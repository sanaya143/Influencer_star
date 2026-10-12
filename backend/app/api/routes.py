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

from ..agents.workflow import run_brief, run_match
from ..config import get_settings
from ..db.database import CampaignRow, RunRow, jsonable, session
from ..schemas.models import AGE_SEGMENTS, TARGETS, CampaignBrief, FilterConfig, ScoreWeights
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


# ------------------------------------------------------------------ health + catalogue
@router.get("/health")
def health():
    s = get_settings()
    return {"status": "ok", "mode": s.effective_mode(), "provider": s.llm_provider, "model": s.llm_model if s.effective_mode() == "llm" else None,
            "data": "synthetic", "influencers": len(get_provider().influencers()), "products": len(get_provider().products())}


@router.get("/meta")
def meta():
    return {"age_segments": AGE_SEGMENTS, "targets": TARGETS, "default_filters": FilterConfig().model_dump(),
            "default_weights": ScoreWeights().model_dump(),
            "categories": sorted({p.category for p in get_provider().products()})}


@router.get("/products")
def products(q: str = "", category: str = "", target: str = "", sort: Literal["featured", "price_asc", "price_desc", "name"] = "featured",
             page: int = Query(1, ge=1), page_size: int = Query(24, ge=1, le=100)):
    items = get_provider().products()
    if q:
        ql = q.lower()
        items = [p for p in items if ql in p.product_name.lower() or ql in p.description.lower() or any(ql in t for t in p.style_tags) or ql in p.category.lower()]
    if category:
        items = [p for p in items if p.category.lower() == category.lower()]
    if target:
        items = [p for p in items if p.target_gender_or_collection == target]
    if sort == "price_asc":
        items = sorted(items, key=lambda p: p.price_gbp)
    elif sort == "price_desc":
        items = sorted(items, key=lambda p: -p.price_gbp)
    elif sort == "name":
        items = sorted(items, key=lambda p: p.product_name)
    out = paginate(items, page, page_size)
    out["items"] = [p.model_dump() for p in out["items"]]
    return out


@router.get("/products/{product_id}")
def product(product_id: str):
    p = get_provider().product(product_id)
    if not p:
        raise HTTPException(404, f"Product '{product_id}' not found")
    return p.model_dump()


# ------------------------------------------------------------------ mock influencer API
@router.get("/mock/influencers")
def mock_influencers(q: str = "", platform: str = "", category: str = "", min_followers: int = 0, max_followers: Optional[int] = None,
                     sort: Literal["id", "followers", "promo_views", "engagement"] = "id",
                     page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=200)):
    items = get_provider().influencers()
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i.display_name.lower() or ql in i.username.lower() or any(ql in t for t in i.content_tags)]
    if platform:
        items = [i for i in items if (i.platform or "").lower() == platform.lower()]
    if category:
        items = [i for i in items if category in i.fashion_categories]
    items = [i for i in items if (i.follower_count or 0) >= min_followers and (max_followers is None or (i.follower_count or 0) <= max_followers)]
    key = {"id": lambda i: i.influencer_id, "followers": lambda i: -(i.follower_count or 0),
           "promo_views": lambda i: -(i.median_promotional_views or 0), "engagement": lambda i: -(i.engagement_rate or 0)}[sort]
    items = sorted(items, key=key)
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


@router.post("/campaigns/parse-brief")
async def parse_brief(req: ParseBriefReq):
    if req.product_id and not get_provider().product(req.product_id):
        raise HTTPException(404, f"Product '{req.product_id}' not found")
    if not req.text.strip() and not req.product_id:
        raise HTTPException(422, "Provide a campaign brief text or a product_id.")
    text = req.text.strip() or f"Promote {get_provider().product(req.product_id).product_name}"
    res = await run_brief(text, req.product_id)
    run_id = res["trace"]["run_id"]
    with session() as db:
        db.add(RunRow(id=run_id, kind="brief", status=res["trace"]["status"], brief=res["brief"], trace=jsonable(res["trace"]), usage=jsonable(res["usage"])))
        db.commit()
    return {"run_id": run_id, "status": res["trace"]["status"], "brief": res["brief"], "needs_clarification": res["clarification"],
            "candidates": res["candidates"], "error": res.get("error"), "warning": res.get("warning"), "trace": res["trace"], "usage": res["usage"]}


class CreateCampaignReq(BaseModel):
    brief: CampaignBrief
    name: Optional[str] = None
    brief_run_id: Optional[str] = None


@router.post("/campaigns", status_code=201)
def create_campaign(req: CreateCampaignReq):
    prod = get_provider().product(req.brief.product_id)
    if not prod:
        raise HTTPException(404, f"Product '{req.brief.product_id}' not found")
    cid = f"cmp_{uuid.uuid4().hex[:8]}"
    brief_trace = None
    if req.brief_run_id:
        with session() as db:
            r = db.get(RunRow, req.brief_run_id)
            brief_trace = r.trace if r else None
    with session() as db:
        db.add(CampaignRow(id=cid, name=req.name or f"{prod.product_name} campaign", brief=req.brief.model_dump(), brief_trace=brief_trace))
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


async def _run_and_store(run_id: str, campaign_id: str, brief: CampaignBrief, brief_trace: dict | None) -> None:
    from ..agents.recorder import Recorder
    from ..agents.workflow import BRIEF, COORD, INSIGHTS

    def on_change(trace: dict) -> None:
        with session() as db:
            r = db.get(RunRow, run_id)
            if r:
                r.status, r.trace = trace["status"], jsonable(trace)
                db.commit()

    rec = Recorder("match", campaign_id, [BRIEF, COORD, INSIGHTS], on_change)
    rec.trace["run_id"] = run_id
    try:
        res = await run_match(brief, campaign_id, brief_trace, on_change, rec)
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
    task = asyncio.create_task(_run_and_store(run_id, campaign_id, brief, row.brief_trace))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    if req.wait:
        await task
    with session() as db:
        status = db.get(RunRow, run_id).status
    return {"run_id": run_id, "campaign_id": campaign_id, "status": status}


@router.get("/campaigns/{campaign_id}/results")
def results(campaign_id: str, sort: Literal["overall_score", "audience_fit", "promo_views", "engagement"] = "overall_score",
            micro_only: bool = False, platform: str = "", min_score: float = 0, limit: int = Query(100, ge=1, le=500)):
    row = _campaign(campaign_id)
    run = _completed_run(campaign_id)
    out = run.output
    ranked = out["ranked"]
    if micro_only:
        ranked = [m for m in ranked if m["is_micro"]]
    if platform:
        ranked = [m for m in ranked if m["platform"].lower() == platform.lower()]
    ranked = [m for m in ranked if m["overall_score"] >= min_score]
    keyf = {"overall_score": lambda m: (-m["overall_score"], m["influencer_id"]), "audience_fit": lambda m: (-m["scores"]["audience_fit"], m["influencer_id"]),
            "promo_views": lambda m: (-m["median_promotional_views"], m["influencer_id"]), "engagement": lambda m: (-m["engagement_rate"], m["influencer_id"])}[sort]
    ranked = sorted(ranked, key=keyf)[:limit]
    return {"campaign_id": campaign_id, "name": row.name, "run_id": run.id, "status": run.status, "brief": run.brief or row.brief,
            "stats": out["stats"], "ranked": ranked, "insights": out.get("insights"), "label": "Synthetic demonstration data; scores are not outcome predictions."}


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
    return {"influencer": inf.model_dump(), "match": match_, "exclusion": excl, "target_age_segments": segs,
            "weights": brief["weights"], "run_id": run.id}


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
    stats = (run.output or {}).get("stats") if run else None
    return {"total_influencers": len(prov.influencers()), "total_products": len(prov.products()), "campaigns": n_campaigns,
            "latest_run": ({"run_id": run.id, "campaign_id": run.campaign_id, "status": run.status, "stats": stats,
                            "usage": run.usage} if run else None), "recent_campaigns": recent_out, "mode": get_settings().effective_mode()}
