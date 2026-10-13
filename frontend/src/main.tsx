import { StrictMode, Suspense, lazy, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import { ThemeProvider } from './shared/theme'
import { ToastProvider } from './shared/toast'
import { Logo } from './shared/ui'
import { StoreProvider } from './storefront/store'
import StoreLayout from './storefront/StoreLayout'
import { BagPage, CategoriesPage, HomePage, ProductPage, ShopPage, WishlistPage } from './storefront/pages'

const StudioApp = lazy(() => import('./studio/StudioApp'))

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return null
}

const Loading = () => (
  <div className="flex min-h-screen items-center justify-center bg-ice" role="status" aria-label="Loading back office">
    <div className="animate-pulse"><Logo size={32} tagline="Zylo Reach" /></div>
  </div>
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollTop />
          <StoreProvider>
            <Routes>
              <Route element={<StoreLayout />}>
                <Route index element={<HomePage />} />
                <Route path="shop" element={<ShopPage />} />
                <Route path="categories" element={<CategoriesPage />} />
                <Route path="product/:id" element={<ProductPage />} />
                <Route path="wishlist" element={<WishlistPage />} />
                <Route path="bag" element={<BagPage />} />
              </Route>
              <Route path="admin/*" element={<Suspense fallback={<Loading />}><StudioApp /></Suspense>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </StoreProvider>
        </BrowserRouter>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
