import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!path)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) { setLoading(false); return }
    let live = true
    setLoading(true); setError(null)
    api<T>(path).then(d => { if (live) { setData(d); setLoading(false) } }).catch(e => { if (live) { setError(e.message); setLoading(false) } })
    return () => { live = false }
  }, [path, tick])
  const reload = useCallback(() => setTick(t => t + 1), [])
  return { data, error, loading, reload }
}

export function usePolling<T>(path: string | null, until: (d: T) => boolean, ms = 800) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const untilRef = useRef(until)
  untilRef.current = until
  useEffect(() => {
    if (!path) return
    let stop = false
    let t: ReturnType<typeof setTimeout>
    const loop = async () => {
      try {
        const d = await api<T>(path)
        if (stop) return
        setData(d)
        if (!untilRef.current(d)) t = setTimeout(loop, ms)
      } catch (e) { if (!stop) setError((e as Error).message) }
    }
    loop()
    return () => { stop = true; clearTimeout(t) }
  }, [path, ms])
  return { data, error }
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage unavailable */ } }, [key, v])
  return [v, setV] as const
}
