import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import { AnimatePresence, animate, motion, useInView, useReducedMotionConfig, type Variants } from 'framer-motion'

export const ease = [0.22, 1, 0.36, 1] as const

/** Router outlet with a soft fade/slide between pages. `keyOf` decides which path changes count as a new page.
 *  The current page stays live (context updates flow through); AnimatePresence keeps the outgoing page's last
 *  rendered element on screen while it exits. */
export function AnimatedOutlet({ keyOf, className, context }: { keyOf?: (pathname: string) => string; className?: string; context?: unknown }) {
  const { pathname } = useLocation()
  const outlet = useOutlet(context)
  const key = keyOf ? keyOf(pathname) : pathname
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={key} className={className} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.24, ease }}>
        {outlet}
      </motion.div>
    </AnimatePresence>
  )
}

export const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } } }
export const rise: Variants = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease } } }

export function Reveal({ children, delay = 0, className = '', y = 16 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease }}>
      {children}
    </motion.div>
  )
}

/** Number that counts up when it scrolls into view (instant when reduced motion is on). */
export function CountUp({ value, format = (v: number) => Math.round(v).toLocaleString('en-GB'), duration = 0.9 }: { value: number; format?: (v: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })
  const reduce = useReducedMotionConfig()
  const [shown, setShown] = useState(reduce ? value : 0)
  const last = useRef(0)
  useEffect(() => {
    if (!inView) return
    if (reduce) { setShown(value); last.current = value; return }
    const c = animate(last.current, value, { duration, ease, onUpdate: v => setShown(v) })
    last.current = value
    return () => c.stop()
  }, [inView, value, reduce, duration])
  return <span ref={ref}>{format(shown)}</span>
}
