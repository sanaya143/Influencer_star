import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardCheck, Layers, Rocket, Shirt, SlidersHorizontal, Users } from 'lucide-react'
import { api, fmt, imgSrc, type Brief, type CollectionView, type Meta, type Paged, type Product } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, ProductImage, Segmented, Skeleton, Spinner, inputCls } from '../shared/ui'

interface PrepareRes {
  status: string; brief: Brief | null; needs_clarification: string[]; target_kind: 'product' | 'collection' | null
  candidates: { product_id: string; product_name: string }[]; collection_candidates: { collection_id: string; name: string }[]
  picked_up: Record<string, unknown>
}
type Mode = 'product' | 'collection'

const EXAMPLE: Record<Mode, string> = {
  product: 'UK women aged 18–24, streetwear, prioritise micro-influencers, budget £3,000',
  collection: 'UK fans aged 18–34, focus on sales, budget £5,000',
}
const AGE_TEXT: Record<string, string> = { children: 'parents of young children', teens: 'teens', '18-24': '18–24', '25-34': '25–34', '35-54': '35–54', '55+': 'over 55' }
const WHO: Record<string, string> = { women: 'women', men: 'men', unisex: 'shoppers', couple: 'couples', family: 'families', kids: 'families' }

function ageList(ages: string[]): string {
  const adult = ages.filter(a => a !== 'children' && a !== 'teens').map(a => AGE_TEXT[a] ?? a)
  const span = adult.length ? `aged ${adult.length > 1 ? `${adult[0].split('–')[0]}–${adult[adult.length - 1].split('–').pop()}` : adult[0]}` : ''
  const extra = ages.filter(a => a === 'children' || a === 'teens').map(a => AGE_TEXT[a])
  return [span, ...extra].filter(Boolean).join(' and ')
}

/** Who the campaign is for, in words the brief parser reads back (target + age segments). */
function audience(target: string, ages: string[]): string {
  if (ages.includes('children')) return `families with young children, parents ${ageList(ages.filter(a => a !== 'children')) || 'aged 25–54'}`
  return `${WHO[target] ?? 'shoppers'} ${ageList(ages)}`
}

/** A ready-to-run request written from what was picked, so the example always fits the product or collection. */
function exampleFor(product?: Product, collection?: CollectionView): string {
  if (collection) {
    const themes = collection.content_themes.slice(0, 2).join(' and ')
    const goal = collection.kind === 'sale' ? 'focus on sales' : 'build awareness'
    return `UK ${audience(collection.target, collection.target_age_segments)}, creators who post about ${themes}, ${goal}, budget £5,000`.replace(/\s+/g, ' ')
  }
  if (product) {
    const style = product.style_tags.filter(t => !['kids', 'family', 'couple'].includes(t)).slice(0, 2).join(' and ') || product.category.toLowerCase()
    const micro = product.price_gbp < 40 ? ', prioritise micro-influencers' : ''
    const budget = product.price_gbp >= 60 ? '£5,000' : '£3,000'
    return `UK ${audience(product.target_gender_or_collection, product.target_age_segments)}, ${style} content${micro}, budget ${budget}`.replace(/\s+/g, ' ')
  }
  return ''
}
const KIND_LABEL: Record<CollectionView['kind'], string> = { licensed: 'Licensed', seasonal: 'Seasonal', sale: 'Sale', edit: 'Edit' }

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block text-sm"><span className="mb-1 block font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>
)
const pretty = (k: string, v: unknown) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`

function CollectionCard({ c, selected, onPick }: { c: CollectionView; selected: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={selected}
      className={`group flex gap-3 rounded-2xl border p-3 text-left transition-colors ${selected ? 'border-brand bg-brand/10 ring-2 ring-brand/30' : 'border-line bg-surface hover:border-brand/60 hover:bg-ice'}`}>
      <span className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-xl bg-ice">
        {c.image && <img src={imgSrc(c.image, 160)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{c.name}</span>
          <Badge tone={c.kind === 'sale' ? 'warn' : c.kind === 'licensed' ? 'brand' : 'neutral'}>{c.kind === 'sale' && c.discount_pct ? `${KIND_LABEL[c.kind]} −${c.discount_pct}%` : KIND_LABEL[c.kind]}</Badge></span>
        <span className="mt-0.5 block text-xs text-muted">{c.tagline}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">{c.content_themes.slice(0, 4).map(t => <span key={t} className="rounded-full bg-ice px-2 py-0.5 text-[11px]">#{t}</span>)}</span>
        <span className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted"><span><Shirt size={11} aria-hidden="true" className="mr-1 inline" />{c.products.length} products</span>
          {c.creators_with_themes != null && <span><Users size={11} aria-hidden="true" className="mr-1 inline" />{fmt.n(c.creators_with_themes)} creators post about it</span>}</span>
      </span>
    </button>
  )
}

export default function CreateCampaign() {
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const meta = useApi<Meta>('/meta').data
  const products = useApi<Paged<Product>>('/products?page_size=100').data?.items ?? []
  const cols = useApi<{ items: CollectionView[] }>('/collections')
  const collections = cols.data?.items ?? []
  const [mode, setMode] = useState<Mode>(sp.get('collection') ? 'collection' : 'product')
  const [productId, setProductId] = useState(sp.get('product') ?? '')
  const [collectionId, setCollectionId] = useState(sp.get('collection') ?? '')
  const [text, setText] = useState('')
  const [brief, setBrief] = useState<Brief | null>(null)
  const [prep, setPrep] = useState<PrepareRes | null>(null)
  const [busy, setBusy] = useState<'prepare' | 'launch' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAdv, setShowAdv] = useState(false)
  const [interests, setInterests] = useState('')
  const [themes, setThemes] = useState('')

  const product = useMemo(() => products.find(p => p.product_id === productId), [products, productId])
  const collection = useMemo(() => collections.find(c => c.collection_id === collectionId), [collections, collectionId])
  // The request fills itself in for whatever is picked, unless the marketer has written their own.
  const suggestion = exampleFor(mode === 'product' ? product : undefined, mode === 'collection' ? collection : undefined)
  const autoText = useRef('')
  useEffect(() => {
    const previous = autoText.current  // read before the updater runs: React calls it later, during the next render
    autoText.current = suggestion
    setText(t => (t.trim() === '' || t === previous ? suggestion : t))
  }, [suggestion])
  const briefCollection = useMemo(() => collections.find(c => c.collection_id === brief?.collection_id), [collections, brief?.collection_id])
  useEffect(() => { if (sp.get('product')) { setProductId(sp.get('product')!); setMode('product') } }, [sp])
  useEffect(() => { setBrief(null); setPrep(null) }, [mode, productId, collectionId])

  async function prepare() {
    setBusy('prepare'); setError(null)
    try {
      const target = mode === 'product' ? { product_id: productId || null } : { collection_id: collectionId || null }
      const r = await api<PrepareRes>('/campaigns/parse-brief', { method: 'POST', json: { text, ...target } })
      setPrep(r)
      if (r.brief) {
        setBrief(r.brief); setInterests(r.brief.preferred_interests.join(', ')); setThemes((r.brief.content_themes ?? []).join(', '))
      } else setBrief(null)
    } catch (e) { setError((e as Error).message) } finally { setBusy(null) }
  }

  async function launch() {
    if (!brief) return
    setBusy('launch'); setError(null)
    try {
      const list = (s: string) => s.split(',').map(x => x.trim().toLowerCase()).filter(Boolean)
      const b = { ...brief, preferred_interests: list(interests), ...(brief.collection_id ? { content_themes: list(themes) } : {}) }
      const c = await api<{ campaign_id: string }>('/campaigns', { method: 'POST', json: { brief: b } })
      await api(`/campaigns/${c.campaign_id}/match`, { method: 'POST', json: {} })
      nav(`/admin/campaigns/${c.campaign_id}/agents`)
    } catch (e) { setError((e as Error).message); setBusy(null) }
  }

  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setBrief(b => (b ? { ...b, [k]: v } : b))
  const setF = (k: keyof Brief['filters'], v: number | boolean) => setBrief(b => (b ? { ...b, filters: { ...b.filters, [k]: v } } : b))
  const toggleSeg = (s: string) => brief && set('target_age_segments', brief.target_age_segments.includes(s) ? brief.target_age_segments.filter(x => x !== s) : [...brief.target_age_segments, s])
  const canPrepare = mode === 'product' ? !!productId || !!text.trim() : !!collectionId || !!text.trim()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Create campaign</h1>
        <p className="text-sm text-muted">Promote one product or a whole collection. Zylo prepares the brief instantly from your choices, you review it, then the agents find, rank and budget the creators.</p>
      </header>

      <Card className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">1. What are you promoting?</h2>
          <Segmented label="Promote" value={mode} onChange={setMode}
            options={[{ value: 'product', label: <span className="inline-flex items-center gap-1.5"><Shirt size={14} aria-hidden="true" />One product</span> },
                      { value: 'collection', label: <span className="inline-flex items-center gap-1.5"><Layers size={14} aria-hidden="true" />A collection</span> }]} />
        </div>

        {mode === 'product' ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <Field label="Product" hint={product ? `${product.category} · ${fmt.gbp(product.price_gbp)} · targets ${product.target_gender_or_collection}, ${product.target_age_segments.join(' / ')} · ${product.total_stock} in stock` : 'Or name it in the request below'}>
              <select className={inputCls} value={productId} onChange={e => setProductId(e.target.value)}>
                <option value="">Choose a product…</option>
                {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name} ({p.category})</option>)}
              </select>
            </Field>
            {product && <ProductImage src={product.product_image} alt={product.product_name} name={product.product_name} category={product.category} colour={product.colour} width={120} className="hidden h-20 w-[60px] rounded-xl md:block" />}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-sm text-muted">A collection campaign only keeps creators who already post about the collection's themes, for example comics and cosplay for Marvel & DC.</p>
            {cols.loading ? <div className="grid gap-3 md:grid-cols-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div> : (
              <div className="grid gap-3 md:grid-cols-2" role="group" aria-label="Collections">
                {collections.map((c, i) => (
                  <motion.div key={c.collection_id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                    <CollectionCard c={c} selected={c.collection_id === collectionId} onPick={() => setCollectionId(c.collection_id)} />
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        <Field label="Campaign request" hint={suggestion && text === suggestion ? 'Suggested from your selection. Edit it freely: ages, gender, city, budget, follower or view minimums, micro-influencers, objective.' : 'Ages, gender, city, budget, follower or view minimums, micro-influencers, objective. Read by rules, instantly.'}>
          <textarea className={`${inputCls} h-20 resize-y`} value={text} onChange={e => setText(e.target.value)} placeholder={suggestion || EXAMPLE[mode]} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={prepare} disabled={busy !== null || !canPrepare}>{busy === 'prepare' ? <Spinner /> : <ClipboardCheck size={16} aria-hidden="true" />} Prepare brief</Button>
          {suggestion && text !== suggestion && <Button variant="ghost" size="sm" onClick={() => setText(suggestion)}>Use suggestion</Button>}
          {!suggestion && <Button variant="ghost" size="sm" onClick={() => setText(EXAMPLE[mode])}>Use example</Button>}
          <span className="text-xs text-muted">Open-ended question instead? Ask the assistant (bottom right).</span>
        </div>
        {error && <ErrorState message={error} />}
      </Card>

      {prep && !brief && (
        <Card className="space-y-3 border-amber-200 bg-amber-50 p-5 dark:border-amber-400/30 dark:bg-amber-400/10">
          <div role="alert"><b>Pick what to promote</b><ul className="mt-1 list-disc pl-5 text-sm">{prep.needs_clarification.map(c => <li key={c}>{c}</li>)}</ul></div>
          {(prep.candidates.length > 0 || prep.collection_candidates.length > 0) && <div className="flex flex-wrap gap-2">
            {prep.collection_candidates.map(c => <Button key={c.collection_id} variant="outline" size="sm" onClick={() => { setMode('collection'); setCollectionId(c.collection_id) }}><Layers size={14} aria-hidden="true" />{c.name}</Button>)}
            {prep.candidates.map(c => <Button key={c.product_id} variant="outline" size="sm" onClick={() => { setMode('product'); setProductId(c.product_id) }}>{c.product_name}</Button>)}
          </div>}
        </Card>
      )}

      {brief && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">2. Review the brief</h2>
              <Badge tone="brand">Prepared instantly by rules · no AI tokens</Badge>
            </div>
            {prep && Object.keys(prep.picked_up).length > 0 && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">Picked up from your request:
                {Object.entries(prep.picked_up).map(([k, v]) => <span key={k} className="rounded-full bg-ice px-2 py-0.5 text-ink">{pretty(k, v)}</span>)}</p>
            )}
            {briefCollection && (
              <div className="rounded-xl border border-line p-3">
                <p className="mb-2 text-sm"><b>{briefCollection.name}</b> <span className="text-muted">· {briefCollection.products.length} products · average {fmt.gbp(briefCollection.avg_price_gbp)}{briefCollection.discount_pct ? ' after discount' : ''}</span></p>
                <div className="scrollbar-thin flex gap-2 overflow-x-auto pb-1">
                  {briefCollection.products.map(p => (
                    <figure key={p.product_id} className="w-20 shrink-0">
                      <ProductImage src={p.product_image} alt={p.product_name} name={p.product_name} category={p.category} colour={p.colour} width={120} className="h-24 w-20 rounded-lg" />
                      <figcaption className="mt-1 line-clamp-2 text-[10px] leading-tight text-muted">{p.product_name}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              {!brief.collection_id && (
                <Field label="Product">
                  <select className={inputCls} value={brief.product_id} onChange={e => set('product_id', e.target.value)}>
                    {products.map(p => <option key={p.product_id} value={p.product_id}>{p.product_name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Objective" hint="Sales plans the budget for orders; the others for relevant views.">
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
              <Field label="Budget (£)" hint="Used for the ROI plan (5,000 if empty).">
                <input className={inputCls} type="number" min={0} step={100} value={brief.budget_gbp ?? ''} onChange={e => set('budget_gbp', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Style interests (comma separated)"><input className={inputCls} value={interests} onChange={e => setInterests(e.target.value)} placeholder="streetwear, denim" /></Field>
            </div>
            {brief.collection_id && (
              <div className="grid gap-3 rounded-xl bg-ice p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <Field label="Content themes creators must post about" hint="From the collection; edit to widen or narrow the pool.">
                  <input className={inputCls} value={themes} onChange={e => setThemes(e.target.value)} />
                </Field>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#01ABDD]" checked={brief.filters.require_content_theme !== false}
                  onChange={e => setF('require_content_theme', e.target.checked)} />Exclude creators with none of them</label>
              </div>
            )}
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Target age segments</legend>
              <div className="flex flex-wrap gap-2">
                {meta?.age_segments.map(s => (
                  <label key={s} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${brief.target_age_segments.includes(s) ? 'border-brand bg-brand text-on-brand' : 'border-line bg-surface hover:border-brand/60'}`}>
                    <input type="checkbox" className="sr-only" checked={brief.target_age_segments.includes(s)} onChange={() => toggleSeg(s)} />{s}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Minimum followers" hint="Eligibility threshold"><input className={inputCls} type="number" min={0} value={brief.filters.min_followers} onChange={e => setF('min_followers', Number(e.target.value))} /></Field>
              <Field label="Minimum median promo views" hint="Eligibility threshold"><input className={inputCls} type="number" min={0} value={brief.filters.min_promo_views} onChange={e => setF('min_promo_views', Number(e.target.value))} /></Field>
              <Field label="Minimum audience match (0–100)" hint="Level 2 cut-off"><input className={inputCls} type="number" min={0} max={100} value={brief.filters.min_audience_match} onChange={e => setF('min_audience_match', Number(e.target.value))} /></Field>
            </div>
            <button className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-ink" onClick={() => setShowAdv(v => !v)} aria-expanded={showAdv}><SlidersHorizontal size={15} aria-hidden="true" />Scoring weights</button>
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
            <div className="flex flex-wrap items-center justify-end gap-3">
              <span className="text-xs text-muted">Runs the Matching Coordinator (with outside creators over MCP, if on) and the Insights agent.</span>
              <Button onClick={launch} disabled={busy !== null || brief.target_age_segments.length === 0}>{busy === 'launch' ? <Spinner /> : <Rocket size={16} aria-hidden="true" />} Launch matching workflow</Button>
            </div>
          </Card>
        </motion.div>
      )}
      {collection && mode === 'collection' && !brief && !prep && <p className="text-center text-xs text-muted">{collection.name} selected. Press “Prepare brief”.</p>}
    </div>
  )
}
