import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { CircleCheck, CircleX, Info, X } from 'lucide-react'

type Tone = 'ok' | 'bad' | 'info'
interface Toast { id: number; tone: Tone; title: string; body?: ReactNode }
const Ctx = createContext<((t: Omit<Toast, 'id'>) => void) | null>(null)
let seq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const dismiss = useCallback((id: number) => setItems(t => t.filter(x => x.id !== id)), [])
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq
    setItems(cur => [...cur.slice(-3), { ...t, id }])
    setTimeout(() => dismiss(id), 4800)
  }, [dismiss])
  const value = useMemo(() => push, [push])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6 md:right-6 md:left-auto md:items-end">
        <AnimatePresence initial={false}>
          {items.map(t => {
            const Icon = t.tone === 'ok' ? CircleCheck : t.tone === 'bad' ? CircleX : Info
            return (
              <motion.div key={t.id} layout initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className="shadow-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-raised p-3.5 text-sm">
                <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${t.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : t.tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-brand-ink'}`} />
                <div className="min-w-0 flex-1"><p className="font-semibold">{t.title}</p>{t.body && <div className="mt-0.5 text-muted">{t.body}</div>}</div>
                <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss notification" className="rounded p-0.5 text-muted hover:text-ink"><X size={15} aria-hidden="true" /></button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  )
}

export function useToast() {
  const c = useContext(Ctx)
  if (!c) throw new Error('ToastProvider missing')
  return c
}
