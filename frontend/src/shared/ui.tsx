import { type ButtonHTMLAttributes, type ReactNode, useState } from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2" aria-label="THREADORA">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="#01ABDD" />
        <path d="M8 11h16M16 11v14M10 21c4 3 8-3 12 0" stroke="#111" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      </svg>
      <span className={`font-display font-bold tracking-[0.14em] ${light ? 'text-white' : 'text-ink'}`} style={{ fontSize: size * 0.6 }}>THREADORA</span>
    </span>
  )
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline'; size?: 'sm' | 'md' }
export function Button({ variant = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'
  const sz = size === 'sm' ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-sm'
  const v = variant === 'primary' ? 'bg-brand text-ink hover:bg-[#2bbde8]' : variant === 'outline' ? 'border border-line bg-white text-ink hover:border-brand hover:bg-ice' : 'text-ink hover:bg-ice'
  return <button type="button" {...p} className={`${base} ${sz} ${v} ${className}`} />
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`min-w-0 rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(17,17,17,0.04)] ${className}`}>{children}</div>
)

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warn' | 'ok' | 'bad' }) {
  const t = {
    neutral: 'bg-ice text-muted border-line', brand: 'bg-brand/10 text-[#066a87] border-brand/30', warn: 'bg-amber-50 text-amber-800 border-amber-200',
    ok: 'bg-emerald-50 text-emerald-800 border-emerald-200', bad: 'bg-red-50 text-red-800 border-red-200',
  }[tone]
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>
}

export const Skeleton = ({ className = 'h-6 w-full' }: { className?: string }) => <div className={`skeleton ${className}`} aria-hidden="true" />

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
      <AlertTriangle className="text-red-600" aria-hidden="true" />
      <p className="text-sm text-red-900">{message}</p>
      {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Try again</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-ice p-10 text-center">
      <Inbox className="text-muted" aria-hidden="true" />
      <p className="font-semibold">{title}</p>
      {hint && <p className="max-w-md text-sm text-muted">{hint}</p>}
      {action}
    </div>
  )
}

export function StatusPill({ status }: { status: string }) {
  const tone = status === 'Completed' ? 'ok' : status === 'Running' ? 'brand' : status === 'Failed' ? 'bad' : status === 'Needs Review' ? 'warn' : 'neutral'
  return (
    <Badge tone={tone as 'ok'}>
      {status === 'Running' && <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />}
      {status}
    </Badge>
  )
}

export function ProductImage({ src, alt, category, className = '' }: { src: string; alt: string; category: string; className?: string }) {
  const [state, setState] = useState<'loading' | 'ok' | 'failed'>(src ? 'loading' : 'failed')
  // Local illustration is always rendered underneath, so the tile is never blank while loading or offline.
  return (
    <div className={`relative overflow-hidden bg-ice ${className}`}>
      <div className="absolute inset-0 flex items-center justify-center" role={state === 'ok' ? undefined : 'img'} aria-label={state === 'ok' ? undefined : alt}>
        <svg viewBox="0 0 64 64" width="38%" fill="none" stroke="#01ABDD" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 10 10 18l6 10 6-3v29h20V25l6 3 6-10-12-8c-2 5-6 7-10 7s-8-2-10-7Z" />
        </svg>
        <span className="sr-only">{category}</span>
      </div>
      {src && state !== 'failed' && (
        <img src={src} alt={alt} loading="lazy" onLoad={() => setState('ok')} onError={() => setState('failed')}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${state === 'ok' ? 'opacity-100' : 'opacity-0'}`} />
      )}
    </div>
  )
}

export const Spinner = () => <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-ink/20 border-t-ink" role="status" aria-label="Loading" />
