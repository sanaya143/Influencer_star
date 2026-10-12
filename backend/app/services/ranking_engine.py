"""Deterministic ranking + the full matching pipeline (pure Python, no LLM)."""
from __future__ import annotations

from ..schemas.models import (CampaignBrief, FilterStats, MatchOutput, MatchResult, Product, ScoreWeights)
from . import audience_matcher as am
from .eligibility_filter import level1_filter

MICRO_RANGE = (10_000, 100_000)
# Missing-data policy: a missing sub-score is replaced by this neutral-low value (not 0, not average)
# and lowers data confidence, so missing data can never create an unjustifiably high score.
MISSING_PENALTY_SCORE = 30.0
CRITERIA_LABELS = {
    "audience_fit": "Audience fit", "content_fit": "Content fit", "engagement": "Engagement",
    "promo_views": "Promo views", "collaboration": "Past collabs", "brand_affinity": "Brand affinity", "region": "Region",
}


def score_candidate(entry: dict, product: Product, weights: ScoreWeights) -> dict:
    inf = entry["inf"]
    missing: list[str] = []
    eng = am.engagement_score(inf)
    if eng is None:
        missing.append("engagement")
        eng = MISSING_PENALTY_SCORE
    pv, view_rate = am.promo_view_score(inf)
    collab, collab_detail = am.collaboration_score(inf, product)
    if collab is None:
        missing.append("collaboration")
        collab = MISSING_PENALTY_SCORE
    aff = inf.brand_affinity_score
    if aff is None:
        missing.append("brand_affinity")
        aff = MISSING_PENALTY_SCORE
    scores = {
        "audience_fit": entry["audience"], "content_fit": entry["content"], "engagement": eng,
        "promo_views": pv, "collaboration": collab, "brand_affinity": round(float(aff), 1), "region": entry["region"],
    }
    w = weights.normalised()
    contrib = {k: round(scores[k] * w[k], 2) for k in scores}
    overall = round(sum(contrib.values()), 2)
    entry.update(scores=scores, contributions=contrib, overall=overall, missing=missing,
                 view_rate=view_rate, collab_detail=collab_detail)
    return entry


def _confidence(inf, missing: list[str]) -> str:
    if inf.data_quality_status == "partial" or len(missing) >= 2:
        return "low"
    if missing or inf.brand_safety_status != "clear":
        return "medium"
    return "high"


def _rationale_and_concerns(e: dict, product: Product) -> tuple[str, list[str]]:
    inf = e["inf"]
    top = sorted(e["contributions"].items(), key=lambda kv: kv[1], reverse=True)[:2]
    strengths = ", ".join(CRITERIA_LABELS[k].lower() for k, _ in top)
    micro = " Micro-influencer with strong view-to-follower ratio." if _is_micro(inf) and e["view_rate"] >= 10 else ""
    rationale = (f"Strongest on {strengths}. {e['details'][0]}; median promo views "
                 f"{inf.median_promotional_views:,} ({e['view_rate']:.1f}% of followers).{micro}")
    concerns = []
    if e["scores"]["audience_fit"] < 50:
        concerns.append("Only a modest share of the audience is in the target segment.")
    if e["scores"]["content_fit"] < 45:
        concerns.append("Limited overlap with the product's style and category.")
    if e["scores"]["region"] < 50:
        concerns.append("Audience is not concentrated in the target region.")
    if "collaboration" in e["missing"]:
        concerns.append("No previous collaboration history to validate performance.")
    if "engagement" in e["missing"] or "brand_affinity" in e["missing"]:
        concerns.append("Some metrics missing; neutral-low values were used.")
    if inf.brand_safety_status != "clear":
        concerns.append("Brand-safety status not fully cleared.")
    if inf.data_quality_status == "partial":
        concerns.append("Profile data is only partially verified.")
    return rationale, concerns


def _is_micro(inf) -> bool:
    return inf.follower_count is not None and MICRO_RANGE[0] <= inf.follower_count < MICRO_RANGE[1]


def rank(entries: list[dict], product: Product, brief: CampaignBrief) -> list[MatchResult]:
    scored = [score_candidate(e, product, brief.weights) for e in entries]
    # stable: score desc, then more promo views, then influencer_id
    scored.sort(key=lambda e: (-e["overall"], -(e["inf"].median_promotional_views or 0), e["inf"].influencer_id))
    out: list[MatchResult] = []
    for i, e in enumerate(scored, start=1):
        inf = e["inf"]
        rationale, concerns = _rationale_and_concerns(e, product)
        out.append(MatchResult(
            rank=i, influencer_id=inf.influencer_id, display_name=inf.display_name, username=inf.username,
            platform=inf.platform or "Unknown", follower_count=inf.follower_count or 0,
            median_promotional_views=inf.median_promotional_views or 0, engagement_rate=inf.engagement_rate or 0.0,
            is_micro=_is_micro(inf), audience_fit_pct=sum(e["relevant"].values()), relevant_audience=e["relevant"],
            scores=e["scores"], contributions=e["contributions"], overall_score=e["overall"], criteria=e["criteria"],
            rationale=rationale, concerns=concerns, data_confidence=_confidence(inf, e["missing"])))
    return out


def run_matching(brief: CampaignBrief, product: Product, influencers: list) -> MatchOutput:
    """Full deterministic pipeline: L1 -> L2 -> rank. Same input always yields same output."""
    l1 = level1_filter(influencers, brief.filters)
    passed, l2_excluded = am.level2_filter(l1["eligible"], brief, product)
    ranked = rank(passed, product, brief)
    c = l1["counts"]
    stats = FilterStats(
        retrieved=c["retrieved"], eligible=c["eligible"], excluded_l1=c["excluded"], review_required=c["review_required"],
        passed_l2=len(passed), excluded_l2=len(l2_excluded), ranked=len(ranked),
        thresholds=l1["thresholds"], warnings=l1["warnings"] + ([] if ranked else ["No influencers matched; try relaxing thresholds."]))
    return MatchOutput(stats=stats, ranked=ranked, excluded=l1["excluded"] + l2_excluded)
