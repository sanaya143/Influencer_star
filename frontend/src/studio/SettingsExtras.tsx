import { useEffect, useState } from 'react'
import { CheckCircle2, Coins, Globe2, PlugZap, Save, XCircle } from 'lucide-react'
import { api, type ModelPrice } from '../api'
import { useApi } from '../shared/hooks'
import { useToast } from '../shared/toast'
import { Badge, Button, Card, Skeleton, Spinner, inputCls } from '../shared/ui'
import { SETTINGS_EVENT } from './ModelChip'

interface Prices { current_model: string; prices: { model: string; price: ModelPrice | null; saved: boolean }[]; note: string }

/** USD per 1M tokens for each model, used by the token-cost dropdown in the header. */
export function ModelPrices() {
  const { data, reload } = useApi<Prices>('/settings/prices')
  const toast = useToast()
  const [model, setModel] = useState('')
  const [inp, setInp] = useState('')
  const [out, setOut] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!data || model) return
    const cur = data.prices.find(p => p.model === data.current_model)
    setModel(data.current_model); setInp(cur?.price ? String(cur.price.input) : ''); setOut(cur?.price ? String(cur.price.output) : '')
  }, [data, model])
  useEffect(() => { if (location.hash === '#prices') document.getElementById('prices')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, [])

  const pick = (m: string) => {
    const p = data?.prices.find(x => x.model === m)
    setModel(m); setInp(p?.price ? String(p.price.input) : ''); setOut(p?.price ? String(p.price.output) : '')
  }
  async function save(clear = false) {
    if (!model.trim()) return
    setBusy(true)
    try {
      await api('/settings/prices', { method: 'PUT', json: clear ? { model } : { model: model.trim(), input_per_m: Number(inp), output_per_m: Number(out) } })
      reload(); window.dispatchEvent(new Event(SETTINGS_EVENT))
      toast({ tone: 'ok', title: clear ? 'Saved price removed' : 'Price saved', body: `Costs for ${model} are recalculated.` })
    } catch (e) { toast({ tone: 'bad', title: 'Could not save the price', body: (e as Error).message }) } finally { setBusy(false) }
  }
  const valid = model.trim() && inp !== '' && out !== '' && Number(inp) >= 0 && Number(out) >= 0

  return (
    <Card className="scroll-mt-24 space-y-4 p-5">
      <div id="prices" className="scroll-mt-24">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Coins size={17} aria-hidden="true" className="text-brand-ink" />Model prices</h2>
        <p className="text-sm text-muted">Used to turn token counts into cost in the header's usage dropdown. Prices are in US dollars per 1 million tokens. {data?.note}</p>
      </div>
      {!data ? <Skeleton className="h-32" /> : (
        <>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_120px_auto] md:items-end">
            <label className="block text-sm"><span className="mb-1 block font-medium">Model</span>
              <input className={inputCls} list="price-models" value={model} onChange={e => pick(e.target.value)} placeholder="model id" />
              <datalist id="price-models">{data.prices.map(p => <option key={p.model} value={p.model} />)}</datalist></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Input $/1M</span><input className={inputCls} type="number" min={0} step="0.01" value={inp} onChange={e => setInp(e.target.value)} /></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Output $/1M</span><input className={inputCls} type="number" min={0} step="0.01" value={out} onChange={e => setOut(e.target.value)} /></label>
            <div className="flex gap-2"><Button onClick={() => save()} disabled={busy || !valid}>{busy ? <Spinner /> : <Save size={15} aria-hidden="true" />}Save</Button>
              {data.prices.find(p => p.model === model)?.saved && <Button variant="ghost" onClick={() => save(true)} disabled={busy}>Reset</Button>}</div>
          </div>
          <div className="scrollbar-thin max-h-64 overflow-auto rounded-xl border border-line">
            <table className="dense w-full">
              <caption className="sr-only">Known model prices</caption>
              <thead><tr><th scope="col">Model</th><th scope="col" className="num">Input $/1M</th><th scope="col" className="num">Output $/1M</th><th scope="col">Source</th></tr></thead>
              <tbody>{data.prices.map(p => (
                <tr key={p.model} className={p.model === data.current_model ? 'bg-brand/5' : ''}>
                  <td><button type="button" onClick={() => pick(p.model)} className="font-mono text-xs hover:text-brand-ink">{p.model}</button>{p.model === data.current_model && <Badge className="ml-2" tone="brand">in use</Badge>}</td>
                  <td className="num">{p.price ? p.price.input : '—'}</td><td className="num">{p.price ? p.price.output : '—'}</td>
                  <td className="text-xs text-muted">{p.price ? p.price.source : 'unknown: add a price'}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}

interface External { enabled: boolean; transport: 'stdio' | 'http'; url: string | null; command: string; label: string; cached_creators: number; fresh: number; sources: string[] }
interface Probe { ok: boolean; server?: string; creators_available?: number; duration_ms: number; error?: string }

/** The outside creator-data provider the Matching Coordinator calls over MCP. */
export function OutsideData() {
  const { data, reload } = useApi<External>('/settings/external-data')
  const toast = useToast()
  const [busy, setBusy] = useState<'toggle' | 'test' | null>(null)
  const [probe, setProbe] = useState<Probe | null>(null)
  async function toggle(enabled: boolean) {
    setBusy('toggle')
    try { await api('/settings/external-data', { method: 'PUT', json: { enabled } }); reload() }
    catch (e) { toast({ tone: 'bad', title: 'Could not save', body: (e as Error).message }) } finally { setBusy(null) }
  }
  async function test() {
    setBusy('test'); setProbe(null)
    try { setProbe(await api<Probe>('/settings/external-data/test', { method: 'POST' })) } finally { setBusy(null) }
  }
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold"><Globe2 size={17} aria-hidden="true" className="text-brand-ink" />Outside creator data (MCP)</h2>
        <p className="text-sm text-muted">During each campaign run the Matching Coordinator connects to an outside data provider as an MCP client and adds the creators it finds to the pool. Every call shows in Agent execution → MCP activity. If the provider cannot be reached, matching carries on with Zylo's own creators.</p>
      </div>
      {!data ? <Skeleton className="h-24" /> : (
        <>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-1 h-4 w-4 accent-[#01ABDD]" checked={data.enabled} disabled={busy !== null} onChange={e => toggle(e.target.checked)} />
            <span><b>Fetch creators from the outside provider</b><span className="block text-muted">{data.label}{data.url ? ` · ${data.url}` : ` · runs ${data.command}`}</span></span>
          </label>
          <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-xl bg-ice p-3"><dt className="text-xs text-muted">Transport</dt><dd className="font-semibold">{data.transport === 'http' ? 'Streamable HTTP' : 'stdio (local process)'}</dd></div>
            <div className="rounded-xl bg-ice p-3"><dt className="text-xs text-muted">Creators cached</dt><dd className="font-semibold">{data.cached_creators}</dd></div>
            <div className="rounded-xl bg-ice p-3"><dt className="text-xs text-muted">Sources</dt><dd className="truncate font-semibold">{data.sources.join(', ') || 'none yet'}</dd></div>
          </dl>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={test} disabled={busy !== null}>{busy === 'test' ? <Spinner /> : <PlugZap size={16} aria-hidden="true" />}Test connection</Button>
            <span className="text-xs text-muted">Point ZYLO_EXTERNAL_MCP_URL at a real provider's MCP server to use it instead of the bundled mock.</span>
          </div>
          {probe && (
            <p role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${probe.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200' : 'border-red-200 bg-red-50 text-red-900 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200'}`}>
              {probe.ok ? <CheckCircle2 size={17} aria-hidden="true" className="mt-0.5 shrink-0" /> : <XCircle size={17} aria-hidden="true" className="mt-0.5 shrink-0" />}
              {probe.ok ? `Connected to ${probe.server} in ${(probe.duration_ms / 1000).toFixed(1)}s: ${probe.creators_available} creators available.` : `Could not connect: ${probe.error}`}
            </p>
          )}
        </>
      )}
    </Card>
  )
}
