import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { BrainCircuit, Check, ChevronDown, Settings as Cog } from 'lucide-react'
import { api, type Health } from '../api'
import { useApi } from '../shared/hooks'
import { useToast } from '../shared/toast'
import { Spinner } from '../shared/ui'

interface SettingsView {
  use_ai: boolean; provider: string; model: string; base_url: string | null; has_key: boolean; keys_saved: Record<string, boolean>
  providers: { id: string; label: string; models: string[]; needs_key: boolean }[]
}

export const SETTINGS_EVENT = 'threadora:settings'
const shortModel = (m: string) => m.split('/').pop() ?? m

/** Header chip that always reflects the model the agents will use, with a quick switcher. */
export default function ModelChip() {
  const health = useApi<Health>('/health')
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const nav = useNavigate()
  const toast = useToast()

  useEffect(() => {
    const reload = () => health.reload()
    window.addEventListener(SETTINGS_EVENT, reload)
    return () => window.removeEventListener(SETTINGS_EVENT, reload)
  }, [health.reload])
  useEffect(() => {
    if (!open) return
    api<SettingsView>('/settings').then(setSettings).catch(() => setSettings(null))
    const onDown = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const h = health.data
  const live = h?.mode === 'llm'
  const provider = settings?.providers.find(p => p.id === settings.provider)
  const canSwitch = !!provider && (!provider.needs_key || settings!.has_key)

  async function choose(model: string) {
    if (!settings) return
    setBusy(model)
    try {
      await api('/settings', { method: 'PUT', json: { use_ai: true, provider: settings.provider, model, base_url: settings.base_url } })
      window.dispatchEvent(new Event(SETTINGS_EVENT))
      setSettings({ ...settings, model, use_ai: true })
      toast({ tone: 'ok', title: 'Model switched', body: `New runs will use ${model}.` })
    } catch (e) {
      toast({ tone: 'bad', title: 'Could not switch model', body: (e as Error).message })
    } finally { setBusy(null) }
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="dialog"
        aria-label={h ? `AI model: ${h.use_ai ? `${h.provider_label} ${h.configured_model}${live ? '' : ' (no access token, running offline)'}` : 'offline, rule-based'}` : 'AI model'}
        className="group flex h-9 max-w-[52vw] items-center gap-2 rounded-full border border-line bg-surface pl-2.5 pr-2 text-xs font-medium transition-colors hover:border-brand sm:max-w-xs">
        <span className="relative flex h-2.5 w-2.5 shrink-0" title={live ? 'Live' : h?.use_ai ? 'Selected, but no access token yet' : 'AI turned off'}>
          {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${live ? 'bg-emerald-500' : h?.use_ai ? 'bg-amber-500' : 'bg-muted/60'}`} />
        </span>
        <BrainCircuit size={15} aria-hidden="true" className="hidden shrink-0 text-brand-ink sm:block" />
        <span className="truncate">
          {!h ? 'Loading model…' : h.use_ai ? <><span className="text-muted">{h.provider_label} · </span>{shortModel(h.configured_model)}</> : 'Offline · rule-based'}
        </span>
        <ChevronDown size={14} aria-hidden="true" className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && h && (
          <motion.div role="dialog" aria-label="AI model details" initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }} transition={{ duration: 0.16 }}
            className="shadow-pop absolute right-0 top-11 z-40 w-[min(22rem,88vw)] origin-top-right rounded-2xl border border-line bg-raised p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Agents are using</p>
            <p className="mt-1 break-all font-mono text-[13px] font-semibold">{h.configured_model || '—'}</p>
            <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-1.5 text-xs">
              <dt className="text-muted">Status</dt>
              <dd className={live ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold'}>{live ? 'LLM active' : h.use_ai ? 'Offline: no access token' : 'Offline mode (AI turned off)'}</dd>
              <dt className="text-muted">Provider</dt><dd>{h.provider_label}</dd>
              <dt className="text-muted">Access token</dt><dd>{h.key_source === 'saved' ? 'Saved in Settings' : h.key_source === 'environment' ? 'From environment' : 'None'}</dd>
              <dt className="text-muted">Decisions</dt><dd>Deterministic Python (model only interprets briefs and explains results)</dd>
            </dl>
            {canSwitch && provider!.models.length > 1 && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1.5 text-xs font-semibold text-muted">Quick switch ({provider!.label})</p>
                <ul className="space-y-0.5">
                  {provider!.models.map(m => {
                    const current = m === settings!.model && settings!.use_ai
                    return (
                      <li key={m}>
                        <button type="button" disabled={!!busy || current} onClick={() => choose(m)}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${current ? 'bg-brand/10 font-semibold' : 'hover:bg-ice'}`}>
                          <span className="w-4 shrink-0">{busy === m ? <Spinner /> : current ? <Check size={14} aria-hidden="true" className="text-brand-ink" /> : null}</span>
                          <span className="truncate font-mono">{m}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            <button type="button" onClick={() => { setOpen(false); nav('/admin/settings') }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-semibold transition-colors hover:border-brand hover:bg-ice">
              <Cog size={14} aria-hidden="true" />Model & token settings
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
