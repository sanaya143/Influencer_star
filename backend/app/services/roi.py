"""Creator fees, return on spend and budget planning (pure Python, deterministic).

What a creator charges comes from their rate card (asking price per deliverable). From it we work out:
  * CPM: fee per 1,000 promotional views;
  * a fair fee: what creators of the same size and platform typically charge for that many views;
  * expected orders and revenue: views x the creator's past purchase rate per view x an audience-fit factor;
  * a budget plan: the creators that give the most value per pound within the budget, compared with the common
    habit of booking the biggest accounts the budget allows.
Everything is an estimate from synthetic data; the assumptions are returned with every result.
"""
from __future__ import annotations

from functools import lru_cache
from statistics import median

from ..data.seed_generator import PRIMARY_DELIVERABLE, tier
from ..schemas.models import CampaignBrief, Influencer
from . import audience_matcher as am
from .data_provider import get_provider
from .eligibility_filter import level1_filter

DEFAULT_BUDGET = 5000.0
DEFAULT_PURCHASE_RATE = 0.0025  # orders per promotional view when a creator has no collaboration history
MAX_PLAN = 15
ASSUMPTIONS = [
    "Fees are each creator's asking price for one primary deliverable (Instagram post, TikTok video or YouTube video). Creators with no rate card use the market rate for their size, marked as estimated.",
    "Views are the creator's median views on past promotional posts.",
    "Purchase rate is orders per view from the creator's past collaborations (0.25% when there is no history).",
    "Better-matched audiences are assumed to buy more: expected orders are scaled by the match score (score 70 = 1x, capped between 0.5x and 1.3x).",
    "Revenue is expected orders x the product price (the collection's average price, after any sale discount).",
    "The comparison plan books the largest accounts in the right fashion category that pass the same eligibility rules, until the budget runs out.",
    "All figures are estimates from synthetic data, not predictions of sales.",
]


def _views(inf: Influencer) -> int:
    return int(inf.median_promotional_views or 0)


def asking_fee(inf: Influencer) -> tuple[int | None, str | None]:
    """The creator's own price for their main deliverable, if they shared a rate card."""
    if not inf.rate_card:
        return None, None
    key = PRIMARY_DELIVERABLE.get(inf.platform or "", "post")
    if key in inf.rate_card:
        return inf.rate_card[key], key
    k, v = next(iter(inf.rate_card.items()))
    return v, k


@lru_cache(maxsize=1)
def _benchmarks_cached(n: int) -> dict:
    by: dict[tuple[str, str], list[tuple[float, float]]] = {}
    for inf in get_provider().influencers():
        fee, _ = asking_fee(inf)
        t, v = tier(inf.follower_count), _views(inf)
        if fee and t and v and inf.follower_count:
            by.setdefault((t, inf.platform or "Unknown"), []).append((fee / v * 1000, fee / inf.follower_count))
            by.setdefault((t, "*"), []).append((fee / v * 1000, fee / inf.follower_count))
    return {k: {"median_cpm": round(median(c for c, _ in rows), 2), "median_fee_per_follower": median(f for _, f in rows), "creators": len(rows)}
            for k, rows in by.items()}


def benchmarks() -> dict:
    """Typical CPM and fee-per-follower by size tier and platform, from every creator who shared a rate card."""
    return _benchmarks_cached(len(get_provider().influencers()))


def _bench(inf: Influencer) -> dict | None:
    b = benchmarks()
    t = tier(inf.follower_count)
    return b.get((t, inf.platform or "Unknown")) or b.get((t, "*")) if t else None


def fair_fee(inf: Influencer) -> int | None:
    """What creators of the same size and platform typically charge for this creator's promotional views."""
    b, v = _bench(inf), _views(inf)
    if not b or not v:
        return None
    return max(10, int(round(b["median_cpm"] * v / 1000, -1)))


def fee(inf: Influencer) -> tuple[int | None, bool, str | None]:
    """(fee, estimated?, deliverable). Falls back to the market rate for the creator's size when no rate card."""
    f, key = asking_fee(inf)
    if f:
        return f, False, key
    b = _bench(inf)
    if b and inf.follower_count:
        return max(25, int(round(b["median_fee_per_follower"] * inf.follower_count, -1))), True, PRIMARY_DELIVERABLE.get(inf.platform or "", "post")
    return None, True, None


def purchase_rate(inf: Influencer) -> float:
    views = sum(c.promotional_views for c in inf.collaboration_history)
    conv = sum(c.conversions for c in inf.collaboration_history)
    return conv / views if views > 0 else DEFAULT_PURCHASE_RATE


def economics(inf: Influencer, unit_price: float, score: float | None, audience_pct: float) -> dict | None:
    f, estimated, deliverable = fee(inf)
    views = _views(inf)
    if not f or not views:
        return None
    fit = max(0.5, min(1.3, (score or 35) / 70))
    orders = views * purchase_rate(inf) * fit
    revenue = orders * unit_price
    fair = fair_fee(inf)
    ratio = f / fair if fair else None
    flag = None if ratio is None or estimated else "good value" if ratio < 0.85 else "above market" if ratio > 1.25 else "fair"
    relevant = views * audience_pct / 100
    return {
        "influencer_id": inf.influencer_id, "display_name": inf.display_name, "platform": inf.platform or "Unknown",
        "followers": inf.follower_count or 0, "tier": tier(inf.follower_count), "source": inf.source,
        "fee_gbp": f, "fee_estimated": estimated, "deliverable": deliverable, "rate_card": inf.rate_card,
        "fair_fee_gbp": fair, "price_vs_market": round(ratio, 2) if ratio else None, "value_flag": flag,
        "suggested_offer_gbp": int(round(min(f, fair * 1.05), -1)) if fair and not estimated else None,
        "views": views, "relevant_views": round(relevant), "audience_in_target_pct": round(audience_pct, 1),
        "cpm_gbp": round(f / views * 1000, 2), "cost_per_1k_relevant_gbp": round(f / relevant * 1000, 2) if relevant else None,
        "purchase_rate_pct": round(purchase_rate(inf) * 100, 3), "fit_factor": round(fit, 2),
        "expected_orders": round(orders, 1), "expected_revenue_gbp": round(revenue, 2),
        "roas": round(revenue / f, 2), "roi_pct": round((revenue - f) / f * 100, 1), "match_score": score,
    }


def _summary(rows: list[dict]) -> dict:
    spend = sum(r["fee_gbp"] for r in rows)
    views = sum(r["views"] for r in rows)
    rel = sum(r["relevant_views"] for r in rows)
    orders = sum(r["expected_orders"] for r in rows)
    revenue = sum(r["expected_revenue_gbp"] for r in rows)
    return {"creators": len(rows), "spend_gbp": spend, "views": views, "relevant_views": round(rel), "expected_orders": round(orders, 1),
            "expected_revenue_gbp": round(revenue, 2), "cpm_gbp": round(spend / views * 1000, 2) if views else None,
            "cost_per_1k_relevant_gbp": round(spend / rel * 1000, 2) if rel else None,
            "roas": round(revenue / spend, 2) if spend else None, "roi_pct": round((revenue - spend) / spend * 100, 1) if spend else None,
            "cost_per_order_gbp": round(spend / orders, 2) if orders else None}


def _fill(rows: list[dict], budget: float, key) -> list[dict]:
    picked, left = [], budget
    for r in sorted(rows, key=key):
        if r["fee_gbp"] <= left and len(picked) < MAX_PLAN:
            picked.append(r)
            left -= r["fee_gbp"]
    return picked


def analyse(brief: CampaignBrief, ranked: list[dict], budget: float | None = None, top_n: int = 40) -> dict:
    """Fees, value and a budget plan for a finished matching run."""
    prov = get_provider()
    product = prov.product(brief.product_id)
    price = product.price_gbp if product else 30.0
    budget = float(budget or brief.budget_gbp or DEFAULT_BUDGET)
    goal = "revenue" if brief.objective == "sales" else "relevant_views"

    rows = []
    for m in ranked[:top_n]:
        inf = prov.influencer(m["influencer_id"])
        e = economics(inf, price, m["overall_score"], m["audience_fit_pct"]) if inf else None
        if e:
            rows.append({**e, "rank": m["rank"]})
    value = (lambda r: -r["expected_revenue_gbp"] / r["fee_gbp"]) if goal == "revenue" else (lambda r: -r["relevant_views"] / r["fee_gbp"])
    plan = _fill(rows, budget, value)

    # The habit Zylo replaces: book the biggest eligible fashion accounts in the right category that the budget allows.
    ranked_score = {m["influencer_id"]: m["overall_score"] for m in ranked}
    cats = am.TARGET_CATEGORIES.get(brief.target, set()) | {product.target_gender_or_collection if product else brief.target}
    eligible = [i for i in level1_filter(prov.influencers(), brief.filters)["eligible"] if cats & set(i.fashion_categories)]
    big = []
    for inf in sorted(eligible, key=lambda i: -(i.follower_count or 0))[:120]:
        share = sum(inf.audience_age_distribution.get(s, 0.0) for s in am.target_age_segments(brief))
        e = economics(inf, price, ranked_score.get(inf.influencer_id), share)
        if e:
            big.append(e)
    baseline = _fill(big, budget, lambda r: -r["followers"])

    ours, theirs = _summary(plan), _summary(baseline)
    ratio = lambda a, b: round(a / b, 2) if a and b else None
    flags = {k: sum(1 for r in rows if r["value_flag"] == k) for k in ("good value", "fair", "above market")}
    overpay = sum(r["fee_gbp"] - r["suggested_offer_gbp"] for r in rows if r["suggested_offer_gbp"] is not None and r["fee_gbp"] > r["suggested_offer_gbp"])
    return {
        "budget_gbp": budget, "optimised_for": goal, "unit_price_gbp": price, "product_name": product.product_name if product else brief.product_id,
        "plan": {"summary": ours, "creators": plan}, "baseline": {"label": "Biggest accounts in the category, within budget", "summary": theirs, "creators": baseline},
        "comparison": {
            "orders_multiple": ratio(ours["expected_orders"], theirs["expected_orders"]),
            "relevant_views_multiple": ratio(ours["relevant_views"], theirs["relevant_views"]),
            "cpm_saving_pct": round((1 - ours["cpm_gbp"] / theirs["cpm_gbp"]) * 100, 1) if ours["cpm_gbp"] and theirs["cpm_gbp"] else None,
            "cost_per_order_saving_pct": round((1 - ours["cost_per_order_gbp"] / theirs["cost_per_order_gbp"]) * 100, 1)
            if ours["cost_per_order_gbp"] and theirs["cost_per_order_gbp"] else None,
        },
        "rates": rows, "value_flags": flags, "negotiation_saving_gbp": int(overpay),
        "benchmarks": [{"tier": t, "platform": p, **v} for (t, p), v in sorted(benchmarks().items()) if p != "*"],
        "assumptions": ASSUMPTIONS, "label": "ESTIMATE · synthetic data",
    }


def plan_summary(brief: CampaignBrief, ranked: list[dict]) -> dict:
    """Short version stored with each run (and given to the Insights agent)."""
    a = analyse(brief, ranked)
    p, b = a["plan"]["summary"], a["baseline"]["summary"]
    return {"budget_gbp": a["budget_gbp"], "optimised_for": a["optimised_for"], "plan": p, "baseline": b, "comparison": a["comparison"],
            "plan_creators": [r["display_name"] for r in a["plan"]["creators"]], "value_flags": a["value_flags"],
            "negotiation_saving_gbp": a["negotiation_saving_gbp"]}
