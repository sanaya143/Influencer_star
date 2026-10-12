// Typed client for the THREADORA backend. All business logic (eligibility, ranking) lives server-side.
export interface Product {
  product_id: string; product_name: string; description: string; category: string; price_gbp: number; sizes: string[]
  target_age_segments: string[]; target_gender_or_collection: string; style_tags: string[]; target_region: string
  campaign_keywords: string[]; product_image: string; seasonal_collection: string; badges: string[]
  colour: string; stock: Record<string, number>; status: 'active' | 'draft' | 'archived'
  total_stock: number; stock_state: 'in_stock' | 'low' | 'out'; low_sizes: string[]; sold_out_sizes: string[]
  units_sold_30d: number; created_at: string; updated_at: string
}
export interface Movement { id: number; product_id: string; product_name: string; size: string; delta: number; balance: number; reason: string; ref: string | null; created_at: string }
export type InventoryProduct = Product & { movements?: Movement[] }
export interface ProductInput {
  product_name: string; description: string; category: string; price_gbp: number; sizes: string[]; stock: Record<string, number>
  target_age_segments: string[]; target_gender_or_collection: string; style_tags: string[]; target_region: string
  product_image: string; seasonal_collection: string; badges: string[]; colour: string; status: 'active' | 'draft' | 'archived'
}
export interface InventoryMeta {
  categories: string[]; targets: string[]; age_segments: string[]; badges: string[]; style_tags: string[]; collections: string[]
  size_presets: Record<string, string[]>; statuses: string[]; thresholds: { low_stock_per_size: number; low_stock_total: number }
}
export interface OrderLineOut { product_id: string; product_name: string; size: string; qty: number; unit_price: number; product_image?: string }
export interface Order { order_id: string; customer_name: string; channel: string; status: string; lines: OrderLineOut[]; units: number; total_gbp: number; created_at: string }
export interface InventorySummary {
  counts: { active: number; draft: number; archived: number }; units_in_stock: number; stock_value_gbp: number
  low_stock_sizes: number; sold_out_sizes: number; orders_30d: number; revenue_30d: number; units_30d: number; aov_30d: number
  storefront_orders_30d: number; bestsellers: Product[]
  low_stock: { product_id: string; product_name: string; product_image: string; size: string; stock: number }[]
  by_category: { category: string; products: number; units_in_stock: number; units_sold_30d: number }[]
  daily: { date: string; revenue: number; orders: number }[]
  thresholds: { low_stock_per_size: number; low_stock_total: number }
}
export interface Leader { influencer_id: string; display_name: string; username: string; platform: string; rank: number; overall_score: number; value: number; is_micro: boolean }
export interface LeaderGroup { key: string; label: string; unit: 'score' | 'views' | 'pct'; items: Leader[] }
export interface RunSummary { run_id: string; campaign_id: string | null; campaign_name: string | null; kind: string; status: string; created_at: string; mode: string | null; model: string | null; total_tokens: number | null }
export interface Health { status: string; mode: 'llm' | 'offline'; provider: string; model: string | null; provider_label: string; configured_model: string; use_ai: boolean; key_source: string; influencers: number; products: number }
export interface Filters { min_followers: number; min_promo_views: number; require_brand_safety: boolean; min_audience_match: number }
export interface Weights { audience_fit: number; content_fit: number; engagement: number; promo_views: number; collaboration: number; brand_affinity: number; region: number }
export interface Brief {
  product_id: string; objective: string; target_age_segments: string[]; target: string; location: string; budget_gbp: number | null
  preferred_interests: string[]; prioritise_micro: boolean; filters: Filters; weights: Weights; notes: string[]; needs_clarification: string[]
}
export interface Criterion { name: string; status: 'satisfied' | 'partial' | 'not_satisfied'; detail: string }
export interface Match {
  rank: number; influencer_id: string; display_name: string; username: string; platform: string; follower_count: number
  median_promotional_views: number; engagement_rate: number; is_micro: boolean; audience_fit_pct: number
  relevant_audience: Record<string, number>; scores: Record<string, number>; contributions: Record<string, number>
  overall_score: number; criteria: Criterion[]; rationale: string; concerns: string[]; data_confidence: 'high' | 'medium' | 'low'; insight?: string | null
}
export interface Stats {
  retrieved: number; eligible: number; excluded_l1: number; review_required: number; passed_l2: number; excluded_l2: number; ranked: number
  thresholds: Filters; warnings: string[]
}
export interface Insights {
  summary: string; recommendation: string; trade_offs: string[]; micro_highlights: string[]; next_steps: string[]; fallback?: boolean
}
export interface Results {
  campaign_id: string; name: string; run_id: string; status: string; brief: Brief; stats: Stats; ranked: Match[]; leaders: LeaderGroup[]
  insights: Insights | null; label: string
}
export interface Exclusion { influencer_id: string; display_name: string; username: string; level: 1 | 2; status: 'excluded' | 'needs_review'; reason_codes: string[]; reasons: string[] }
export interface Paged<T> { items: T[]; total: number; page: number; page_size: number; pages: number }
export interface ToolCall { name: string; input: unknown; output: unknown; duration_ms: number; error: string | null; at: string }
export interface AgentRun {
  id: string; name: string; role: string; status: string; started_at: string | null; completed_at: string | null; duration_ms: number | null
  tools: ToolCall[]; output_summary: string | null; input_tokens: number; output_tokens: number; total_tokens: number
  token_source: string; llm_calls: number; errors: string[]; retries: number
}
export interface Trace {
  run_id: string; campaign_id: string | null; kind: string; status: string; started_at: string; completed_at: string | null; mode: string
  provider: string; model: string | null; summary: string | null; agents: AgentRun[]; steps: { ts: string; agent: string; kind: string; detail: string }[]
}
export interface Usage {
  run_id: string; model: string | null; provider: string; mode: string; input_tokens: number; output_tokens: number; total_tokens: number
  token_source: string; estimated_cost_usd: number | null; cost_note: string | null; note: string; executed_at: string
  per_agent: { agent: string; input_tokens: number; output_tokens: number; total_tokens: number; token_source: string }[]
}
export interface Influencer {
  influencer_id: string; display_name: string; username: string; platform: string | null; bio: string | null; creator_content_style: string | null
  follower_count: number | null; median_recent_views: number | null; median_promotional_views: number | null; engagement_rate: number | null
  audience_age_distribution: Record<string, number>; audience_gender_distribution: Record<string, number>
  audience_location_distribution: Record<string, number>; interests: string[]; fashion_categories: string[]; content_tags: string[]
  brand_affinity_score: number | null
  collaboration_history: { collaboration_id: string; product_id: string; campaign_type: string; promotional_views: number; engagement: number; campaign_outcome: string; recorded_at: string }[]
  brand_safety_status: string; data_quality_status: string
}
export interface Analytics {
  run_id: string
  funnel: { stage: string; count: number; pct: number }[]
  breakdown: { influencer_id: string; name: string; rank: number; overall: number; contributions: Record<string, number> }[]
  scatter: { influencer_id: string; name: string; platform: string; views: number; match: number; followers: number; engagement: number; overall: number; rank: number; is_micro: boolean }[]
  demographics: { target: Record<string, number>; shortlist_average: Record<string, number>; segments: string[] }
  summary: { avg_score_top10: number; micro_in_top10: number; platform_mix_top10: Record<string, number>; exclusion_reasons: Record<string, number> }
  estimate: { label: string; estimated_views_top3: number; assumptions: string }
  weights: Weights; thresholds: Filters
}
export interface Meta { age_segments: string[]; targets: string[]; default_filters: Filters; default_weights: Weights; categories: string[] }

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, message: string, body?: unknown) { super(message); this.status = status; this.body = body }
}

/** Size an image URL for its slot. Unsplash photos are resized by the CDN (3:4 crop); other URLs pass through. */
export function imgSrc(src: string, width: number): string {
  if (!src.includes('images.unsplash.com')) return src
  try {
    const u = new URL(src)
    u.searchParams.set('w', String(width))
    u.searchParams.set('h', String(Math.round((width * 4) / 3)))
    u.searchParams.set('fit', 'crop')
    return u.toString()
  } catch { return src }
}

/** FastAPI validation errors arrive as a list; turn them into one readable sentence. */
function describe(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(d => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : JSON.stringify(d))).join(' ')
  return JSON.stringify(detail)
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {}
  const res = await fetch(`/api${path}`, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  })
  if (!res.ok) {
    let msg = res.statusText
    let body: unknown
    try { body = await res.json(); const b = body as { detail?: unknown }; msg = describe(b.detail ?? b) } catch { /* ignore */ }
    throw new ApiError(res.status, msg, body)
  }
  return res.json() as Promise<T>
}

export const fmt = {
  n: (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-GB')),
  k: (v: number | null | undefined) => (v == null ? '—' : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v)),
  pct: (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`),
  gbp: (v: number) => `£${v.toFixed(2).replace(/\.00$/, '')}`,
  money: (v: number) => `£${v.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`,
  ago: (iso: string) => {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
    if (s < 60) return 'just now'
    if (s < 3600) return `${Math.floor(s / 60)} min ago`
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  },
}
export const CRITERIA_LABELS: Record<string, string> = {
  audience_fit: 'Audience fit', content_fit: 'Content fit', engagement: 'Engagement', promo_views: 'Promo views',
  collaboration: 'Past collabs', brand_affinity: 'Brand affinity', region: 'Region',
}
