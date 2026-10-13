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
    assert pb["brief"] and pb["status"] == "Completed" and pb["interpreted_by"] == "rules"
    brief = pb["brief"]
    brief.update(brief_over)
    c = client.post("/api/campaigns", json={"brief": brief})
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
    res = client.get(f"/api/campaigns/{cid}/results", params={"limit": 2000}).json()
    st = res["stats"]
    assert st["retrieved"] == client.get("/api/health").json()["influencers"] >= 1000
    assert st["ranked"] == len(res["ranked"]) > 0
    assert st["eligible"] >= st["passed_l2"] >= st["ranked"]
    assert res["insights"]["summary"]
    ex = client.get(f"/api/campaigns/{cid}/excluded").json()
    assert ex["total"] == st["excluded_l1"] + st["review_required"] + st["excluded_l2"]
    assert all(e["reasons"] for e in ex["items"])
    tr = client.get(f"/api/runs/{res['run_id']}/trace").json()
    assert [a["id"] for a in tr["agents"]] == ["MatchingCoordinatorAgent", "CampaignInsightsAgent"]
    assert any(t["name"] == "roi_planner" for a in tr["agents"] for t in a["tools"])
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


def test_collections_api_and_campaign(client):
    cols = client.get("/api/collections").json()["items"]
    ids = {c["collection_id"] for c in cols}
    assert {"COL-MARVEL-DC", "COL-DISNEY", "COL-SUMMER-SALE", "COL-WINTER"} <= ids
    marvel = next(c for c in cols if c["collection_id"] == "COL-MARVEL-DC")
    assert marvel["products"] and marvel["creators_with_themes"] > 0 and "marvel" in marvel["content_themes"]
    # the licensed products exist in the shop
    assert client.get("/api/products/P101").json()["product_name"] == "Marvel Avengers Graphic Tee"
    pb = client.post("/api/campaigns/parse-brief", json={"text": "", "collection_id": "COL-WINTER"}).json()
    assert pb["target_kind"] == "collection" and pb["brief"]["content_themes"]
    cid = client.post("/api/campaigns", json={"brief": pb["brief"]}).json()["campaign_id"]
    assert client.post(f"/api/campaigns/{cid}/match", json={"wait": True}).json()["status"] == "Completed"
    res = client.get(f"/api/campaigns/{cid}/results").json()
    assert res["ranked"] and all(m["matched_themes"] for m in res["ranked"])
    assert client.get("/api/collections/COL-NOPE").status_code == 404
    made = client.post("/api/collections", json={"collection_id": "festival edit", "name": "Festival Edit", "content_themes": ["festival", "music"],
                                                 "product_ids": ["P048"], "target": "unisex", "target_age_segments": ["18-24"]})
    assert made.status_code == 201 and made.json()["collection_id"] == "COL-FESTIVAL-EDIT"


def test_roi_plan_respects_budget_and_beats_biggest_accounts(client):
    cid = make_campaign(client, budget_gbp=4000)
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    r = client.get(f"/api/campaigns/{cid}/roi").json()
    assert r["budget_gbp"] == 4000 and 0 < r["plan"]["summary"]["spend_gbp"] <= 4000
    assert r["baseline"]["summary"]["spend_gbp"] <= 4000 and r["assumptions"] and r["label"].startswith("ESTIMATE")
    assert all(x["fee_gbp"] > 0 and x["cpm_gbp"] > 0 for x in r["rates"])
    assert any(x["value_flag"] for x in r["rates"]) and r["benchmarks"]
    big = client.get(f"/api/campaigns/{cid}/roi", params={"budget": 20000}).json()
    assert big["plan"]["summary"]["spend_gbp"] >= r["plan"]["summary"]["spend_gbp"]
    detail = client.get(f"/api/campaigns/{cid}/results/{r['plan']['creators'][0]['influencer_id']}").json()
    assert detail["economics"]["fee_gbp"] == r["plan"]["creators"][0]["fee_gbp"]


def test_usage_summary_and_model_prices(client):
    u = client.get("/api/usage/summary", params={"days": 7}).json()
    assert u["period_days"] == 7 and "totals" in u and u["totals"]["total_tokens"] >= 0
    pr = client.get("/api/settings/prices").json()
    mini = next(x for x in pr["prices"] if x["model"] == "gpt-4o-mini")
    assert mini["price"]["input"] == 0.15
    free = next(x for x in pr["prices"] if x["model"].endswith(":free"))
    assert free["price"]["input"] == 0
    after = client.put("/api/settings/prices", json={"model": "my-model", "input_per_m": 1.5, "output_per_m": 3}).json()
    assert next(x for x in after["prices"] if x["model"] == "my-model")["price"]["source"] == "saved in Settings"
    from app.services.usage import cost
    assert cost("my-model", 1_000_000, 1_000_000) == 4.5
    client.put("/api/settings/prices", json={"model": "my-model"})
    assert cost("my-model", 10, 10) is None


def test_external_data_setting(client):
    v = client.get("/api/settings/external-data").json()
    assert v["transport"] == "stdio" and "enabled" in v
    assert client.put("/api/settings/external-data", json={"enabled": False}).json()["enabled"] is False
