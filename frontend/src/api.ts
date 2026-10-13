// Typed client for the Zylo backend. All business logic (eligibility, ranking) lives server-side.
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
/** One entry of an agent's "brain": a model turn (what it saw, thought, said and decided to call), a tool call,
 *  a deterministic rule-based decision, or a note (including errors). */
export interface BrainEvent {
  seq: number; ts: string; agent: string; kind: 'llm' | 'tool' | 'rule' | 'note'
  model?: string; input?: string; thought?: string; output?: string; calls?: { name: string; args: unknown }[]
  tokens?: { in: number | null; out: number | null }; duration_ms?: number; error?: string
  name?: string; args?: unknown; result?: string; text?: string; level?: 'info' | 'warn' | 'error'
}
export type Card =
  | { type: 'products'; title: string; items: { product_id: string; name: string; price_gbp: number; category: string; colour: string; status: string; stock_state: 'in_stock' | 'low' | 'out'; total_stock: number; low_sizes: string[]; sold_out_sizes: string[]; sold_30d: number }[] }
  | { type: 'kpis'; title: string; items: { label: string; value: string }[] }
  | { type: 'orders'; title: string; items: { order_id: string; customer: string; channel: string; units: number; total_gbp: number; items: string[]; at: string }[] }
  | { type: 'creators'; title: string; items: { influencer_id: string; name: string; platform: string; followers: number | null; promo_views: number | null; engagement: number | null }[] }
  | { type: 'matches'; title: string; subtitle: string; campaign_id?: string; items: { rank: number; influencer_id: string; name: string; platform: string; followers: number; promo_views: number; score: number; is_micro: boolean }[] }
  | { type: 'campaigns'; title: string; items: { campaign_id: string; name: string; status: string; ranked: number | null }[] }
  | { type: 'campaign_started'; campaign_id: string; name: string; page: string; agents_page: string }
  | { type: 'explain'; creator: string; influencer_id: string; rank: number | null; score: number | null; reasons: string[]; concerns: string[] }
export interface ChatTurn {
  turn_id: string; session_id: string; idx: number; user_text: string; answer: string | null; status: 'Running' | 'Completed' | 'Needs Review' | 'Failed'
  mode: 'llm' | 'rules' | null; model: string | null; note: string | null; brain: BrainEvent[]; cards: Card[]; agents: string[]
  usage: { total_tokens: number; input_tokens: number; output_tokens: number; token_source: string } | null; created_at: string; completed_at: string | null
}
export interface ChatCapabilities { mode: 'llm' | 'offline'; provider: string; model: string | null; agents: { name: string; role: string; tools: { name: string; summary: string }[] }[] }
export interface McpCall {
  id: number; at: string; client: string; transport: string; kind: 'tool' | 'resource' | 'prompt'; name: string; args: string
  status: 'ok' | 'error'; error: string | null; duration_ms: number; result_hint: string | null; changes_data: boolean
}
export interface McpCalls {
  items: McpCall[]
  summary: { total: number; last_hour: number; errors: number; changes: number; avg_ms: number; top_tools: { name: string; count: number }[]; clients: { name: string; count: number }[] }
  server: { running: boolean; writes: boolean; token_required: boolean; tools: number; endpoint: string }
}
export interface Health { status: string; mode: 'llm' | 'offline'; provider: string; model: string | null; provider_label: string; configured_model: string; use_ai: boolean; key_source: string; influencers: number; products: number }
export interface Filters { min_followers: number; min_promo_views: number; require_brand_safety: boolean; min_audience_match: number; require_content_theme?: boolean }
export interface Weights { audience_fit: number; content_fit: number; engagement: number; promo_views: number; collaboration: number; brand_affinity: number; region: number }
export interface Brief {
  product_id: string; collection_id?: string | null; content_themes?: string[]; objective: string; target_age_segments: string[]; target: string; location: string; budget_gbp: number | null
  preferred_interests: string[]; prioritise_micro: boolean; filters: Filters; weights: Weights; notes: string[]; needs_clarification: string[]
}
export interface Criterion { name: string; status: 'satisfied' | 'partial' | 'not_satisfied'; detail: string }
export interface Match {
  rank: number; influencer_id: string; display_name: string; username: string; platform: string; follower_count: number
  median_promotional_views: number; engagement_rate: number; is_micro: boolean; audience_fit_pct: number
  relevant_audience: Record<string, number>; scores: Record<string, number>; contributions: Record<string, number>
  overall_score: number; criteria: Criterion[]; rationale: string; concerns: string[]; data_confidence: 'high' | 'medium' | 'low'; insight?: string | null
  source?: string; matched_themes?: string[]
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
  insights: Insights | null; label: string; roi?: RoiSummary | null; sources?: { zylo: number; outside: number } | null
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
  brain?: BrainEvent[]  // absent on runs recorded before the brain existed
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
  content_themes?: string[]; rate_card?: Record<string, number>; source?: string
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
export interface CollectionView {
  collection_id: string; name: string; tagline: string; description: string; kind: 'licensed' | 'seasonal' | 'sale' | 'edit'
  content_themes: string[]; product_ids: string[]; target: string; target_age_segments: string[]; style_tags: string[]; discount_pct: number
  image: string; avg_price_gbp: number; total_stock: number; creators_with_themes: number | null
  products: { product_id: string; product_name: string; price_gbp: number; product_image: string; colour: string; category: string; total_stock: number }[]
}
export interface PlanSummary {
  creators: number; spend_gbp: number; views: number; relevant_views: number; expected_orders: number; expected_revenue_gbp: number
  cpm_gbp: number | null; cost_per_1k_relevant_gbp: number | null; roas: number | null; roi_pct: number | null; cost_per_order_gbp: number | null
}
export interface CreatorEconomics {
  influencer_id: string; display_name: string; platform: string; followers: number; tier: string | null; source: string; rank?: number
  fee_gbp: number; fee_estimated: boolean; deliverable: string | null; rate_card: Record<string, number>; fair_fee_gbp: number | null
  price_vs_market: number | null; value_flag: 'good value' | 'fair' | 'above market' | null; suggested_offer_gbp: number | null
  views: number; relevant_views: number; audience_in_target_pct: number; cpm_gbp: number; cost_per_1k_relevant_gbp: number | null
  purchase_rate_pct: number; fit_factor: number; expected_orders: number; expected_revenue_gbp: number; roas: number; roi_pct: number; match_score: number | null
}
export interface RoiComparison { orders_multiple: number | null; relevant_views_multiple: number | null; cpm_saving_pct: number | null; cost_per_order_saving_pct: number | null }
export interface RoiSummary {
  budget_gbp: number; optimised_for: 'revenue' | 'relevant_views'; plan: PlanSummary; baseline: PlanSummary; comparison: RoiComparison
  plan_creators: string[]; value_flags: Record<string, number>; negotiation_saving_gbp: number
}
export interface RoiAnalysis {
  campaign_id: string; run_id: string; budget_gbp: number; optimised_for: 'revenue' | 'relevant_views'; unit_price_gbp: number; product_name: string
  plan: { summary: PlanSummary; creators: CreatorEconomics[] }; baseline: { label: string; summary: PlanSummary; creators: CreatorEconomics[] }
  comparison: RoiComparison; rates: CreatorEconomics[]; value_flags: Record<string, number>; negotiation_saving_gbp: number
  benchmarks: { tier: string; platform: string; median_cpm: number; median_fee_per_follower: number; creators: number }[]
  assumptions: string[]; label: string
}
export interface UsageTotals { calls: number; input_tokens: number; output_tokens: number; total_tokens: number; cost_usd: number; unpriced_calls: number; estimated_tokens: boolean }
export interface ModelPrice { input: number; output: number; source: string }
export interface UsageSummary {
  period_days: number; totals: UsageTotals; today: UsageTotals
  by_source: (UsageTotals & { source: string })[]
  by_model: (UsageTotals & { model: string; price: ModelPrice | null })[]
  by_agent: { agent: string; input_tokens: number; output_tokens: number; total_tokens: number }[]
  recent: { kind: string; id: string; label: string; at: string; model: string | null; in: number; out: number; cost_usd: number | null; link: string; token_source: string | null }[]
  current_model: string | null; current_price: ModelPrice | null; unpriced_models: string[]; note: string
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
  usd: (v: number) => (v === 0 ? '$0' : v < 0.01 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`),
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
