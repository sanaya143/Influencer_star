import os
import time

os.environ["LLM_MODE"] = "offline"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.agents import concierge
from app.db.database import ChatTurnRow, init_db, session
from app.main import app
from app.services import agent_tools as at


@pytest.fixture()
def client():
    init_db("sqlite:///:memory:")
    with TestClient(app) as c:
        yield c


def ask(c, text, sid=None, rules_only=False):
    sid = sid or c.post("/api/chat/sessions").json()["session_id"]
    r = c.post(f"/api/chat/sessions/{sid}/messages", json={"text": text, "rules_only": rules_only})
    assert r.status_code == 202, r.text
    tid = r.json()["turn_id"]
    for _ in range(200):
        t = c.get(f"/api/chat/turns/{tid}").json()
        if t["status"] != "Running":
            return sid, t
        time.sleep(0.1)
    raise AssertionError("turn did not finish")


def tools_called(turn):
    return [(e["agent"], e["name"]) for e in turn["brain"] if e["kind"] == "tool"]


def test_capabilities_list_the_specialist_agents(client):
    d = client.get("/api/chat/capabilities").json()
    assert [a["name"] for a in d["agents"]] == ["InventoryAgent", "CreatorAgent", "MatchingAgent", "CampaignAgent"]
    names = {t["name"] for a in d["agents"] for t in a["tools"]}
    assert names == {t.__name__ for t in at.ALL_TOOLS} and len(names) == 11 and d["mode"] == "offline"


def test_every_chat_tool_has_a_valid_model_schema():
    from google.adk.tools import FunctionTool
    for fn in at.ALL_TOOLS:
        decl = FunctionTool(fn)._get_declaration()
        assert decl.name == fn.__name__ and decl.description


def test_inventory_question_routes_to_the_inventory_agent(client):
    sid, t = ask(client, "Which products are low on stock?")
    assert t["status"] == "Completed" and t["mode"] == "rules" and t["model"] is None
    assert tools_called(t) == [("InventoryAgent", "list_products")] and t["agents"] == ["InventoryAgent"]
    kinds = [e["kind"] for e in t["brain"]]
    assert kinds[0] == "note" and "No language model is configured" in t["brain"][0]["text"]
    rule = next(e for e in t["brain"] if e["kind"] == "rule")
    assert "intent “stock check”" in rule["text"] and kinds.index("rule") < kinds.index("tool")
    assert t["cards"][0]["type"] == "products" and t["cards"][0]["items"]
    assert "need attention" in t["answer"] or "no products" in t["answer"].lower()
    assert client.get("/api/chat/sessions").json()["items"][0]["title"].startswith("Which products")


def test_matching_question_previews_without_saving(client):
    _, t = ask(client, "Find micro-influencers for the Oversized Graphic Hoodie aimed at 18-24 women")
    assert tools_called(t) == [("MatchingAgent", "preview_matching")]
    call = next(e for e in t["brain"] if e["kind"] == "tool")
    assert call["args"]["product_id"] == "P001" and call["args"]["target_age_segments"] == "18-24" and call["args"]["target"] == "women"
    card = t["cards"][0]
    assert card["type"] == "matches" and 1 <= len(card["items"]) <= 5 and "preview" in card["subtitle"]
    assert "Oversized Graphic Hoodie" in t["answer"] and "nothing was saved" in t["answer"]
    assert client.get("/api/campaigns").json()["items"] == []


def test_sales_and_creator_questions(client):
    _, sales = ask(client, "Summarise sales this month")
    assert [n for _, n in tools_called(sales)] == ["inventory_summary", "recent_orders"] and "orders" in sales["answer"]
    assert {c["type"] for c in sales["cards"]} == {"kpis", "orders"}
    _, cr = ask(client, "Show the top TikTok creators")
    assert tools_called(cr) == [("CreatorAgent", "search_creators")] and cr["cards"][0]["type"] == "creators"
    assert all(c["platform"] == "TikTok" for c in cr["cards"][0]["items"])


def test_launching_a_campaign_starts_the_real_workflow(client):
    _, t = ask(client, "Launch a campaign for the Washed Straight Jeans")
    assert tools_called(t) == [("CampaignAgent", "start_campaign")]
    card = t["cards"][0]
    assert card["type"] == "campaign_started" and card["page"].startswith("/admin/campaigns/cmp_") and "Started" in t["answer"]
    camps = client.get("/api/campaigns").json()["items"]
    assert len(camps) == 1 and camps[0]["campaign_id"] == card["campaign_id"] and camps[0]["product_id"] == "P012"
    # nothing is launched by a question that merely mentions campaigns
    _, q = ask(client, "How are campaigns doing?")
    assert ("CampaignAgent", "start_campaign") not in tools_called(q)


def test_campaign_results_and_explanations_use_the_latest_campaign(client):
    pb = client.post("/api/campaigns/parse-brief", json={"text": "UK women 18-24 streetwear", "product_id": "P001"}).json()
    cid = client.post("/api/campaigns", json={"brief": pb["brief"], "name": "Hoodie drop"}).json()["campaign_id"]
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    _, res = ask(client, "Show the latest campaign's top creators")
    assert [n for _, n in tools_called(res)] == ["list_campaigns", "get_campaign_results"] and res["cards"][0]["campaign_id"] == cid
    assert "Hoodie drop" in res["answer"] and len(res["cards"][0]["items"]) == 5
    _, ex = ask(client, "Why was I0001 excluded?")
    assert tools_called(ex)[-1] == ("CampaignAgent", "explain_creator_in_campaign")
    assert any("using the latest" in e.get("text", "") for e in ex["brain"] if e["kind"] == "rule")
    assert "excluded" in ex["answer"] or "ranked" in ex["answer"]


def test_unclear_requests_get_help_not_guesses(client):
    _, t = ask(client, "hello there")
    assert not tools_called(t) and "stock and sales" in t["answer"]
    _, amb = ask(client, "find influencers for streetwear")  # no single product
    assert not tools_called(amb) and "Which product" in amb["answer"]
    _, bad = ask(client, "launch a campaign for something")
    assert ("CampaignAgent", "start_campaign") not in tools_called(bad) and "Which product" in bad["answer"]


def test_model_path_runs_the_real_adk_loop_and_records_the_brain(client, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    _, t = ask(client, "Which products are low on stock?")
    assert t["status"] == "Completed" and t["mode"] == "llm" and t["model"] is not None
    turns = [e for e in t["brain"] if e["kind"] == "llm"]
    assert len(turns) == 2  # decide, then answer
    assert turns[0]["calls"][0]["name"] == "list_products" and turns[0]["input"].startswith("user:") and turns[0]["tokens"]["in"] > 0
    assert turns[1]["input"].startswith("tool:") and "need attention" in turns[1]["output"] or "no products" in turns[1]["output"].lower()
    assert tools_called(t) == [("InventoryAgent", "list_products")] and t["cards"][0]["type"] == "products"
    assert t["usage"]["total_tokens"] > 0 and t["usage"]["token_source"] in ("actual", "mixed")
    # a second message in the same chat reuses the conversation
    sid = t["session_id"]
    _, t2 = ask(client, "Show the top YouTube creators", sid)
    assert t2["mode"] == "llm" and tools_called(t2) == [("CreatorAgent", "search_creators")]
    assert [x["idx"] for x in client.get(f"/api/chat/sessions/{sid}").json()["turns"]] == [1, 2]


def test_model_failure_falls_back_to_the_router_and_says_so(client, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")

    async def boom(*a, **k):
        raise RuntimeError("Service temporarily overloaded")
    monkeypatch.setattr(concierge, "_run_model", boom)
    _, t = ask(client, "Which products are low on stock?")
    assert t["mode"] == "rules" and t["status"] == "Needs Review" and "rule-based router answered" in t["note"] and "overloaded" in t["note"]
    assert any(e["kind"] == "note" and e.get("level") == "error" for e in t["brain"]) and tools_called(t)
    assert t["answer"] and t["cards"]


def test_rules_only_flag_skips_the_model(client, monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    _, t = ask(client, "Which products are low on stock?", rules_only=True)
    assert t["mode"] == "rules" and not [e for e in t["brain"] if e["kind"] == "llm"] and t["status"] == "Completed"


def test_chat_api_validation_and_lifecycle(client):
    assert client.post("/api/chat/sessions/chat_nope/messages", json={"text": "hi"}).status_code == 404
    sid = client.post("/api/chat/sessions").json()["session_id"]
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": ""}).status_code == 422
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "x" * 2001}).status_code == 422
    assert client.get(f"/api/chat/sessions/{sid}").json()["turns"] == []
    assert client.get("/api/chat/sessions").json()["items"] == []  # empty chats are not listed
    with session() as db:  # a turn still running blocks the next message
        db.add(ChatTurnRow(id="turn_stuck", session_id=sid, idx=1, user_text="hi", status="Running", brain=[], cards=[], agents=[]))
        db.commit()
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "again"}).status_code == 409
    assert client.get("/api/chat/turns/turn_missing").status_code == 404
    assert client.delete(f"/api/chat/sessions/{sid}").status_code == 204
    assert client.get(f"/api/chat/sessions/{sid}").status_code == 404


def test_cards_are_built_from_results_not_from_the_model():
    assert concierge.attachments_from("list_products", {"error": "x"}) == []
    assert concierge.attachments_from("unknown_tool", {"a": 1}) == []
    card = concierge.attachments_from("start_campaign", {"campaign_id": "cmp_1", "name": "N", "page": "/admin/campaigns/cmp_1", "agents_page": "/admin/campaigns/cmp_1/agents"})[0]
    assert card == {"type": "campaign_started", "campaign_id": "cmp_1", "name": "N", "page": "/admin/campaigns/cmp_1", "agents_page": "/admin/campaigns/cmp_1/agents"}


def test_micro_influencer_requests_return_only_micro_creators(client):
    _, t = ask(client, "Find micro-influencers for the Oversized Graphic Hoodie")
    call = next(e for e in t["brain"] if e["kind"] == "tool")
    assert call["args"]["micro_only"] is True
    card = t["cards"][0]
    assert card["title"].startswith("Top micro-influencers") and card["items"] and all(m["is_micro"] for m in card["items"])
    assert "Best-fit micro-influencers" in t["answer"]
    ranks = [m["rank"] for m in card["items"]]
    assert ranks == sorted(ranks) and ranks[0] >= 1  # still the overall ranks, in order
    _, plain = ask(client, "Find influencers for the Oversized Graphic Hoodie")
    assert next(e for e in plain["brain"] if e["kind"] == "tool")["args"]["micro_only"] is False
    assert plain["cards"][0]["title"].startswith("Top creators") and [m["rank"] for m in plain["cards"][0]["items"]] == [1, 2, 3, 4, 5]
    assert "Calling: preview_matching." in t["brain"][1]["text"]


# ---------------------------------------------------------------------- an overloaded model is retried, visibly
OVERLOADED = "litellm.ServiceUnavailableError: ServiceUnavailableError: OpenrouterException - Upstream error from Nvidia: Service temporarily overloaded"


def _model_env(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    monkeypatch.setattr(concierge, "RETRY_WAITS", (0.01, 0.01))


def test_overloaded_model_is_retried_and_the_user_can_watch(client, monkeypatch):
    _model_env(monkeypatch)
    calls = {"n": 0, "deleted": 0}
    real_delete = concierge._SESSIONS.delete_session

    async def flaky(rec, session_id, text, context, cards):
        calls["n"] += 1
        if calls["n"] < 3:
            raise RuntimeError(OVERLOADED)
        rec.brain("ConciergeAgent", "llm", model="m", output="Recovered answer.")
        return "Recovered answer."

    async def counting_delete(**kw):
        calls["deleted"] += 1
        return await real_delete(**kw)
    monkeypatch.setattr(concierge, "_run_model", flaky)
    monkeypatch.setattr(concierge._SESSIONS, "delete_session", counting_delete)
    _, t = ask(client, "Which products are low on stock?")
    assert t["mode"] == "llm" and t["status"] == "Completed" and t["answer"] == "Recovered answer." and not t["note"]
    warns = [e["text"] for e in t["brain"] if e["kind"] == "note" and e.get("level") == "warn"]
    assert len(warns) == 2 and "Retrying in 0.01s (attempt 2 of 3)" in warns[0] and "attempt 3 of 3" in warns[1]
    assert "Upstream error from Nvidia: Service temporarily overloaded" in warns[0] and "litellm." not in warns[0] and "ServiceUnavailableError" not in warns[0]
    assert calls == {"n": 3, "deleted": 2}  # the half-recorded attempt is dropped before each retry


def test_model_that_stays_overloaded_falls_back_after_all_attempts(client, monkeypatch):
    _model_env(monkeypatch)

    async def down(*a, **k):
        raise RuntimeError(OVERLOADED)
    monkeypatch.setattr(concierge, "_run_model", down)
    _, t = ask(client, "Which products are low on stock?")
    assert t["mode"] == "rules" and t["status"] == "Needs Review" and t["answer"] and t["cards"]
    assert t["note"].startswith("The model could not answer after 3 attempts (OpenrouterException - Upstream error from Nvidia: Service temporarily overloaded)")
    assert t["note"].endswith("the rule-based router answered instead.")
    assert sum(1 for e in t["brain"] if e["kind"] == "note" and e.get("level") == "warn") == 2


def test_permanent_errors_are_not_retried(client, monkeypatch):
    _model_env(monkeypatch)
    calls = {"n": 0}

    async def bad_token(*a, **k):
        calls["n"] += 1
        raise RuntimeError("AuthenticationError: Invalid API key")
    monkeypatch.setattr(concierge, "_run_model", bad_token)
    _, t = ask(client, "Which products are low on stock?")
    assert calls["n"] == 1 and t["mode"] == "rules" and "after" not in t["note"].split("(")[0] and "Invalid API key" in t["note"]
    assert not [e for e in t["brain"] if e.get("level") == "warn"]


def test_failure_message_helpers():
    assert concierge._friendly(RuntimeError(OVERLOADED)) == "OpenrouterException - Upstream error from Nvidia: Service temporarily overloaded"
    assert concierge._transient(RuntimeError(OVERLOADED)) and concierge._transient(RuntimeError("429 Too Many Requests"))
    assert not concierge._transient(RuntimeError("AuthenticationError: Invalid API key")) and not concierge._transient(__import__("asyncio").TimeoutError())
