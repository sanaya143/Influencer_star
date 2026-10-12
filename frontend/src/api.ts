// Typed client for the THREADORA backend. All business logic (eligibility, ranking) lives server-side.
export interface Product {
  product_id: string; product_name: string; description: string; category: string; price_gbp: number; sizes: string[]
  target_age_segments: string[]; target_gender_or_collection: string; style_tags: string[]; target_region: string
  campaign_keywords: string[]; product_image: string; seasonal_collection: string; badges: string[]
}
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
  campaign_id: string; name: string; run_id: string; status: string; brief: Brief; stats: Stats; ranked: Match[]; insights: Insights | null; label: string
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
  constructor(status: number, message: string) { super(message); this.status = status }
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
    try { const b = await res.json(); msg = typeof b.detail === 'string' ? b.detail : JSON.stringify(b.detail ?? b) } catch { /* ignore */ }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

export const fmt = {
  n: (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('en-GB')),
  k: (v: number | null | undefined) => (v == null ? '—' : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : String(v)),
  pct: (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v.toFixed(d)}%`),
  gbp: (v: number) => `£${v.toFixed(2).replace(/\.00$/, '')}`,
}
export const CRITERIA_LABELS: Record<string, string> = {
  audience_fit: 'Audience fit', content_fit: 'Content fit', engagement: 'Engagement', promo_views: 'Promo views',
  collaboration: 'Past collabs', brand_affinity: 'Brand affinity', region: 'Region',
}
