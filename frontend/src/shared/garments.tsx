// Offline fallback artwork: a line illustration of the right garment type (picked from the product name),
// tinted with the product colour, so a tile still matches its label when the photo cannot load.

const SHAPES: Record<string, string[]> = {
  tee: ['M22 10 10 18l6 10 6-3v29h20V25l6 3 6-10-12-8c-2 5-6 7-10 7s-8-2-10-7Z'],
  hoodie: ['M23 13c0-5 4-9 9-9s9 4 9 9', 'M23 12 10 20l6 10 6-3v29h20V27l6 3 6-10-13-8c-2 4-5 6-9 6s-7-2-9-6Z', 'M26 42h12v6H26Z', 'M30 19v6M34 19v6'],
  jacket: ['M22 8 11 14v42h17V24l4-7 4 7v32h17V14L42 8l-10 9Z', 'M32 30v2M32 38v2M32 46v2'],
  dress: ['M26 6h12l-2 10 7 5-5 5 10 30H16l10-30-5-5 7-5Z'],
  trousers: ['M18 8h28l2 48H36l-4-30-4 30H16Z', 'M18 14h28'],
  shorts: ['M16 16h32l2 24H36l-4-12-4 12H14Z', 'M16 22h32'],
  skirt: ['M22 14h20l9 34H13Z', 'M22 20h20'],
  bag: ['M14 26h36l-3 28H17Z', 'M24 26v-6a8 8 0 0 1 16 0v6'],
  hat: ['M14 40c0-12 8-21 18-21s18 9 18 21', 'M8 40h48v5H8Z'],
  jewellery: ['M18 12c0 17 6 27 14 27s14-10 14-27', 'M32 39v3', 'M32 52a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'],
  scarf: ['M20 8h24v18H30v30h-10Z', 'M22 56v4M26 56v4M30 56v4'],
  set: ['M22 6 13 12l4 7 4-2v13h22V17l4 2 4-7-9-6c-1 3-4 5-7 5s-6-2-7-5Z', 'M22 36h20l2 22h-9l-3-13-3 13h-9Z'],
  bra: ['M14 20c5 0 9 6 9 12h18c0-6 4-12 9-12v18H14Z'],
}

const RULES: [RegExp, string][] = [
  [/hoodie|sweatshirt/, 'hoodie'], [/pyjama|co-ord|knit set|\bset\b/, 'set'], [/bra\b/, 'bra'], [/skirt/, 'skirt'],
  [/jacket|coat|blazer(?! dress)|bomber|shacket|gilet|fleece|cardigan|overshirt|parka|puffer/, 'jacket'],
  [/dress|gown|jumpsuit/, 'dress'], [/shorts/, 'shorts'], [/jeans|trousers|joggers|leggings|chino|pants|dungarees/, 'trousers'],
  [/bag|tote|crossbody/, 'bag'], [/\bhat\b|cap\b|beanie/, 'hat'], [/necklace|earring|hoop|jewel/, 'jewellery'], [/scarf/, 'scarf'],
]

const COLOURS: Record<string, string> = {
  black: '#2b2f33', white: '#f4f4f2', cream: '#efe5cf', natural: '#eadfc8', oatmeal: '#e2d6bf', stone: '#cdbfa6', tan: '#c49a6c',
  khaki: '#a89a6a', olive: '#6b7445', 'forest green': '#2f5d46', sage: '#a7bca0', navy: '#25385f', indigo: '#33437a', red: '#c0392b',
  'red check': '#b03a32', yellow: '#f2c230', mustard: '#d9a514', lavender: '#b9a7e0', lilac: '#c6a7d8', teal: '#2a8d8a',
  silver: '#c9ced3', gold: '#d4af37', champagne: '#e8d3a8', charcoal: '#474d53', 'grey marl': '#a3a8ad', 'light wash': '#9fbad6',
  'mid wash': '#5d7fa8', 'brown tweed': '#7a5b3e', tartan: '#8e3b2f', check: '#7d6a55', 'floral print': '#e7a0b4',
}

export function garmentFor(name: string, category = ''): string {
  const n = name.toLowerCase()
  for (const [re, kind] of RULES) if (re.test(n)) return kind
  return category === 'Accessories' ? 'bag' : 'tee'
}

export function GarmentArt({ name, category, colour = '', className = '' }: { name: string; category: string; colour?: string; className?: string }) {
  const kind = garmentFor(name, category)
  const fill = COLOURS[colour.toLowerCase()] ?? 'color-mix(in oklab, var(--brand) 18%, var(--surface))'
  const [body, ...details] = SHAPES[kind]
  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={body} style={{ fill, stroke: 'var(--brand)' }} />
      {details.map(d => <path key={d} d={d} style={{ stroke: 'var(--brand)' }} />)}
    </svg>
  )
}
