"""REST API: health, catalogue, mock influencer API, campaigns, runs, analytics, export."""
from __future__ import annotations

import asyncio
import csv
import io
import json
import uuid
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field

from ..agents.brief_parser import interpret
from ..agents.workflow import run_match
from ..config import PROVIDERS, get_settings
from ..db.database import CampaignRow, RunRow, jsonable, session
from ..schemas.models import AGE_SEGMENTS, CATEGORIES, TARGETS, CampaignBrief, Collection, FilterConfig, ScoreWeights
from ..services import collections, creators, inventory, roi, usage
from ..services.data_provider import get_provider

router = APIRouter(prefix="/api")
_tasks: set[asyncio.Task] = set()


# ------------------------------------------------------------------ helpers
def paginate(items: list, page: int, page_size: int) -> dict:
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


def _campaign(cid: str) -> CampaignRow:
    with session() as db:
        row = db.get(CampaignRow, cid)
    if not row:
        raise HTTPException(404, f"Campaign '{cid}' not found")
    return row


def _latest_match_run(cid: str) -> RunRow | None:
    with session() as db:
        return (db.query(RunRow).filter(RunRow.campaign_id == cid, RunRow.kind == "match")
                .order_by(RunRow.created_at.desc(), RunRow.id.desc()).first())


def _completed_run(cid: str) -> RunRow:
    run = _latest_match_run(cid)
    if run is None:
        raise HTTPException(404, "This campaign has not been run yet. POST /api/campaigns/{id}/match first.")
    if run.output is None:
        raise HTTPException(409, f"Latest run is {run.status}; results not available yet.")
    return run


LEADER_FIELDS = [
    ("overall", "Best overall match", "score", lambda m: m["overall_score"], None),
    ("audience_fit", "Best audience fit", "score", lambda m: m["scores"]["audience_fit"], None),
    ("promo_views", "Most promo views", "views", lambda m: m["median_promotional_views"], None),
    ("engagement", "Highest engagement", "pct", lambda m: m["engagement_rate"], None),
    ("micro", "Top micro-influencers", "score", lambda m: m["overall_score"], lambda m: m["is_micro"]),
]


def leaders(ranked: list[dict], n: int = 3) -> list[dict]:
    """Top-n ranked creators for each headline field (ties broken by overall rank)."""
    out = []
    for key, label, unit, value, keep in LEADER_FIELDS:
        pool = [m for m in ranked if keep is None or keep(m)]
        top = sorted(pool, key=lambda m: (-value(m), m["rank"]))[:n]
        out.append({"key": key, "label": label, "unit": unit, "items": [
            {"influencer_id": m["influencer_id"], "display_name": m["display_name"], "username": m["username"], "platform": m["platform"],
             "rank": m["rank"], "overall_score": m["overall_score"], "value": value(m), "is_micro": m["is_micro"]} for m in top]})
    return out


# ------------------------------------------------------------------ health + catalogue
@router.get("/health")
def health():
    s = get_settings()
    llm = s.effective_mode() == "llm"
    return {"status": "ok", "mode": s.effective_mode(), "provider": s.llm_provider, "model": s.llm_model if llm else None,
            "provider_label": PROVIDERS.get(s.llm_provider, {}).get("label", s.llm_provider), "configured_model": s.llm_model,
            "use_ai": s.llm_mode != "offline", "key_source": s.key_source,
            "data": "synthetic", "influencers": len(get_provider().influencers()), "products": len(get_provider().products())}


@router.get("/meta")
def meta():
    return {"age_segments": AGE_SEGMENTS, "targets": TARGETS, "default_filters": FilterConfig().model_dump(),
            "default_weights": ScoreWeights().model_dump(),
            "categories": CATEGORIES}


@router.get("/products")
def products(q: str = "", category: str = "", target: str = "",
             sort: Literal["featured", "newest", "bestsellers", "price_asc", "price_desc", "name"] = "featured",
             page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100)):
    """Storefront catalogue: active products from the inventory database, with live stock."""
    return paginate(inventory.search(["active"], q, category, target, "", sort), page, page_size)


@router.get("/products/{product_id}")
def product(product_id: str):
    p = inventory.product_view(product_id)
    if not p or p["status"] != "active":
        raise HTTPException(404, f"Product '{product_id}' not found")
    return p


# ------------------------------------------------------------------ mock influencer API
@router.get("/mock/influencers")
def mock_influencers(q: str = "", platform: str = "", category: str = "", min_followers: int = 0, max_followers: Optional[int] = None,
                     sort: Literal["id", "followers", "promo_views", "engagement"] = "id",
                     page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
    items = creators.search(q, platform, category, min_followers, max_followers, sort)
    out = paginate(items, page, page_size)
    out["items"] = [i.model_dump(exclude={"collaboration_history"}) for i in out["items"]]
    out["data_note"] = "Synthetic demonstration data served by the mock API."
    return out


@router.get("/mock/influencers/{influencer_id}")
def mock_influencer(influencer_id: str):
    i = get_provider().influencer(influencer_id)
    if not i:
        raise HTTPException(404, f"Influencer '{influencer_id}' not found")
    return i.model_dump()


# ------------------------------------------------------------------ campaigns
class ParseBriefReq(BaseModel):
    text: str = ""
    product_id: Optional[str] = None
    collection_id: Optional[str] = None


@router.post("/campaigns/parse-brief")
def parse_brief(req: ParseBriefReq):
    """Prepare the brief for review: instant, deterministic, no model call (this replaced the Campaign Brief Agent)."""
    for pid in (req.product_id, req.collection_id):
        if pid and not get_provider().product(pid):
            raise HTTPException(404, f"Product or collection '{pid}' not found")
    if not req.text.strip() and not req.product_id and not req.collection_id:
        raise HTTPException(422, "Provide a campaign request, a product_id or a collection_id.")
    res = interpret(req.text, req.product_id, req.collection_id)
    brief = res["brief"].model_dump() if res["brief"] else None
    return {"run_id": None, "status": "Completed" if brief else "Needs Review", "brief": brief, "needs_clarification": res["needs_clarification"],
            "candidates": res["candidates"], "collection_candidates": res["collection_candidates"], "picked_up": res["picked_up"],
            "target_kind": res["target_kind"], "interpreted_by": "rules"}


# ------------------------------------------------------------------ collections
@router.get("/collections")
def list_collections():
    infl = get_provider().influencers()
    return {"items": [collections.view(c, infl) for c in collections.all_collections()]}


@router.get("/collections/{collection_id}")
def get_collection(collection_id: str):
    c = collections.get(collection_id)
    if c is None:
        raise HTTPException(404, f"Collection '{collection_id}' not found")
    return collections.view(c, get_provider().influencers())


@router.post("/collections", status_code=201)
def create_collection(c: Collection):
    if not c.collection_id.startswith("COL-"):
        c.collection_id = "COL-" + "-".join(c.collection_id.upper().split())
    missing = [pid for pid in c.product_ids if inventory.get_product(pid) is None]
    if missing:
        raise HTTPException(422, f"Unknown product id(s): {', '.join(missing)}")
    try:
        collections.create(c)
    except ValueError as e:
        raise HTTPException(409, str(e))
    return collections.view(c, get_provider().influencers())


class CreateCampaignReq(BaseModel):
    brief: CampaignBrief
    name: Optional[str] = None
    brief_run_id: Optional[str] = None


@router.post("/campaigns", status_code=201)
def create_campaign(req: CreateCampaignReq):
    prod = get_provider().product(req.brief.product_id)
    if not prod:
        raise HTTPException(404, f"Product or collection '{req.brief.product_id}' not found")
    if prod.status == "archived":
        raise HTTPException(409, f"'{prod.product_name}' is archived; restore it in Inventory before planning a campaign.")
    cid = f"cmp_{uuid.uuid4().hex[:8]}"
    with session() as db:
        db.add(CampaignRow(id=cid, name=req.name or f"{prod.product_name} campaign", brief=req.brief.model_dump(), brief_trace=None))
        db.commit()
    return {"campaign_id": cid, "name": req.name or f"{prod.product_name} campaign", "brief": req.brief.model_dump()}


@router.get("/campaigns")
def list_campaigns():
    with session() as db:
        rows = db.query(CampaignRow).order_by(CampaignRow.created_at.desc()).limit(50).all()
        out = []
        for r in rows:
            run = (db.query(RunRow).filter(RunRow.campaign_id == r.id, RunRow.kind == "match").order_by(RunRow.created_at.desc()).first())
            out.append({"campaign_id": r.id, "name": r.name, "product_id": r.brief["product_id"], "created_at": r.created_at.isoformat(),
                        "latest_run_id": run.id if run else None, "status": run.status if run else "Pending",
                        "ranked": (run.output or {}).get("stats", {}).get("ranked") if run else None})
    return {"items": out}


@router.get("/campaigns/{campaign_id}")
def get_campaign(campaign_id: str):
    row = _campaign(campaign_id)
    run = _latest_match_run(campaign_id)
    return {"campaign_id": row.id, "name": row.name, "brief": row.brief, "created_at": row.created_at.isoformat(),
            "latest_run_id": run.id if run else None, "status": run.status if run else "Pending"}


class MatchReq(BaseModel):
    filters: Optional[FilterConfig] = None
    weights: Optional[ScoreWeights] = None
    wait: bool = False  # block until the run finishes (used by tests / scripts)


async def _run_and_store(run_id: str, campaign_id: str, brief: CampaignBrief) -> None:
    from ..agents.recorder import Recorder
    from ..agents.workflow import COORD, INSIGHTS

    def on_change(trace: dict) -> None:
        with session() as db:
            r = db.get(RunRow, run_id)
            if r:
                r.status, r.trace = trace["status"], jsonable(trace)
                db.commit()

    rec = Recorder("match", campaign_id, [COORD, INSIGHTS], on_change)
    rec.trace["run_id"] = run_id
    try:
        res = await run_match(brief, campaign_id, on_change, rec)
    except Exception as e:  # last-resort guard so a run never stays 'Running'
        rec.error(COORD, str(e))
        rec.finish("Failed", f"Workflow failed: {e}")
        res = {"output": None, "trace": rec.trace, "usage": rec.usage(), "status": "Failed"}
    with session() as db:
        r = db.get(RunRow, run_id)
        r.status, r.output, r.trace, r.usage = res["status"], jsonable(res["output"]) if res["output"] else None, jsonable(res["trace"]), jsonable(res["usage"])
        db.commit()


@router.post("/campaigns/{campaign_id}/match", status_code=202)
async def match(campaign_id: str, req: MatchReq = MatchReq()):
    row = _campaign(campaign_id)
    brief = CampaignBrief(**row.brief)
    if req.filters:
        brief.filters = req.filters
    if req.weights:
        brief.weights = req.weights
    if req.filters or req.weights:
        with session() as db:
            r = db.get(CampaignRow, campaign_id)
            r.brief = brief.model_dump()
            db.commit()
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    with session() as db:
        db.add(RunRow(id=run_id, campaign_id=campaign_id, kind="match", status="Pending", brief=brief.model_dump()))
        db.commit()
    task = asyncio.create_task(_run_and_store(run_id, campaign_id, brief))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    if req.wait:
        await task
    with session() as db:
        status = db.get(RunRow, run_id).status
    return {"run_id": run_id, "campaign_id": campaign_id, "status": status}


@router.get("/campaigns/{campaign_id}/results")
def results(campaign_id: str, sort: Literal["overall_score", "audience_fit", "promo_views", "engagement"] = "overall_score",
            micro_only: bool = False, platform: str = "", min_score: float = 0, limit: int = Query(100, ge=1, le=2000)):
    row = _campaign(campaign_id)
    run = _completed_run(campaign_id)
    out = run.output
    ranked = out["ranked"]
    top = leaders(ranked)
    if micro_only:
        ranked = [m for m in ranked if m["is_micro"]]
    if platform:
        ranked = [m for m in ranked if m["platform"].lower() == platform.lower()]
    ranked = [m for m in ranked if m["overall_score"] >= min_score]
    keyf = {"overall_score": lambda m: (-m["overall_score"], m["influencer_id"]), "audience_fit": lambda m: (-m["scores"]["audience_fit"], m["influencer_id"]),
            "promo_views": lambda m: (-m["median_promotional_views"], m["influencer_id"]), "engagement": lambda m: (-m["engagement_rate"], m["influencer_id"])}[sort]
    ranked = sorted(ranked, key=keyf)[:limit]
    return {"campaign_id": campaign_id, "name": row.name, "run_id": run.id, "status": run.status, "brief": run.brief or row.brief,
            "stats": out["stats"], "ranked": ranked, "leaders": top, "insights": out.get("insights"), "roi": out.get("roi"), "sources": out.get("sources"),
            "label": "Synthetic demonstration data; scores are not outcome predictions."}


@router.get("/campaigns/{campaign_id}/results/{influencer_id}")
def result_detail(campaign_id: str, influencer_id: str):
    run = _completed_run(campaign_id)
    inf = get_provider().influencer(influencer_id)
    if not inf:
        raise HTTPException(404, f"Influencer '{influencer_id}' not found")
    match_ = next((m for m in run.output["ranked"] if m["influencer_id"] == influencer_id), None)
    excl = next((e for e in run.output["excluded"] if e["influencer_id"] == influencer_id), None)
    brief = run.brief
    from ..services.audience_matcher import target_age_segments
    segs = target_age_segments(CampaignBrief(**brief))
    product = get_provider().product(brief["product_id"])
    share = match_["audience_fit_pct"] if match_ else sum(inf.audience_age_distribution.get(s, 0.0) for s in segs)
    econ = roi.economics(inf, product.price_gbp if product else 30.0, match_["overall_score"] if match_ else None, share)
    return {"influencer": inf.model_dump(), "match": match_, "exclusion": excl, "target_age_segments": segs,
            "weights": brief["weights"], "run_id": run.id, "economics": econ}


@router.get("/campaigns/{campaign_id}/roi")
def campaign_roi(campaign_id: str, budget: Optional[float] = Query(None, gt=0, le=10_000_000), top_n: int = Query(40, ge=5, le=200)):
    """Creator fees, value against the market rate, and the best plan for a budget (all estimates, recomputed live)."""
    _campaign(campaign_id)
    run = _completed_run(campaign_id)
    return {"campaign_id": campaign_id, "run_id": run.id, **roi.analyse(CampaignBrief(**run.brief), run.output["ranked"], budget, top_n)}


# ------------------------------------------------------------------ token usage and cost
@router.get("/usage/summary")
def usage_summary(days: int = Query(30, ge=1, le=365)):
    return usage.summary(days)


@router.get("/campaigns/{campaign_id}/excluded")
def excluded(campaign_id: str, level: Optional[int] = None, status: Optional[Literal["excluded", "needs_review"]] = None, code: str = "",
             q: str = "", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
    run = _completed_run(campaign_id)
    items = run.output["excluded"]
    if level:
        items = [e for e in items if e["level"] == level]
    if status:
        items = [e for e in items if e["status"] == status]
    if code:
        items = [e for e in items if code in e["reason_codes"]]
    if q:
        items = [e for e in items if q.lower() in e["display_name"].lower() or q.lower() in e["username"].lower()]
    counts: dict[str, int] = {}
    for e in run.output["excluded"]:
        for c in e["reason_codes"]:
            counts[c] = counts.get(c, 0) + 1
    out = paginate(items, page, page_size)
    out["reason_counts"] = counts
    return out


@router.get("/campaigns/{campaign_id}/analytics")
def analytics(campaign_id: str):
    run = _completed_run(campaign_id)
    out = run.output
    st = out["stats"]
    base = st["retrieved"] or 1
    funnel = [{"stage": "Retrieved", "count": st["retrieved"]}, {"stage": "Passed Level 1", "count": st["eligible"]},
              {"stage": "Passed Level 2", "count": st["passed_l2"]}, {"stage": "Ranked", "count": st["ranked"]}]
    for f in funnel:
        f["pct"] = round(f["count"] / base * 100, 1)
    ranked = out["ranked"]
    top = ranked[:15]
    breakdown = [{"influencer_id": m["influencer_id"], "name": m["display_name"], "rank": m["rank"], "overall": m["overall_score"],
                  "contributions": m["contributions"]} for m in top]
    scatter = [{"influencer_id": m["influencer_id"], "name": m["display_name"], "platform": m["platform"], "views": m["median_promotional_views"],
                "match": round((m["scores"]["audience_fit"] + m["scores"]["content_fit"]) / 2, 1), "followers": m["follower_count"],
                "engagement": m["engagement_rate"], "overall": m["overall_score"], "rank": m["rank"], "is_micro": m["is_micro"]} for m in ranked]
    brief = run.brief
    from ..services.audience_matcher import target_age_segments
    segs = target_age_segments(CampaignBrief(**brief))
    tgt = {s: round(100 / len(segs), 1) if s in segs else 0.0 for s in AGE_SEGMENTS}
    shortlist = ranked[:10]
    inf_map = {i.influencer_id: i for i in get_provider().influencers()}
    avg = {s: 0.0 for s in AGE_SEGMENTS}
    for m in shortlist:
        for s in AGE_SEGMENTS:
            avg[s] += inf_map[m["influencer_id"]].audience_age_distribution.get(s, 0.0) / max(1, len(shortlist))
    reasons: dict[str, int] = {}
    for e in out["excluded"]:
        for c in e["reason_codes"]:
            reasons[c] = reasons.get(c, 0) + 1
    top3 = ranked[:3]
    est_reach = sum(m["median_promotional_views"] for m in top3)
    return {
        "run_id": run.id, "funnel": funnel, "breakdown": breakdown, "scatter": scatter,
        "demographics": {"target": tgt, "shortlist_average": {k: round(v, 1) for k, v in avg.items()}, "segments": AGE_SEGMENTS},
        "summary": {"avg_score_top10": round(sum(m["overall_score"] for m in shortlist) / max(1, len(shortlist)), 1),
                    "micro_in_top10": sum(1 for m in shortlist if m["is_micro"]),
                    "platform_mix_top10": {p: sum(1 for m in shortlist if m["platform"] == p) for p in sorted({m["platform"] for m in shortlist})},
                    "exclusion_reasons": reasons},
        "estimate": {"label": "ESTIMATE", "estimated_views_top3": est_reach,
                     "assumptions": "One promotional post each from the top 3 creators, achieving their median promotional views from synthetic data. Not a prediction of sales or ROI."},
        "weights": brief["weights"], "thresholds": st["thresholds"],
    }


@router.get("/campaigns/{campaign_id}/export")
def export(campaign_id: str, format: Literal["csv", "json"] = "csv"):
    row = _campaign(campaign_id)
    run = _completed_run(campaign_id)
    ranked = run.output["ranked"]
    if format == "json":
        body = json.dumps({"campaign": {"id": row.id, "name": row.name}, "brief": run.brief, "stats": run.output["stats"], "ranked": ranked,
                           "excluded": run.output["excluded"], "data_note": "Synthetic demonstration data"}, indent=2)
        return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{campaign_id}.json"'})
    buf = io.StringIO()
    w = csv.writer(buf)
    crit = list(ranked[0]["scores"].keys()) if ranked else []
    w.writerow(["rank", "influencer_id", "name", "username", "platform", "followers", "median_promo_views", "engagement_rate_pct", "is_micro",
                "overall_score", *[f"score_{c}" for c in crit], "data_confidence", "rationale", "concerns"])
    for m in ranked:
        w.writerow([m["rank"], m["influencer_id"], m["display_name"], m["username"], m["platform"], m["follower_count"], m["median_promotional_views"],
                    m["engagement_rate"], m["is_micro"], m["overall_score"], *[m["scores"][c] for c in crit], m["data_confidence"], m["rationale"], " | ".join(m["concerns"])])
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{campaign_id}.csv"'})


# ------------------------------------------------------------------ runs
def _run(run_id: str) -> RunRow:
    with session() as db:
        r = db.get(RunRow, run_id)
    if not r:
        raise HTTPException(404, f"Run '{run_id}' not found")
    return r


@router.get("/runs")
def list_runs(kind: Literal["match", "brief", ""] = "match", limit: int = Query(20, ge=1, le=100)):
    with session() as db:
        q = db.query(RunRow)
        if kind:
            q = q.filter(RunRow.kind == kind)
        rows = q.order_by(RunRow.created_at.desc(), RunRow.id.desc()).limit(limit).all()
        ids = {r.campaign_id for r in rows if r.campaign_id}
        names = {c.id: c.name for c in db.query(CampaignRow).filter(CampaignRow.id.in_(ids)).all()} if ids else {}
    return {"items": [{"run_id": r.id, "campaign_id": r.campaign_id, "campaign_name": names.get(r.campaign_id), "kind": r.kind,
                       "status": r.status, "created_at": r.created_at.isoformat(), "mode": (r.trace or {}).get("mode"),
                       "model": (r.trace or {}).get("model"), "total_tokens": (r.usage or {}).get("total_tokens")} for r in rows]}


@router.get("/runs/{run_id}/trace")
def run_trace(run_id: str):
    r = _run(run_id)
    return r.trace or {"run_id": run_id, "status": r.status, "agents": [], "steps": []}


@router.get("/runs/{run_id}/usage")
def run_usage(run_id: str):
    r = _run(run_id)
    if r.usage:
        return r.usage
    return {"run_id": run_id, "status": r.status, "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "token_source": "none", "per_agent": [],
            "note": "Usage is available after the run finishes."}


# ------------------------------------------------------------------ overview
@router.get("/overview")
def overview():
    prov = get_provider()
    with session() as db:
        run = db.query(RunRow).filter(RunRow.kind == "match").order_by(RunRow.created_at.desc(), RunRow.id.desc()).first()
        n_campaigns = db.query(CampaignRow).count()
        recent = db.query(CampaignRow).order_by(CampaignRow.created_at.desc()).limit(5).all()
        recent_out = [{"campaign_id": c.id, "name": c.name, "created_at": c.created_at.isoformat()} for c in recent]
        camp = db.get(CampaignRow, run.campaign_id) if run and run.campaign_id else None
        latest = {c["campaign_id"]: (db.query(RunRow).filter(RunRow.campaign_id == c["campaign_id"], RunRow.kind == "match")
                                     .order_by(RunRow.created_at.desc()).first()) for c in recent_out}
    for c in recent_out:
        r = latest.get(c["campaign_id"])
        c["status"] = r.status if r else "Pending"
        c["ranked"] = ((r.output or {}).get("stats") or {}).get("ranked") if r else None
    stats = (run.output or {}).get("stats") if run else None
    inv = inventory.summary()
    return {"total_influencers": len(prov.influencers()), "total_products": len(prov.products()), "campaigns": n_campaigns,
            "latest_run": ({"run_id": run.id, "campaign_id": run.campaign_id, "campaign_name": camp.name if camp else None, "status": run.status,
                            "stats": stats, "usage": run.usage, "created_at": run.created_at.isoformat(),
                            "leaders": leaders((run.output or {}).get("ranked") or [])} if run else None),
            "recent_campaigns": recent_out, "mode": get_settings().effective_mode(),
            "inventory": {k: inv[k] for k in ("counts", "units_in_stock", "stock_value_gbp", "low_stock_sizes", "sold_out_sizes",
                                              "orders_30d", "revenue_30d", "bestsellers", "low_stock")}}
