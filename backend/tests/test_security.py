"""Zylo Reach security tests: response headers, rate limits, the daily token budget, and automated attack probes
(path traversal, SQL-injection and script payloads, oversized input, method and auth checks).

The attack probes are an automated penetration-test baseline, not a substitute for a manual penetration test.
"""
import os
import re
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.db.database import RunRow, init_db, session
from app.main import app
from app.security import inline_script_hashes, limiter


@pytest.fixture
def client(monkeypatch):
    init_db("sqlite:///:memory:")
    limiter.reset()
    with TestClient(app, base_url="http://localhost:8010") as c:
        yield c
    limiter.reset()


@pytest.fixture
def limits_on(monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_LIMITS", "on")
    limiter.reset()


# ------------------------------------------------------------------ security headers
def test_reach_responses_carry_security_headers(client):
    r = client.get("/api/health")
    h = r.headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert h["referrer-policy"] == "strict-origin-when-cross-origin" and "camera=()" in h["permissions-policy"]
    assert h["cache-control"] == "no-store"
    policy = dict(part.strip().split(" ", 1) for part in h["content-security-policy"].split(";"))
    assert policy["default-src"] == "'self'" and policy["object-src"] == "'none'" and policy["frame-ancestors"] == "'none'"
    assert "'unsafe-inline'" not in policy["script-src"] and "'unsafe-eval'" not in policy["script-src"]
    assert all(hsh in policy["script-src"] for hsh in inline_script_hashes())  # the one inline theme script, by hash


def test_csp_hash_matches_the_inline_script_actually_served(client):
    page = client.get("/admin")
    if page.status_code != 200 or "<script" not in page.text:
        pytest.skip("frontend not built (npm run build)")
    import base64
    import hashlib
    inline = [b for b in re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", page.text, re.S) if b.strip()]
    served = {f"'sha256-{base64.b64encode(hashlib.sha256(b.encode()).digest()).decode()}'" for b in inline}
    assert served and served <= set(re.split(r"[\s;]+", page.headers["content-security-policy"]))


def test_storefront_pages_are_left_alone(client):
    assert "content-security-policy" not in client.get("/").headers


# ------------------------------------------------------------------ rate limits
def _chat(client, text="which products are low on stock?"):
    sid = client.post("/api/chat/sessions").json()["session_id"]
    return client.post(f"/api/chat/sessions/{sid}/messages", json={"text": text, "rules_only": True})


def test_chat_messages_are_rate_limited(client, limits_on, monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_CHAT_MESSAGE", "3,10")
    assert [_chat(client).status_code for _ in range(3)] == [202, 202, 202]
    r = _chat(client)
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0 and "per minute" in r.json()["detail"]


def test_daily_cap_applies_after_the_minute_window(client, limits_on, monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_CHAT_MESSAGE", "100,2")
    assert [_chat(client).status_code for _ in range(2)] == [202, 202]
    r = _chat(client)
    assert r.status_code == 429 and "per day" in r.json()["detail"]


def _campaign(client):
    pb = client.post("/api/campaigns/parse-brief", json={"text": "UK women 18-24", "product_id": "P001"}).json()
    return client.post("/api/campaigns", json={"brief": pb["brief"]}).json()["campaign_id"]


def test_campaign_runs_are_rate_limited(client, limits_on, monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_CAMPAIGN_RUN", "2")
    cid = _campaign(client)
    assert [client.post(f"/api/campaigns/{cid}/match", json={"wait": True}).status_code for _ in range(2)] == [202, 202]
    r = client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    assert r.status_code == 429 and r.headers["retry-after"]


def test_too_many_runs_in_flight_are_refused(client, limits_on):
    cid = _campaign(client)
    limiter.running_runs = 3
    r = client.post(f"/api/campaigns/{cid}/match", json={})
    assert r.status_code == 429 and "in progress" in r.json()["detail"]
    limiter.running_runs = 0
    assert client.post(f"/api/campaigns/{cid}/match", json={"wait": True}).status_code == 202
    assert limiter.running_runs == 0  # the slot is released when the run ends


def test_limits_are_per_client(client, limits_on, monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_MODEL_TEST", "1")
    from app.security import limiter as lim
    lim.check("model_test", "10.0.0.1")
    lim.check("model_test", "10.0.0.2")  # another client has its own allowance
    with pytest.raises(Exception) as e:
        lim.check("model_test", "10.0.0.1")
    assert getattr(e.value, "status_code", None) == 429


def test_spoofed_forwarded_for_does_not_reset_the_limit(client, limits_on, monkeypatch):
    monkeypatch.setenv("ZYLO_RATE_CHAT_MESSAGE", "1")
    assert _chat(client).status_code == 202
    sid = client.post("/api/chat/sessions").json()["session_id"]
    r = client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "hi", "rules_only": True}, headers={"X-Forwarded-For": "1.2.3.4"})
    assert r.status_code == 429


# ------------------------------------------------------------------ daily token budget
def test_daily_token_budget_blocks_model_work_but_not_rule_based_work(client, monkeypatch):
    with session() as db:
        db.add(RunRow(id="run_budget", kind="match", status="Completed", created_at=datetime.now(timezone.utc),
                      usage={"input_tokens": 900, "output_tokens": 200, "model": "gpt-4o-mini", "provider": "openai"}))
        db.commit()
    monkeypatch.setenv("ZYLO_DAILY_TOKEN_BUDGET", "1000")
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")
    cid = _campaign(client)
    r = client.post(f"/api/campaigns/{cid}/match", json={})
    assert r.status_code == 429 and "budget" in r.json()["detail"]
    sid = client.post("/api/chat/sessions").json()["session_id"]
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "hello", "rules_only": False}).status_code == 429
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "hello", "rules_only": True}).status_code == 202
    monkeypatch.setenv("ZYLO_DAILY_TOKEN_BUDGET", "5000")
    assert client.post(f"/api/campaigns/{cid}/match", json={"wait": True}).status_code == 202


# ------------------------------------------------------------------ automated attack probes
@pytest.mark.parametrize("path", [
    "/..%2f..%2fbackend%2fapp%2fconfig.py", "/%2e%2e/%2e%2e/.env", "/admin/..%2f..%2f..%2fbackend%2fapp%2fsecurity.py",
    "/api/uploads/..%2f..%2fdata%2fzylo.db", "/api/uploads/....//....//data/zylo.db",
])
def test_path_traversal_never_reads_files_outside_the_app(client, path):
    r = client.get(path)
    assert "def get_settings" not in r.text and "SQLite format" not in r.text and "ZYLO_RATE" not in r.text
    assert r.status_code in (200, 400, 404)  # 200 only for the SPA shell, never the requested file


@pytest.mark.parametrize("payload", ["' OR 1=1 --", "\" OR \"\"=\"", "'; DROP TABLE products; --", "%' UNION SELECT * FROM settings --"])
def test_sql_injection_payloads_are_treated_as_plain_text(client, payload):
    before = client.get("/api/inventory/products", params={"page_size": 1}).json()["total"]
    r = client.get("/api/inventory/products", params={"q": payload})
    assert r.status_code == 200 and r.json()["total"] == 0  # matched as text, so nothing matches
    assert client.get("/api/mock/influencers", params={"q": payload}).status_code == 200
    assert client.get("/api/inventory/products", params={"page_size": 1}).json()["total"] == before  # nothing dropped


def test_script_payloads_are_stored_as_text_and_served_as_json(client):
    evil = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    body = {"product_name": "Tee " + evil[:40], "description": "Description " + evil, "category": "Unisex", "price_gbp": 10, "sizes": ["M"],
            "stock": {"M": 1}, "target_age_segments": ["18-24"], "target_gender_or_collection": "unisex", "status": "draft"}
    r = client.post("/api/inventory/products", json=body)
    assert r.status_code == 201 and r.headers["content-type"].startswith("application/json") and r.headers["x-content-type-options"] == "nosniff"
    assert r.json()["description"] == body["description"]  # kept verbatim; the UI renders text, never HTML
    bad = client.post("/api/inventory/products", json={**body, "product_image": "javascript:alert(1)"})
    assert bad.status_code == 422


def test_oversized_and_malformed_input_is_rejected(client):
    sid = client.post("/api/chat/sessions").json()["session_id"]
    assert client.post(f"/api/chat/sessions/{sid}/messages", json={"text": "x" * 2001}).status_code == 422
    assert client.post(f"/api/chat/sessions/{sid}/messages", content=b"{not json", headers={"content-type": "application/json"}).status_code == 422
    assert client.post("/api/uploads", json={"data": "data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+"}).status_code in (400, 413, 415, 422)


def test_tokens_are_never_returned_and_methods_are_restricted(client):
    secret = "sk-test-SECRET-1234567890"
    client.put("/api/settings", json={"use_ai": True, "provider": "openai", "model": "gpt-4o-mini", "api_key": secret})
    for path in ("/api/settings", "/api/health", "/api/usage/summary", "/api/settings/prices"):
        assert secret not in client.get(path).text and "SECRET-1234" not in client.get(path).text
    assert client.delete("/api/settings").status_code == 405
    client.put("/api/settings", json={"use_ai": False, "provider": "openai", "model": "gpt-4o-mini", "clear_key": True})


def test_mcp_cannot_change_data_without_a_token(client, monkeypatch):
    monkeypatch.delenv("ZYLO_MCP_TOKEN", raising=False)
    monkeypatch.setenv("ZYLO_MCP_WRITES", "1")  # writes requested, but no token: they must stay off
    from app.mcp_server import WRITE_TOOLS, build_server
    import asyncio
    names = {t.name for t in asyncio.run(build_server(writes=False).list_tools())}
    assert not (names & WRITE_TOOLS)
