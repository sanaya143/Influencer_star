import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles, Rocket, SlidersHorizontal } from 'lucide-react'
import { api, fmt, type Brief, type Meta, type Paged, type Product, type Trace, type Usage } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, Spinner } from '../shared/ui'

interface ParseRes { run_id: string; status: string; brief: Brief | null; needs_clarification: string[]; candidates: { product_id: string; product_name: string }[]; error?: string; warning?: string | null; trace: Trace; usage: Usage }

const EXAMPLE = "Find suitable UK-based influencers to promote our new women's streetwear collection for customers aged 18–24. Prioritize strong promotional views and relevant micro-influencers."

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>
)
const inputCls = 'w-full rounded-xl border border-line bg-white px-3 py-2 text-sm focus:border-brand'

export default function CreateCampaign() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const meta = useApi<Meta>('/meta').data
  const products = useApi<Paged<Product>>('/products?page_size=100').data?.items ?? []
  const [productId, setProductId] = useState(sp.get('product') ?? '')
  const [text, setText] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [briefRun, setBriefRun] = useState<ParseRes | null>(null)
  const [busy, setBusy] = useState<'parse' | 'launch' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdv, setShowAdv] = useState(false)
  const [interests, setInterests] = useState('')

  const product = useMemo(() => products.find(p => p.product_id === productId), [products, productId])
  useEffect(() => { if (sp.get('product')) setProductId(sp.get('product')!) }, [sp])

  async function interpret() {
    setBusy('parse'); setError(null)
    try {
      const r = await api<ParseRes>('/campaigns/parse-brief', { method: 'POST', json: { text, product_id: productId || null } })
      setBriefRun(r)
      if (r.brief) { setBrief(r.brief); setInterests(r.brief.preferred_interests.join(', ')) } else setBrief(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function launch() {
    if (!brief) return
    setBusy('launch'); setError(null)
    try {
      const b = { ...brief, preferred_interests: interests.split(',').map(s => s.trim()).filter(Boolean) }
      const c = await api<{ campaign_id: string }>('/campaigns', { method: 'POST', json: { brief: b, brief_run_id: briefRun?.run_id } })
      await api(`/campaigns/${c.campaign_id}/match`, { method: 'POST', json: {} })
      nav(`/admin/campaigns/${c.campaign_id}`)
    } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setBrief(b => (b ? { ...b, [k]: v } : b))
  const setF = (k: keyof Brief['filters'], v: number) => setBrief(b => (b ? { ...b, filters: { ...b.filters, [k]: v } } : b))
  const toggleSeg = (s: string) => brief && set('target_age_segments', brief.target_age_segments.includes(s) ? brief.target_age_segments.filter(x => x !== s) : [...brief.target_age_segments, s])

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Create campaign</h1>
        <p className="text-sm text-muted">Describe the campaign in plain English or just pick a product. The Campaign Brief Agent turns it into a structured brief you can review before anything runs.</p>
      </header>

      <Card className="space-y-4 p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Product" hint={product ? `${product.category} · ${fmt.gbp(product.price_gbp)} · targets ${product.target_gender_or_collection}, ${product.target_age_segments.join(' / ')}` : 'Optional if your brief names the product'}>
            <select className={inputCls} value={productId} onChange={e => setProductId(e.target.value)}>
              <option value="">— Let the agent find the product —</option>
              {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.category})</option>)}
            </select>
          </Field>
          <Field label="Campaign request (natural language)">
            <textarea className={`${inputCls} h-24 resize-y`} value={text} onChange={e => setText(e.target.value)} placeholder={EXAMPLE} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={interpret} disabled={busy !== null || (!text.trim() && !productId)}>{busy === 'parse' ? <Spinner /> : <Sparkles size={16} aria-hidden="true" />} Interpret brief</Button>
          <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLE)}>Use example</Button>
        </div>
        {error && <ErrorState message={error} />}
      </Card>

      {briefRun?.warning && brief && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm"><b>Model call failed, rule-based fallback used.</b> {briefRun.warning} <a className="font-semibold text-[#066a87] underline" href="/admin/settings">Check Settings</a></div>}

      {briefRun && !brief && (
        <Card className="space-y-3 border-amber-200 bg-amber-50 p-5" >
          <div role="alert"><b>The agent needs your input</b>
            <ul className="mt-1 list-disc pl-5 text-sm">{briefRun.needs_clarification.map(c => <li key={c}>{c}</li>)}</ul></div>
          {briefRun.candidates?.length > 0 && <div className="flex flex-wrap gap-2">
            {briefRun.candidates.map(c => <Button key={c.product_id} variant="outline" size="sm" onClick={() => setProductId(c.product_id)}>{c.product_name}</Button>)}
          </div>}
          <p className="text-xs text-muted">Choose a product above and press “Interpret brief” again.</p>
        </Card>
      )}

      {brief && (
        <Card className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Review brief</h2>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Badge tone="brand">{briefRun?.trace.mode === 'llm' ? `Interpreted by ${briefRun.trace.provider} · ${briefRun.trace.model}` : 'Rule-based interpretation (offline mode)'}</Badge>
              {briefRun && briefRun.usage.total_tokens > 0 && <Badge>{fmt.n(briefRun.usage.total_tokens)} tokens · {briefRun.usage.token_source}</Badge>}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Product">
              <select className={inputCls} value={brief.product_id} onChange={e => set('product_id', e.target.value)}>
                {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
              </select>
            </Field>
            <Field label="Objective">
              <select className={inputCls} value={brief.objective} onChange={e => set('objective', e.target.value)}>
                {['awareness', 'launch', 'engagement', 'sales'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Target gender / collection">
              <select className={inputCls} value={brief.target} onChange={e => set('target', e.target.value)}>
                {meta?.targets.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Location"><input className={inputCls} value={brief.location} onChange={e => set('location', e.target.value)} /></Field>
            <Field label="Budget (£, optional)">
              <input className={inputCls} type="number" min={0} value={brief.budget_gbp ?? ''} onChange={e => set('budget_gbp', e.target.value === '' ? null : Number(e.target.value))} />
            </Field>
            <Field label="Interests / categories (comma separated)"><input className={inputCls} value={interests} onChange={e => setInterests(e.target.value)} placeholder="streetwear, denim" /></Field>
          </div>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Target age segments</legend>
            <div className="flex flex-wrap gap-2">
              {meta?.age_segments.map(s => (
                <label key={s} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${brief.target_age_segments.includes(s) ? 'border-brand bg-brand text-ink' : 'border-line bg-white'}`}>
                  <input type="checkbox" className="sr-only" checked={brief.target_age_segments.includes(s)} onChange={() => toggleSeg(s)} />{s}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Minimum followers" hint="Eligibility threshold (configurable default)"><input className={inputCls} type="number" min={0} value={brief.filters.min_followers} onChange={e => setF('min_followers', Number(e.target.value))} /></Field>
            <Field label="Minimum median promo views" hint="Eligibility threshold (configurable default)"><input className={inputCls} type="number" min={0} value={brief.filters.min_promo_views} onChange={e => setF('min_promo_views', Number(e.target.value))} /></Field>
            <Field label="Minimum audience match (0–100)" hint="Level 2 cut-off"><input className={inputCls} type="number" min={0} max={100} value={brief.filters.min_audience_match} onChange={e => setF('min_audience_match', Number(e.target.value))} /></Field>
          </div>
          <button className="inline-flex items-center gap-1.5 text-sm font-medium text-[#066a87]" onClick={() => setShowAdv(v => !v)} aria-expanded={showAdv}><SlidersHorizontal size={15} aria-hidden="true" />Scoring weights</button>
          {showAdv && (
            <div className="grid gap-3 rounded-xl bg-ice p-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(brief.weights) as (keyof Brief['weights'])[]).map(k => (
                <Field key={k} label={`${k.replace('_', ' ')} (${brief.weights[k]})`}>
                  <input type="range" min={0} max={50} value={brief.weights[k]} className="w-full accent-[#01ABDD]" onChange={e => setBrief({ ...brief, weights: { ...brief.weights, [k]: Number(e.target.value) } })} />
                </Field>
              ))}
              <p className="text-xs text-muted sm:col-span-2 lg:col-span-4">Weights are normalised to 100% by the backend. Follower count is an eligibility rule, not a ranking weight.</p>
            </div>
          )}
          {brief.prioritise_micro && <p className="text-sm text-muted">Micro-influencers will be highlighted (10k–100k followers).</p>}
          <div className="flex justify-end"><Button onClick={launch} disabled={busy !== null || brief.target_age_segments.length === 0}>{busy === 'launch' ? <Spinner /> : <Rocket size={16} aria-hidden="true" />} Launch matching workflow</Button></div>
        </Card>
      )}
    </div>
  )
}
