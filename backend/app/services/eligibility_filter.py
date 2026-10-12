"""Level 1 — deterministic eligibility filtering (pure Python, no LLM)."""
from __future__ import annotations

from ..schemas.models import Exclusion, FilterConfig, Influencer

REQUIRED_FIELDS = ["platform", "follower_count", "median_promotional_views", "engagement_rate"]


def check_influencer(inf: Influencer, cfg: FilterConfig) -> Exclusion | None:
    """Return an Exclusion (excluded or needs_review) or None when eligible.

    Missing critical metrics -> needs_review (never treated as verified-low).
    Verified failures -> excluded.
    """
    codes: list[str] = []
    reasons: list[str] = []
    review_codes: list[str] = []
    review_reasons: list[str] = []

    for f in REQUIRED_FIELDS:
        if getattr(inf, f) is None:
            review_codes.append(f"MISSING_{f.upper()}")
            review_reasons.append(f"Required field '{f}' is missing; value not inferred.")

    if inf.follower_count is not None and inf.follower_count < cfg.min_followers:
        codes.append("LOW_FOLLOWERS")
        reasons.append(f"Followers {inf.follower_count:,} below minimum {cfg.min_followers:,}.")
    if inf.median_promotional_views is not None and inf.median_promotional_views < cfg.min_promo_views:
        codes.append("LOW_PROMO_VIEWS")
        reasons.append(f"Median promotional views {inf.median_promotional_views:,} below minimum {cfg.min_promo_views:,}.")
    if cfg.require_brand_safety and inf.brand_safety_status == "flagged":
        codes.append("BRAND_SAFETY_FLAGGED")
        reasons.append("Failed brand-safety policy check.")
    if cfg.require_brand_safety and inf.brand_safety_status == "unknown":
        review_codes.append("BRAND_SAFETY_UNKNOWN")
        review_reasons.append("Brand-safety status unknown; manual review required.")
    if inf.data_quality_status == "unreliable":
        review_codes.append("UNRELIABLE_DATA")
        review_reasons.append("Profile data flagged unreliable; metrics cannot be trusted.")

    if codes:  # verified failure wins; also surface review notes for completeness
        return Exclusion(influencer_id=inf.influencer_id, display_name=inf.display_name, username=inf.username,
                         level=1, status="excluded", reason_codes=codes + review_codes, reasons=reasons + review_reasons)
    if review_codes:
        return Exclusion(influencer_id=inf.influencer_id, display_name=inf.display_name, username=inf.username,
                         level=1, status="needs_review", reason_codes=review_codes, reasons=review_reasons)
    return None


def level1_filter(influencers: list[Influencer], cfg: FilterConfig) -> dict:
    eligible: list[Influencer] = []
    excluded: list[Exclusion] = []
    for inf in influencers:
        ex = check_influencer(inf, cfg)
        if ex is None:
            eligible.append(inf)
        else:
            excluded.append(ex)
    review = [e for e in excluded if e.status == "needs_review"]
    warnings = []
    if review:
        warnings.append(f"{len(review)} profile(s) need manual review due to missing or unreliable critical metrics.")
    partial = sum(1 for i in eligible if i.data_quality_status == "partial")
    if partial:
        warnings.append(f"{partial} eligible profile(s) have partial data; scores carry lower confidence.")
    return {
        "eligible": eligible, "excluded": excluded,
        "counts": {"retrieved": len(influencers), "eligible": len(eligible),
                   "excluded": len(excluded) - len(review), "review_required": len(review)},
        "thresholds": cfg.model_dump(), "warnings": warnings,
    }
