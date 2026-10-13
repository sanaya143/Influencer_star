import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, Maximize2, MessageSquarePlus, RotateCcw, SendHorizontal, MessageCircle, TriangleAlert, X, Zap } from 'lucide-react'
import { fmt, type ChatTurn } from '../api'
import { useToast } from '../shared/toast'
import { Badge, Button, Skeleton } from '../shared/ui'
import BrainTimeline, { agentLabel } from './Brain'
import CardView, { Rich } from './AssistantCards'
import { SUGGESTIONS, progress, seconds, useAssistantChat } from './assistantChat'

function Reply({ t, onRetry, busy }: { t: ChatTurn; onRetry: (text: string) => void; busy: boolean }) {
  const [brain, setBrain] = useState(false)
  return (
    <div className="space-y-2.5">
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm text-on-brand">{t.user_text}</p>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 space-y-2">
        {t.status === 'Running' ? (
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md bg-ice px-3.5 py-2 text-sm text-muted" role="status">
            <span className="flex gap-1" aria-hidden="true">{[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>
            <span className="min-w-0 truncate">{progress(t)}</span>
          </div>
        ) : (
          <div className={`rounded-2xl rounded-tl-md px-3.5 py-2.5 ${t.status === 'Failed' ? 'bg-red-50 dark:bg-red-400/10' : 'bg-ice'}`}>{t.answer && <Rich text={t.answer} />}</div>
        )}
        {t.note && t.status !== 'Running' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs dark:border-amber-400/30 dark:bg-amber-400/10">
            <p className="flex items-start gap-1.5"><TriangleAlert size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-amber-600" />{t.note}</p>
            {t.mode === 'rules' && t.status === 'Needs Review' && (
              <Button size="sm" variant="outline" className="mt-1.5" disabled={busy} onClick={() => onRetry(t.user_text)}><RotateCcw size={12} aria-hidden="true" />Ask the model again</Button>
            )}
          </div>
        )}
        {t.cards.map((c, i) => <motion.div key={`${t.turn_id}-${i}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><CardView card={c} /></motion.div>)}
        {t.status !== 'Running' && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted">
            <Badge tone={t.mode === 'llm' ? 'brand' : 'neutral'}>{t.mode === 'llm' ? 'AI model' : 'Rule-based'}</Badge>
            {t.agents.length > 0 && <span className="truncate">{t.agents.map(agentLabel).join(' → ')}</span>}
            {seconds(t) != null && <span className="tabular">{seconds(t)!.toFixed(1)}s</span>}
            {!!t.usage?.total_tokens && <span className="tabular">{fmt.n(t.usage.total_tokens)} tokens</span>}
            <button type="button" onClick={() => setBrain(b => !b)} aria-expanded={brain} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold hover:bg-ice hover:text-ink"><Brain size={12} aria-hidden="true" />{brain ? 'Hide brain' : 'Brain'}</button>
          </div>
        )}
        <AnimatePresence initial={false}>
          {brain && t.brain.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden rounded-xl border border-line p-2">
              <BrainTimeline events={t.brain} live={t.status === 'Running'} running={t.status === 'Running'} maxHeight="16rem" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

/** Floating "Ask Zylo" button with a chat panel, available on every back-office page. */
export default function AssistantWidget() {
  const { pathname } = useLocation()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(false)
  const [input, setInput] = useState('')
  const openRef = useRef(open)
  openRef.current = open
  const chat = useAssistantChat({
    onError: msg => toast({ tone: 'bad', title: 'Could not send', body: msg }),
    onReply: () => { if (!openRef.current) setUnread(true) },
  })
  const { caps, turns, loading, running, sending, rulesOnly, setRulesOnly } = chat
  const scroller = useRef<HTMLDivElement>(null)
  const area = useRef<HTMLTextAreaElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const onPage = pathname.startsWith('/admin/assistant')

  useEffect(() => { if (open) { setUnread(false); setTimeout(() => area.current?.focus(), 60) } }, [open])
  useEffect(() => { if (open) scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight, behavior: 'smooth' }) }, [open, turns.length, running?.brain.length, running?.status])
  useEffect(() => { const a = area.current; if (a) { a.style.height = 'auto'; a.style.height = `${Math.min(a.scrollHeight, 120)}px` } }, [input])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); button.current?.focus() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => { if (onPage) setOpen(false) }, [onPage])

  const send = async (text: string) => { if (await chat.send(text)) setInput('') }
  if (onPage) return null
  const live = caps.data?.mode === 'llm'

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.section role="dialog" aria-label="Zylo assistant" initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            className="shadow-pop fixed inset-0 z-50 flex origin-bottom-right flex-col overflow-hidden bg-surface sm:inset-auto sm:bottom-24 sm:right-5 sm:h-[min(680px,calc(100dvh-8rem))] sm:w-[420px] sm:rounded-2xl sm:border sm:border-line">
            <header className="flex items-center gap-2.5 border-b border-line bg-ice/60 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-on-brand"><MessageCircle size={18} aria-hidden="true" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-tight">Zylo assistant</p>
                <p className="truncate text-[11px] text-muted">{caps.data ? (live ? `AI · ${caps.data.model}` : 'Rule-based router (no AI model)') : 'Connecting…'}</p>
              </div>
              <button type="button" onClick={() => { chat.newChat(); setInput(''); area.current?.focus() }} aria-label="New chat" title="New chat" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"><MessageSquarePlus size={17} aria-hidden="true" /></button>
              <Link to="/admin/assistant" onClick={() => setOpen(false)} aria-label="Open the full assistant page" title="Full view with the agent brain" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"><Maximize2 size={16} aria-hidden="true" /></Link>
              <button type="button" onClick={() => { setOpen(false); button.current?.focus() }} aria-label="Close assistant" className="rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"><X size={18} aria-hidden="true" /></button>
            </header>

            <div ref={scroller} className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite" aria-label="Conversation">
              {loading ? <><Skeleton className="h-10 w-2/3" /><Skeleton className="ml-auto h-10 w-1/2" /></> : !turns.length ? (
                <div className="space-y-4 pt-2">
                  <div className="rounded-2xl rounded-tl-md bg-ice px-3.5 py-3 text-sm">
                    <p className="font-semibold">Hi, I'm the Zylo assistant.</p>
                    <p className="mt-1 text-muted">Ask about stock, sales, collections, creators, matching, campaign results or creator fees. I pick the right agents and show you their thinking. I only launch a campaign if you ask me to.</p>
                  </div>
                  <div className="flex flex-col items-start gap-1.5">
                    {SUGGESTIONS.map((s, i) => (
                      <motion.button key={s} type="button" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.04 * i }} onClick={() => void send(s)}
                        className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs transition-colors hover:border-brand hover:bg-ice">{s}</motion.button>
                    ))}
                  </div>
                </div>
              ) : turns.map(t => <Reply key={t.turn_id} t={t} busy={!!running || sending} onRetry={text => void send(text)} />)}
            </div>

            <form onSubmit={e => { e.preventDefault(); void send(input) }} className="border-t border-line p-3">
              <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-1.5 transition-colors focus-within:border-brand">
                <label className="sr-only" htmlFor="assistant-widget-input">Message the assistant</label>
                <textarea id="assistant-widget-input" ref={area} rows={1} value={input} maxLength={2000} disabled={!!running} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input) } }}
                  placeholder={running ? 'Answering…' : 'Ask anything about the shop or campaigns…'}
                  className="max-h-28 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-muted focus:outline-none disabled:opacity-60" />
                <Button type="submit" size="sm" disabled={!input.trim() || sending || !!running} aria-label="Send message"><SendHorizontal size={15} aria-hidden="true" /></Button>
              </div>
              <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 px-1 text-[11px] text-muted"><input type="checkbox" className="accent-[#01ABDD]" checked={rulesOnly} onChange={e => setRulesOnly(e.target.checked)} /><Zap size={11} aria-hidden="true" />Skip the AI model (instant)</label>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      <motion.button ref={button} type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog" aria-label={open ? 'Close the assistant' : 'Open the Zylo assistant'}
        initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
        className={`shadow-pop fixed bottom-5 right-5 z-50 items-center gap-2 rounded-full bg-brand py-3.5 pl-3.5 pr-3.5 font-semibold text-on-brand md:pr-5 ${open ? 'hidden sm:flex' : 'flex'}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={open ? 'x' : 's'} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
            {open ? <X size={22} aria-hidden="true" /> : <MessageCircle size={22} aria-hidden="true" />}
          </motion.span>
        </AnimatePresence>
        <span className="hidden text-sm md:inline">{open ? 'Close' : 'Ask Zylo'}</span>
        {(unread || (!open && !!running)) && <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-70" /><span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-surface bg-amber-500" /></span>}
      </motion.button>
    </>
  )
}
