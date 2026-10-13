import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, Eye, Heart, UserRound, Target } from 'lucide-react'
import { fmt, type Leader, type LeaderGroup } from '../api'
import { Avatar } from '../shared/ui'
import { CountUp, rise, stagger } from '../shared/motion'

const ICONS: Record<string, typeof Crown> = { overall: Crown, audience_fit: Target, promo_views: Eye, engagement: Heart, micro: UserRound }
const UNIT_LABEL: Record<string, string> = { overall: 'score', audience_fit: 'fit', promo_views: 'median views', engagement: 'engagement', micro: 'score' }

export const leaderValue = (unit: LeaderGroup['unit'], v: number) => (unit === 'views' ? fmt.k(v) : unit === 'pct' ? `${v.toFixed(1)}%` : v.toFixed(1))

function Medal({ n }: { n: number }) {
  const cls = n === 1 ? 'bg-brand text-on-brand' : n === 2 ? 'bg-brand/25 text-ink' : 'bg-brand/10 text-ink'
  return <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${cls}`} aria-label={`Position ${n}`}>{n}</span>
}

/** Top 3 by overall score as a podium (2 · 1 · 3). Revealed like an award: third, then second, then first; each bar
 *  rises while its score counts up, and the creator drops in once the bar lands. */
const BAR: Record<number, number> = { 1: 132, 2: 100, 3: 76 }
const AT: Record<number, number> = { 3: 0.1, 2: 0.45, 1: 0.8 }  // reveal order
const RISE = 0.75

export function Podium({ items, campaignId }: { items: Leader[]; campaignId: string }) {
  if (!items.length) return null
  const order = [items[1], items[0], items[2]].filter(Boolean) as Leader[]
  return (
    <div>
      <ol aria-label="Top 3 creators by overall match" className="flex items-end justify-center gap-2 sm:gap-3">
        {order.map(l => {
          const pos = items.indexOf(l) + 1, first = pos === 1
          return (
            <li key={l.influencer_id} className="flex w-[31%] max-w-[8.5rem] flex-col items-center text-center">
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: AT[pos] + RISE * 0.8, type: 'spring', stiffness: 420, damping: 28 }}
                className="w-full">
                <Link to={`/admin/campaigns/${campaignId}/influencer/${l.influencer_id}`} className="group flex flex-col items-center rounded-lg px-1 pb-2">
                  <span className="relative">
                    <Avatar name={l.display_name} size={first ? 48 : 40} className={`transition-transform group-hover:scale-105 ${first ? 'ring-2 ring-brand ring-offset-2 ring-offset-surface' : ''}`} />
                    {first && <Crown size={16} aria-hidden="true" className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[#b8862b]" />}
                  </span>
                  <span className="mt-2 w-full truncate text-[13px] font-semibold group-hover:text-brand-ink">{l.display_name}</span>
                  <span className="w-full truncate text-[11px] text-muted">{l.platform}{l.is_micro ? ' · micro' : ''}</span>
                </Link>
              </motion.div>
              <motion.div initial={{ height: 8 }} animate={{ height: BAR[pos] }} transition={{ delay: AT[pos], duration: RISE, ease: [0.16, 1, 0.3, 1] }}
                className={`relative w-full overflow-hidden rounded-t-lg border-x border-t ${first ? 'border-brand bg-brand text-on-brand' : 'border-line bg-ice text-ink'}`}>
                {first && <motion.span aria-hidden="true" initial={{ x: '-120%' }} animate={{ x: '160%' }} transition={{ delay: AT[1] + RISE, duration: 0.9, ease: 'easeInOut' }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/35 to-transparent" />}
                <span className="relative flex flex-col items-center pt-2.5">
                  <span className="tabular font-display text-[22px] font-semibold leading-none"><CountUp value={l.overall_score} duration={RISE + 0.25} delay={AT[pos]} format={v => v.toFixed(1)} /></span>
                  <span className={`mt-1 text-[11px] font-medium ${first ? 'opacity-80' : 'text-muted'}`}>{pos === 1 ? '1st' : pos === 2 ? '2nd' : '3rd'}</span>
                </span>
              </motion.div>
            </li>
          )
        })}
      </ol>
      <div className="h-px w-full bg-line" aria-hidden="true" />
    </div>
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
          <motion.li key={g.key} variants={rise} className="group/card rounded-xl border border-line bg-surface p-4 transition-colors hover:border-ink/20">
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded-md border border-line p-1.5 text-muted transition-colors group-hover/card:text-brand-ink"><Icon size={14} aria-hidden="true" /></span>
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
                        <span className="tabular block text-sm font-semibold"><CountUp value={l.value} delay={0.1 + i * 0.08} format={v => leaderValue(g.unit, v)} /></span>
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
