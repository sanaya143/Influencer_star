"""Domain operations shared by every AI-facing surface (the chat assistant's agents and the MCP server), so there is one
implementation of each. Core functions raise `ToolFail` with a readable message; the chat wrappers at the bottom turn
that into an `{"error": ...}` result the model can react to. Plain types only (str/int/bool), because the model sees
these signatures as its tool schema."""
from __future__ import annotations

import functools
from collections import Counter
from typing import Any, Callable

from ..schemas.models import AGE_SEGMENTS, TARGETS
from . import creators as creators_svc
from . import inventory
from .data_provider import get_provider
from .ranking_engine import run_matching


class ToolFail(Exception):
    """A problem the caller (a model or a person) can act on, e.g. 'Product X not found'."""


def routes():
    """REST handlers back the saved-campaign operations. Imported on first use: they pull in the agent framework."""
    from ..api import routes as r
    return r


# ---------------------------------------------------------------------- shaping (compact results for models)
def slim_product(p: dict) -> dict:
    keys = ("product_id", "product_name", "category", "colour", "price_gbp", "status", "stock", "total_stock", "stock_state", "low_sizes",
            "sold_out_sizes", "units_sold_30d", "badges", "seasonal_collection", "target_gender_or_collection", "target_age_segments", "style_tags")
    return {k: p[k] for k in keys}


def slim_creator(i) -> dict:
    return {"influencer_id": i.influencer_id, "display_name": i.display_name, "username": i.username, "platform": i.platform,
            "follower_count": i.follower_count, "median_promotional_views": i.median_promotional_views, "engagement_rate_pct": i.engagement_rate,
            "style": i.creator_content_style, "fashion_categories": i.fashion_categories, "brand_safety": i.brand_safety_status,
            "data_quality": i.data_quality_status}


def slim_match(m) -> dict:
    return {"rank": m.rank, "influencer_id": m.influencer_id, "name": m.display_name, "username": m.username, "platform": m.platform,
            "followers": m.follower_count, "median_promo_views": m.median_promotional_views, "engagement_rate_pct": m.engagement_rate,
            "is_micro": m.is_micro, "overall_score": m.overall_score, "sub_scores": m.scores, "data_confidence": m.data_confidence,
            "rationale": m.rationale, "concerns": m.concerns}


def page(items: list, page_no: int, page_size: int) -> dict:
    total, start = len(items), (page_no - 1) * page_size
    return {"total": total, "page": page_no, "pages": max(1, -(-total // page_size)), "page_size": page_size, "items": items[start:start + page_size]}


# ---------------------------------------------------------------------- operations
def preview_matching_core(product_id: str, target_age_segments: list[str] | None = None, target: str | None = None, location: str = "",
                          min_followers: int | None = None, min_promo_views: int | None = None, min_audience_match: float = 55.0,
                          preferred_interests: list[str] | None = None, top_n: int = 10, micro_only: bool = False) -> dict[str, Any]:
    """Deterministic Level 1 → Level 2 → ranking for a product. Nothing is saved and no language model is involved."""
    from ..agents.brief_parser import assemble_brief
    product = get_provider().product(product_id)
    if product is None:
        raise ToolFail(f"Product '{product_id}' not found")
    bad = [a for a in (target_age_segments or []) if a not in AGE_SEGMENTS]
    if bad or (target and target not in TARGETS):
        raise ToolFail(f"Use age segments from {', '.join(AGE_SEGMENTS)} and a target from {', '.join(TARGETS)}.")
    brief = assemble_brief(product, {"target_age_segments": target_age_segments or None, "target": target or None, "location": location or None,
                                     "min_followers": min_followers, "min_promo_views": min_promo_views, "preferred_interests": preferred_interests or []})
    brief.filters.min_audience_match = min_audience_match
    out = run_matching(brief, product, get_provider().influencers())
    reasons = Counter(code for e in out.excluded for code in e.reason_codes)
    pool = [m for m in out.ranked if m.is_micro] if micro_only else out.ranked  # rank numbers stay the overall ranks
    return {"product": {"product_id": product.product_id, "product_name": product.product_name, "status": product.status},
            "brief": brief.model_dump(exclude={"notes", "needs_clarification"}), "stats": out.stats.model_dump(),
            "micro_only": micro_only, "micro_ranked": sum(1 for m in out.ranked if m.is_micro),
            "top": [slim_match(m) for m in pool[:top_n]], "exclusion_reason_counts": dict(reasons.most_common()),
            "note": "Preview only: not saved. Scores rank fit and are not predictions of sales or ROI. Synthetic data."}


def campaign_results(campaign_id: str, top_n: int = 10, micro_only: bool = False, platform: str = "") -> dict[str, Any]:
    from fastapi import HTTPException
    try:
        r = routes().results(campaign_id, sort="overall_score", micro_only=micro_only, platform=platform, min_score=0, limit=top_n)
    except HTTPException as e:
        raise ToolFail(str(e.detail)) from None
    ins = r.get("insights") or {}
    return {"campaign_id": r["campaign_id"], "name": r["name"], "status": r["status"], "stats": r["stats"], "leaders": r["leaders"],
            "top": [{k: m[k] for k in ("rank", "influencer_id", "display_name", "platform", "follower_count", "median_promotional_views",
                                       "engagement_rate", "is_micro", "overall_score", "scores", "data_confidence", "rationale", "concerns")}
                    for m in r["ranked"]],
            "insights": {k: ins.get(k) for k in ("summary", "recommendation", "trade_offs", "micro_highlights", "next_steps")}, "note": r["label"]}


def campaign_analytics(campaign_id: str) -> dict[str, Any]:
    from fastapi import HTTPException
    try:
        a = routes().analytics(campaign_id)
    except HTTPException as e:
        raise ToolFail(str(e.detail)) from None
    return {k: a[k] for k in ("run_id", "funnel", "breakdown", "demographics", "summary", "estimate", "weights", "thresholds")}


def explain_creator(campaign_id: str, influencer_id: str) -> dict[str, Any]:
    from fastapi import HTTPException
    try:
        d = routes().result_detail(campaign_id, influencer_id)
    except HTTPException as e:
        raise ToolFail(str(e.detail)) from None
    return {"creator": slim_creator(get_provider().influencer(influencer_id)), "ranked_as": d["match"], "excluded_as": d["exclusion"],
            "target_age_segments": d["target_age_segments"], "weights": d["weights"]}


def _csv(s: str) -> list[str] | None:
    items = [x.strip() for x in (s or "").replace(";", ",").split(",") if x.strip()]
    return items or None


# ---------------------------------------------------------------------- chat-facing tools (what the model can call)
def safe(fn: Callable) -> Callable:
    """Errors become {"error": ...} results so the model can explain or retry instead of the turn failing."""
    if hasattr(fn, "__wrapped__") or not callable(fn):
        return fn

    @functools.wraps(fn)
    def sync_wrapper(*a, **kw):
        try:
            return fn(*a, **kw)
        except ToolFail as e:
            return {"error": str(e)}
        except Exception as e:  # unexpected: still report, never crash the turn
            return {"error": f"{type(e).__name__}: {e}"}

    @functools.wraps(fn)
    async def async_wrapper(*a, **kw):
        try:
            return await fn(*a, **kw)
        except ToolFail as e:
            return {"error": str(e)}
        except Exception as e:
            return {"error": f"{type(e).__name__}: {e}"}

    import inspect
    return async_wrapper if inspect.iscoroutinefunction(fn) else sync_wrapper


@safe
def list_products(q: str = "", category: str = "", stock: str = "", limit: int = 8) -> dict:
    """Search the product catalogue with live stock per size. q matches name, colour or style tag. category is one of
    Women, Men, Kids, Unisex, Couple Looks, Accessories. stock is '' (any), 'low', 'out', 'in_stock' or 'attention'
    (low or sold-out sizes). Returns up to `limit` products (max 20)."""
    items = inventory.search(["active"], q, category, "", stock, "bestsellers" if not stock else "stock_asc")
    res = page([slim_product(p) for p in items], 1, max(1, min(int(limit or 8), 20)))
    return {"total": res["total"], "products": res["items"]}


@safe
def get_product(product_id: str) -> dict:
    """Full details for one product by id (for example P001), including per-size stock and recent stock movements."""
    p = inventory.product_view(product_id)
    if p is None:
        raise ToolFail(f"Product '{product_id}' not found")
    return {**slim_product(p), "description": p["description"], "movements": inventory.movements(product_id, 8)}


@safe
def inventory_summary() -> dict:
    """Inventory and 30-day sales snapshot: live product count, units and stock value, low and sold-out sizes, orders,
    revenue, average order value, bestsellers, sizes to restock first, and sales by category."""
    s = inventory.summary()
    s.pop("daily", None)
    s["bestsellers"] = [{"product_id": p["product_id"], "product_name": p["product_name"], "units_sold_30d": p["units_sold_30d"]} for p in s["bestsellers"]]
    s["low_stock"] = [{k: v for k, v in r.items() if k != "product_image"} for r in s["low_stock"]]
    return s


@safe
def recent_orders(limit: int = 5) -> dict:
    """The most recent orders (newest first) with customer, items, units and total."""
    res = inventory.list_orders(1, max(1, min(int(limit or 5), 15)), "", "")
    return {"total": res["total"], "orders": [{"order_id": o["order_id"], "customer": o["customer_name"], "channel": o["channel"], "units": o["units"],
                                               "total_gbp": o["total_gbp"], "items": [f"{ln['qty']} x {ln['product_name']} ({ln['size']})" for ln in o["lines"]],
                                               "at": o["created_at"]} for o in res["items"]]}


@safe
def search_creators(q: str = "", platform: str = "", category: str = "", min_followers: int = 0, sort: str = "followers", limit: int = 8) -> dict:
    """Browse the synthetic creator (influencer) dataset without campaign scoring. q matches name, handle or content tag.
    platform: Instagram, TikTok or YouTube. category: women, men, unisex, kids, family, couple or accessories.
    sort: followers, promo_views, engagement or id."""
    if sort not in ("id", "followers", "promo_views", "engagement"):
        sort = "followers"
    res = page(creators_svc.search(q, platform, category, int(min_followers), None, sort), 1, max(1, min(int(limit or 8), 20)))  # type: ignore[arg-type]
    return {"total": res["total"], "creators": [slim_creator(i) for i in res["items"]]}


@safe
def get_creator(influencer_id: str) -> dict:
    """One creator's profile by id (for example I0001): audience age, gender and location mix, interests, brand affinity and past collaborations."""
    i = get_provider().influencer(influencer_id)
    if i is None:
        raise ToolFail(f"Creator '{influencer_id}' not found")
    d = i.model_dump()
    d["collaboration_history"] = d["collaboration_history"][:6]
    return d


@safe
def preview_matching(product_id: str, target_age_segments: str = "", target: str = "", location: str = "", min_followers: int = 0,
                     min_promo_views: int = 0, top_n: int = 5, micro_only: bool = False) -> dict:
    """Rank creators for a product with the deterministic Python engine (eligibility, audience match, weighted score). Nothing is
    saved. target_age_segments is a comma list from: children, teens, 18-24, 25-34, 35-54, 55+ (empty = the product's own).
    target is women, men, unisex, couple, family or kids (empty = the product's own). location defaults to UK. 0 for the
    follower/view minimums means the standard thresholds. Set micro_only to true when the user asks for micro-influencers
    (10k to 100k followers); the ranks shown are still the overall ranks."""
    return preview_matching_core(product_id, _csv(target_age_segments), target or None, location, int(min_followers) or None,
                                 int(min_promo_views) or None, 55.0, None, max(1, min(int(top_n or 5), 15)), bool(micro_only))


@safe
def list_campaigns(limit: int = 5) -> dict:
    """Recent saved campaigns with status and number of ranked creators (newest first)."""
    return {"campaigns": routes().list_campaigns()["items"][: max(1, min(int(limit or 5), 15))]}


@safe
def get_campaign_results(campaign_id: str, top_n: int = 5) -> dict:
    """The ranked shortlist of a saved campaign: funnel counts, the top 3 in each field, top creators, and the written insights."""
    return campaign_results(campaign_id, max(1, min(int(top_n or 5), 15)))


@safe
def explain_creator_in_campaign(campaign_id: str, influencer_id: str) -> dict:
    """Why a creator was ranked where they were, or excluded, in a saved campaign (score breakdown or exact exclusion reasons)."""
    return explain_creator(campaign_id, influencer_id)


@safe
async def start_campaign(product_id: str, request: str = "") -> dict:
    """LAUNCH a saved campaign for a product: builds the brief from the request text and starts the full agent workflow
    (Brief agent, Matching coordinator, Insights agent). Only call when the user explicitly asks to create, launch or run
    a campaign. Returns the campaign id and its page."""
    from ..agents.brief_parser import assemble_brief, extract_fields
    r = routes()
    product = get_provider().product(product_id)
    if product is None:
        raise ToolFail(f"Product '{product_id}' not found")
    if product.status == "archived":
        raise ToolFail(f"'{product.product_name}' is archived and cannot be promoted.")
    brief = assemble_brief(product, extract_fields(request or f"Promote {product.product_name}"))
    created = r.create_campaign(r.CreateCampaignReq(brief=brief, name=f"{product.product_name} campaign (chat)"))
    started = await r.match(created["campaign_id"], r.MatchReq())
    return {"campaign_id": created["campaign_id"], "name": created["name"], "run_id": started["run_id"], "status": started["status"],
            "page": f"/admin/campaigns/{created['campaign_id']}", "agents_page": f"/admin/campaigns/{created['campaign_id']}/agents",
            "brief": {"target": brief.target, "age_segments": brief.target_age_segments, "location": brief.location}}


# Which specialist agent owns each tool (shown in the brain timeline and used to group the model's tools).
SPECIALISTS: dict[str, dict[str, Any]] = {
    "InventoryAgent": {"role": "Catalogue, stock levels, orders and sales", "tools": [list_products, get_product, inventory_summary, recent_orders]},
    "CreatorAgent": {"role": "Browse and inspect the creator (influencer) dataset", "tools": [search_creators, get_creator]},
    "MatchingAgent": {"role": "Rank creators for a product with the deterministic engine", "tools": [preview_matching]},
    "CampaignAgent": {"role": "Saved campaigns: results, explanations, and launching the full agent workflow",
                      "tools": [list_campaigns, get_campaign_results, explain_creator_in_campaign, start_campaign]},
}
AGENT_OF: dict[str, str] = {t.__name__: a for a, spec in SPECIALISTS.items() for t in spec["tools"]}
ALL_TOOLS = [t for spec in SPECIALISTS.values() for t in spec["tools"]]
TOOL_BY_NAME = {t.__name__: t for t in ALL_TOOLS}
