"""Zylo Concierge: the chat assistant.

A language model (through Google ADK) decides, turn by turn, which specialist agents to consult and which of their tools
to call, so the path through the system is the model's choice. The specialists do the real work with deterministic
Python (inventory, creator search, the matching engine, saved campaigns), and the model writes the answer from their
results. Every model turn, decision and tool call is recorded in the run's "brain" timeline.

If no model is configured, or the model fails, a rule-based router picks the same tools from keywords and fills a fixed
answer template, so the assistant always answers; the turn is labelled so nobody mistakes it for the model.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
import uuid
from pathlib import Path
from typing import Any, Callable

from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from ..config import get_settings
from ..services import agent_tools as at
from ..services.data_provider import get_provider
from .brain import model_hooks
from .brief_parser import extract_fields, search_products
from .recorder import Recorder, redact
from .workflow import make_model

# ADK warns once per tool call that Google's schema has no "default value"; our tools document their defaults instead.
logging.getLogger("google_adk.google.adk.tools._function_parameter_parse_util").setLevel(logging.ERROR)

CONCIERGE = "ConciergeAgent"
APP = "zylo-chat"
LLM_TIMEOUT_S = 150  # overall budget for the model path, retries included
RETRY_WAITS = (3.0, 8.0)  # seconds to wait before the 2nd and 3rd attempt when the model is temporarily unavailable
_TRANSIENT = ("serviceunavailable", "ratelimit", "timeout", "apiconnection", "internalserver", "badgateway", "overloaded", "temporarily",
              "rate limit", "429", "502", "503", "504")
PROMPT = Path(__file__).parent / "prompts" / "concierge_agent.md"
_SESSIONS = InMemorySessionService()  # conversation memory for the model path, per chat session


def chat_agent_names() -> list[str]:
    return [CONCIERGE, *at.SPECIALISTS]


def _agents_block() -> str:
    return "\n".join(f"- {name} ({spec['role']}): " + ", ".join(t.__name__ for t in spec["tools"]) for name, spec in at.SPECIALISTS.items())


# ---------------------------------------------------------------------- result cards (built from tool results, never by the model)
def attachments_from(tool: str, res: Any) -> list[dict]:
    if not isinstance(res, dict) or res.get("error"):
        return []
    if tool in ("list_products", "get_product"):
        items = res.get("products") or ([res] if "product_id" in res else [])
        if not items:
            return []
        return [{"type": "products", "title": f"{res.get('total', len(items))} product{'s' if res.get('total', len(items)) != 1 else ''}",
                 "items": [{"product_id": p["product_id"], "name": p["product_name"], "price_gbp": p["price_gbp"], "category": p["category"], "colour": p.get("colour", ""),
                            "status": p["status"], "stock_state": p["stock_state"], "total_stock": p["total_stock"], "low_sizes": p["low_sizes"],
                            "sold_out_sizes": p["sold_out_sizes"], "sold_30d": p["units_sold_30d"]} for p in items]}]
    if tool == "inventory_summary":
        return [{"type": "kpis", "title": "Last 30 days and stock", "items": [
            {"label": "Live products", "value": str(res["counts"]["active"])}, {"label": "Units in stock", "value": f"{res['units_in_stock']:,}"},
            {"label": "Low or sold-out sizes", "value": str(res["low_stock_sizes"] + res["sold_out_sizes"])}, {"label": "Orders", "value": f"{res['orders_30d']:,}"},
            {"label": "Revenue", "value": f"£{res['revenue_30d']:,.0f}"}, {"label": "Avg order", "value": f"£{res['aov_30d']:.2f}"}]}]
    if tool == "recent_orders":
        return [{"type": "orders", "title": f"{len(res.get('orders', []))} latest orders", "items": res.get("orders", [])}] if res.get("orders") else []
    if tool == "search_creators":
        return [{"type": "creators", "title": f"{res['total']} creators", "items": [
            {"influencer_id": c["influencer_id"], "name": c["display_name"], "platform": c["platform"], "followers": c["follower_count"],
             "promo_views": c["median_promotional_views"], "engagement": c["engagement_rate_pct"]} for c in res.get("creators", [])]}] if res.get("creators") else []
    if tool == "preview_matching":
        st = res["stats"]
        micro = f", {res['micro_ranked']:,} of them micro-influencers" if res.get("micro_only") else ""
        return [{"type": "matches", "title": f"{'Top micro-influencers' if res.get('micro_only') else 'Top creators'} for {res['product']['product_name']}",
                 "subtitle": f"{st['retrieved']:,} evaluated → {st['eligible']:,} eligible → {st['ranked']:,} ranked{micro} (preview, not saved)",
                 "items": [{"rank": m["rank"], "influencer_id": m["influencer_id"], "name": m["name"], "platform": m["platform"], "followers": m["followers"],
                            "promo_views": m["median_promo_views"], "score": m["overall_score"], "is_micro": m["is_micro"]} for m in res["top"]]}]
    if tool == "get_campaign_results":
        st = res["stats"]
        return [{"type": "matches", "title": res["name"], "subtitle": f"{st['retrieved']:,} evaluated → {st['eligible']:,} eligible → {st['ranked']:,} ranked", "campaign_id": res["campaign_id"],
                 "items": [{"rank": m["rank"], "influencer_id": m["influencer_id"], "name": m["display_name"], "platform": m["platform"], "followers": m["follower_count"],
                            "promo_views": m["median_promotional_views"], "score": m["overall_score"], "is_micro": m["is_micro"]} for m in res["top"]]}]
    if tool == "list_campaigns":
        return [{"type": "campaigns", "title": "Recent campaigns", "items": res.get("campaigns", [])}] if res.get("campaigns") else []
    if tool == "start_campaign":
        return [{"type": "campaign_started", "campaign_id": res["campaign_id"], "name": res["name"], "page": res["page"], "agents_page": res["agents_page"]}]
    if tool == "explain_creator_in_campaign":
        ranked, ex = res.get("ranked_as"), res.get("excluded_as")
        return [{"type": "explain", "creator": res["creator"]["display_name"], "influencer_id": res["creator"]["influencer_id"],
                 "rank": ranked["rank"] if ranked else None, "score": ranked["overall_score"] if ranked else None,
                 "reasons": (ex or {}).get("reasons", []), "concerns": (ranked or {}).get("concerns", [])}]
    return []


# ---------------------------------------------------------------------- the model path (ADK)
def build_concierge(rec: Recorder, cards: list[dict]) -> LlmAgent:
    starts: dict[str, float] = {}

    def before_tool(tool, args, tool_context):
        starts[tool.name] = time.perf_counter()
        return None

    def after_tool(tool, args, tool_context, tool_response):
        dur = (time.perf_counter() - starts.pop(tool.name, time.perf_counter())) * 1000
        err = tool_response.get("error") if isinstance(tool_response, dict) else None
        rec.tool_call(at.AGENT_OF.get(tool.name, CONCIERGE), tool.name, args, tool_response, dur, err if isinstance(err, str) else None)
        cards.extend(attachments_from(tool.name, tool_response))
        return None

    model_name = get_settings().llm_model
    before_m, after_m = model_hooks(rec, CONCIERGE, model_name)
    return LlmAgent(name=CONCIERGE, model=make_model(), instruction=lambda ctx: PROMPT.read_text("utf-8").replace("{agents}", _agents_block()),
                    description="Coordinates the specialist agents to answer back-office questions.", tools=list(at.ALL_TOOLS),
                    before_tool_callback=before_tool, after_tool_callback=after_tool, before_model_callback=before_m, after_model_callback=after_m)


async def _run_model(rec: Recorder, session_id: str, text: str, context: str, cards: list[dict]) -> str:
    agent = build_concierge(rec, cards)
    runner = Runner(app_name=APP, agent=agent, session_service=_SESSIONS)
    sess = await _SESSIONS.get_session(app_name=APP, user_id="marketer", session_id=session_id)
    fresh = sess is None
    if fresh:
        await _SESSIONS.create_session(app_name=APP, user_id="marketer", session_id=session_id, state={})
    message = f"{context}\n\nNew request: {text}" if (fresh and context) else text
    answer = ""
    async for ev in runner.run_async(user_id="marketer", session_id=session_id, new_message=types.Content(role="user", parts=[types.Part(text=message)])):
        if ev.author == CONCIERGE and ev.content and not ev.get_function_responses():
            um = ev.usage_metadata
            if um is not None and (um.prompt_token_count is not None or um.candidates_token_count is not None):
                rec.add_usage(CONCIERGE, um.prompt_token_count or 0, um.candidates_token_count or 0)
            else:
                rec.add_usage(CONCIERGE, None, None, fallback_text_in=message[:4000], fallback_text_out="".join(p.text or "" for p in ev.content.parts or []))
        if ev.is_final_response() and ev.author == CONCIERGE and ev.content:
            answer = "".join(p.text or "" for p in ev.content.parts or [] if getattr(p, "text", None) and not getattr(p, "thought", False)).strip()
    return answer


# ---------------------------------------------------------------------- the rule-based router (no model)
PRODUCT_ID, CREATOR_ID, CAMPAIGN_ID = re.compile(r"\bP\d{3}\b", re.I), re.compile(r"\bI\d{4}\b", re.I), re.compile(r"\bcmp_[0-9a-f]{8}\b")
CATEGORIES = {"women": "Women", "men": "Men", "kids": "Kids", "unisex": "Unisex", "accessories": "Accessories", "couple": "Couple Looks"}


def find_product(text: str) -> tuple[dict | None, list[dict]]:
    """The product a message is about: an explicit id, or a clear single best match on its words."""
    m = PRODUCT_ID.search(text)
    prov = get_provider()
    if m:
        p = prov.product(m.group(0).upper())
        if p:
            return {"product_id": p.product_id, "product_name": p.product_name}, []
    cands = search_products(text, prov.products(), limit=4)
    if cands and (len(cands) == 1 or cands[0]["score"] >= cands[1]["score"] + 2) and cands[0]["score"] >= 3:
        return cands[0], cands
    return None, cands


def plan(text: str) -> tuple[str, list[tuple[str, dict]], str]:
    """(intent, [(tool, args)], note). Deterministic keyword routing used when no model answers."""
    t = text.lower()
    product, cands = find_product(text)
    cmp_id = CAMPAIGN_ID.search(text)
    creator = CREATOR_ID.search(text)
    cat = next((v for k, v in CATEGORIES.items() if re.search(rf"\b{k}\b", t)), "")
    if re.search(r"\b(launch|start|run|create|kick ?off|set up)\b.*\bcampaign\b|\bcampaign\b.*\b(launch|start|run|kick ?off)\b", t):
        if product:
            return "launch a campaign", [("start_campaign", {"product_id": product["product_id"], "request": text})], f"Product identified: {product['product_name']}"
        return "launch a campaign", [], "Which product? I could not tell from the message."
    if re.search(r"\b(why|explain|reason|excluded|rejected)\b", t) and creator:
        calls = [("explain_creator_in_campaign", {"campaign_id": cmp_id.group(0) if cmp_id else "", "influencer_id": creator.group(0).upper()})]
        return "explain a creator's result", calls, "Needs a campaign id; the latest campaign is used when none is given."
    about_campaign = bool(re.search(r"\bcampaigns?\b", t)) and not product  # "the latest campaign's top creators" is about saved results
    if re.search(r"\b(influencers?|creators?|micro|shortlist|match(ing)?|promote|promotion|tiktok|instagram|youtube)\b", t) and not about_campaign:
        if creator and not product:
            return "look up a creator", [("get_creator", {"influencer_id": creator.group(0).upper()})], "Creator id found in the message."
        if product:
            f = extract_fields(text)
            args = {"product_id": product["product_id"], "target_age_segments": ",".join(f.get("target_age_segments", [])), "target": f.get("target", ""),
                    "location": f.get("location", ""), "min_followers": int(f.get("min_followers") or 0), "min_promo_views": int(f.get("min_promo_views") or 0), "top_n": 5,
                    "micro_only": bool(re.search(r"\bmicro\b", t))}
            return "rank creators for a product", [("preview_matching", args)], f"Product identified: {product['product_name']}"
        if re.search(r"\b(search|find|show|list|top|best|biggest)\b", t) and not cands:
            platform = next((p for p in ("Instagram", "TikTok", "YouTube") if p.lower() in t), "")
            return "browse creators", [("search_creators", {"q": "", "platform": platform, "category": cat.lower(), "min_followers": 0, "sort": "promo_views" if "view" in t else "followers", "limit": 8})], "No product named, so browsing creators."
        return "rank creators for a product", [], "Which product should I find creators for?"
    if re.search(r"\bcampaigns?\b|\bresults?\b", t):
        return "campaign results", [("list_campaigns", {"limit": 5})], "Then the latest campaign's results."
    if re.search(r"\b(stock|low|sold.?out|out of stock|restock|inventory|running (low|out)|replenish)\b", t):
        return "stock check", [("list_products", {"q": "", "category": cat, "stock": "attention", "limit": 8})], "Products with low or sold-out sizes."
    if re.search(r"\b(sales|revenue|orders?|bestsellers?|best.?sellers?|selling|sold|aov|summary|overview)\b", t):
        return "sales and orders", [("inventory_summary", {}), ("recent_orders", {"limit": 5})], "30-day sales snapshot and the latest orders."
    if product:
        return "product details", [("get_product", {"product_id": product["product_id"]})], f"Product identified: {product['product_name']}"
    if cat or re.search(r"\b(products?|catalogue|catalog|items?|clothes|show me)\b", t):
        return "browse products", [("list_products", {"q": "" if cat else re.sub(r"\b(show|me|the|products?|items?)\b", "", t).strip(), "category": cat, "stock": "", "limit": 8})], "Browsing the catalogue."
    return "help", [], ""


HELP = ("I can help with **stock and sales** (\"which products are low on stock?\", \"summarise sales\"), **creators** (\"top TikTok creators\"), "
        "**matching** (\"find micro-influencers for the Oversized Graphic Hoodie aimed at 18-24 women\"), **saved campaigns** "
        "(\"show the latest campaign's top creators\", \"why was I0007 excluded?\"), and I can **launch a campaign** when you ask me to.")


def _fmt_list(items: list[str], n: int = 5) -> str:
    return "\n".join(f"- {x}" for x in items[:n])


def compose(intent: str, results: list[tuple[str, dict, Any]], note: str) -> str:
    """Fixed-template answers for the rule-based path."""
    if intent == "help" or (not results and not note):
        return HELP
    if not results:
        return note
    tool, args, res = results[0]
    if isinstance(res, dict) and res.get("error"):
        return f"I could not do that: {res['error']}"
    if tool == "list_products":
        ps = res["products"]
        if not ps:
            return "Nothing matches: no products have low or sold-out sizes right now." if args.get("stock") else "No products matched."
        return (f"**{res['total']} products** {'need attention on stock' if args.get('stock') else 'matched'}. Most urgent:\n" +
                _fmt_list([f"{p['product_name']}: {p['total_stock']} units" + (f", sold out in {', '.join(p['sold_out_sizes'])}" if p["sold_out_sizes"] else "") + (f", low in {', '.join(p['low_sizes'])}" if p["low_sizes"] else "") for p in ps], 5))
    if tool == "get_product":
        return f"**{res['product_name']}** ({res['product_id']}): £{res['price_gbp']}, {res['total_stock']} units in stock ({res['stock_state'].replace('_', ' ')}), {res['units_sold_30d']} sold in the last 30 days."
    if tool == "inventory_summary":
        out = (f"In the last 30 days: **{res['orders_30d']:,} orders**, **£{res['revenue_30d']:,.0f} revenue**, average order £{res['aov_30d']:.2f}. "
               f"{res['counts']['active']} live products with {res['units_in_stock']:,} units in stock; {res['low_stock_sizes']} sizes are low and {res['sold_out_sizes']} sold out.")
        if res["bestsellers"]:
            out += "\nBestsellers:\n" + _fmt_list([f"{b['product_name']} ({b['units_sold_30d']} sold)" for b in res["bestsellers"]], 3)
        return out
    if tool == "search_creators":
        return f"**{res['total']} creators** match. Top results are below; ask me to rank creators for a specific product for a fit-based view."
    if tool == "get_creator":
        return (f"**{res['display_name']}** ({res['username']}), {res.get('platform') or 'platform unknown'}: {res.get('follower_count') or 'n/a'} followers, "
                f"{res.get('median_promotional_views') or 'n/a'} median promo views, {res.get('engagement_rate') or 'n/a'}% engagement. {res.get('creator_content_style') or ''}")
    if tool == "preview_matching":
        st, top = res["stats"], res["top"]
        if not top:
            return f"No creators matched {res['product']['product_name']} with these filters. Try lowering the follower or view minimums."
        kind = "micro-influencers" if res.get("micro_only") else "creators"
        if res.get("micro_only") and res["micro_ranked"] < st["ranked"]:
            kind += f" ({res['micro_ranked']:,} of the {st['ranked']:,} ranked)"
        return (f"For **{res['product']['product_name']}**, {st['retrieved']:,} creators were evaluated, {st['eligible']:,} were eligible and **{st['ranked']:,} ranked**. Best-fit {kind}:\n" +
                _fmt_list([f"{m['name']} ({m['platform']}): {m['overall_score']:.0f}/100" + (", micro-influencer" if m["is_micro"] else "") for m in top], 3) +
                "\nThis is a preview and nothing was saved. Scores rank fit, not sales.")
    if tool == "list_campaigns":
        cs = res.get("campaigns", [])
        if not cs:
            return "There are no saved campaigns yet. Ask me to launch one for a product."
        return f"The latest campaign is **{cs[0]['name']}** ({cs[0]['status']})."  # replaced by the results step in run_rules
    if tool == "get_campaign_results":
        top = res["top"]
        return (f"**{res['name']}**: {res['stats']['ranked']:,} creators ranked. Top 3:\n" + _fmt_list([f"{m['display_name']} ({m['platform']}): {m['overall_score']:.0f}/100" for m in top], 3) +
                (f"\n{res['insights']['recommendation']}" if res["insights"].get("recommendation") else ""))
    if tool == "explain_creator_in_campaign":
        if res.get("ranked_as"):
            m = res["ranked_as"]
            return f"**{res['creator']['display_name']}** ranked **#{m['rank']}** with {m['overall_score']:.0f}/100. " + (f"Concerns: {'; '.join(m['concerns'])}" if m["concerns"] else "No concerns were flagged.")
        ex = res.get("excluded_as")
        return f"**{res['creator']['display_name']}** was excluded: " + (" ".join(ex["reasons"]) if ex else "not found in this campaign's evaluated set.")
    if tool == "start_campaign":
        return f"Started **{res['name']}**. The Brief, Matching and Insights agents are running now; open the campaign to watch them."
    return note or HELP


async def _call(tool: str, args: dict) -> Any:
    fn = at.TOOL_BY_NAME[tool]
    return await fn(**args) if asyncio.iscoroutinefunction(fn) else fn(**args)


async def _run_rules(rec: Recorder, text: str, cards: list[dict]) -> str:
    intent, calls, note = plan(text)
    why = f" {note.rstrip('.')}." if note else ""
    rec.brain(CONCIERGE, "rule", text=f"Rule-based router: intent “{intent}”.{why}" + (f" Calling: {', '.join(c[0] for c in calls)}." if calls else ""))
    results: list[tuple[str, dict, Any]] = []
    for tool, args in calls:
        if tool == "explain_creator_in_campaign" and not args["campaign_id"]:
            latest = (await _call("list_campaigns", {"limit": 1})).get("campaigns") or []
            if not latest:
                results.append((tool, args, {"error": "There are no saved campaigns to look in."}))
                continue
            args = {**args, "campaign_id": latest[0]["campaign_id"]}
            rec.brain(CONCIERGE, "rule", text=f"No campaign id given, using the latest: {latest[0]['name']} ({latest[0]['campaign_id']}).")
        t0 = time.perf_counter()
        res = await _call(tool, args)
        err = res.get("error") if isinstance(res, dict) else None
        rec.tool_call(at.AGENT_OF[tool], tool, args, res, (time.perf_counter() - t0) * 1000, err)
        cards.extend(attachments_from(tool, res))
        results.append((tool, args, res))
        if tool == "list_campaigns" and not err and res.get("campaigns"):  # "campaign results" = list, then open the newest
            cid = res["campaigns"][0]["campaign_id"]
            rec.brain(CONCIERGE, "rule", text=f"Opening the latest campaign ({cid}) to read its results.")
            t1 = time.perf_counter()
            res2 = await _call("get_campaign_results", {"campaign_id": cid, "top_n": 5})
            err2 = res2.get("error") if isinstance(res2, dict) else None
            rec.tool_call(at.AGENT_OF["get_campaign_results"], "get_campaign_results", {"campaign_id": cid, "top_n": 5}, res2, (time.perf_counter() - t1) * 1000, err2)
            cards[:] = [c for c in cards if c["type"] != "campaigns"] + attachments_from("get_campaign_results", res2)
            results = [("get_campaign_results", {"campaign_id": cid}, res2)]
    answer = compose(intent, results, note)
    rec.brain(CONCIERGE, "rule", text="Wrote the answer from a fixed template using the tool results (no language model).")
    return answer


# ---------------------------------------------------------------------- one chat turn
def _friendly(e: Exception) -> str:
    """The provider's own message without LiteLLM's repeated class-name prefixes."""
    msg = re.sub(r"^(litellm\.)?\w+Error:\s*(\w+Error:\s*)?", "", str(e).strip())
    return (msg or type(e).__name__)[:200]


def _transient(e: Exception) -> bool:
    """Worth retrying: the provider is busy or the network blipped. A hard timeout of ours, a bad token or a bad request are not."""
    if isinstance(e, asyncio.TimeoutError):
        return False
    text = f"{type(e).__name__} {e}".lower()
    return any(k in text for k in _TRANSIENT)


async def run_turn(session_id: str, text: str, history: list[dict], on_change: Callable[[dict, list], None] | None = None, force_rules: bool = False) -> dict:
    """Run one user message. Returns {answer, cards, mode, model, trace, usage, status}."""
    s = get_settings()
    cards: list[dict] = []
    rec = Recorder("chat", session_id, chat_agent_names(), (lambda tr: on_change(tr, cards)) if on_change else None)
    rec.trace["run_id"] = f"turn_{uuid.uuid4().hex[:10]}"
    rec.start_run()
    rec.start_agent(CONCIERGE)
    answer, mode, status, note = "", "rules", "Completed", None
    context = "\n".join(f"{'User' if i % 2 == 0 else 'Assistant'}: {m}" for i, m in enumerate(
        [x for t in history[-4:] for x in (t["user_text"], (t.get("answer") or "")[:300])])) if history else ""
    if s.effective_mode() == "llm" and not force_rules:
        rec.brain(CONCIERGE, "note", level="info", text=f"Sent your message to {s.llm_model}. Waiting for its first decision…")
        loop = asyncio.get_running_loop()
        deadline = loop.time() + LLM_TIMEOUT_S
        attempt = 0
        while True:
            attempt += 1
            try:
                answer = await asyncio.wait_for(_run_model(rec, session_id, text, context, cards), timeout=max(5.0, deadline - loop.time()))
                mode = "llm"
                if not answer:
                    raise ValueError("the model returned an empty answer")
                break
            except Exception as e:  # overloaded free model, bad token, no tool support, timeout...
                started = any(ev["kind"] in ("llm", "tool") for ev in rec.trace["brain"])  # nothing has happened yet, so a retry is clean
                wait = RETRY_WAITS[attempt - 1] if attempt <= len(RETRY_WAITS) else None
                if wait is not None and not started and _transient(e) and loop.time() + wait < deadline:
                    rec.brain(CONCIERGE, "note", level="warn", text=f"The model is overloaded right now ({_friendly(e)}). Retrying in {wait:g}s (attempt {attempt + 1} of {len(RETRY_WAITS) + 1})…")
                    try:  # drop the half-recorded attempt so the retry does not repeat the user message in the model's memory
                        await _SESSIONS.delete_session(app_name=APP, user_id="marketer", session_id=session_id)
                    except Exception:
                        pass
                    await asyncio.sleep(wait)
                    continue
                tried = f" after {attempt} attempt{'s' if attempt != 1 else ''}" if attempt > 1 else ""
                note = f"The model could not answer{tried} ({_friendly(e) if str(e) else 'it timed out'}); the rule-based router answered instead."
                rec.error(CONCIERGE, note)
                cards.clear()
                status = "Needs Review"
                break
    elif not force_rules:
        note = "No language model is configured, so the rule-based router is answering."
        rec.brain(CONCIERGE, "note", level="info", text=note)
    if mode != "llm":
        try:
            answer = await _run_rules(rec, text, cards)
        except Exception as e:
            rec.error(CONCIERGE, f"router failed: {e}")
            answer, status = "Sorry, something went wrong while answering. Please try again or rephrase.", "Failed"
    rec.end_agent(CONCIERGE, "Answered" if status != "Failed" else None, "Completed" if status != "Failed" else "Failed")
    rec.brain(CONCIERGE, "note", level="info", text="Answer ready.")
    trace = rec.finish(status, "answered by " + ("the model" if mode == "llm" else "the rule-based router"))
    return {"answer": answer, "cards": cards, "mode": mode, "model": s.llm_model if mode == "llm" else None, "note": note, "trace": trace,
            "usage": rec.usage(), "status": status}
