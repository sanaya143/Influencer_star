import { useId, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

/** A card whose body stays hidden until asked for. The content mounts only when opened, so heavy panels (the agent
 *  brain) cost nothing until someone wants them. */
export default function Collapsible({ title, subtitle, meta, icon, defaultOpen = false, children, className = '' }: {
  title: string; subtitle?: string; meta?: ReactNode; icon?: ReactNode; defaultOpen?: boolean; children: ReactNode; className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={`rounded-xl border border-line bg-surface ${className}`}>
      <h2 className="m-0">
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}
          className="flex w-full items-center gap-3 rounded-xl px-5 py-4 text-left transition-colors hover:bg-ice/60">
          {icon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line text-muted">{icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold leading-tight text-ink">{title}</span>
            {subtitle && <span className="mt-0.5 block text-[13px] font-normal text-muted">{subtitle}</span>}
          </span>
          {meta && <span className="hidden shrink-0 text-xs text-muted sm:block">{meta}</span>}
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-ink">
            {open ? 'Hide' : 'Show'}<ChevronDown size={14} aria-hidden="true" className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>
      </h2>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="overflow-hidden">
            <div className="border-t border-line px-5 pb-5 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
