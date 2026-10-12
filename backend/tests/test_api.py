import os

os.environ["LLM_MODE"] = "offline"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.db.database import init_db
from app.main import app


@pytest.fixture(scope="module")
def client():
    init_db("sqlite:///:memory:")
    with TestClient(app) as c:
        yield c


def make_campaign(client, **brief_over):
    pb = client.post("/api/campaigns/parse-brief", json={"text": "UK women aged 18-24 streetwear, micro-influencers", "product_id": "P001"}).json()
    assert pb["brief"] and pb["status"] == "Completed"
    brief = pb["brief"]
    brief.update(brief_over)
    c = client.post("/api/campaigns", json={"brief": brief, "brief_run_id": pb["run_id"]})
    assert c.status_code == 201
    return c.json()["campaign_id"]


def test_health_and_products(client):
    assert client.get("/api/health").json()["status"] == "ok"
    p = client.get("/api/products", params={"category": "Kids"}).json()
    assert p["total"] > 0 and all(i["category"] == "Kids" for i in p["items"])
    assert client.get("/api/products/NOPE").status_code == 404


def test_mock_influencers_pagination_and_filter(client):
    r = client.get("/api/mock/influencers", params={"page": 2, "page_size": 10, "min_followers": 10000}).json()
    assert r["page"] == 2 and len(r["items"]) <= 10
    assert all((i["follower_count"] or 0) >= 10000 for i in r["items"])
    assert client.get("/api/mock/influencers/I0001").status_code == 200


def test_full_workflow(client):
    cid = make_campaign(client)
    r = client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    assert r.status_code == 202 and r.json()["status"] == "Completed"
    res = client.get(f"/api/campaigns/{cid}/results").json()
    st = res["stats"]
    assert st["retrieved"] == 300 and st["ranked"] == len(res["ranked"]) > 0
    assert st["eligible"] >= st["passed_l2"] >= st["ranked"]
    assert res["insights"]["summary"]
    ex = client.get(f"/api/campaigns/{cid}/excluded").json()
    assert ex["total"] == st["excluded_l1"] + st["review_required"] + st["excluded_l2"]
    assert all(e["reasons"] for e in ex["items"])
    tr = client.get(f"/api/runs/{res['run_id']}/trace").json()
    assert [a["id"] for a in tr["agents"]] == ["CampaignBriefAgent", "MatchingCoordinatorAgent", "CampaignInsightsAgent"]
    assert any(t["name"] == "level1_eligibility_filter" for a in tr["agents"] for t in a["tools"])
    us = client.get(f"/api/runs/{res['run_id']}/usage").json()
    assert us["mode"] == "offline" and us["total_tokens"] == 0
    an = client.get(f"/api/campaigns/{cid}/analytics").json()
    assert [f["count"] for f in an["funnel"]] == [st["retrieved"], st["eligible"], st["passed_l2"], st["ranked"]]
    assert an["estimate"]["label"] == "ESTIMATE"
    assert client.get(f"/api/campaigns/{cid}/export", params={"format": "csv"}).text.startswith("rank,")
    assert client.get(f"/api/campaigns/{cid}/export", params={"format": "json"}).json()["ranked"]


def test_threshold_change_reruns_backend(client):
    cid = make_campaign(client)
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    a = client.get(f"/api/campaigns/{cid}/results").json()["stats"]["eligible"]
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True, "filters": {"min_followers": 50000, "min_promo_views": 2000}})
    b = client.get(f"/api/campaigns/{cid}/results").json()["stats"]["eligible"]
    assert b < a


def test_zero_results_state(client):
    cid = make_campaign(client)
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True, "filters": {"min_followers": 99_000_000}})
    res = client.get(f"/api/campaigns/{cid}/results").json()
    assert res["ranked"] == [] and res["stats"]["warnings"]
    assert res["insights"]["recommendation"]


def test_results_before_run_404(client):
    cid = make_campaign(client)
    assert client.get(f"/api/campaigns/{cid}/results").status_code == 404


def test_ambiguous_brief_needs_review(client):
    pb = client.post("/api/campaigns/parse-brief", json={"text": "find influencers for streetwear"}).json()
    assert pb["status"] == "Needs Review" and pb["needs_clarification"] and pb["brief"] is None


def test_deterministic_results_across_runs(client):
    a, b = make_campaign(client), make_campaign(client)
    for c in (a, b):
        client.post(f"/api/campaigns/{c}/match", json={"wait": True})
    ra = [m["influencer_id"] for m in client.get(f"/api/campaigns/{a}/results").json()["ranked"]]
    rb = [m["influencer_id"] for m in client.get(f"/api/campaigns/{b}/results").json()["ranked"]]
    assert ra == rb
