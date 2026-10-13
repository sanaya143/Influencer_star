import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Brain, History, MessageSquarePlus, RotateCcw, SendHorizontal, Sparkles, TriangleAlert, Zap } from 'lucide-react'
import { api, ApiError, fmt, type ChatCapabilities, type ChatTurn } from '../api'
import { useApi } from '../shared/hooks'
import { useToast } from '../shared/toast'
import { Badge, Button, Card, Skeleton, selectCls } from '../shared/ui'
import BrainTimeline, { agentLabel } from './Brain'
import CardView, { Rich } from './AssistantCards'

const KEY = 'zylo.chat'
const SUGGESTIONS = [
  'Which products are low on stock?',
  'Find micro-influencers for the Oversized Graphic Hoodie aimed at 18-24 women',
  'Summarise sales for the last 30 days',
  "Show the latest campaign's top creators",
  'Show the top TikTok creators by promo views',
  'Tell me about the Washed Straight Jeans',
]

function blankTurn(turn_id: string, session_id: string, idx: number, user_text: string): ChatTurn {
  return { turn_id, session_id, idx, user_text, answer: null, status: 'Running', mode: null, model: null, note: null, brain: [], cards: [], agents: [], usage: null, created_at: new Date().toISOString(), completed_at: null }
}
const seconds = (t: ChatTurn) => (t.completed_at ? (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) / 1000 : null)

/** What the agent is doing right now, from the newest brain event. */
function progress(t: ChatTurn): string {
  const last = t.brain[t.brain.length - 1]
  if (!last) return 'Starting…'
  if (last.kind === 'note') return last.level === 'warn' ? last.text ?? 'Retrying…' : 'Waiting for the model…'
  if (last.kind === 'llm') return last.calls?.length ? `Calling ${last.calls.map(c => c.name).join(', ')}…` : 'Writing the answer…'
  if (last.kind === 'tool') return `${agentLabel(last.agent)} finished ${last.name}; thinking about the result…`
  if (last.kind === 'rule') return 'Applying the routing rules…'
  return 'Working…'
}

export default function Assistant() {
  const toast = useToast()
  const caps = useApi<ChatCapabilities>('/chat/capabilities')
  const history = useApi<{ items: { session_id: string; title: string; turns: number }[] }>('/chat/sessions')
  const [sid, setSid] = useState<string | null>(() => { try { return localStorage.getItem(KEY) } catch { return null } })
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [loading, setLoading] = useState(!!sid)
  const [selected, setSelected] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [rulesOnly, setRulesOnly] = useState(false)
  const [sending, setSending] = useState(false)
  const [tick, setTick] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)

  const remember = (id: string | null) => { setSid(id); try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY) } catch { /* private mode: chat still works */ } }

  // load the saved conversation
  useEffect(() => {
    if (!sid) { setLoading(false); return }
    let live = true
    setLoading(true)
    api<{ turns: ChatTurn[] }>(`/chat/sessions/${sid}`)
      .then(d => { if (live) { setTurns(d.turns); setSelected(d.turns.at(-1)?.turn_id ?? null) } })
      .catch(e => { if (live && e instanceof ApiError && e.status === 404) { remember(null); setTurns([]) } })
      .finally(() => live && setLoading(false))
    return () => { live = false }
  }, [sid])

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
        if (fresh.status !== 'Running') { history.reload(); clearInterval(t) }
      } catch { /* transient: try again on the next tick */ }
    }, 700)
    const clock = setInterval(() => setTick(n => n + 1), 1000)
    return () => { stop = true; clearInterval(t); clearInterval(clock) }
  }, [running?.turn_id])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [turns.length, running?.brain.length, running?.status])
  useEffect(() => { const a = area.current; if (a) { a.style.height = 'auto'; a.style.height = `${Math.min(a.scrollHeight, 140)}px` } }, [input])

  const send = useCallback(async (text: string) => {
    const msg = text.trim()
    if (!msg || sending || running) return
    setSending(true)
    try {
      let id = sid
      if (!id) { id = (await api<{ session_id: string }>('/chat/sessions', { method: 'POST' })).session_id; remember(id) }
      const r = await api<{ turn_id: string }>(`/chat/sessions/${id}/messages`, { method: 'POST', json: { text: msg, rules_only: rulesOnly } })
      setTurns(ts => [...ts, blankTurn(r.turn_id, id!, ts.length + 1, msg)])
      setSelected(r.turn_id)
      setInput('')
    } catch (e) {
      toast({ tone: 'bad', title: 'Could not send', body: (e as Error).message })
    } finally { setSending(false) }
  }, [sid, sending, running, rulesOnly, toast])

  const newChat = () => { remember(null); setTurns([]); setSelected(null); setInput(''); area.current?.focus() }
  const sel = turns.find(t => t.turn_id === selected) ?? turns.at(-1) ?? null
  void tick

  const live = caps.data?.mode === 'llm'
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">Assistant</h1>
          <p className="text-sm text-muted">Ask in plain English. The coordinator decides which specialist agents to call, and you can watch it think.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {caps.data && <Badge tone={live ? 'ok' : 'neutral'}>{live ? `AI model · ${caps.data.model}` : 'No AI model: rule-based router'}</Badge>}
          {(history.data?.items.length ?? 0) > 0 && (
            <label className="relative inline-flex items-center"><span className="sr-only">Earlier chats</span><History size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 text-muted" />
              <select value={sid ?? ''} onChange={e => e.target.value && remember(e.target.value)} className={`${selectCls} w-44 pl-8`}>
                <option value="">Earlier chats…</option>{history.data!.items.map(h => <option key={h.session_id} value={h.session_id}>{h.title}</option>)}
              </select></label>
          )}
          <Button variant="outline" size="sm" onClick={newChat}><MessageSquarePlus size={15} aria-hidden="true" />New chat</Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        {/* conversation */}
        <Card className="flex h-[clamp(520px,calc(100dvh-13rem),860px)] min-w-0 flex-col overflow-hidden">
          <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 space-y-5 overflow-y-auto p-4 md:p-5" aria-live="polite" aria-label="Conversation">
            {loading ? <><Skeleton className="h-12 w-2/3" /><Skeleton className="ml-auto h-12 w-1/2" /></> : !turns.length ? (
              <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
                <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-on-brand"><Sparkles size={26} aria-hidden="true" /></motion.span>
                <div><h2 className="text-xl font-semibold">What would you like to explore?</h2><p className="mx-auto mt-1 max-w-md text-sm text-muted">I'll pick the right agents for your question: inventory, creators, matching or saved campaigns. Nothing is changed unless you ask me to launch a campaign.</p></div>
                <div className="flex max-w-2xl flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s, i) => (
                    <motion.button key={s} type="button" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} onClick={() => send(s)}
                      className="rounded-full border border-line bg-surface px-3.5 py-2 text-left text-sm transition-colors hover:border-brand hover:bg-ice">{s}</motion.button>
                  ))}
                </div>
              </div>
            ) : turns.map(t => (
              <div key={t.turn_id} className="space-y-3">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end"><p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-on-brand">{t.user_text}</p></motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ice text-brand-ink"><Sparkles size={16} aria-hidden="true" /></span>
                  <div className="min-w-0 flex-1 space-y-3">
                    {t.status === 'Running' ? (
                      <div className="inline-flex items-center gap-2.5 rounded-2xl rounded-tl-md bg-ice px-4 py-2.5 text-sm text-muted" role="status">
                        <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
                        <span>{progress(t)}</span><span className="tabular text-xs">{Math.max(0, Math.round((Date.now() - new Date(t.created_at).getTime()) / 1000))}s</span>
                      </div>
                    ) : (
                      <div className={`rounded-2xl rounded-tl-md px-4 py-3 ${t.status === 'Failed' ? 'bg-red-50 dark:bg-red-400/10' : 'bg-ice'}`}>{t.answer && <Rich text={t.answer} />}</div>
                    )}
                    {t.note && t.status !== 'Running' && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-400/30 dark:bg-amber-400/10">
                        <p className="flex items-start gap-1.5"><TriangleAlert size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />{t.note}</p>
                        {t.mode === 'rules' && t.status === 'Needs Review' && (
                          <div className="mt-2 flex flex-wrap items-center gap-2 pl-5">
                            <Button size="sm" variant="outline" disabled={!!running || sending} onClick={() => void send(t.user_text)}><RotateCcw size={13} aria-hidden="true" />Ask the model again</Button>
                            <Link to="/admin/settings" className="font-semibold text-brand-ink hover:underline">Choose a different model</Link>
                            <span className="text-muted">Free models are often busy; a paid or local model is steadier.</span>
                          </div>
                        )}
                      </div>
                    )}
                    <AnimatePresence initial={false}>{t.cards.map((c, i) => <motion.div key={`${t.turn_id}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}><CardView card={c} /></motion.div>)}</AnimatePresence>
                    {t.status !== 'Running' && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        <Badge tone={t.mode === 'llm' ? 'brand' : 'neutral'}>{t.mode === 'llm' ? `AI · ${t.model || 'model'}` : 'Rule-based router'}</Badge>
                        {t.agents.length > 0 && <span>Agents: {t.agents.map(agentLabel).join(' → ')}</span>}
                        {seconds(t) != null && <span className="tabular">{seconds(t)!.toFixed(1)}s</span>}
                        {!!t.usage?.total_tokens && <span className="tabular">{fmt.n(t.usage.total_tokens)} tokens</span>}
                        <button type="button" onClick={() => setSelected(t.turn_id)} aria-pressed={sel?.turn_id === t.turn_id} className={`ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold transition-colors ${sel?.turn_id === t.turn_id ? 'bg-brand/15 text-brand-ink' : 'hover:bg-ice hover:text-ink'}`}><Brain size={13} aria-hidden="true" />See its brain</button>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            ))}
          </div>
          <form onSubmit={e => { e.preventDefault(); void send(input) }} className="border-t border-line bg-surface p-3">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 transition-colors focus-within:border-brand">
              <label className="sr-only" htmlFor="assistant-input">Message the assistant</label>
              <textarea id="assistant-input" ref={area} rows={1} value={input} maxLength={2000} disabled={!!running} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input) } }}
                placeholder={running ? 'The assistant is answering…' : 'Ask about stock, creators, matching or campaigns…'}
                className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus:outline-none disabled:opacity-60" />
              <Button type="submit" disabled={!input.trim() || sending || !!running} aria-label="Send message"><SendHorizontal size={16} aria-hidden="true" /></Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-muted">
              <label className="inline-flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-[#01ABDD]" checked={rulesOnly} onChange={e => setRulesOnly(e.target.checked)} /><Zap size={12} aria-hidden="true" />Skip the AI model (instant, rule-based)</label>
              <span>Enter to send · Shift+Enter for a new line · synthetic data</span>
            </div>
          </form>
        </Card>

        {/* the brain */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-20 xl:self-start">
          <Card className="p-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Brain size={16} aria-hidden="true" className="text-brand-ink" />Agents behind the assistant</h2>
            {!caps.data ? <Skeleton className="h-16" /> : (
              <ul className="grid grid-cols-2 gap-2">
                {caps.data.agents.map(a => {
                  const used = !!sel?.agents.includes(a.name)
                  return (
                    <li key={a.name} className={`rounded-xl border p-2.5 transition-colors ${used ? 'border-brand bg-brand/10' : 'border-line'}`} title={a.tools.map(t => t.name).join(', ')}>
                      <p className="flex items-center gap-1.5 text-xs font-semibold">{used && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}{agentLabel(a.name)}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-muted">{a.role}</p>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><h2 className="text-sm font-semibold">Agent brain</h2>
                <p className="truncate text-xs text-muted">{sel ? `“${sel.user_text}”` : 'Ask something to see the coordinator think.'}</p></div>
              {sel && sel.status !== 'Running' && <Badge tone={sel.mode === 'llm' ? 'brand' : 'neutral'}>{sel.mode === 'llm' ? 'AI model' : 'Rules'}</Badge>}
            </div>
            <BrainTimeline events={sel?.brain ?? []} live={sel?.status === 'Running'} running={sel?.status === 'Running'} maxHeight="min(60dvh, 34rem)"
              emptyHint="The model's turns, tool calls and decisions will appear here, step by step." />
          </Card>
        </div>
      </div>
    </div>
  )
}
