import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ToastProvider } from '../shared/toast'
import UsageChip from './UsageChip'
import AssistantWidget from './AssistantWidget'

const totals = (tokens: number, cost: number, unpriced = 0) => ({ calls: 3, input_tokens: tokens - 100, output_tokens: 100, total_tokens: tokens, cost_usd: cost, unpriced_calls: unpriced, estimated_tokens: false })
const USAGE = {
  period_days: 30, totals: totals(12400, 0.0312), today: totals(1000, 0.002),
  by_source: [{ source: 'Campaign run', ...totals(9000, 0.02) }, { source: 'Assistant chat', ...totals(3400, 0.0112) }],
  by_model: [{ model: 'gpt-4o-mini', ...totals(12400, 0.0312), price: { input: 0.15, output: 0.6, source: 'default list price' } }],
  by_agent: [{ agent: 'Campaign Insights Agent', input_tokens: 8000, output_tokens: 1000, total_tokens: 9000 }],
  recent: [{ kind: 'Campaign run', id: 'run_1', label: 'Hoodie campaign', at: new Date().toISOString(), model: 'gpt-4o-mini', in: 8000, out: 1000, cost_usd: 0.0018, link: '/admin/agents', token_source: 'actual' }],
  current_model: 'gpt-4o-mini', current_price: { input: 0.15, output: 0.6, source: 'default list price' }, unpriced_models: [], note: 'Cost = tokens x price.',
}

function respond(routes: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const key = Object.keys(routes).find(k => url.includes(k))
    return new Response(JSON.stringify(key ? routes[key] : {}), { status: key ? 200 : 404, headers: { 'Content-Type': 'application/json' } })
  }))
}
const wrap = (ui: ReactNode, path = '/admin') => render(<ToastProvider><MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter></ToastProvider>)

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear() })

describe('token usage dropdown', () => {
  it('shows tokens and cost in the header and opens and closes a breakdown', async () => {
    respond({ '/usage/summary': USAGE })
    wrap(<UsageChip />)
    const button = await screen.findByRole('button', { name: /Token usage, the last 30 days: 12,400 tokens, \$0\.03/ })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Token usage and cost' })
    expect(dialog).toHaveTextContent('12,400')
    expect(dialog).toHaveTextContent('Assistant chat')
    expect(dialog).toHaveTextContent('$0.15 in / $0.6 out per 1M')
    expect(dialog).toHaveTextContent('Campaign Insights Agent')
    fireEvent.click(button)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('warns when a model has no price', async () => {
    respond({ '/usage/summary': { ...USAGE, totals: totals(500, 0, 2), unpriced_models: ['my-model'], by_model: [{ model: 'my-model', ...totals(500, 0, 2), price: null }] } })
    wrap(<UsageChip />)
    fireEvent.click(await screen.findByRole('button', { name: /unpriced/ }))
    expect(await screen.findByText(/No price for my-model/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add a price' })).toHaveAttribute('href', '/admin/settings#prices')
  })
})

describe('floating assistant', () => {
  it('opens a chat panel from the bottom-right button and closes with Escape', async () => {
    respond({ '/chat/capabilities': { mode: 'offline', provider: 'none', model: null, agents: [] }, '/chat/sessions': { items: [] } })
    wrap(<AssistantWidget />)
    const button = screen.getByRole('button', { name: 'Open the Zylo assistant' })
    fireEvent.click(button)
    expect(await screen.findByRole('dialog', { name: 'Zylo assistant' })).toBeInTheDocument()
    expect(screen.getByText('Show the collections')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the full assistant page' })).toHaveAttribute('href', '/admin/assistant')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
  it('is hidden on the full assistant page', () => {
    respond({ '/chat/capabilities': { mode: 'offline', agents: [] }, '/chat/sessions': { items: [] } })
    wrap(<AssistantWidget />, '/admin/assistant')
    expect(screen.queryByRole('button', { name: 'Open the Zylo assistant' })).toBeNull()
  })
})
