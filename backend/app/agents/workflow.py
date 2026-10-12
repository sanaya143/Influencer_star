"""Google ADK orchestration for the THREADORA workflow.

Agents
  1. CampaignBriefAgent       LlmAgent (llm mode)  | deterministic BaseAgent (offline mode)
  2. MatchingCoordinatorAgent deterministic BaseAgent that calls the Python L1/L2/ranking services as tools
  3. CampaignInsightsAgent    LlmAgent (llm mode)  | deterministic BaseAgent (offline mode)

All filtering, scoring and ranking runs in the Python services; the LLM only interprets the
request and explains results.
"""
from __future__ import annotations

import json
import re
import time
import uuid
import warnings
from pathlib import Path
from typing import Any, AsyncGenerator, Callable

warnings.filterwarnings("ignore", category=FutureWarning)

from google.adk.agents import BaseAgent, LlmAgent, SequentialAgent
from google.adk.agents.invocation_context import InvocationContext
from google.adk.events import Event, EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.tools import ToolContext
from google.genai import types

from ..config import get_settings, litellm_model
from ..schemas.models import CampaignBrief, FilterStats, MatchOutput
from ..services import audience_matcher as am
from ..services import ranking_engine as re_
from ..services.data_provider import get_provider
from ..services.eligibility_filter import level1_filter
from .brief_parser import assemble_brief, parse_request, search_products
from .recorder import Recorder

PROMPTS = Path(__file__).parent / "prompts"
BRIEF, COORD, INSIGHTS = "CampaignBriefAgent", "MatchingCoordinatorAgent", "CampaignInsightsAgent"
APP = "threadora"


def _prompt(name: str) -> str:
    return (PROMPTS / name).read_text("utf-8")


def make_model():
    """Build the ADK model for the provider/model/token chosen on the Settings page (or env)."""
    s = get_settings()
    if s.llm_provider == "fake":  # test double, see fake_llm.py
        from .fake_llm import FakeLlm
        return FakeLlm(model="fake-llm")
    from google.adk.models.lite_llm import LiteLlm  # all providers go through LiteLLM
    kwargs: dict = {"timeout": 180}
    if s.llm_api_key:
        kwargs["api_key"] = s.llm_api_key
    if s.llm_base_url:
        kwargs["api_base"] = s.llm_base_url
    return LiteLlm(model=litellm_model(s.llm_provider, s.llm_model), **kwargs)


# ---------------------------------------------------------------- tool-callback plumbing
def _tool_hooks(rec: Recorder, agent_name: str):
    starts: dict[str, float] = {}

    def before(tool, args, tool_context):
        starts[tool.name] = time.perf_counter()
        return None

    def after(tool, args, tool_context, tool_response):
        dur = (time.perf_counter() - starts.pop(tool.name, time.perf_counter())) * 1000
        err = tool_response.get("error") if isinstance(tool_response, dict) else None
        rec.tool_call(agent_name, tool.name, args, tool_response, dur, err if isinstance(err, str) else None)
        return None

    return before, after


def _agent_hooks(rec: Recorder, name: str, summarise: Callable[[dict], str | None] | None = None):
    def before(callback_context):
        rec.start_agent(name)
        return None

    def after(callback_context):
        state = callback_context.state.to_dict() if hasattr(callback_context.state, "to_dict") else dict(callback_context.state)
        rec.end_agent(name, summarise(state) if summarise else None)
        return None

    return before, after


# ---------------------------------------------------------------- Brief agent
def _brief_tools(rec: Recorder):
    prov = get_provider()

    def search_products_tool(query: str) -> dict:
        """Search the THREADORA product catalogue. Returns up to 5 candidate products with scores."""
        return {"candidates": search_products(query, prov.products())}

    def submit_brief(product_id: str, objective: str, target_age_segments: list[str], target: str, location: str,
                     budget_gbp: float, preferred_interests: list[str], prioritise_micro: bool, min_followers: int,
                     min_promo_views: int, needs_clarification: list[str], tool_context: ToolContext) -> dict:
        """Submit the final structured campaign brief. Call exactly once.

        Use empty string / 0 / empty list for anything the request did not state, so configured defaults apply.
        Put questions in needs_clarification when the request is ambiguous.
        """
        product = prov.product(product_id)
        if product is None:
            return {"error": f"Unknown product_id '{product_id}'. Use search_products first."}
        fields = {"objective": objective or None, "target_age_segments": target_age_segments or None, "target": target or None,
                  "location": location or None, "budget_gbp": budget_gbp or None, "preferred_interests": preferred_interests,
                  "prioritise_micro": prioritise_micro, "min_followers": min_followers or None,
                  "min_promo_views": min_promo_views or None, "needs_clarification": needs_clarification}
        try:
            brief = assemble_brief(product, fields)
        except Exception as e:  # validation failure is returned to the model so it can retry
            return {"error": f"Invalid brief: {e}"}
        if brief.needs_clarification:
            tool_context.state["clarification"] = brief.needs_clarification
        else:
            tool_context.state["brief"] = brief.model_dump()
        return {"ok": True, "brief": brief.model_dump()}

    search_products_tool.__name__ = "search_products"
    return [search_products_tool, submit_brief]


def build_brief_agent(rec: Recorder, mode: str) -> BaseAgent:
    def summarise(state: dict) -> str | None:
        b = state.get("brief")
        if state.get("clarification"):
            return "Needs clarification: " + "; ".join(state["clarification"])
        return f"Brief for {b['product_id']}: {b['target']} / {', '.join(b['target_age_segments'])} / {b['location']}" if b else None

    before_a, after_a = _agent_hooks(rec, BRIEF, summarise)
    if mode == "llm":
        before_t, after_t = _tool_hooks(rec, BRIEF)
        return LlmAgent(
            name=BRIEF, model=make_model(), instruction=lambda ctx: _prompt("brief_agent.md"),
            description="Turns a marketing request into a validated CampaignBrief.", tools=_brief_tools(rec),
            before_agent_callback=before_a, after_agent_callback=after_a, before_tool_callback=before_t, after_tool_callback=after_t)
    return OfflineBriefAgent(name=BRIEF, rec=rec, before_agent_callback=before_a, after_agent_callback=after_a)


class OfflineBriefAgent(BaseAgent):
    """Rule-based Brief Agent used when no LLM is configured (deterministic testing mode)."""
    rec: Any = None
    model_config = {"arbitrary_types_allowed": True}

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        prov = get_provider()
        st = ctx.session.state
        text, pid = st.get("request_text", ""), st.get("product_id")
        t0 = time.perf_counter()
        pre = prov.product(pid) if pid else None
        product, fields, cands = parse_request(text, pre, prov.products())
        self.rec.tool_call(BRIEF, "search_products", {"query": text}, {"candidates": cands}, (time.perf_counter() - t0) * 1000)
        delta: dict = {}
        if product is None:
            msg = ["Could not safely identify a single product from the request. Pick one of the suggested products or choose it in the product selector."]
            delta = {"clarification": msg, "candidates": cands}
            self.rec.tool_call(BRIEF, "submit_brief", {"product_id": None, "needs_clarification": msg}, {"ok": False, "needs_clarification": msg}, 0.2)
        else:
            t1 = time.perf_counter()
            brief = assemble_brief(product, fields)
            self.rec.tool_call(BRIEF, "submit_brief", {"product_id": product.product_id, **{k: v for k, v in fields.items()}},
                               {"ok": True, "brief": brief.model_dump()}, (time.perf_counter() - t1) * 1000)
            delta = {"brief": brief.model_dump()}
        yield Event(author=self.name, actions=EventActions(state_delta=delta),
                    content=types.Content(role="model", parts=[types.Part(text="Brief processed.")]))


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

    async def _run_async_impl(self, ctx: InvocationContext) -> AsyncGenerator[Event, None]:
        brief = CampaignBrief(**ctx.session.state["brief"])
        prov = get_provider()
        product = prov.product(brief.product_id)
        if product is None:
            raise ValueError(f"Product {brief.product_id} not found")
        infl = self._call("retrieve_data", lambda: prov.influencers(), {"product_id": brief.product_id, "source": "mock API (synthetic)"},
                          lambda r: {"influencers_retrieved": len(r)})
        l1 = self._call("level1_eligibility_filter", lambda: level1_filter(infl, brief.filters), brief.filters.model_dump(),
                        lambda r: {**r["counts"], "warnings": r["warnings"]})
        l2 = self._call("level2_audience_matcher", lambda: am.level2_filter(l1["eligible"], brief, product),
                        {"target": brief.target, "age_segments": brief.target_age_segments, "location": brief.location,
                         "min_audience_match": brief.filters.min_audience_match},
                        lambda r: {"passed": len(r[0]), "excluded": len(r[1])})
        ranked = self._call("ranking_engine", lambda: re_.rank(l2[0], product, brief), {"weights": brief.weights.model_dump()},
                            lambda r: {"ranked": len(r), "top": [{"rank": m.rank, "id": m.influencer_id, "score": m.overall_score} for m in r[:3]]})
        c = l1["counts"]
        stats = FilterStats(retrieved=c["retrieved"], eligible=c["eligible"], excluded_l1=c["excluded"], review_required=c["review_required"],
                            passed_l2=len(l2[0]), excluded_l2=len(l2[1]), ranked=len(ranked), thresholds=l1["thresholds"],
                            warnings=l1["warnings"] + ([] if ranked else ["No influencers matched; try relaxing thresholds."]))
        out = MatchOutput(stats=stats, ranked=ranked, excluded=l1["excluded"] + l2[1])
        summary = (f"{stats.retrieved} retrieved → {stats.eligible} eligible → {stats.passed_l2} audience matches → {stats.ranked} ranked"
                   + (f"; {stats.review_required} need review" if stats.review_required else ""))
        yield Event(author=self.name, actions=EventActions(state_delta={"match_output": out.model_dump(), "coord_summary": summary}),
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
    return {"data_note": "SYNTHETIC demonstration data", "product": p.product_name if p else brief["product_id"],
            "campaign": {k: brief[k] for k in ("objective", "target", "target_age_segments", "location", "budget_gbp")},
            "funnel": {k: out["stats"][k] for k in ("retrieved", "eligible", "excluded_l1", "review_required", "passed_l2", "ranked")},
            "top_candidates": top, "micro_candidates": micro}


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
    return {
        "summary": (f"For {inp['product']}, {f['retrieved']} synthetic profiles were evaluated: {f['eligible']} passed eligibility, "
                    f"{f['passed_l2']} matched the audience, and {f['ranked']} were ranked. {best['name']} leads with {best['overall_score']:.0f}/100."),
        "recommendation": f"Start with the top 3 ({', '.join(t['name'] for t in top[:3])}) and use the lower-ranked options as a test group.",
        "trade_offs": trade, "micro_highlights": micro,
        "next_steps": ["Review score breakdowns and compare the top creators", "Check excluded creators whose reason is a threshold you may want to relax",
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
        self.rec.tool_call(INSIGHTS, "template_insights", {"top_candidates": len(inp["top_candidates"])}, {"keys": list(ins)}, (time.perf_counter() - t0) * 1000)
        yield Event(author=self.name, actions=EventActions(state_delta={"insights": ins}),
                    content=types.Content(role="model", parts=[types.Part(text=ins["summary"])]))


def build_insights_agent(rec: Recorder, mode: str) -> BaseAgent:
    summ = lambda s: (s.get("insights") or {}).get("summary") if isinstance(s.get("insights"), dict) else "Insights generated."
    before_a, after_a = _agent_hooks(rec, INSIGHTS, summ)
    if mode == "llm":
        def instruction(ctx):
            return _prompt("insights_agent.md").replace("{insight_input}", json.dumps(_insight_input(dict(ctx.state)), default=str))
        return LlmAgent(name=INSIGHTS, model=make_model(), instruction=instruction, output_key="insights_raw",
                        description="Explains ranked results and suggests next steps.",
                        generate_content_config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
                        before_agent_callback=before_a, after_agent_callback=after_a)
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


async def run_brief(text: str, product_id: str | None, on_change: Callable[[dict], None] | None = None) -> dict:
    mode = get_settings().effective_mode()
    rec = Recorder("brief", None, [BRIEF], on_change)
    rec.start_run()
    state: dict = {"request_text": text, "product_id": product_id}
    prompt = text + (f"\n\n(Pre-selected product: {product_id})" if product_id else "")
    status, summary = "Completed", ""
    fallback_note = None
    try:
        agent = build_brief_agent(rec, mode)
        final = await _execute(rec, agent, state, prompt, {BRIEF} if mode == "llm" else set())
    except Exception as e:
        rec.error(BRIEF, str(e)[:400])
        if mode != "llm":
            rec.agent(BRIEF)["status"] = "Failed"
            trace = rec.finish("Failed", f"Brief agent failed: {e}")
            return {"brief": None, "clarification": [], "candidates": [], "error": str(e), "trace": trace, "usage": rec.usage()}
        # The configured model failed (bad token, rate limit, no tool support...): fall back to the rule-based parser.
        try:
            a = rec.agent(BRIEF)
            a["status"], a["tools"] = "Pending", []
            final = await _execute(rec, build_brief_agent(rec, "offline"), state, prompt, set())
            fallback_note = f"The model call failed ({str(e)[:160]}); the rule-based parser was used instead."
        except Exception as e2:
            rec.agent(BRIEF)["status"] = "Failed"
            trace = rec.finish("Failed", f"Brief agent failed: {e2}")
            return {"brief": None, "clarification": [], "candidates": [], "error": str(e2), "trace": trace, "usage": rec.usage()}
    brief = final.get("brief")
    clar = final.get("clarification") or (brief or {}).get("needs_clarification") or []
    if brief is None and not clar:
        clar = ["The agent could not produce a brief; please select a product and try again."]
    if clar:
        status, summary = "Needs Review", "Brief needs clarification: " + "; ".join(clar)
        rec.agent(BRIEF)["status"] = "Needs Review"
    else:
        summary = rec.agent(BRIEF)["output_summary"] or "Brief produced."
    if fallback_note:
        status = "Needs Review"
        rec.agent(BRIEF)["status"] = "Needs Review"
        rec.agent(BRIEF)["output_summary"] = f"{summary} {fallback_note}".strip()
        summary = fallback_note
    trace = rec.finish(status, summary)
    return {"brief": brief, "clarification": clar, "candidates": final.get("candidates") or [], "trace": trace, "usage": rec.usage(),
            "warning": fallback_note}


async def run_match(brief: CampaignBrief, campaign_id: str, brief_trace: dict | None = None,
                    on_change: Callable[[dict], None] | None = None, rec: Recorder | None = None) -> dict:
    mode = get_settings().effective_mode()
    names = [BRIEF, COORD, INSIGHTS]
    rec = rec or Recorder("match", campaign_id, names, on_change)
    if brief_trace:  # carry over the Campaign Brief Agent card from the brief-review step
        for a in brief_trace["agents"]:
            if a["id"] == BRIEF:
                rec.trace["agents"][0] = {**a}
        rec.step(BRIEF, "info", "Brief produced earlier and approved by the marketer")
    else:
        b = rec.agent(BRIEF)
        b["status"], b["output_summary"] = "Completed", "Structured form input validated (Campaign Brief Agent not invoked)."
        b["token_source"] = "none"
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
