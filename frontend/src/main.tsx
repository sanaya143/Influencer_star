import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import './index.css'
import { StoreProvider } from './storefront/store'
import StoreLayout from './storefront/StoreLayout'
import { BagPage, CategoriesPage, HomePage, ProductPage, ShopPage, WishlistPage } from './storefront/pages'
import StudioLayout from './studio/StudioLayout'
import Overview from './studio/Overview'
import CreateCampaign from './studio/CreateCampaign'
import CampaignLayout from './studio/CampaignLayout'
import Results from './studio/Results'
import Profile from './studio/Profile'
import Analytics from './studio/Analytics'
import Agents, { AgentsLanding } from './studio/Agents'
import Discovery from './studio/Discovery'
import Settings from './studio/Settings'

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
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
          <Route path="admin" element={<StudioLayout />}>
            <Route index element={<Overview />} />
            <Route path="campaigns/new" element={<CreateCampaign />} />
            <Route path="campaigns/:campaignId" element={<CampaignLayout />}>
              <Route index element={<Results />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="agents" element={<Agents />} />
              <Route path="influencer/:influencerId" element={<Profile />} />
            </Route>
            <Route path="discovery" element={<Discovery />} />
            <Route path="agents" element={<AgentsLanding />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
)
