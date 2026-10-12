import { garmentFor } from './garments'
import { imgSrc } from '../api'
import { leaderValue } from '../studio/Leaders'

describe('garment fallback artwork', () => {
  it('matches the illustration to the product name, not just the category', () => {
    expect(garmentFor('Oversized Graphic Hoodie', 'Women')).toBe('hoodie')
    expect(garmentFor('Kids Dino Pyjama Set', 'Kids')).toBe('set')
    expect(garmentFor('Oversized Blazer Dress', 'Women')).toBe('dress')
    expect(garmentFor('Classic Trench Coat', 'Women')).toBe('jacket')
    expect(garmentFor('Tweed Skirt Suit', 'Women')).toBe('skirt')
    expect(garmentFor('Silver Hoop Earrings', 'Accessories')).toBe('jewellery')
    expect(garmentFor('Canvas Tote Bag', 'Accessories')).toBe('bag')
    expect(garmentFor('Mystery Item', 'Accessories')).toBe('bag')
    expect(garmentFor('Mystery Item', 'Men')).toBe('tee')
  })
})

describe('image sizing', () => {
  it('resizes Unsplash photos to a 3:4 crop and leaves other URLs alone', () => {
    const u = new URL(imgSrc('https://images.unsplash.com/photo-1?auto=format&fit=crop&w=800&h=1067&q=75', 300))
    expect([u.searchParams.get('w'), u.searchParams.get('h'), u.searchParams.get('q')]).toEqual(['300', '400', '75'])
    expect(imgSrc('/api/uploads/abc.png', 300)).toBe('/api/uploads/abc.png')
  })
})

describe('leader values', () => {
  it('formats each leaderboard unit', () => {
    expect(leaderValue('views', 174500)).toBe('174.5k')
    expect(leaderValue('pct', 9.456)).toBe('9.5%')
    expect(leaderValue('score', 88)).toBe('88.0')
  })
})
