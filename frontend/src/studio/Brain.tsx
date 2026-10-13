import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Brain, ChevronDown, Cog, Info, TriangleAlert, Wrench } from 'lucide-react'
import type { BrainEvent } from '../api'
import { Badge } from '../shared/ui'

export const agentLabel = (id: string) => id.replace(/([a-z])([A-Z])/g, '$1 $2')
const compact = (v: unknown, n = 140) => {
  let s = ''
  try { s = typeof v === 'string' ? v : JSON.stringify(v) } catch { s = String(v) }
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}
const ms = (v?: number) => (v == null ? null : v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(1)} s`)

function Section({ label, children, mono = false, italic = false }: { label: string; children: React.ReactNode; mono?: boolean; italic?: boolean }) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2 text-xs">
      <span className="pt-0.5 font-semibold uppercase tracking-[0.08em] text-muted">{label}</span>
      <div className={`min-w-0 break-words ${mono ? 'font-mono text-[11px]' : ''} ${italic ? 'italic text-muted' : ''}`}>{children}</div>
    </div>
  )
}

function Card({ e, open, onToggle }: { e: BrainEvent; open: boolean; onToggle: () => void }) {
  const clamp = open ? '' : 'line-clamp-3'
  const meta = [e.tokens && (e.tokens.in != null || e.tokens.out != null) ? `${e.tokens.in ?? '–'} in / ${e.tokens.out ?? '–'} out tokens` : null, ms(e.duration_ms)].filter(Boolean).join(' · ')
  const err = e.kind === 'note' && e.level === 'error'
  const warn = e.kind === 'note' && e.level === 'warn'
  const Icon = e.kind === 'llm' ? Brain : e.kind === 'tool' ? Wrench : e.kind === 'rule' ? Cog : err || warn ? TriangleAlert : Info
  const tone = err ? 'border-red-200 bg-red-50 dark:border-red-400/30 dark:bg-red-400/10' : warn ? 'border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10'
    : e.kind === 'llm' ? 'border-brand/40 bg-brand/5' : 'border-line bg-surface'
  const title = e.kind === 'llm' ? 'Model turn' : e.kind === 'tool' ? 'Tool call' : e.kind === 'rule' ? 'Rule-based decision' : err ? 'Error' : warn ? 'Warning' : 'Note'
  return (
    <motion.li layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="relative pl-9">
      <span className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full border ${e.kind === 'llm' ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface text-brand-ink'} ${err ? '!border-red-400 !text-red-600' : ''}`}>
        <Icon size={14} aria-hidden="true" />
      </span>
      <div className={`rounded-xl border p-3 ${tone}`}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">{title}</span>
          <Badge tone={e.kind === 'llm' ? 'brand' : 'neutral'}>{agentLabel(e.agent)}</Badge>
          {e.model && <span className="truncate font-mono text-[11px] text-muted">{e.model}</span>}
          {meta && <span className="tabular ml-auto text-[11px] text-muted">{meta}</span>}
          <ChevronDown size={13} aria-hidden="true" className={`text-muted transition-transform ${open ? 'rotate-180' : ''} ${meta ? '' : 'ml-auto'}`} />
        </button>
        <div className="mt-2 space-y-1.5">
          {e.kind === 'llm' && (
            <>
              {e.input && <Section label="Saw" mono><span className={`block ${clamp}`}>{e.input}</span></Section>}
              {e.thought && <Section label="Thought" italic><span className={`block ${clamp}`}>{e.thought}</span></Section>}
              {e.output && <Section label="Said"><span className={`block ${clamp}`}>{e.output}</span></Section>}
              {!!e.calls?.length && (
                <Section label="Decided">
                  <ul className="space-y-1">{e.calls.map((c, i) => (
                    <li key={i} className="rounded-lg bg-ice px-2 py-1 font-mono text-[11px]"><b>{c.name}</b>({open ? JSON.stringify(c.args, null, 1) : compact(c.args, 110)})</li>
                  ))}</ul>
                </Section>
              )}
              {!e.output && !e.calls?.length && !e.thought && <p className="text-xs italic text-muted">The model returned nothing.</p>}
            </>
          )}
          {e.kind === 'tool' && (
            <>
              <Section label="Call" mono><span className={`block ${clamp}`}><b>{e.name}</b>({open ? JSON.stringify(e.args, null, 1) : compact(e.args, 200)})</span></Section>
              {e.error ? <Section label="Failed"><span className="text-red-700 dark:text-red-300">{e.error}</span></Section>
                : e.result && <Section label="Result" mono><span className={`block ${open ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>{e.result}</span></Section>}
            </>
          )}
          {(e.kind === 'rule' || e.kind === 'note') && <p className={`text-xs ${clamp}`}>{e.text}</p>}
        </div>
      </div>
    </motion.li>
  )
}

/** The agents' thinking, step by step. Used for campaign runs and the chat assistant. */
export default function BrainTimeline({ events, live = false, running = false, filterable = false, maxHeight, emptyHint }: {
  events: BrainEvent[]; live?: boolean; running?: boolean; filterable?: boolean; maxHeight?: string; emptyHint?: string
}) {
  const [agent, setAgent] = useState('')
  const [openSeq, setOpenSeq] = useState<Set<number>>(new Set())
  const box = useRef<HTMLDivElement>(null)
  const agents = useMemo(() => [...new Set(events.map(e => e.agent))], [events])
  const shown = agent ? events.filter(e => e.agent === agent) : events
  const stats = useMemo(() => ({ turns: events.filter(e => e.kind === 'llm').length, tools: events.filter(e => e.kind === 'tool').length, rules: events.filter(e => e.kind === 'rule').length }), [events])
  useEffect(() => { if (live && box.current) box.current.scrollTo({ top: box.current.scrollHeight, behavior: 'smooth' }) }, [live, events.length])
  const toggle = (seq: number) => setOpenSeq(s => { const n = new Set(s); if (n.has(seq)) n.delete(seq); else n.add(seq); return n })

  if (!events.length) return <p className="rounded-xl border border-dashed border-line p-5 text-center text-sm text-muted">{running ? 'Waiting for the first step…' : emptyHint ?? 'No steps recorded.'}</p>
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span><b className="tabular text-ink">{stats.turns}</b> model turn{stats.turns === 1 ? '' : 's'}</span>
        <span><b className="tabular text-ink">{stats.tools}</b> tool call{stats.tools === 1 ? '' : 's'}</span>
        <span><b className="tabular text-ink">{stats.rules}</b> rule decision{stats.rules === 1 ? '' : 's'}</span>
        {running && <span className="inline-flex items-center gap-1.5 text-brand-ink"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />thinking…</span>}
      </div>
      {filterable && agents.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter brain by agent">
          {['', ...agents].map(a => (
            <button key={a || 'all'} type="button" aria-pressed={agent === a} onClick={() => setAgent(a)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${agent === a ? 'border-brand bg-brand text-on-brand' : 'border-line hover:border-brand/60'}`}>{a ? agentLabel(a) : 'All agents'}</button>
          ))}
        </div>
      )}
      <div ref={box} className="scrollbar-thin overflow-y-auto pr-1" style={maxHeight ? { maxHeight } : undefined}>
        <ol className="relative space-y-2.5" aria-label="Agent brain timeline">
          <span aria-hidden="true" className="absolute bottom-3 left-[13px] top-3 w-px bg-line" />
          <AnimatePresence initial={false}>
            {shown.map(e => <Card key={e.seq} e={e} open={openSeq.has(e.seq)} onToggle={() => toggle(e.seq)} />)}
          </AnimatePresence>
        </ol>
      </div>
    </div>
  )
}
