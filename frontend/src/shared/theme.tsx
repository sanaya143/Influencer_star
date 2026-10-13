import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'framer-motion'
import { Moon, Sun } from 'lucide-react'

export type ThemePref = 'light' | 'dark' | 'system'
export type MotionPref = 'system' | 'on' | 'off'
interface ThemeCtx {
  pref: ThemePref; resolved: 'light' | 'dark'; setPref: (p: ThemePref) => void; toggle: () => void
  motion: MotionPref; setMotion: (m: MotionPref) => void; systemReducedMotion: boolean
}
const Ctx = createContext<ThemeCtx | null>(null)
const KEY = 'zylo.theme', MOTION_KEY = 'zylo.motion'

const media = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches
function read<T extends string>(key: string, allowed: T[], fallback: T): T {
  try { const v = localStorage.getItem(key) as T | null; return v && allowed.includes(v) ? v : fallback } catch { return fallback }
}
function write(key: string, v: string) {
  try { localStorage.setItem(key, v) } catch { /* storage unavailable: the choice still applies for this visit */ }
}
function useMedia(q: string) {
  const [m, setM] = useState(() => media(q))
  useEffect(() => {
    const mq = window.matchMedia?.(q)
    if (!mq) return
    const on = (e: MediaQueryListEvent) => setM(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [q])
  return m
}

/** Theme (light/dark) and animation preference. Animations follow the OS "reduce motion" setting unless the
 *  viewer explicitly turns them on or off here; under reduced motion the app keeps gentle fades only. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(() => read(KEY, ['light', 'dark', 'system'], 'system'))
  const [motionPref, setMotionState] = useState<MotionPref>(() => read(MOTION_KEY, ['system', 'on', 'off'], 'system'))
  const sysDark = useMedia('(prefers-color-scheme: dark)')
  const sysReduce = useMedia('(prefers-reduced-motion: reduce)')
  const resolved: 'light' | 'dark' = pref === 'system' ? (sysDark ? 'dark' : 'light') : pref
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('theme-switching')
    root.classList.toggle('dark', resolved === 'dark')
    root.dataset.theme = resolved
    const t = setTimeout(() => root.classList.remove('theme-switching'), 400)
    return () => clearTimeout(t)
  }, [resolved])
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('motion-on', motionPref === 'on')
    root.classList.toggle('motion-off', motionPref === 'off')
  }, [motionPref])
  const setPref = useCallback((p: ThemePref) => { setPrefState(p); write(KEY, p) }, [])
  const setMotion = useCallback((m: MotionPref) => { setMotionState(m); write(MOTION_KEY, m) }, [])
  const value = useMemo(() => ({
    pref, resolved, setPref, toggle: () => setPref(resolved === 'dark' ? 'light' : 'dark'), motion: motionPref, setMotion, systemReducedMotion: sysReduce,
  }), [pref, resolved, setPref, motionPref, setMotion, sysReduce])
  return (
    <Ctx.Provider value={value}>
      <MotionConfig reducedMotion={motionPref === 'on' ? 'never' : motionPref === 'off' ? 'always' : 'user'}>{children}</MotionConfig>
    </Ctx.Provider>
  )
}

export const useTheme = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('ThemeProvider missing')
  return c
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme()
  const dark = resolved === 'dark'
  return (
    <button type="button" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}
      className={`relative inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-line bg-surface text-ink transition-colors hover:border-brand hover:bg-ice ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={dark ? 'moon' : 'sun'} initial={{ y: 14, opacity: 0, rotate: -60 }} animate={{ y: 0, opacity: 1, rotate: 0 }} exit={{ y: -14, opacity: 0, rotate: 60 }}
          transition={{ duration: 0.22 }} className="inline-flex">
          {dark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </button>
  )
}
