import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useLocalStorage } from '../shared/hooks'

export interface BagItem { product_id: string; size: string; qty: number }
interface Store {
  bag: BagItem[]; wishlist: string[]
  addToBag: (id: string, size: string) => void; setQty: (id: string, size: string, qty: number) => void
  toggleWish: (id: string) => void; clearBag: () => void
}
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bag, setBag] = useLocalStorage<BagItem[]>('threadora.bag', [])
  const [wishlist, setWish] = useLocalStorage<string[]>('threadora.wishlist', [])
  const value = useMemo<Store>(() => ({
    bag, wishlist,
    addToBag: (id, size) => setBag(b => b.some(i => i.product_id === id && i.size === size) ? b.map(i => i.product_id === id && i.size === size ? { ...i, qty: i.qty + 1 } : i) : [...b, { product_id: id, size, qty: 1 }]),
    setQty: (id, size, qty) => setBag(b => qty <= 0 ? b.filter(i => !(i.product_id === id && i.size === size)) : b.map(i => i.product_id === id && i.size === size ? { ...i, qty } : i)),
    toggleWish: id => setWish(w => w.includes(id) ? w.filter(x => x !== id) : [...w, id]),
    clearBag: () => setBag([]),
  }), [bag, wishlist, setBag, setWish])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
export const useStore = () => { const c = useContext(Ctx); if (!c) throw new Error('StoreProvider missing'); return c }
