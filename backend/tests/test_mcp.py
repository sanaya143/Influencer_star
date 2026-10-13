import asyncio
import os

os.environ["LLM_MODE"] = "offline"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient
from mcp.shared.memory import create_connected_server_and_client_session

from app.db.database import init_db
from app.main import app
from app.mcp_server import build_server

READ_TOOLS = {"list_products", "get_product", "inventory_summary", "stock_movements", "list_orders", "search_creators", "get_creator",
              "preview_matching", "list_campaigns", "get_campaign_results", "get_campaign_analytics", "explain_creator_in_campaign"}
WRITE_TOOLS = {"create_product", "adjust_stock", "set_product_status", "place_order"}


@pytest.fixture()
def api():
    init_db("sqlite:///:memory:")
    with TestClient(app) as c:
        yield c


def run(calls, writes=False):
    """Run [(tool, args), ...] against an in-memory MCP client/server pair and return the results."""
    async def go():
        async with create_connected_server_and_client_session(build_server(writes=writes)._mcp_server) as c:
            return [await c.call_tool(name, args) for name, args in calls]
    return asyncio.run(go())


def tools(writes):
    async def go():
        async with create_connected_server_and_client_session(build_server(writes=writes)._mcp_server) as c:
            return {t.name: t for t in (await c.list_tools()).tools}
    return asyncio.run(go())


def test_tool_surface_and_write_gate(api):
    ro = tools(False)
    assert set(ro) == READ_TOOLS and all(t.annotations.readOnlyHint for t in ro.values())
    rw = tools(True)
    assert set(rw) == READ_TOOLS | WRITE_TOOLS
    assert all(not rw[n].annotations.readOnlyHint for n in WRITE_TOOLS)
    assert rw["set_product_status"].annotations.destructiveHint


def test_inventory_tools(api):
    ls, one, summ, mv = run([("list_products", {"category": "Kids", "page_size": 5}), ("get_product", {"product_id": "P001"}),
                             ("inventory_summary", {}), ("stock_movements", {"limit": 3})])
    sc = ls.structuredContent
    assert sc["total"] > 0 and len(sc["items"]) <= 5 and all(p["category"] == "Kids" for p in sc["items"]) and "description" not in sc["items"][0]
    assert one.structuredContent["product_id"] == "P001" and "movements" in one.structuredContent
    assert summ.structuredContent["counts"]["active"] == 60 and "daily" not in summ.structuredContent
    assert "items" in mv.structuredContent
    (missing,) = run([("get_product", {"product_id": "NOPE"})])
    assert missing.isError and "not found" in missing.content[0].text


def test_creator_and_matching_tools_are_deterministic(api):
    (found, one) = run([("search_creators", {"platform": "TikTok", "min_followers": 10000, "page_size": 3}), ("get_creator", {"influencer_id": "I0001"})])
    assert found.structuredContent["total"] > 0 and all(c["platform"] == "TikTok" for c in found.structuredContent["items"])
    assert one.structuredContent["influencer_id"] == "I0001" and "audience_age_distribution" in one.structuredContent
    args = {"product_id": "P001", "target_age_segments": ["18-24"], "target": "women", "top_n": 5}
    a, b = run([("preview_matching", args), ("preview_matching", args)])
    ta = a.structuredContent
    assert ta == b.structuredContent and len(ta["top"]) == 5 and ta["stats"]["retrieved"] >= 1000
    assert [m["rank"] for m in ta["top"]] == [1, 2, 3, 4, 5] and ta["top"][0]["overall_score"] >= ta["top"][-1]["overall_score"]
    assert ta["exclusion_reason_counts"] and "Preview only" in ta["note"]
    # nothing was saved by a preview
    assert api.get("/api/campaigns").json()["items"] == []
    (bad,) = run([("preview_matching", {"product_id": "NOPE"})])
    assert bad.isError


def test_saved_campaign_tools(api):
    pb = api.post("/api/campaigns/parse-brief", json={"text": "UK women 18-24 streetwear", "product_id": "P001"}).json()
    cid = api.post("/api/campaigns", json={"brief": pb["brief"], "name": "MCP campaign"}).json()["campaign_id"]
    api.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    top = api.get(f"/api/campaigns/{cid}/results").json()["ranked"][0]["influencer_id"]
    lst, res, ana, why = run([("list_campaigns", {}), ("get_campaign_results", {"campaign_id": cid, "top_n": 3}),
                              ("get_campaign_analytics", {"campaign_id": cid}), ("explain_creator_in_campaign", {"campaign_id": cid, "influencer_id": top})])
    assert lst.structuredContent["items"][0]["name"] == "MCP campaign"
    r = res.structuredContent
    assert len(r["top"]) == 3 and r["top"][0]["influencer_id"] == top and {g["key"] for g in r["leaders"]} >= {"overall", "micro"}
    assert "scatter" not in ana.structuredContent and ana.structuredContent["funnel"][0]["count"] >= 1000
    assert why.structuredContent["ranked_as"]["rank"] == 1 and why.structuredContent["excluded_as"] is None
    (nope,) = run([("get_campaign_results", {"campaign_id": "cmp_missing"})])
    assert nope.isError and "not found" in nope.content[0].text


def test_write_tools(api):
    created, = run([("create_product", {"product": {
        "product_name": "MCP Test Gilet", "description": "A quilted gilet created through MCP.", "category": "Women", "price_gbp": 40,
        "sizes": ["S", "M"], "stock": {"S": 2, "M": 5}, "target_age_segments": ["18-24"], "target_gender_or_collection": "women", "status": "draft"}})], writes=True)
    pid = created.structuredContent["product_id"]
    assert pid == "P061" and created.structuredContent["status"] == "draft"
    assert api.get(f"/api/products/{pid}").status_code == 404  # drafts stay out of the storefront
    up, down, nope = run([("adjust_stock", {"product_id": pid, "size": "S", "delta": 3, "reason": "Delivery"}),
                          ("adjust_stock", {"product_id": pid, "size": "S", "delta": -99}), ("adjust_stock", {"product_id": pid, "size": "XL", "delta": 1})], writes=True)
    assert up.structuredContent["stock"]["S"] == 5 and down.isError and "Only 5" in down.content[0].text and nope.isError
    live, = run([("set_product_status", {"product_id": pid, "status": "active"})], writes=True)
    assert live.structuredContent["status"] == "active" and api.get(f"/api/products/{pid}").json()["stock"]["S"] == 5
    ok, short = run([("place_order", {"lines": [{"product_id": pid, "size": "M", "qty": 2}]}),
                     ("place_order", {"lines": [{"product_id": pid, "size": "M", "qty": 1}, {"product_id": pid, "size": "S", "qty": 50}]})], writes=True)
    assert ok.structuredContent["units"] == 2 and short.isError
    assert api.get(f"/api/products/{pid}").json()["stock"] == {"S": 5, "M": 3}  # the failed order took nothing


def test_methodology_resource_and_prompt(api):
    async def go():
        async with create_connected_server_and_client_session(build_server()._mcp_server) as c:
            doc = await c.read_resource("zylo://methodology")
            prompt = await c.get_prompt("plan_influencer_campaign", {"product_id": "P001"})
            return doc.contents[0].text, prompt.messages[0].content.text
    doc, prompt = asyncio.run(go())
    assert "never scores" in doc and "1,000 followers" in doc and "P001" in prompt and "synthetic" in prompt


# ---------------------------------------------------------------------- the HTTP endpoint inside the API process
HDRS = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}


def rpc(c, method, params=None, id_=1, headers=None):
    body = {"jsonrpc": "2.0", "method": method, **({"params": params} if params is not None else {}), **({"id": id_} if id_ is not None else {})}
    return c.post("/mcp", json=body, headers={**HDRS, **(headers or {})})


def handshake(c, extra=None):
    r = rpc(c, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "pytest", "version": "1"}}, headers=extra)
    assert r.status_code == 200, r.text
    sid = r.headers["mcp-session-id"]
    h = {**(extra or {}), "mcp-session-id": sid, "mcp-protocol-version": "2025-06-18"}
    assert rpc(c, "notifications/initialized", id_=None, headers=h).status_code in (200, 202)
    return r.json()["result"], h


def test_http_endpoint_open_is_read_only(monkeypatch):
    monkeypatch.delenv("ZYLO_MCP_TOKEN", raising=False)
    monkeypatch.setenv("ZYLO_MCP_WRITES", "1")  # requested, but no token: must stay disabled
    init_db("sqlite:///:memory:")
    with TestClient(app, base_url="http://localhost:8000") as c:
        info, h = handshake(c)
        assert info["serverInfo"]["name"] == "zylo" and "SYNTHETIC" in info["instructions"]
        names = {t["name"] for t in rpc(c, "tools/list", id_=2, headers=h).json()["result"]["tools"]}
        assert names == READ_TOOLS
        call = rpc(c, "tools/call", {"name": "get_product", "arguments": {"product_id": "P001"}}, id_=3, headers=h).json()["result"]
        assert call["structuredContent"]["product_id"] == "P001"
        assert c.get("/api/health").status_code == 200  # the REST API is unaffected


def test_http_endpoint_token_and_writes(monkeypatch):
    monkeypatch.setenv("ZYLO_MCP_TOKEN", "s3cret-token")
    monkeypatch.setenv("ZYLO_MCP_WRITES", "1")
    init_db("sqlite:///:memory:")
    with TestClient(app, base_url="http://localhost:8000") as c:
        assert rpc(c, "initialize", {}).status_code == 401
        assert rpc(c, "initialize", {}, headers={"Authorization": "Bearer wrong"}).status_code == 401
        _, h = handshake(c, {"Authorization": "Bearer s3cret-token"})
        names = {t["name"] for t in rpc(c, "tools/list", id_=2, headers=h).json()["result"]["tools"]}
        assert names == READ_TOOLS | WRITE_TOOLS


def test_http_rejects_foreign_host_header(monkeypatch):
    monkeypatch.delenv("ZYLO_MCP_TOKEN", raising=False)
    init_db("sqlite:///:memory:")
    with TestClient(app, base_url="http://evil.example") as c:  # DNS-rebinding protection
        assert rpc(c, "initialize", {}).status_code in (400, 403, 421)


def test_browser_gets_a_status_page_but_clients_still_work(monkeypatch):
    monkeypatch.delenv("ZYLO_MCP_TOKEN", raising=False)
    monkeypatch.delenv("ZYLO_MCP_WRITES", raising=False)
    init_db("sqlite:///:memory:")
    with TestClient(app, base_url="http://localhost:8000") as c:
        page = c.get("/mcp", headers={"Accept": "text/html,application/xhtml+xml"})
        assert page.status_code == 200 and "text/html" in page.headers["content-type"]
        assert "Zylo MCP server" in page.text and "preview_matching" in page.text and "claude mcp add --transport http zylo http://localhost:8000/mcp" in page.text
        assert "adjust_stock" not in page.text  # write tools are not offered
        assert handshake(c)[0]["serverInfo"]["name"] == "zylo"  # protocol traffic is untouched


# ---------------------------------------------------------------------- MCP activity log
def test_activity_log_records_calls_with_outcomes(api):
    assert api.get("/api/mcp/calls").json()["items"] == []
    run([("list_products", {"category": "Kids", "page_size": 2}), ("get_product", {"product_id": "NOPE"}),
         ("preview_matching", {"product_id": "P001", "top_n": 3})])
    run([("adjust_stock", {"product_id": "P001", "size": "M", "delta": 2, "reason": "log test"}), ("adjust_stock", {"product_id": "P001", "size": "M", "delta": -9999})], writes=True)
    d = api.get("/api/mcp/calls").json()
    by_name = {}
    for c in d["items"]:
        by_name.setdefault(c["name"], []).append(c)
    assert [c["name"] for c in d["items"]][:2] == ["adjust_stock", "adjust_stock"]  # newest first
    ok_list = by_name["list_products"][0]
    assert ok_list["status"] == "ok" and ok_list["kind"] == "tool" and ok_list["result_hint"].endswith("results") and '"category": "Kids"' in ok_list["args"]
    assert ok_list["client"] and ok_list["transport"] == "memory" and ok_list["duration_ms"] >= 0
    missing = by_name["get_product"][0]
    assert missing["status"] == "error" and "not found" in missing["error"]
    assert "ranked of" in by_name["preview_matching"][0]["result_hint"]
    good, bad = sorted(by_name["adjust_stock"], key=lambda c: c["id"])
    assert good["status"] == "ok" and good["changes_data"] is True and bad["status"] == "error" and bad["changes_data"] is False
    s = d["summary"]
    assert s["total"] == 5 and s["errors"] == 2 and s["changes"] == 1 and s["top_tools"][0] == {"name": "adjust_stock", "count": 2}
    # filters and polling
    assert {c["name"] for c in api.get("/api/mcp/calls", params={"status": "error"}).json()["items"]} == {"get_product", "adjust_stock"}
    assert [c["name"] for c in api.get("/api/mcp/calls", params={"changes_only": True}).json()["items"]] == ["adjust_stock"]
    newest = d["items"][0]["id"]
    assert api.get("/api/mcp/calls", params={"after_id": newest}).json()["items"] == []
    run([("inventory_summary", {})])
    assert [c["name"] for c in api.get("/api/mcp/calls", params={"after_id": newest}).json()["items"]] == ["inventory_summary"]


def test_activity_log_covers_resources_and_prompts_and_masks_secrets(api):
    async def go():
        async with create_connected_server_and_client_session(build_server()._mcp_server) as c:
            await c.read_resource("zylo://methodology")
            await c.get_prompt("plan_influencer_campaign", {"product_id": "P001"})
    asyncio.run(go())
    kinds = {(c["kind"], c["name"]) for c in api.get("/api/mcp/calls").json()["items"]}
    assert ("resource", "zylo://methodology") in kinds and ("prompt", "plan_influencer_campaign") in kinds
    from app.services.mcp_log import summarize_args
    out = summarize_args({"product_id": "P001", "api_key": "sk-live-12345", "authorization": "Bearer abc", "note": "x" * 900})
    assert "sk-live-12345" not in out and "Bearer abc" not in out and "[REDACTED]" in out and len(out) <= 300


def test_logging_failure_never_breaks_a_tool_call(api, monkeypatch):
    from app.services import mcp_log

    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(mcp_log, "session", boom)
    (res,) = run([("get_product", {"product_id": "P001"})])
    assert not res.isError and res.structuredContent["product_id"] == "P001"


def test_http_calls_are_logged_with_client_and_transport(monkeypatch):
    monkeypatch.delenv("ZYLO_MCP_TOKEN", raising=False)
    monkeypatch.delenv("ZYLO_MCP_WRITES", raising=False)
    init_db("sqlite:///:memory:")
    with TestClient(app, base_url="http://localhost:8000") as c:
        _, h = handshake(c)
        rpc(c, "tools/call", {"name": "get_product", "arguments": {"product_id": "P002"}}, id_=5, headers=h)
        d = c.get("/api/mcp/calls").json()
        assert d["items"][0]["name"] == "get_product" and d["items"][0]["transport"] == "http" and d["items"][0]["client"] == "pytest 1"
        assert d["server"] == {"running": True, "writes": False, "token_required": False, "tools": 12, "endpoint": "/mcp"}
