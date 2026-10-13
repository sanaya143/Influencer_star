import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Network, Rocket } from 'lucide-react'
import { fmt, type Card } from '../api'
import { Avatar, Badge, Button, StatusPill } from '../shared/ui'

/** Minimal markdown for the assistant's replies: paragraphs, "- " bullets and **bold**. No HTML is ever injected. */
export function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>))
  const blocks: ReactNode[] = []
  let bullets: string[] = []
  let table: string[][] = []
  const flushTable = () => {
    if (!table.length) return
    const [head, ...rows] = table
    blocks.push(
      <div key={`t${blocks.length}`} className="scrollbar-thin overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="dense w-full"><thead><tr>{head.map((c, i) => <th key={i} scope="col">{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table>
      </div>)
    table = []
  }
  const flush = () => { if (bullets.length) { blocks.push(<ul key={`u${blocks.length}`} className="list-disc space-y-0.5 pl-5">{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = [] } }
  for (const line of text.split('\n')) {
    if (/^\s*\|.*\|\s*$/.test(line)) {  // markdown table row (the separator row |---|---| is dropped)
      flush()
      if (!/^\s*\|[\s:|-]+\|\s*$/.test(line)) table.push(line.trim().slice(1, -1).split('|').map(c => c.trim()))
      continue
    }
    flushTable()
    if (/^\s*[-*] /.test(line)) { bullets.push(line.replace(/^\s*[-*] /, '')); continue }
    flush()
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>)
  }
  flush()
  flushTable()
  return <div className="space-y-2 text-sm leading-relaxed">{blocks}</div>
}

const Box = ({ title, subtitle, children, action }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode }) => (
  <section className="overflow-hidden rounded-xl border border-line bg-surface" aria-label={title}>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-ice px-3 py-2">
      <div><p className="text-xs font-semibold">{title}</p>{subtitle && <p className="text-[11px] text-muted">{subtitle}</p>}</div>{action}
    </div>
    {children}
  </section>
)
const STOCK = { in_stock: ['ok', 'In stock'], low: ['warn', 'Low stock'], out: ['bad', 'Sold out'] } as const

export default function CardView({ card }: { card: Card }) {
  switch (card.type) {
    case 'products':
      return (
        <Box title={card.title}>
          <ul className="divide-y divide-line">
            {card.items.map(p => (
              <li key={p.product_id}>
                <Link to={`/admin/inventory/${p.product_id}`} className="group flex items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-ice">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium group-hover:text-brand-ink">{p.name}</span>
                    <span className="block truncate text-xs text-muted"><span className="font-mono">{p.product_id}</span> · {p.category} · {p.colour} · {fmt.gbp(p.price_gbp)}</span></span>
                  <span className="hidden text-right text-xs text-muted sm:block">{p.sold_out_sizes.length > 0 && <span className="block">sold out: {p.sold_out_sizes.join(', ')}</span>}{p.low_sizes.length > 0 && <span className="block">low: {p.low_sizes.join(', ')}</span>}</span>
                  <span className="text-right"><Badge tone={STOCK[p.stock_state][0]}>{STOCK[p.stock_state][1]}</Badge><span className="tabular mt-0.5 block text-[11px] text-muted">{p.total_stock} units · {p.sold_30d} sold/30d</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </Box>
      )
    case 'kpis':
      return (
        <Box title={card.title}>
          <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
            {card.items.map(k => <div key={k.label} className="bg-surface px-3 py-2"><dt className="text-[11px] text-muted">{k.label}</dt><dd className="tabular text-base font-semibold">{k.value}</dd></div>)}
          </dl>
        </Box>
      )
    case 'orders':
      return (
        <Box title={card.title} action={<Link to="/admin/orders" className="text-xs font-semibold text-brand-ink hover:underline">All orders</Link>}>
          <ul className="divide-y divide-line">
            {card.items.map(o => (
              <li key={o.order_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="min-w-0"><b className="font-mono">{o.order_id}</b> · {o.customer}<span className="block truncate text-muted">{o.items.join(', ')}</span></span>
                <span className="tabular text-right"><b>{fmt.gbp(o.total_gbp)}</b><span className="block text-muted">{o.units} units · {fmt.ago(o.at)}</span></span>
              </li>
            ))}
          </ul>
        </Box>
      )
    case 'creators':
      return (
        <Box title={card.title}>
          <ul className="divide-y divide-line">
            {card.items.map(c => (
              <li key={c.influencer_id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Avatar name={c.name} size={28} />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.name}</span><span className="block text-xs text-muted">{c.platform ?? 'platform unknown'} · <span className="font-mono">{c.influencer_id}</span></span></span>
                <span className="tabular text-right text-xs text-muted"><b className="text-ink">{fmt.k(c.followers)}</b> followers<span className="block">{fmt.k(c.promo_views)} promo views · {c.engagement ?? '—'}% eng.</span></span>
              </li>
            ))}
          </ul>
        </Box>
      )
    case 'matches':
      return (
        <Box title={card.title} subtitle={card.subtitle} action={card.campaign_id && <Link to={`/admin/campaigns/${card.campaign_id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink hover:underline">Full results<ArrowUpRight size={12} aria-hidden="true" /></Link>}>
          <div className="overflow-x-auto">
            <table className="dense w-full min-w-[460px]">
              <thead><tr><th scope="col">#</th><th scope="col">Creator</th><th scope="col" className="num">Followers</th><th scope="col" className="num">Promo views</th><th scope="col" className="num">Score</th></tr></thead>
              <tbody>
                {card.items.map(m => (
                  <tr key={m.influencer_id}>
                    <td><span className={`tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[11px] font-bold ${m.rank <= 3 ? 'bg-brand text-on-brand' : 'bg-ice'}`}>{m.rank}</span></td>
                    <td><div className="flex items-center gap-2"><Avatar name={m.name} size={24} />
                      <span>{card.campaign_id ? <Link to={`/admin/campaigns/${card.campaign_id}/influencer/${m.influencer_id}`} className="font-medium hover:text-brand-ink">{m.name}</Link> : <span className="font-medium">{m.name}</span>}
                        <span className="block text-[11px] text-muted">{m.platform}{m.is_micro ? ' · micro' : ''}</span></span></div></td>
                    <td className="num">{fmt.n(m.followers)}</td><td className="num">{fmt.n(m.promo_views)}</td><td className="num font-bold">{m.score.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>
      )
    case 'campaigns':
      return (
        <Box title={card.title}>
          <ul className="divide-y divide-line">
            {card.items.map(c => (
              <li key={c.campaign_id}><Link to={`/admin/campaigns/${c.campaign_id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-ice">
                <span className="truncate font-medium">{c.name}</span><span className="flex items-center gap-2 text-xs text-muted">{c.ranked != null && <span>{c.ranked} ranked</span>}<StatusPill status={c.status} /></span></Link></li>
            ))}
          </ul>
        </Box>
      )
    case 'campaign_started':
      return (
        <Box title="Campaign launched">
          <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <p className="min-w-0 text-sm"><Rocket size={15} aria-hidden="true" className="mr-1.5 inline text-brand-ink" /><b>{card.name}</b><span className="block text-xs text-muted">The Brief, Matching and Insights agents are running.</span></p>
            <div className="flex gap-2">
              <Link to={card.agents_page}><Button size="sm"><Network size={14} aria-hidden="true" />Watch the agents</Button></Link>
              <Link to={card.page}><Button size="sm" variant="outline">Open results</Button></Link>
            </div>
          </div>
        </Box>
      )
    case 'explain':
      return (
        <Box title={`${card.creator}: ${card.rank ? `ranked #${card.rank} (${card.score?.toFixed(0)}/100)` : 'not ranked'}`}>
          <ul className="list-disc space-y-1 px-3 py-2 pl-7 text-xs">
            {card.reasons.map(r => <li key={r}>{r}</li>)}{card.concerns.map(r => <li key={r} className="text-amber-800 dark:text-amber-300">{r}</li>)}
            {!card.reasons.length && !card.concerns.length && <li className="list-none text-muted">No exclusion reasons or concerns recorded.</li>}
          </ul>
        </Box>
      )
  }
}
