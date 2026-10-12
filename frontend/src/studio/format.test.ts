import { fmt } from '../api'

describe('formatters', () => {
  it('formats counts and percentages without inventing values', () => {
    expect(fmt.k(1500)).toBe('1.5k')
    expect(fmt.k(null)).toBe('—')
    expect(fmt.pct(12.345)).toBe('12.3%')
    expect(fmt.gbp(32)).toBe('£32')
  })
})
