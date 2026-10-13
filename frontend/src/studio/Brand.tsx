import { useEffect } from 'react'

export const PRODUCT = 'Zylo Reach'

/** Zylo Reach wordmark: the gold Zylo logo with REACH set in the same metallic serif, on one baseline. */
export function ReachLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img src="/zylo-reach-wordmark.png" alt={PRODUCT} decoding="async" draggable={false}
      className={`${compact ? 'h-7' : 'h-8'} w-auto select-none`} />
  )
}

/** While the back office is open, the browser tab is titled Zylo Reach; the shop's title is restored on leave. */
export function useReachDocument() {
  useEffect(() => {
    const title = document.title
    document.title = PRODUCT
    return () => { document.title = title }
  }, [])
}
