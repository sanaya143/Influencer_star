import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Archive, ArrowLeft, ExternalLink, ImagePlus, Megaphone, Plus, RotateCcw, Save, Trash2, Upload, X } from 'lucide-react'
import { api, ApiError, fmt, type InventoryMeta, type InventoryProduct, type ProductInput } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, ProductImage, Segmented, Skeleton, Spinner, inputCls } from '../shared/ui'
import { useToast } from '../shared/toast'
import { SizeChips } from './Inventory'

const BLANK: ProductInput = {
  product_name: '', description: '', category: 'Women', price_gbp: 0, sizes: ['XS', 'S', 'M', 'L', 'XL'], stock: { XS: 10, S: 10, M: 10, L: 10, XL: 10 },
  target_age_segments: ['18-24'], target_gender_or_collection: 'women', style_tags: [], target_region: 'UK', product_image: '',
  seasonal_collection: '', badges: ['New'], colour: '', status: 'active',
}
const CATEGORY_DEFAULTS: Record<string, { target: string; preset: string }> = {
  Women: { target: 'women', preset: 'Clothing' }, Men: { target: 'men', preset: 'Clothing' }, Kids: { target: 'kids', preset: 'Kids' },
  Unisex: { target: 'unisex', preset: 'Clothing' }, 'Couple Looks': { target: 'couple', preset: 'Clothing' }, Accessories: { target: 'unisex', preset: 'One size' },
}
const MAX_UPLOAD = 4 * 1024 * 1024

function Section({ title, hint, children, delay = 0 }: { title: string; hint?: string; children: ReactNode; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}>
      <Card className="p-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        <div className="mt-4 space-y-4">{children}</div>
      </Card>
    </motion.div>
  )
}

function Field({ label, error, hint, children, required = false, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <div className="text-sm">
      <label htmlFor={htmlFor} className="mb-1 block font-medium">{label}{required && <span className="text-brand-ink" aria-hidden="true"> *</span>}</label>
      {children}
      <AnimatePresence initial={false}>
        {error ? <motion.p key="e" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} role="alert" className="mt-1 text-xs font-medium text-red-700 dark:text-red-300">{error}</motion.p>
          : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      </AnimatePresence>
    </div>
  )
}

function Chip({ on, children, onClick }: { on: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition-all active:scale-95 ${on ? 'border-brand bg-brand font-semibold text-on-brand' : 'border-line bg-surface hover:border-brand/60'}`}>{children}</button>
  )
}

export default function ProductForm() {
  const { productId } = useParams()
  const editing = !!productId
  const nav = useNavigate()
  const toast = useToast()
  const meta = useApi<InventoryMeta>('/inventory/meta').data
  const existing = useApi<InventoryProduct>(editing ? `/inventory/products/${productId}` : null)
  const [form, setForm] = useState<ProductInput>(BLANK)
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState<'save' | 'upload' | 'status' | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const [newSize, setNewSize] = useState('')
  const [newTag, setNewTag] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const p = existing.data
    if (!p) return
    setForm({ product_name: p.product_name, description: p.description, category: p.category, price_gbp: p.price_gbp, sizes: p.sizes, stock: p.stock,
      target_age_segments: p.target_age_segments, target_gender_or_collection: p.target_gender_or_collection, style_tags: p.style_tags,
      target_region: p.target_region, product_image: p.product_image, seasonal_collection: p.seasonal_collection, badges: p.badges, colour: p.colour, status: p.status })
  }, [existing.data])

  const set = <K extends keyof ProductInput>(k: K, v: ProductInput[K]) => setForm(f => ({ ...f, [k]: v }))
  const toggle = (k: 'target_age_segments' | 'badges' | 'style_tags', v: string) => setForm(f => ({ ...f, [k]: f[k].includes(v) ? f[k].filter(x => x !== v) : [...f[k], v] }))
  const setSizes = (sizes: string[]) => setForm(f => ({ ...f, sizes, stock: Object.fromEntries(sizes.map(s => [s, f.stock[s] ?? 10])) }))
  const changeCategory = (c: string) => {
    set('category', c)
    if (!editing && meta) { const d = CATEGORY_DEFAULTS[c]; set('target_gender_or_collection', d.target); setSizes(meta.size_presets[d.preset]) }
  }

  const errors = useMemo(() => {
    const e: Partial<Record<keyof ProductInput, string>> = {}
    if (form.product_name.trim().length < 2) e.product_name = 'Give the product a name (at least 2 characters).'
    if (form.description.trim().length < 10) e.description = 'Write a short description (at least 10 characters).'
    if (!(form.price_gbp > 0)) e.price_gbp = 'Enter a price above £0.'
    if (!form.sizes.length) e.sizes = 'Add at least one size.'
    if (Object.values(form.stock).some(v => v < 0 || !Number.isFinite(v))) e.stock = 'Stock cannot be negative.'
    if (!form.target_age_segments.length) e.target_age_segments = 'Pick at least one age segment (used for influencer matching).'
    if (form.product_image && !/^(https?:\/\/|\/api\/uploads\/)/.test(form.product_image)) e.product_image = 'Use an http(s) image link or upload a file.'
    return e
  }, [form])
  const show = (k: keyof ProductInput) => (submitted ? errors[k] : undefined)
  const total = form.sizes.reduce((n, s) => n + (form.stock[s] ?? 0), 0)

  async function upload(file: File) {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) { toast({ tone: 'bad', title: 'Unsupported file', body: 'Use a PNG, JPEG, WebP or GIF image.' }); return }
    if (file.size > MAX_UPLOAD) { toast({ tone: 'bad', title: 'Image too large', body: 'Images must be 4 MB or smaller.' }); return }
    setBusy('upload')
    try {
      const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
      const { url } = await api<{ url: string }>('/uploads', { method: 'POST', json: { filename: file.name, data } })
      set('product_image', url)
      toast({ tone: 'ok', title: 'Image uploaded' })
    } catch (e) { toast({ tone: 'bad', title: 'Upload failed', body: (e as Error).message }) } finally { setBusy(null) }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }

  async function save() {
    setSubmitted(true); setServerError(null)
    if (Object.keys(errors).length) { document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return }
    setBusy('save')
    try {
      const body = { ...form, price_gbp: Number(form.price_gbp) }
      const p = await api<InventoryProduct>(editing ? `/inventory/products/${productId}` : '/inventory/products', { method: editing ? 'PUT' : 'POST', json: body })
      toast({ tone: 'ok', title: editing ? 'Product updated' : 'Product created',
        body: p.status === 'active' ? <>Live in the storefront now. <a className="font-semibold text-brand-ink underline" href={`/product/${p.product_id}`} target="_blank" rel="noreferrer">View in store</a></> : 'Saved as a draft: hidden from the storefront.' })
      if (editing) existing.reload(); else nav(`/admin/inventory/${p.product_id}`, { replace: true })
    } catch (e) {
      setServerError(e instanceof ApiError ? e.message : (e as Error).message)
    } finally { setBusy(null) }
  }

  async function setStatus(status: ProductInput['status']) {
    if (!productId) return
    setBusy('status')
    try {
      await api(`/inventory/products/${productId}/status`, { method: 'POST', json: { status } })
      set('status', status); existing.reload()
      toast({ tone: 'ok', title: status === 'archived' ? 'Product archived' : 'Product restored', body: status === 'archived' ? 'Removed from the storefront. Past orders and campaigns keep their history.' : 'Back in the storefront.' })
    } catch (e) { toast({ tone: 'bad', title: 'Could not change status', body: (e as Error).message }) } finally { setBusy(null) }
  }

  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />
  if (!meta || (editing && !existing.data)) return <div className="mx-auto max-w-6xl space-y-4"><Skeleton className="h-16" /><div className="grid gap-4 lg:grid-cols-3"><Skeleton className="h-96 lg:col-span-2" /><Skeleton className="h-96" /></div></div>
  const live = form.status === 'active'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Link to="/admin/inventory" className="inline-flex items-center gap-1 text-sm font-medium text-brand-ink hover:underline"><ArrowLeft size={15} aria-hidden="true" />Inventory</Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold md:text-3xl">{editing ? form.product_name || 'Edit product' : 'Add a product'}</h1>
          <p className="text-sm text-muted">{editing ? <><span className="font-mono">{productId}</span> · last updated {existing.data && fmt.ago(existing.data.updated_at)}</> : 'Saved products appear in the storefront immediately and can be promoted with influencer campaigns.'}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => nav('/admin/inventory')}>Cancel</Button>
          <Button onClick={save} disabled={busy !== null}>{busy === 'save' ? <Spinner /> : <Save size={16} aria-hidden="true" />}{editing ? 'Save changes' : 'Create product'}</Button>
        </div>
      </header>
      <AnimatePresence>{serverError && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><ErrorState message={serverError} /></motion.div>}</AnimatePresence>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <form className="@container min-w-0 space-y-5" onSubmit={e => { e.preventDefault(); save() }} noValidate>
          <Section title="Product details">
            <Field label="Product name" required error={show('product_name')} htmlFor="pf-name">
              <input id="pf-name" className={inputCls} value={form.product_name} maxLength={80} onChange={e => set('product_name', e.target.value)} placeholder="e.g. Recycled Puffer Jacket" />
            </Field>
            <Field label="Description" required error={show('description')} hint={`${form.description.length}/600`} htmlFor="pf-desc">
              <textarea id="pf-desc" className={`${inputCls} h-24 resize-y`} value={form.description} maxLength={600} onChange={e => set('description', e.target.value)} placeholder="What it is, the fit, the fabric and when to wear it." />
            </Field>
            <div className="grid gap-4 @lg:grid-cols-3">
              <Field label="Category" required htmlFor="pf-cat"><select id="pf-cat" className={inputCls} value={form.category} onChange={e => changeCategory(e.target.value)}>{meta.categories.map(c => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Colour" htmlFor="pf-colour"><input id="pf-colour" className={inputCls} value={form.colour} maxLength={30} onChange={e => set('colour', e.target.value)} placeholder="e.g. Sage" /></Field>
              <Field label="Collection" htmlFor="pf-coll">
                <input id="pf-coll" className={inputCls} list="pf-collections" value={form.seasonal_collection} maxLength={40} onChange={e => set('seasonal_collection', e.target.value)} placeholder="e.g. Street Edit" />
                <datalist id="pf-collections">{meta.collections.map(c => <option key={c} value={c} />)}</datalist>
              </Field>
            </div>
          </Section>

          <Section title="Price, badges & visibility" delay={0.05}>
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="Price (£)" required error={show('price_gbp')} htmlFor="pf-price">
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">£</span>
                  <input id="pf-price" type="number" min={0} step="0.01" className={`${inputCls} pl-7`} value={form.price_gbp || ''} onChange={e => set('price_gbp', Number(e.target.value))} placeholder="0.00" /></div>
              </Field>
              <Field label="Visibility" hint={live ? 'Shown and purchasable in the storefront.' : form.status === 'draft' ? 'Hidden from shoppers; you can still plan campaigns.' : 'Archived: hidden everywhere except history.'}>
                <Segmented label="Visibility" value={form.status} onChange={v => set('status', v)}
                  options={[{ value: 'active', label: 'Active' }, { value: 'draft', label: 'Draft' }, ...(editing ? [{ value: 'archived' as const, label: 'Archived' }] : [])]} />
              </Field>
            </div>
            <Field label="Badges"><div className="flex flex-wrap gap-2">{meta.badges.map(b => <Chip key={b} on={form.badges.includes(b)} onClick={() => toggle('badges', b)}>{b}</Chip>)}</div></Field>
          </Section>

          <Section title="Image" hint="Paste an image link or upload a photo (PNG, JPEG, WebP or GIF, up to 4 MB)." delay={0.1}>
            <div className="grid gap-4 @md:grid-cols-[150px_1fr]">
              <div onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
                className={`relative aspect-[3/4] overflow-hidden rounded-xl border-2 border-dashed transition-colors ${drag ? 'border-brand bg-brand/10' : 'border-line'}`}>
                {form.product_image ? <ProductImage src={form.product_image} alt={`${form.product_name || 'Product'} preview`} name={form.product_name} category={form.category} colour={form.colour} width={300} className="h-full w-full" />
                  : <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-xs text-muted"><ImagePlus size={22} aria-hidden="true" />Drop an image here</div>}
                {busy === 'upload' && <div className="absolute inset-0 flex items-center justify-center bg-surface/70"><Spinner /></div>}
              </div>
              <div className="space-y-3">
                <Field label="Image link" error={show('product_image')} htmlFor="pf-img"><input id="pf-img" className={inputCls} value={form.product_image} onChange={e => set('product_image', e.target.value)} placeholder="https://images.unsplash.com/photo-…" /></Field>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" aria-label="Upload product image" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}><Upload size={15} aria-hidden="true" />Upload image</Button>
                  {form.product_image && <Button variant="ghost" size="sm" onClick={() => set('product_image', '')}><X size={15} aria-hidden="true" />Remove</Button>}
                </div>
                <p className="text-xs text-muted">Without an image the shop shows a {form.category.toLowerCase()} illustration matched to the product name.</p>
              </div>
            </div>
          </Section>

          <Section title="Sizes & stock" hint="Units on hand per size. Storefront orders reduce these numbers automatically." delay={0.15}>
            <div className="flex flex-wrap gap-2">
              {Object.entries(meta.size_presets).map(([name, sizes]) => <Chip key={name} on={JSON.stringify(sizes) === JSON.stringify(form.sizes)} onClick={() => setSizes(sizes)}>{name}</Chip>)}
            </div>
            {show('sizes') && <p role="alert" className="text-xs font-medium text-red-700 dark:text-red-300">{errors.sizes}</p>}
            <ul className="grid gap-2 @md:grid-cols-2 @2xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {form.sizes.map(s => (
                  <motion.li key={s} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2 rounded-xl border border-line bg-ice p-2">
                    <span className="w-16 truncate text-sm font-semibold">{s}</span>
                    <input type="number" min={0} aria-label={`Stock for size ${s}`} value={form.stock[s] ?? 0} onChange={e => set('stock', { ...form.stock, [s]: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} className={`${inputCls} tabular w-20 py-1.5`} />
                    <span className="flex-1 text-[11px] text-muted">{(form.stock[s] ?? 0) === 0 ? 'sold out' : (form.stock[s] ?? 0) <= meta.thresholds.low_stock_per_size ? 'low' : ''}</span>
                    <button type="button" onClick={() => setSizes(form.sizes.filter(x => x !== s))} aria-label={`Remove size ${s}`} className="rounded p-1 text-muted hover:text-red-600"><Trash2 size={14} aria-hidden="true" /></button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <div className="flex flex-wrap items-center gap-2">
              <input aria-label="New size" value={newSize} onChange={e => setNewSize(e.target.value)} maxLength={10} placeholder="Add a size, e.g. XXL" className={`${inputCls} w-44`}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newSize.trim() && !form.sizes.includes(newSize.trim())) { setSizes([...form.sizes, newSize.trim()]); setNewSize('') } } }} />
              <Button variant="outline" size="sm" disabled={!newSize.trim() || form.sizes.includes(newSize.trim())} onClick={() => { setSizes([...form.sizes, newSize.trim()]); setNewSize('') }}><Plus size={15} aria-hidden="true" />Add size</Button>
              <span className="tabular ml-auto text-sm text-muted">Total <b className="text-ink">{fmt.n(total)}</b> units</span>
            </div>
          </Section>

          <Section title="Audience & style" hint="Used by the influencer-matching engine to find creators whose audiences fit this product." delay={0.2}>
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="Target collection" required htmlFor="pf-target"><select id="pf-target" className={`${inputCls} capitalize`} value={form.target_gender_or_collection} onChange={e => set('target_gender_or_collection', e.target.value)}>{meta.targets.map(t => <option key={t} value={t}>{t}</option>)}</select></Field>
              <Field label="Target region" htmlFor="pf-region"><input id="pf-region" className={inputCls} value={form.target_region} onChange={e => set('target_region', e.target.value)} /></Field>
            </div>
            <Field label="Target age segments" required error={show('target_age_segments')}>
              <div className="flex flex-wrap gap-2">{meta.age_segments.map(a => <Chip key={a} on={form.target_age_segments.includes(a)} onClick={() => toggle('target_age_segments', a)}>{a}</Chip>)}</div>
            </Field>
            <Field label="Style tags" hint="Up to 8. These become campaign keywords.">
              <div className="flex flex-wrap gap-2">
                {[...new Set([...meta.style_tags, ...form.style_tags])].map(t => <Chip key={t} on={form.style_tags.includes(t)} onClick={() => toggle('style_tags', t)}>{t}</Chip>)}
                <input aria-label="Custom style tag" value={newTag} onChange={e => setNewTag(e.target.value)} maxLength={24} placeholder="+ custom tag" className="w-32 rounded-full border border-dashed border-line bg-transparent px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const t = newTag.trim().toLowerCase(); if (t && !form.style_tags.includes(t)) set('style_tags', [...form.style_tags, t]); setNewTag('') } }} />
              </div>
            </Field>
          </Section>
          <button type="submit" className="sr-only">Save</button>
        </form>

        <aside className="grid gap-4 self-start md:grid-cols-2 xl:sticky xl:top-20 xl:block xl:space-y-4">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Storefront preview</p>
              <Badge tone={live ? 'ok' : form.status === 'draft' ? 'neutral' : 'bad'}>{live ? 'Live' : form.status === 'draft' ? 'Draft · hidden' : 'Archived'}</Badge>
            </div>
            <div className="p-4">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl">
                <ProductImage src={form.product_image} alt={form.product_name || 'Product preview'} name={form.product_name} category={form.category} colour={form.colour} width={400} className="h-full w-full" />
                <div className="absolute left-2 top-2 flex flex-wrap gap-1">{form.badges.map(b => <span key={b} className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold">{b}</span>)}</div>
              </div>
              <motion.div layout className="mt-3">
                <p className="font-semibold leading-tight">{form.product_name || 'Product name'}</p>
                <p className="text-sm">{form.price_gbp > 0 ? fmt.gbp(form.price_gbp) : '£—'} <span className="text-xs text-muted">· {form.category}{form.colour ? ` · ${form.colour}` : ''}</span></p>
                <div className="mt-2"><SizeChips p={form} low={meta.thresholds.low_stock_per_size} /></div>
              </motion.div>
              <dl className="mt-4 space-y-1 border-t border-line pt-3 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted">Matching audience</dt><dd className="text-right capitalize">{form.target_gender_or_collection} · {form.target_age_segments.join(', ') || '—'}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted">Keywords</dt><dd className="text-right">{[...form.style_tags, form.seasonal_collection.toLowerCase()].filter(Boolean).join(', ') || '—'}</dd></div>
              </dl>
            </div>
          </Card>
          {editing && existing.data && (
            <>
              <Card className="space-y-2 p-4">
                <Link to={`/admin/campaigns/new?product=${productId}`} className="block"><Button className="w-full"><Megaphone size={16} aria-hidden="true" />Plan influencer campaign</Button></Link>
                {existing.data.status === 'active' && <a href={`/product/${productId}`} target="_blank" rel="noreferrer" className="block"><Button variant="outline" className="w-full"><ExternalLink size={16} aria-hidden="true" />View in storefront</Button></a>}
                {existing.data.status === 'archived'
                  ? <Button variant="outline" className="w-full" disabled={busy !== null} onClick={() => setStatus('active')}><RotateCcw size={16} aria-hidden="true" />Restore to storefront</Button>
                  : <Button variant="danger" className="w-full" disabled={busy !== null} onClick={() => setStatus('archived')}><Archive size={16} aria-hidden="true" />Archive product</Button>}
              </Card>
              <Card className="p-4">
                <h2 className="mb-2 text-sm font-semibold">Stock history</h2>
                {!existing.data.movements?.length ? <p className="text-xs text-muted">No stock movements yet.</p> : (
                  <ul className="space-y-1.5 text-xs">
                    {existing.data.movements.map(m => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate"><b>{m.size}</b> · {m.reason}{m.ref ? <span className="font-mono text-muted"> {m.ref}</span> : ''}</span>
                        <span className="tabular shrink-0"><b className={m.delta < 0 ? '' : 'text-brand-ink'}>{m.delta > 0 ? '+' : ''}{m.delta}</b> <span className="text-muted">→ {m.balance} · {fmt.ago(m.created_at)}</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
