import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Eye, Heart, Sparkles, Target } from 'lucide-react'
import { fmt, type Leader, type LeaderGroup } from '../api'
import { Avatar } from '../shared/ui'
import { rise, stagger } from '../shared/motion'

const ICONS: Record<string, typeof Crown> = { overall: Crown, audience_fit: Target, promo_views: Eye, engagement: Heart, micro: Sparkles }
const UNIT_LABEL: Record<string, string> = { overall: 'score', audience_fit: 'fit', promo_views: 'median views', engagement: 'engagement', micro: 'score' }

export const leaderValue = (unit: LeaderGroup['unit'], v: number) => (unit === 'views' ? fmt.k(v) : unit === 'pct' ? `${v.toFixed(1)}%` : v.toFixed(1))

function Medal({ n }: { n: number }) {
  const cls = n === 1 ? 'bg-brand text-on-brand' : n === 2 ? 'bg-brand/25 text-ink' : 'bg-brand/10 text-ink'
  return <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${cls}`} aria-label={`Position ${n}`}>{n}</span>
}

/** Top 3 by overall score, laid out as a podium (2 · 1 · 3). */
export function Podium({ items, campaignId }: { items: Leader[]; campaignId: string }) {
  if (!items.length) return null
  const order = [items[1], items[0], items[2]].filter(Boolean) as Leader[]
  const height = (l: Leader) => (l === items[0] ? 'h-28' : l === items[1] ? 'h-20' : 'h-14')
  return (
    <ol aria-label="Top 3 creators by overall match" className="flex items-end justify-center gap-2 sm:gap-3">
      {order.map((l, i) => {
        const pos = items.indexOf(l) + 1
        return (
          <motion.li key={l.influencer_id} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 + i * 0.1, type: 'spring', stiffness: 260, damping: 22 }}
            className="flex w-24 flex-col items-center text-center sm:w-28">
            <Link to={`/admin/campaigns/${campaignId}/influencer/${l.influencer_id}`} className="group flex flex-col items-center">
              <span className="relative">
                {pos === 1 && <Crown size={18} aria-hidden="true" className="absolute -top-4 left-1/2 -translate-x-1/2 text-brand-ink" />}
                <Avatar name={l.display_name} size={pos === 1 ? 52 : 42} className="ring-2 ring-surface transition-transform group-hover:scale-105" />
              </span>
              <span className="mt-1.5 line-clamp-1 text-xs font-semibold group-hover:text-brand-ink">{l.display_name}</span>
              <span className="text-[11px] text-muted">{l.platform}</span>
            </Link>
            <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className={`mt-2 flex w-full origin-bottom flex-col items-center justify-start rounded-t-xl pt-2 ${height(l)} ${pos === 1 ? 'bg-brand text-on-brand' : 'bg-brand/15'}`}>
              <span className="text-lg font-bold leading-none">{l.overall_score.toFixed(0)}</span>
              <span className="text-[10px] font-medium opacity-80">#{pos}</span>
            </motion.div>
          </motion.li>
        )
      })}
    </ol>
  )
}

/** "Top 3 in each field": one compact card per headline metric. */
export function LeaderBoard({ groups, campaignId, keys }: { groups: LeaderGroup[]; campaignId: string; keys?: string[] }) {
  const shown = keys ? groups.filter(g => keys.includes(g.key)) : groups
  return (
    <motion.ul variants={stagger} initial="hidden" animate="show" className={`grid gap-3 sm:grid-cols-2 ${shown.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4'}`}>
      {shown.map(g => {
        const Icon = ICONS[g.key] ?? Crown
        return (
          <motion.li key={g.key} variants={rise} className="shadow-card group/card rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-brand/50">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-lg bg-brand/10 p-1.5 text-brand-ink transition-transform group-hover/card:rotate-[-6deg] group-hover/card:scale-110"><Icon size={15} aria-hidden="true" /></span>
              <h3 className="text-sm font-semibold">{g.label}</h3>
            </div>
            {!g.items.length ? <p className="text-xs text-muted">No creators in this group.</p> : (
              <ol className="space-y-2.5">
                {g.items.map((l, i) => (
                  <li key={l.influencer_id}>
                    <Link to={`/admin/campaigns/${campaignId}/influencer/${l.influencer_id}`} className="group flex items-center gap-2.5 rounded-lg transition-colors">
                      <Medal n={i + 1} />
                      <Avatar name={l.display_name} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium group-hover:text-brand-ink">{l.display_name}</span>
                        <span className="block truncate text-[11px] text-muted">#{l.rank} overall · {l.platform}{l.is_micro && g.key !== 'micro' ? ' · micro' : ''}</span>
                      </span>
                      <span className="text-right">
                        <span className="tabular block text-sm font-semibold">{leaderValue(g.unit, l.value)}</span>
                        <span className="block text-[10px] text-muted">{UNIT_LABEL[g.key]}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </motion.li>
        )
      })}
    </motion.ul>
  )
}
