import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState, ErrorState, Logo, ProductImage, StatusPill } from './ui'

describe('shared UI', () => {
  it('shows an accessible error with retry', () => {
    const retry = vi.fn()
    render(<ErrorState message="Boom" onRetry={retry} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    fireEvent.click(screen.getByText('Try again'))
    expect(retry).toHaveBeenCalled()
  })
  it('renders empty state and status', () => {
    render(<><EmptyState title="Nothing" hint="Try again" /><StatusPill status="Needs Review" /></>)
    expect(screen.getByText('Nothing')).toBeInTheDocument()
    expect(screen.getByText('Needs Review')).toBeInTheDocument()
  })
  it('falls back to a local illustration when the image fails', () => {
    render(<ProductImage src="http://bad.invalid/x.jpg" alt="Hoodie" category="Women" />)
    fireEvent.error(screen.getByAltText('Hoodie'))
    expect(screen.getByRole('img', { name: 'Hoodie' })).toBeInTheDocument()
  })
})

describe('brand', () => {
  it('renders the Zylo logo with an accessible name', () => {
    render(<Logo tagline="Back office" />)
    expect(screen.getByAltText('Zylo')).toHaveAttribute('src', '/zylo-wordmark.png')
    expect(screen.getByText('Back office')).toBeInTheDocument()
  })
})
