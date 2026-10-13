import { type ButtonHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Inbox, X } from 'lucide-react'
import { imgSrc } from '../api'
import { GarmentArt } from './garments'

// Zylo logo (gold wordmark with hanger). `size` is the visual scale used across the app; the image is 2.2:1.
export function Logo({ size = 28, tagline }: { size?: number; light?: boolean; tagline?: string }) {
  const h = Math.round(size * 1.45)
  return (
    <span className="inline-flex flex-col items-start" aria-label="Zylo">
      <img src="/zylo-wordmark.png" alt="Zylo" height={h} width={Math.round(h * 2.21)} decoding="async" draggable={false} style={{ height: h, width: 'auto' }} />
      {tagline && <span className="-mt-0.5 pl-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{tagline}</span>}
    </span>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; size?: 'sm' | 'md' }
export function Button({ variant = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 cursor-pointer'
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'
  const v = {
    primary: 'bg-brand text-on-brand shadow-[0_6px_18px_-8px_rgba(1,171,221,0.7)] hover:-translate-y-px hover:bg-brand-hover',
    outline: 'border border-line bg-surface text-ink hover:border-brand hover:bg-ice',
    ghost: 'text-ink hover:bg-ice',
    danger: 'border border-red-200 bg-surface text-red-700 hover:bg-red-50 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500/10',
  }[variant]
  return <button type="button" {...p} className={`${base} ${sz} ${v} ${className}`} />
}

export const Card = ({ children, className = '', hover = false }: { children: ReactNode; className?: string; hover?: boolean }) => (
  <div className={`shadow-card min-w-0 rounded-2xl border border-line bg-surface ${hover ? 'transition-all duration-300 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-pop' : ''} ${className}`}>{children}</div>
)

export type Tone = 'neutral' | 'brand' | 'warn' | 'ok' | 'bad'
export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: Tone; className?: string }) {
  const t = {
    neutral: 'bg-ice text-muted border-line',
    brand: 'bg-brand/10 text-brand-ink border-brand/30',
    warn: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:border-amber-400/30',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:border-emerald-400/30',
    bad: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-400/10 dark:text-red-300 dark:border-red-400/30',
  }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${t} ${className}`}>{children}</span>
}

export const Skeleton = ({ className = 'h-6 w-full' }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-400/30 dark:bg-red-400/10">
      <AlertTriangle className="text-red-600 dark:text-red-400" aria-hidden="true" />
      <p className="text-sm text-red-900 dark:text-red-200">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-ice p-10 text-center">
      <Inbox className="text-muted" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action}
    </motion.div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone: Tone = status === 'Completed' ? 'ok' : status === 'Running' ? 'brand' : status === 'Failed' ? 'bad' : status === 'Needs Review' ? 'warn' : 'neutral'
  return (
    <Badge tone={tone}>
      {status === 'Running' && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />}
      {status}
    </Badge>
  )
}

export function ProductImage({ src, alt, category, name, colour, className = '', width = 600, priority = false }: {
  src: string; alt: string; category: string; name?: string; colour?: string; className?: string; width?: number; priority?: boolean
}) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>(src ? 'loading' : 'failed')
  useEffect(() => { setState(src ? 'loading' : 'failed') }, [src])
  // The garment illustration sits underneath, so the tile is never blank while loading or offline.
  return (
    <div className={`relative overflow-hidden bg-ice ${className}`}>
      <div className="absolute inset-0 flex items-center justify-center" role={state === 'ok' ? undefined : 'img'} aria-label={state === 'ok' ? undefined : alt}>
        <GarmentArt name={name ?? alt} category={category} colour={colour} className={`w-[42%] transition-opacity duration-300 ${state === 'loading' ? 'opacity-40' : 'opacity-100'}`} />
        <span className="sr-only">{category}</span>
      </div>
      {src && state !== 'failed' && (
        <img src={imgSrc(src, width)} srcSet={src.includes('images.unsplash.com') ? `${imgSrc(src, width)} 1x, ${imgSrc(src, width * 2)} 2x` : undefined}
          alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" onLoad={() => setState('ok')} onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </div>
  )
}

export const Spinner = () => <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current/20 border-t-current" role="status" aria-label="Loading" />

const AVATAR_TONES = ['bg-[#d9f3fb] text-[#05556d]', 'bg-[#fde3d8] text-[#8a3413]', 'bg-[#e4e0f7] text-[#3a2d8a]', 'bg-[#d6f3e8] text-[#0e6544]', 'bg-[#fbecc8] text-[#7a5300]']
export function Avatar({ name, size = 36, className = '' }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.38 }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${AVATAR_TONES[h % AVATAR_TONES.length]} ${className}`}>{initials}</span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label, size = 'md' }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" aria-label={label} className="relative inline-flex rounded-xl border border-line bg-surface p-1 text-sm">
      {options.map(o => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`relative rounded-lg font-medium transition-colors ${size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5'} ${value === o.value ? 'text-on-brand' : 'text-muted hover:text-ink'}`}>
          {value === o.value && <motion.span layoutId={`seg-${label}`} className="absolute inset-0 rounded-lg bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    setTimeout(() => closeRef.current?.focus(), 30)
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.() }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
            initial={{ y: 40, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className={`shadow-pop max-h-[90vh] w-full overflow-auto rounded-t-2xl border border-line bg-raised p-5 sm:rounded-2xl ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-muted hover:bg-ice hover:text-ink"><X size={18} aria-hidden="true" /></button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function Stat({ label, value, sub, icon, accent = false }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; accent?: boolean }) {
  return (
    <Card hover className={`h-full p-4 ${accent ? 'border-brand/40' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted">{label}</p>
        {icon && <span className="rounded-lg bg-brand/10 p-1.5 text-brand-ink">{icon}</span>}
      </div>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  )
}

export const inputCls = 'w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted/70 transition-colors focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30'
export const selectCls = 'rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-brand focus:outline-none'
