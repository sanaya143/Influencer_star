"""Google ADK orchestration for the Zylo workflow.

Agents
  1. MatchingCoordinatorAgent deterministic BaseAgent. Its tools, in order: resolve the product or collection, load
     Zylo's creators, fetch outside creators over MCP, Level 1 eligibility, Level 2 audience match, ranking, ROI plan.
  2. CampaignInsightsAgent    LlmAgent (llm mode)  | deterministic BaseAgent (offline mode)

The brief is prepared before the run by the deterministic parser (brief_parser.interpret) and reviewed by the
marketer, so no model call is spent on it. All filtering, scoring, ranking and ROI maths run in Python; the LLM
only explains the results.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
import uuid
import warnings
from pathlib import Path
from typing import Any, AsyncGenerator, Callable

warnings.filterwarnings("ignore", category=FutureWarning)

from google.adk.agents import BaseAgent, LlmAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from ..config import get_settings, litellm_model
from ..schemas.models import CampaignBrief, FilterStats, MatchOutput
from ..services import audience_matcher as am
from ..services import external_creators, roi
from ..services import ranking_engine as re_
from ..services.data_provider import get_provider
from ..services.eligibility_filter import level1_filter
from .brain import model_hooks
from .recorder import Recorder

PROMPTS = Path(__file__).parent / "prompts"
BRIEF, COORD, INSIGHTS = "CampaignBriefAgent", "MatchingCoordinatorAgent", "CampaignInsightsAgent"  # BRIEF: runs recorded before it was retired
APP = "zylo"


def _prompt(name: str) -> str:
    return (PROMPTS / name).read_text("utf-8")


def make_model():
    """Build the ADK model for the provider/model/token chosen on the Settings page (or env)."""
    s = get_settings()
    if s.llm_provider == "fake":  # test double, see fake_llm.py
        from .fake_llm import FakeLlm
        return FakeLlm(model="fake-llm")
    from google.adk.models.lite_llm import LiteLlm  # all providers go through LiteLLM
    kwargs: dict = {"timeout": 180, "num_retries": 3}  # LiteLLM retries brief provider hiccups (503/429/timeouts) with backoff
    if s.llm_api_key:
        kwargs["api_key"] = s.llm_api_key
    if s.llm_base_url:
        kwargs["api_base"] = s.llm_base_url
    return LiteLlm(model=litellm_model(s.llm_provider, s.llm_model), **kwargs)


# ---------------------------------------------------------------- tool-callback plumbing
def _agent_hooks(rec: Recorder, name: str, summarise: Callable[[dict], str | None] | None = None):
    def before(callback_context):
        rec.start_agent(name)
        return None

    def after(callback_context):
        state = callback_context.state.to_dict() if hasattr(callback_context.state, "to_dict") else dict(callback_context.state)
        rec.end_agent(name, summarise(state) if summarise else None)
        return None

    return before, after


# ---------------------------------------------------------------- Matching coordinator (deterministic)
class MatchingCoordinatorAgent(BaseAgent):
    rec: Any = None
    model_config = {"arbitrary_types_allowed": True}

    def _call(self, name: str, fn: Callable, tool_input: dict, summarise: Callable[[Any], Any]):
        t0 = time.perf_counter()
        try:
            res = fn()
        except Exception as e:
            self.rec.tool_call(COORD, name, tool_input, None, (time.perf_counter() - t0) * 1000, error=str(e))
            raise
        self.rec.tool_call(COORD, name, tool_input, summarise(res), (time.perf_counter() - t0) * 1000)
        return res

    async def _outside_creators(self, brief: CampaignBrief, themes: list[str], have: set[str]) -> list:
        """Pull extra creators from the outside provider over MCP (skipped when turned off; never fatal)."""
        cfg = external_creators.config()
        query = {"themes": themes or brief.preferred_interests, "limit": 120, "min_followers": brief.filters.min_followers,
                 "provider": cfg["label"], "transport": f"MCP {cfg['transport']}"}
        if not cfg["enabled"]:
            self.rec.tool_call(COORD, "fetch_external_creators", query, {"skipped": True, "reason": "Outside data is turned off in Settings"}, 0.1)
            return []
        res = await asyncio.to_thread(external_creators.fetch, query["themes"], query["limit"], query["min_followers"])
        new = [c for c in res["creators"] if c.influencer_id not in have]
        out = {"server": res["server"], "fetched": len(res["creators"]), "new_creators": len(new), "total_matches_at_provider": res["total_matches"]}
        if res["error"]:
            out["fallback"] = "Carried on with Zylo's own creators"
        self.rec.tool_call(COORD, "fetch_external_creators", query, out, res["duration_ms"], error=res["error"])
        self.rec.brain(COORD, "rule", text=(
            f"Asked the outside provider over MCP ({cfg['transport']}) for creators posting about {', '.join(query['themes']) or 'any theme'}: "
            + (f"{len(new)} new creators added to the pool." if not res["error"] else f"it could not be reached ({res['error'][:120]}), so only Zylo's own creators are used.")))
        return new

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        brief = CampaignBrief(**ctx.session.state["brief"])
        prov = get_provider()
        product = self._call("resolve_target", lambda: prov.product(brief.product_id), {"product_id": brief.product_id},
                             lambda p: None if p is None else {"kind": "collection" if p.category == "Collection" else "product", "name": p.product_name,
                                                               "price_gbp": p.price_gbp, "themes": am.campaign_themes(brief, p), "target": brief.target})
        if product is None:
            raise ValueError(f"Product or collection {brief.product_id} not found")
        themes = am.campaign_themes(brief, product)
        f, w = brief.filters, brief.weights.normalised()
        self.rec.brain(COORD, "rule", text=(
            "No language model: every filtering, ranking and budget decision is deterministic Python. "
            + (f"Collection campaign for {product.product_name}: creators must post about {', '.join(themes)}. " if themes else "")
            + f"Level 1 keeps creators with ≥ {f.min_followers:,} followers and ≥ {f.min_promo_views:,} median promo views"
            f"{' and a clear brand-safety status' if f.require_brand_safety else ''}; missing metrics go to review, never guessed. "
            f"Level 2 keeps audience/content match ≥ {f.min_audience_match:g} for {', '.join(brief.target_age_segments)} / {brief.target} / {brief.location}. "
            "Ranking weights: " + ", ".join(f"{k.replace('_', ' ')} {v * 100:.0f}%" for k, v in w.items()) + "."))
        own = self._call("retrieve_data", lambda: prov.influencers(), {"product_id": brief.product_id, "source": "Zylo creator dataset (synthetic)"},
                         lambda r: {"influencers_retrieved": len(r)})
        outside = await self._outside_creators(brief, themes, {i.influencer_id for i in own})
        infl = own + outside
        l1 = self._call("level1_eligibility_filter", lambda: level1_filter(infl, brief.filters), {**brief.filters.model_dump(), "pool": len(infl)},
                        lambda r: {**r["counts"], "warnings": r["warnings"]})
        l2 = self._call("level2_audience_matcher", lambda: am.level2_filter(l1["eligible"], brief, product),
                        {"target": brief.target, "age_segments": brief.target_age_segments, "location": brief.location, "themes": themes,
                         "min_audience_match": brief.filters.min_audience_match},
                        lambda r: {"passed": len(r[0]), "excluded": len(r[1])})
        ranked = self._call("ranking_engine", lambda: re_.rank(l2[0], product, brief), {"weights": brief.weights.model_dump()},
                            lambda r: {"ranked": len(r), "from_outside_provider": sum(1 for m in r if m.source != "zylo"),
                                       "top": [{"rank": m.rank, "id": m.influencer_id, "score": m.overall_score} for m in r[:3]]})
        ranked_dicts = [m.model_dump() for m in ranked]
        plan = self._call("roi_planner", lambda: roi.plan_summary(brief, ranked_dicts),
                          {"budget_gbp": brief.budget_gbp or roi.DEFAULT_BUDGET, "objective": brief.objective},
                          lambda r: {"plan_creators": r["plan"]["creators"], "spend_gbp": r["plan"]["spend_gbp"],
                                     "expected_orders": r["plan"]["expected_orders"], "roas": r["plan"]["roas"],
                                     "vs_biggest_accounts_orders": r["comparison"]["orders_multiple"]})
        c = l1["counts"]
        stats = FilterStats(retrieved=c["retrieved"], eligible=c["eligible"], excluded_l1=c["excluded"], review_required=c["review_required"],
                            passed_l2=len(l2[0]), excluded_l2=len(l2[1]), ranked=len(ranked), thresholds=l1["thresholds"],
                            warnings=l1["warnings"] + ([] if ranked else ["No influencers matched; try relaxing thresholds."]))
        out = MatchOutput(stats=stats, ranked=ranked, excluded=l1["excluded"] + l2[1]).model_dump()
        out["roi"] = plan
        out["sources"] = {"zylo": len(own), "outside": len(outside)}
        summary = (f"{stats.retrieved} retrieved"
                   + (f" ({len(outside)} from the outside provider)" if outside else "")
                   + f" → {stats.eligible} eligible → {stats.passed_l2} audience matches → {stats.ranked} ranked"
                   + (f"; {stats.review_required} need review" if stats.review_required else ""))
        yield Event(author=self.name, actions=EventActions(state_delta={"match_output": out, "coord_summary": summary}),
                    content=types.Content(role="model", parts=[types.Part(text=summary)]))


# ---------------------------------------------------------------- Insights agent
def _insight_input(state: dict) -> dict:
    out = state["match_output"]
    brief = state["brief"]
    ranked = out["ranked"]
    prov = get_provider()
    p = prov.product(brief["product_id"])
    top = [{"influencer_id": m["influencer_id"], "name": m["display_name"], "platform": m["platform"], "followers": m["follower_count"],
            "median_promo_views": m["median_promotional_views"], "engagement_rate_pct": m["engagement_rate"],
            "is_micro": m["is_micro"], "overall_score": m["overall_score"], "sub_scores": m["scores"],
            "audience_in_target_pct": round(m["audience_fit_pct"], 1), "concerns": m["concerns"], "confidence": m["data_confidence"]}
           for m in ranked[:5]]
    micro = [t for t in [{"influencer_id": m["influencer_id"], "name": m["display_name"], "followers": m["follower_count"],
                          "median_promo_views": m["median_promotional_views"], "overall_score": m["overall_score"], "rank": m["rank"]}
                         for m in ranked if m["is_micro"]][:3]]
    plan = out.get("roi") or {}
    budget = {"budget_gbp": plan.get("budget_gbp"), "optimised_for": plan.get("optimised_for"), "plan": plan.get("plan"),
              "plan_creators": plan.get("plan_creators"), "biggest_accounts_plan": plan.get("baseline"),
              "comparison": plan.get("comparison"), "label": "ESTIMATE from synthetic data"} if plan else None
    return {"data_note": "SYNTHETIC demonstration data", "product": p.product_name if p else brief["product_id"],
            "is_collection": bool(p and p.category == "Collection"), "collection_themes": brief.get("content_themes") or (p.content_themes if p else []),
            "campaign": {k: brief[k] for k in ("objective", "target", "target_age_segments", "location", "budget_gbp")},
            "funnel": {k: out["stats"][k] for k in ("retrieved", "eligible", "excluded_l1", "review_required", "passed_l2", "ranked")},
            "creator_sources": out.get("sources"), "top_candidates": top, "micro_candidates": micro, "budget_plan": budget}


def template_insights(inp: dict) -> dict:
    top = inp["top_candidates"]
    f = inp["funnel"]
    if not top:
        return {"summary": f"No influencers satisfied all criteria for {inp['product']}. {f['retrieved']} profiles were evaluated.",
                "recommendation": "Relax the follower, promotional-view or audience-match thresholds and re-run.",
                "trade_offs": [], "micro_highlights": [], "next_steps": ["Lower thresholds", "Broaden target age segments or region"],
                "per_influencer": {}}
    best = top[0]
    big = max(top, key=lambda t: t["followers"])
    trade = []
    if big["influencer_id"] != best["influencer_id"]:
        trade.append(f"{big['name']} has the largest reach in the top 5 ({big['followers']:,} followers) but ranks #{top.index(big) + 1}; "
                     f"{best['name']} ranks first on audience and content relevance.")
    trade.append("Higher reach does not guarantee audience relevance: follower count is used only as an eligibility threshold.")
    micro = [f"{m['name']} (rank #{m['rank']}, {m['followers']:,} followers, {m['median_promo_views']:,} median promo views)" for m in inp["micro_candidates"]]
    per = {t["influencer_id"]: (f"{t['name']} scores {t['overall_score']:.0f}/100 with {t['audience_in_target_pct']:.0f}% of the audience in the target "
                                f"segment and {t['median_promo_views']:,} median promotional views.") for t in top}
    bp = inp.get("budget_plan") or {}
    if bp.get("plan") and bp["plan"]["creators"]:
        pl, cmp_ = bp["plan"], bp.get("comparison") or {}
        trade.append(f"Estimated budget plan: £{pl['spend_gbp']:,.0f} on {pl['creators']} creators for about {pl['views']:,} views and "
                     f"{pl['expected_orders']:.0f} orders"
                     + (f", {cmp_['orders_multiple']:g}x the orders of booking the biggest accounts with the same budget." if cmp_.get("orders_multiple") else ".")
                     + " This is an estimate from synthetic data.")
    return {
        "summary": (f"For {inp['product']}, {f['retrieved']} synthetic profiles were evaluated: {f['eligible']} passed eligibility, "
                    f"{f['passed_l2']} matched the audience, and {f['ranked']} were ranked. {best['name']} leads with {best['overall_score']:.0f}/100."),
        "recommendation": f"Start with the top 3 ({', '.join(t['name'] for t in top[:3])}) and use the lower-ranked options as a test group.",
        "trade_offs": trade, "micro_highlights": micro,
        "next_steps": ["Review score breakdowns and compare the top creators", "Open the ROI tab to adjust the budget and check each creator's asking price against the market rate",
                       "Check excluded creators whose reason is a threshold you may want to relax",
                       "Validate any reach or outcome projections with a small pilot; these figures are not guarantees."],
        "per_influencer": per}


def _parse_json(text: str) -> dict | None:
    t = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    try:
        d = json.loads(t)
        return d if isinstance(d, dict) else None
    except Exception:
        m = re.search(r"\{.*\}", t, re.S)
        if m:
            try:
                return json.loads(m.group(0))
            except Exception:
                return None
    return None


class OfflineInsightsAgent(BaseAgent):
    rec: Any = None
    model_config = {"arbitrary_types_allowed": True}

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        t0 = time.perf_counter()
        inp = _insight_input(ctx.session.state)
        ins = template_insights(inp)
        self.rec.brain(INSIGHTS, "rule", text=f"No language model: wrote the explanation from a fixed template using the top {len(inp['top_candidates'])} ranked creators and the funnel counts.")
        self.rec.tool_call(INSIGHTS, "template_insights", {"top_candidates": len(inp["top_candidates"])}, {"keys": list(ins)}, (time.perf_counter() - t0) * 1000)
        yield Event(author=self.name, actions=EventActions(state_delta={"insights": ins}),
                    content=types.Content(role="model", parts=[types.Part(text=ins["summary"])]))


def build_insights_agent(rec: Recorder, mode: str) -> BaseAgent:
    summ = lambda s: (s.get("insights") or {}).get("summary") if isinstance(s.get("insights"), dict) else "Insights generated."
    before_a, after_a = _agent_hooks(rec, INSIGHTS, summ)
    if mode == "llm":
        def instruction(ctx):
            return _prompt("insights_agent.md").replace("{insight_input}", json.dumps(_insight_input(dict(ctx.state)), default=str))
        before_m, after_m = model_hooks(rec, INSIGHTS, get_settings().llm_model)
        return LlmAgent(name=INSIGHTS, model=make_model(), instruction=instruction, output_key="insights_raw",
                        description="Explains ranked results and suggests next steps.",
                        generate_content_config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
                        before_agent_callback=before_a, after_agent_callback=after_a, before_model_callback=before_m, after_model_callback=after_m)
    return OfflineInsightsAgent(name=INSIGHTS, rec=rec, before_agent_callback=before_a, after_agent_callback=after_a)


# ---------------------------------------------------------------- runner helpers
async def _execute(rec: Recorder, root: BaseAgent, state: dict, message: str, llm_agents: set[str]) -> dict:
    svc = InMemorySessionService()
    sid = f"s_{uuid.uuid4().hex[:8]}"
    await svc.create_session(app_name=APP, user_id="marketer", session_id=sid, state=state)
    runner = Runner(app_name=APP, agent=root, session_service=svc)
    msg = types.Content(role="user", parts=[types.Part(text=message)])
    async for ev in runner.run_async(user_id="marketer", session_id=sid, new_message=msg):
        if ev.author in llm_agents and ev.content and not ev.get_function_responses():
            um = ev.usage_metadata
            text_out = "".join(p.text or "" for p in (ev.content.parts or []) if getattr(p, "text", None))
            if um is not None and (um.prompt_token_count is not None or um.candidates_token_count is not None):
                rec.add_usage(ev.author, um.prompt_token_count or 0, um.candidates_token_count or 0)
            else:
                rec.add_usage(ev.author, None, None, fallback_text_in=message + json.dumps(state, default=str)[:4000], fallback_text_out=text_out)
    sess = await svc.get_session(app_name=APP, user_id="marketer", session_id=sid)
    return dict(sess.state)


async def run_match(brief: CampaignBrief, campaign_id: str, on_change: Callable[[dict], None] | None = None,
                    rec: Recorder | None = None) -> dict:
    mode = get_settings().effective_mode()
    rec = rec or Recorder("match", campaign_id, [COORD, INSIGHTS], on_change)
    rec.start_run()
    state = {"brief": brief.model_dump()}
    coord = MatchingCoordinatorAgent(name=COORD, rec=rec, description="Runs L1/L2/ranking Python services.",
                                     before_agent_callback=_agent_hooks(rec, COORD, lambda s: s.get("coord_summary"))[0],
                                     after_agent_callback=_agent_hooks(rec, COORD, lambda s: s.get("coord_summary"))[1])
    status = "Completed"
    out: dict | None = None
    insights: dict | None = None
    try:
        # Stage 1: deterministic matching (an ADK agent invoking Python tools)
        st1 = await _execute(rec, coord, state, "Run matching pipeline", set())
        out = st1["match_output"]
        # Stage 2: insights (LLM in llm mode); retried once, then falls back to a template
        state2 = {"brief": state["brief"], "match_output": out}
        for attempt in range(2):
            rec.agent(INSIGHTS)["status"] = "Pending"
            try:
                agent = build_insights_agent(rec, mode)
                st2 = await _execute(rec, agent, state2, "Explain the results", {INSIGHTS} if mode == "llm" else set())
                insights = st2.get("insights")
                if insights is None and st2.get("insights_raw"):
                    insights = _parse_json(st2["insights_raw"])
                    if insights is None:
                        raise ValueError("Insights agent returned non-JSON output")
                break
            except Exception as e:
                rec.error(INSIGHTS, f"attempt {attempt + 1}: {e}")
                rec.agent(INSIGHTS)["retries"] = attempt
        if insights is None:
            insights = template_insights(_insight_input(state2))
            insights["fallback"] = True
            a = rec.agent(INSIGHTS)
            a["status"], a["output_summary"] = "Needs Review", "LLM insights unavailable; deterministic template used instead."
            status = "Needs Review"
        else:
            insights.setdefault("fallback", False)
            rec.agent(INSIGHTS)["retries"] = rec.agent(INSIGHTS).get("retries", 0)
        if out["stats"]["review_required"]:
            pass  # surfaced as warning in stats; run itself completed
    except Exception as e:
        rec.error(COORD, str(e))
        for n in (COORD, INSIGHTS):
            a = rec.agent(n)
            if a["status"] in ("Running", "Pending"):
                a["status"] = "Failed"
        trace = rec.finish("Failed", f"Workflow failed: {e}")
        return {"output": None, "insights": None, "trace": trace, "usage": rec.usage(), "status": "Failed", "error": str(e)}
    if out and insights:
        pi = insights.get("per_influencer") or {}
        for m in out["ranked"][:10]:
            m["insight"] = pi.get(m["influencer_id"])
        out["insights"] = insights
    summary = rec.agent(COORD)["output_summary"] or "Workflow finished."
    trace = rec.finish(status, summary)
    return {"output": out, "insights": insights, "trace": trace, "usage": rec.usage(), "status": status}
