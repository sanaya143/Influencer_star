// Back-office routes, loaded as a separate chunk so storefront shoppers never download the studio (or D3).
import { Route, Routes } from 'react-router-dom'
import StudioLayout from './StudioLayout'
import Overview from './Overview'
import CreateCampaign from './CreateCampaign'
import CampaignLayout from './CampaignLayout'
import Results from './Results'
import Profile from './Profile'
import Analytics from './Analytics'
import Agents, { AgentsLanding } from './Agents'
import Discovery from './Discovery'
import Settings from './Settings'
import Inventory from './Inventory'
import ProductForm from './ProductForm'
import Orders from './Orders'

export default function StudioApp() {
  return (
    <Routes>
      <Route element={<StudioLayout />}>
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
        <Route path="inventory" element={<Inventory />} />
        <Route path="inventory/new" element={<ProductForm />} />
        <Route path="inventory/:productId" element={<ProductForm />} />
        <Route path="orders" element={<Orders />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
