import base64
import os

os.environ["LLM_MODE"] = "offline"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.db.database import init_db
from app.main import app

PNG = base64.b64encode(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64).decode()


@pytest.fixture()
def client():
    init_db("sqlite:///:memory:")
    with TestClient(app) as c:
        yield c


def new_product(**over):
    body = {"product_name": "Recycled Puffer Jacket", "description": "Warm, light and made with recycled fill for winter city days.",
            "category": "Women", "price_gbp": 64, "sizes": ["S", "M", "L"], "stock": {"S": 3, "M": 10, "L": 0},
            "target_age_segments": ["18-24", "25-34"], "target_gender_or_collection": "women", "style_tags": ["Streetwear", "casual"],
            "seasonal_collection": "Winter Edit", "colour": "Sage", "badges": ["New"], "status": "active",
            "product_image": "https://images.unsplash.com/photo-1?w=10"}
    body.update(over)
    return body


def test_seeded_catalogue_and_orders(client):
    s = client.get("/api/inventory/summary").json()
    assert s["counts"]["active"] == 73 and s["orders_30d"] > 0 and len(s["bestsellers"]) == 3
    assert len(s["daily"]) == 30 and s["units_in_stock"] > 0
    assert client.get("/api/orders", params={"page_size": 5}).json()["total"] >= 1000


def test_backoffice_product_flows_to_storefront_and_campaigns(client):
    r = client.post("/api/inventory/products", json=new_product())
    assert r.status_code == 201, r.text
    p = r.json()
    pid = p["product_id"]
    assert pid == "P061" and p["style_tags"] == ["streetwear", "casual"] and p["total_stock"] == 13
    assert "winter edit" in p["campaign_keywords"]
    store = client.get("/api/products", params={"page_size": 8}).json()["items"]
    assert store[0]["product_id"] == pid  # newest product leads the storefront's featured list
    detail = client.get(f"/api/products/{pid}").json()
    assert detail["stock"] == {"S": 3, "M": 10, "L": 0} and detail["low_sizes"] == ["S"] and detail["sold_out_sizes"] == ["L"]
    brief = client.post("/api/campaigns/parse-brief", json={"text": "UK women 18-24", "product_id": pid}).json()
    assert brief["brief"]["product_id"] == pid
    assert client.post("/api/campaigns", json={"brief": brief["brief"]}).status_code == 201
    moves = client.get(f"/api/inventory/products/{pid}").json()["movements"]
    assert {m["reason"] for m in moves} == {"Initial stock"}


def test_edit_draft_and_archive_visibility(client):
    pid = client.post("/api/inventory/products", json=new_product(status="draft")).json()["product_id"]
    assert client.get(f"/api/products/{pid}").status_code == 404
    assert any(i["product_id"] == pid for i in client.get("/api/inventory/products", params={"page_size": 100}).json()["items"])
    upd = client.put(f"/api/inventory/products/{pid}", json=new_product(status="active", price_gbp=59.5, stock={"S": 5, "M": 10, "L": 2})).json()
    assert upd["price_gbp"] == 59.5 and upd["status"] == "active"
    assert client.get(f"/api/products/{pid}").json()["price_gbp"] == 59.5
    moves = client.get(f"/api/inventory/products/{pid}").json()["movements"]
    assert {(m["size"], m["delta"]) for m in moves if m["reason"] == "Back-office edit"} == {("S", 2), ("L", 2)}
    assert client.delete(f"/api/inventory/products/{pid}").json()["status"] == "archived"
    assert client.get(f"/api/products/{pid}").status_code == 404
    assert all(i["product_id"] != pid for i in client.get("/api/products", params={"page_size": 100}).json()["items"])


@pytest.mark.parametrize("over", [{"category": "Shoes"}, {"stock": {"XXL": 2}}, {"product_image": "javascript:alert(1)"},
                                  {"price_gbp": 0}, {"sizes": []}, {"target_age_segments": ["90+"]}, {"badges": ["Free"]}])
def test_product_validation(client, over):
    assert client.post("/api/inventory/products", json=new_product(**over)).status_code == 422


def test_order_decrements_stock_and_is_atomic(client):
    pid = client.post("/api/inventory/products", json=new_product()).json()["product_id"]
    o = client.post("/api/orders", json={"lines": [{"product_id": pid, "size": "M", "qty": 2}, {"product_id": "P001", "size": "M", "qty": 1}]})
    assert o.status_code == 201 and o.json()["units"] == 3
    assert client.get(f"/api/products/{pid}").json()["stock"]["M"] == 8
    m = client.get("/api/inventory/movements", params={"product_id": pid}).json()["items"][0]
    assert (m["delta"], m["balance"], m["reason"], m["ref"]) == (-2, 8, "Storefront order", o.json()["order_id"])
    assert client.get("/api/orders", params={"channel": "storefront"}).json()["items"][0]["order_id"] == o.json()["order_id"]
    short = client.post("/api/orders", json={"lines": [{"product_id": pid, "size": "M", "qty": 1}, {"product_id": pid, "size": "S", "qty": 4}]})
    assert short.status_code == 409 and short.json()["items"][0] == {
        "product_id": pid, "size": "S", "requested": 4, "available": 3, "product_name": "Recycled Puffer Jacket", "reason": "insufficient stock"}
    assert client.get(f"/api/products/{pid}").json()["stock"]["M"] == 8  # nothing was taken from the valid line


def test_stock_adjustment(client):
    pid = client.post("/api/inventory/products", json=new_product()).json()["product_id"]
    assert client.post(f"/api/inventory/products/{pid}/stock", json={"size": "L", "delta": 12, "reason": "Restock"}).json()["stock"]["L"] == 12
    assert client.post(f"/api/inventory/products/{pid}/stock", json={"size": "S", "delta": -9}).status_code == 409
    assert client.post(f"/api/inventory/products/{pid}/stock", json={"size": "XL", "delta": 1}).status_code == 422


def test_uploads_are_type_checked(client, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    url = client.post("/api/uploads", json={"data": "data:image/png;base64," + PNG}).json()["url"]
    got = client.get(url)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.headers["x-content-type-options"] == "nosniff"
    svg = base64.b64encode(b"<svg onload='alert(1)'/>").decode()
    assert client.post("/api/uploads", json={"data": svg}).status_code == 422
    assert client.post("/api/uploads", json={"data": "not base64!"}).status_code == 422
    assert client.get("/api/uploads/..%2F..%2Fsecret.png").status_code == 404


def test_leaders_runs_and_health(client):
    pb = client.post("/api/campaigns/parse-brief", json={"text": "UK women 18-24 streetwear", "product_id": "P001"}).json()
    cid = client.post("/api/campaigns", json={"brief": pb["brief"], "name": "Hoodie drop"}).json()["campaign_id"]
    client.post(f"/api/campaigns/{cid}/match", json={"wait": True})
    res = client.get(f"/api/campaigns/{cid}/results", params={"limit": 5}).json()
    groups = {g["key"]: g for g in res["leaders"]}
    assert set(groups) == {"overall", "audience_fit", "promo_views", "engagement", "micro"}
    assert [i["rank"] for i in groups["overall"]["items"]] == [1, 2, 3]
    views = [i["value"] for i in groups["promo_views"]["items"]]
    assert views == sorted(views, reverse=True) and all(i["is_micro"] for i in groups["micro"]["items"])
    runs = client.get("/api/runs").json()["items"]
    assert runs[0]["campaign_id"] == cid and runs[0]["campaign_name"] == "Hoodie drop" and runs[0]["status"] == "Completed"
    ov = client.get("/api/overview").json()
    assert ov["latest_run"]["campaign_name"] == "Hoodie drop" and len(ov["latest_run"]["leaders"]) == 5 and ov["inventory"]["bestsellers"]
    h = client.get("/api/health").json()
    assert h["configured_model"] and h["provider_label"] and h["mode"] == "offline"


def test_rebrand_migrations(client, tmp_path, monkeypatch):
    from app import config
    from app.db.database import ProductRow, session
    from app.services.inventory import apply_rebrand
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "threadora.db").write_bytes(b"old-db")
    monkeypatch.setattr(config, "ROOT", tmp_path)
    assert config.default_database_path().read_bytes() == b"old-db"  # copied once, original kept
    assert (tmp_path / "data" / "threadora.db").exists()
    with session() as db:
        db.get(ProductRow, "P001").description = "From the THREADORA Street Edit collection."
        db.commit()
    apply_rebrand()
    assert client.get("/api/products/P001").json()["description"] == "From the Zylo Street Edit collection."
