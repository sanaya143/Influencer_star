"""Level 2 — deterministic product and audience matching (pure Python, no LLM)."""
from __future__ import annotations

from ..schemas.models import CampaignBrief, Criterion, Exclusion, Influencer, Product

# Which gender audience share each target collection implies (None = no gender constraint).
TARGET_GENDER = {"women": "women", "men": "men", "unisex": None, "couple": None, "family": None, "kids": None}
# Content-category tokens that indicate suitability for each target.
TARGET_CATEGORIES = {
    "women": {"women", "unisex"}, "men": {"men", "unisex"}, "unisex": {"unisex", "women", "men"},
    "couple": {"couple", "unisex"}, "family": {"family", "kids"}, "kids": {"kids", "family"},
    "accessories": {"accessories"},
}
# Older/younger audience for kids: parents buy kidswear, so adult audience segments count.
KIDS_PARENT_SEGMENTS = ["25-34", "35-54"]


def target_age_segments(brief: CampaignBrief, product: Product | None = None) -> list[str]:
    segs = list(brief.target_age_segments)
    if brief.target in ("kids", "family") and any(s in ("children",) for s in segs):
        # kids are not the audience of creators; parents are the buying audience.
        segs = [s for s in segs if s != "children"] + [s for s in KIDS_PARENT_SEGMENTS if s not in segs]
    return segs


def audience_fit(inf: Influencer, brief: CampaignBrief) -> tuple[float, dict[str, float], str]:
    """Return (score 0-100, relevant age distribution, detail)."""
    segs = target_age_segments(brief)
    dist = inf.audience_age_distribution
    share = sum(dist.get(s, 0.0) for s in segs)
    relevant = {s: dist.get(s, 0.0) for s in segs}
    gkey = TARGET_GENDER.get(brief.target)
    gscore = 1.0
    gdetail = ""
    if gkey:
        gshare = inf.audience_gender_distribution.get(gkey, 0.0)
        gscore = min(1.0, gshare / 60.0)  # 60%+ matching gender = full marks
        gdetail = f" and {gshare:.0f}% {gkey} audience"
    # age share: 60% of audience in target segments = full marks
    age_score = min(1.0, share / 60.0)
    score = round(100 * (0.75 * age_score + 0.25 * gscore), 1)
    return score, relevant, f"{share:.0f}% of audience in {'/'.join(segs)}{gdetail}"


def content_fit(inf: Influencer, brief: CampaignBrief, product: Product) -> tuple[float, str]:
    """Overlap of creator content with product style tags, category and requested interests."""
    p_styles = set(product.style_tags) | set(brief.preferred_interests)
    i_styles = set(inf.content_tags) | set(inf.interests)
    style_overlap = len(p_styles & i_styles) / max(1, len(set(product.style_tags)))
    style_overlap = min(1.0, style_overlap)
    cats = TARGET_CATEGORIES.get(brief.target, set()) | {product.target_gender_or_collection}
    cat_hit = 1.0 if (set(inf.fashion_categories) & cats) else 0.0
    if brief.target == "couple" and "couple" not in inf.content_tags and "couple" not in inf.fashion_categories:
        cat_hit *= 0.4  # couple campaigns need couple/coordinated content signals
    pref = 0.0
    if brief.preferred_interests:
        pref = len(set(brief.preferred_interests) & i_styles) / len(brief.preferred_interests)
    score = 100 * (0.5 * style_overlap + 0.4 * cat_hit + 0.1 * pref) if brief.preferred_interests else 100 * (0.55 * style_overlap + 0.45 * cat_hit)
    shared = sorted(set(product.style_tags) & i_styles)
    return round(score, 1), f"shared style tags: {', '.join(shared) or 'none'}; category match: {'yes' if cat_hit else 'no'}"


def region_relevance(inf: Influencer, brief: CampaignBrief) -> tuple[float, str]:
    loc = brief.location.strip().lower()
    dist = inf.audience_location_distribution
    uk_cities = {"london", "manchester", "birmingham", "leeds", "glasgow", "bristol", "liverpool", "cardiff", "edinburgh"}
    if loc in ("uk", "united kingdom", "gb", "britain"):
        share = sum(v for k, v in dist.items() if k.lower() in uk_cities or k.lower() in ("uk", "gb"))
    else:
        share = sum(v for k, v in dist.items() if k.lower() == loc)
    return round(min(100.0, share / 70.0 * 100), 1), f"{share:.0f}% of audience in {brief.location}"


def engagement_score(inf: Influencer) -> float | None:
    if inf.engagement_rate is None:
        return None
    return round(min(100.0, inf.engagement_rate / 8.0 * 100), 1)  # 8%+ = full marks


def promo_view_score(inf: Influencer) -> tuple[float, float]:
    """Return (score, view_rate_pct). Rewards views relative to followers with a log reach term, so
    follower count alone never dominates."""
    import math
    views = inf.median_promotional_views or 0
    followers = max(1, inf.follower_count or 1)
    view_rate = views / followers  # 0.0-1.0
    rate_score = min(1.0, view_rate / 0.25)
    abs_score = min(1.0, math.log10(max(views, 1)) / math.log10(100_000))  # 100k views = full marks
    return round(100 * (0.6 * rate_score + 0.4 * abs_score), 1), round(view_rate * 100, 2)


def collaboration_score(inf: Influencer, product: Product) -> tuple[float | None, str]:
    hist = inf.collaboration_history
    if not hist:
        return None, "no previous collaboration data"
    pts = {"strong": 100.0, "average": 60.0, "weak": 20.0}
    base = sum(pts[c.campaign_outcome] for c in hist) / len(hist)
    # small bonus when previous collab was in a similar product category
    return round(base, 1), f"{len(hist)} previous collaboration(s), avg outcome {base:.0f}/100"


def level2_filter(eligible: list[Influencer], brief: CampaignBrief, product: Product) -> tuple[list[dict], list[Exclusion]]:
    passed, excluded = [], []
    for inf in eligible:
        a_score, relevant, a_detail = audience_fit(inf, brief)
        c_score, c_detail = content_fit(inf, brief, product)
        r_score, r_detail = region_relevance(inf, brief)
        match = 0.5 * a_score + 0.5 * c_score
        crit = [
            Criterion(name="Audience age/gender", status=_st(a_score, 70, 40), detail=a_detail),
            Criterion(name="Content & style", status=_st(c_score, 60, 30), detail=c_detail),
            Criterion(name="Target region", status=_st(r_score, 70, 40), detail=r_detail),
        ]
        entry = {"inf": inf, "audience": a_score, "relevant": relevant, "content": c_score, "region": r_score,
                 "match": round(match, 1), "criteria": crit, "details": (a_detail, c_detail, r_detail)}
        if match < brief.filters.min_audience_match:
            codes, reasons = ["LOW_AUDIENCE_MATCH"], [f"Audience/content match {match:.0f} below minimum {brief.filters.min_audience_match:.0f} ({a_detail}; {c_detail})."]
            if a_score < 30:
                codes.append("AUDIENCE_AGE_MISMATCH")
            if c_score < 30:
                codes.append("CONTENT_MISMATCH")
            excluded.append(Exclusion(influencer_id=inf.influencer_id, display_name=inf.display_name, username=inf.username,
                                      level=2, status="excluded", reason_codes=codes, reasons=reasons))
        else:
            passed.append(entry)
    return passed, excluded


def _st(score: float, hi: float, lo: float) -> str:
    return "satisfied" if score >= hi else "partial" if score >= lo else "not_satisfied"
