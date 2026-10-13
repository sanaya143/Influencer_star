import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { BrainEvent } from '../api'
import BrainTimeline, { agentLabel } from './Brain'
import { Rich } from './AssistantCards'

describe('assistant text renderer', () => {
  it('renders bold, bullets and markdown tables without leaking markup', () => {
    const { container } = render(<Rich text={'**3 products** need attention:\n- Wool Scarf\n- Canvas Tote\n\n| Product | Size |\n|---|---|\n| Hoodie | XS |\n| Tee | M |'} />)
    expect(screen.getByText('3 products').tagName).toBe('B')
    expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['Wool Scarf', 'Canvas Tote'])
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map(h => h.textContent)).toEqual(['Product', 'Size'])
    expect(within(table).getAllByRole('row')).toHaveLength(3)  // header + 2 rows; the |---| separator is dropped
    expect(container.textContent).not.toContain('|')
  })
  it('never injects HTML from the model', () => {
    const { container } = render(<Rich text={'<img src=x onerror=alert(1)> **ok**'} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
  })
})

const EVENTS: BrainEvent[] = [
  { seq: 1, ts: '2026-10-13T10:00:00Z', agent: 'ConciergeAgent', kind: 'llm', model: 'test/model', input: 'user: which products are low?', calls: [{ name: 'list_products', args: { stock: 'attention' } }], tokens: { in: 120, out: 14 }, duration_ms: 850 },
  { seq: 2, ts: '2026-10-13T10:00:01Z', agent: 'InventoryAgent', kind: 'tool', name: 'list_products', args: { stock: 'attention' }, result: '{"total": 35}', duration_ms: 12 },
  { seq: 3, ts: '2026-10-13T10:00:02Z', agent: 'ConciergeAgent', kind: 'llm', model: 'test/model', input: 'tool: tool result list_products', thought: 'Two sizes matter most.', output: 'Hoodie XS is sold out.' },
  { seq: 4, ts: '2026-10-13T10:00:03Z', agent: 'MatchingCoordinatorAgent', kind: 'rule', text: 'No language model: every decision is deterministic Python.' },
  { seq: 5, ts: '2026-10-13T10:00:04Z', agent: 'ConciergeAgent', kind: 'note', level: 'error', text: 'The model could not answer.' },
]

describe('agent brain timeline', () => {
  it('shows what the model saw, thought, said and decided, plus tools, rules and errors', () => {
    render(<BrainTimeline events={EVENTS} />)
    const stat = (text: string) => screen.getByText((_, el) => el?.tagName === 'SPAN' && el.textContent === text)
    expect(stat('2 model turns')).toBeInTheDocument()
    expect(stat('1 tool call')).toBeInTheDocument()
    expect(stat('1 rule decision')).toBeInTheDocument()
    expect(screen.getByText('user: which products are low?')).toBeInTheDocument()
    expect(screen.getAllByText('list_products')).toHaveLength(2)  // the model's decision, then the tool call it led to
    expect(screen.getByText('Two sizes matter most.')).toBeInTheDocument()
    expect(screen.getByText('Hoodie XS is sold out.')).toBeInTheDocument()
    expect(screen.getByText('Rule-based decision')).toBeInTheDocument()
    expect(screen.getByText('The model could not answer.')).toBeInTheDocument()
    expect(screen.getByText('Inventory Agent')).toBeInTheDocument()
  })
  it('filters by agent and expands a step', async () => {
    render(<BrainTimeline events={EVENTS} filterable />)
    fireEvent.click(screen.getByRole('button', { name: 'Matching Coordinator Agent' }))
    await waitFor(() => expect(screen.queryByText('Hoodie XS is sold out.')).toBeNull())
    expect(screen.getByText(/deterministic Python/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'All agents' }))
    const step = screen.getAllByRole('button', { expanded: false })[0]
    fireEvent.click(step)
    expect(step).toHaveAttribute('aria-expanded', 'true')
  })
  it('explains an empty timeline, and a pending one', () => {
    const { rerender } = render(<BrainTimeline events={[]} emptyHint="Nothing yet." />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    rerender(<BrainTimeline events={[]} running />)
    expect(screen.getByText('Waiting for the first step…')).toBeInTheDocument()
    expect(agentLabel('CampaignBriefAgent')).toBe('Campaign Brief Agent')
  })
})
