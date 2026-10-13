// Chat state shared by the floating assistant and the full-page view, so both show the same conversation.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError, type ChatCapabilities, type ChatTurn } from '../api'
import { useApi } from '../shared/hooks'
import { agentLabel } from './Brain'

export const CHAT_KEY = 'zylo.chat'
export const SUGGESTIONS = [
  'Which products are low on stock?',
  'Find micro-influencers for the Oversized Graphic Hoodie aimed at 18-24 women',
  'Which creators suit the Marvel & DC collection?',
  'What would a £3,000 budget get for the latest campaign?',
  'Summarise sales for the last 30 days',
  'Show the collections',
]

export function blankTurn(turn_id: string, session_id: string, idx: number, user_text: string): ChatTurn {
  return { turn_id, session_id, idx, user_text, answer: null, status: 'Running', mode: null, model: null, note: null, brain: [], cards: [], agents: [], usage: null, created_at: new Date().toISOString(), completed_at: null }
}
export const seconds = (t: ChatTurn) => (t.completed_at ? (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 1000 : null)

/** What the agent is doing right now, from the newest brain event. */
export function progress(t: ChatTurn): string {
  const last = t.brain[t.brain.length - 1]
  if (!last) return 'Starting…'
  if (last.kind === 'note') return last.level === 'warn' ? last.text ?? 'Retrying…' : 'Waiting for the model…'
  if (last.kind === 'llm') return last.calls?.length ? `Calling ${last.calls.map(c => c.name).join(', ')}…` : 'Writing the answer…'
  if (last.kind === 'tool') return `${agentLabel(last.agent)} finished ${last.name}; thinking about the result…`
  if (last.kind === 'rule') return 'Applying the routing rules…'
  return 'Working…'
}

function stored(): string | null { try { return localStorage.getItem(CHAT_KEY) } catch { return null } }

export function useAssistantChat(opts: { onError?: (msg: string) => void; onReply?: (t: ChatTurn) => void } = {}) {
  const caps = useApi<ChatCapabilities>('/chat/capabilities')
  const history = useApi<{ items: { session_id: string; title: string; turns: number }[] }>('/chat/sessions')
  const [sid, setSid] = useState<string | null>(stored)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(!!sid)
  const [rulesOnly, setRulesOnly] = useState(false)
  const [sending, setSending] = useState(false)
  const [tick, setTick] = useState(0)
  const { onError, onReply } = opts
  const fresh = useRef<string | null>(null)  // a session this hook just created: nothing to load from the server yet

  const remember = useCallback((id: string | null) => {
    setSid(id)
    try { if (id) localStorage.setItem(CHAT_KEY, id); else localStorage.removeItem(CHAT_KEY) } catch { /* private mode: chat still works */ }
  }, [])

  // load the saved conversation
  useEffect(() => {
    if (!sid) { setLoading(false); setTurns([]); return }
    if (fresh.current === sid) { setLoading(false); return }
    let live = true
    setLoading(true)
    api<{ turns: ChatTurn[] }>(`/chat/sessions/${sid}`)
      .then(d => { if (live) setTurns(d.turns) })
      .catch(e => { if (live && e instanceof ApiError && e.status === 404) { remember(null); setTurns([]) } })
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [sid, remember])

  // watch a running turn: its brain fills in live
  const running = turns.find(t => t.status === 'Running')
  useEffect(() => {
    if (!running) return
    const id = running.turn_id
    let stop = false
    const t = setInterval(async () => {
      try {
        const fresh = await api<ChatTurn>(`/chat/turns/${id}`)
        if (stop) return
        setTurns(ts => ts.map(x => (x.turn_id === id ? fresh : x)))
        if (fresh.status !== 'Running') { history.reload(); clearInterval(t); onReply?.(fresh) }
      } catch { /* transient: try again on the next tick */ }
    }, 700)
    const clock = setInterval(() => setTick(n => n + 1), 1000)
    return () => { stop = true; clearInterval(t); clearInterval(clock) }
  }, [running?.turn_id])  // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (text: string): Promise<string | null> => {
    const msg = text.trim()
    if (!msg || sending || running) return null
    setSending(true)
    try {
      let id = sid
      if (!id) { id = (await api<{ session_id: string }>('/chat/sessions', { method: 'POST' })).session_id; fresh.current = id; remember(id) }
      const r = await api<{ turn_id: string }>(`/chat/sessions/${id}/messages`, { method: 'POST', json: { text: msg, rules_only: rulesOnly } })
      setTurns(ts => [...ts, blankTurn(r.turn_id, id!, ts.length + 1, msg)])
      return r.turn_id
    } catch (e) {
      onError?.((e as Error).message)
      return null
    } finally { setSending(false) }
  }, [sid, sending, running, rulesOnly, remember, onError])

  const newChat = useCallback(() => { remember(null); setTurns([]) }, [remember])

  return { caps, history, sid, open: remember, turns, loading, running, sending, send, newChat, rulesOnly, setRulesOnly, tick }
}
