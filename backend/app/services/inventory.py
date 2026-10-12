"""Product inventory. The back office writes here; the storefront, the orders API and the influencer-matching
engine all read from here, so a product saved in the back office is immediately live everywhere."""
from __future__ import annotations

import re
import threading
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..config import get_settings
from ..data.seed_generator import load_seed_orders, load_seed_products
from ..db.database import OrderRow, ProductRow, StockMovementRow, now, session
from ..schemas.models import OrderIn, Product, ProductIn, StockAdjust

LOW_STOCK = 5  # units per size at or below which a size counts as "low"
LOW_TOTAL = 20  # total units at or below which a product counts as "low stock"
_write_lock = threading.Lock()  # serialises stock read-modify-write within this process (SQLite MVP)


class InventoryError(Exception):
    def __init__(self, status: int, message: str, detail: list | None = None):
        super().__init__(message)
        self.status, self.message, self.detail = status, message, detail or []


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ------------------------------------------------------------------ seeding
def seed_if_empty() -> None:
    """First start: load the synthetic catalogue and order history into the database."""
    with session() as db:
        if db.query(ProductRow).first() is not None:
            return
        seed_dir = Path(get_settings().seed_dir)
        products = load_seed_products(seed_dir)
        t = now()
        for p in products:
            db.add(ProductRow(**p.model_dump(), created_at=t - timedelta(days=120), updated_at=t - timedelta(days=120)))
        if db.query(OrderRow).first() is None:
            names = {p.product_id: p.product_name for p in products}
            for o in load_seed_orders(seed_dir):
                lines = [{**ln, "product_name": names.get(ln["product_id"], ln["product_id"])} for ln in o["lines"] if ln["product_id"] in names]
                if not lines:
                    continue
                db.add(OrderRow(id=o["order_id"], customer_name=o["customer_name"], channel="seed",
                                status="fulfilled" if o["days_ago"] > 2 else "paid", lines=lines,
                                units=sum(ln["qty"] for ln in lines), total_gbp=round(sum(ln["qty"] * ln["unit_price"] for ln in lines), 2),
                                created_at=t - timedelta(days=o["days_ago"])))
        db.commit()


# ------------------------------------------------------------------ read helpers
def _product(r: ProductRow) -> Product:
    return Product(product_id=r.product_id, product_name=r.product_name, description=r.description, category=r.category,
                   price_gbp=r.price_gbp, sizes=list(r.sizes), target_age_segments=list(r.target_age_segments),
                   target_gender_or_collection=r.target_gender_or_collection, style_tags=list(r.style_tags),
                   target_region=r.target_region, campaign_keywords=list(r.campaign_keywords), product_image=r.product_image,
                   seasonal_collection=r.seasonal_collection, badges=list(r.badges), colour=r.colour,
                   stock={k: int(v) for k, v in (r.stock or {}).items()}, status=r.status)


def stock_state(stock: dict[str, int]) -> str:
    total = sum(stock.values())
    return "out" if total == 0 else "low" if total <= LOW_TOTAL else "in_stock"


def _view(r: ProductRow, sold: dict[str, int] | None = None) -> dict:
    p = _product(r).model_dump()
    total = sum(p["stock"].values())
    p.update(total_stock=total, stock_state=stock_state(p["stock"]),
             low_sizes=[s for s, v in p["stock"].items() if 0 < v <= LOW_STOCK],
             sold_out_sizes=[s for s, v in p["stock"].items() if v == 0],
             units_sold_30d=(sold or {}).get(r.product_id, 0),
             created_at=_aware(r.created_at).isoformat(), updated_at=_aware(r.updated_at).isoformat())
    return p


def units_sold(days: int = 30) -> dict[str, int]:
    since = now() - timedelta(days=days)
    out: dict[str, int] = defaultdict(int)
    with session() as db:
        for o in db.query(OrderRow).filter(OrderRow.created_at >= since).all():
            for ln in o.lines:
                out[ln["product_id"]] += int(ln["qty"])
    return dict(out)


def products(status: str | None = "active") -> list[Product]:
    with session() as db:
        q = db.query(ProductRow)
        if status:
            q = q.filter(ProductRow.status == status)
        return [_product(r) for r in q.order_by(ProductRow.product_id).all()]


def get_product(product_id: str) -> Product | None:
    with session() as db:
        r = db.get(ProductRow, product_id)
        return _product(r) if r else None


def product_view(product_id: str) -> dict | None:
    with session() as db:
        r = db.get(ProductRow, product_id)
        return _view(r, units_sold()) if r else None


def search(statuses: list[str] | None = None, q: str = "", category: str = "", target: str = "", stock: str = "",
           sort: str = "featured") -> list[dict]:
    with session() as db:
        query = db.query(ProductRow)
        if statuses:
            query = query.filter(ProductRow.status.in_(statuses))
        rows = query.all()
    sold = units_sold()
    items = [_view(r, sold) for r in rows]
    if q:
        ql = q.lower().strip()
        items = [p for p in items if ql in p["product_name"].lower() or ql in p["description"].lower() or ql in p["product_id"].lower()
                 or ql in p["category"].lower() or ql in p["colour"].lower() or any(ql in t for t in p["style_tags"])]
    if category:
        items = [p for p in items if p["category"].lower() == category.lower()]
    if target:
        items = [p for p in items if p["target_gender_or_collection"] == target]
    if stock:
        items = [p for p in items if p["stock_state"] == stock or (stock == "attention" and (p["stock_state"] != "in_stock" or p["low_sizes"] or p["sold_out_sizes"]))]
    keys = {
        "featured": lambda p: (p["created_at"], -int(p["product_id"][1:]) if p["product_id"][1:].isdigit() else 0),
        "newest": lambda p: (p["created_at"], p["product_id"]),
        "updated": lambda p: p["updated_at"],
        "bestsellers": lambda p: (p["units_sold_30d"], p["product_id"]),
        "price_asc": lambda p: -p["price_gbp"], "price_desc": lambda p: p["price_gbp"],
        "stock_asc": lambda p: -p["total_stock"], "name": None,
    }
    if sort == "name":
        return sorted(items, key=lambda p: p["product_name"])
    return sorted(items, key=keys.get(sort, keys["featured"]), reverse=True)


# ------------------------------------------------------------------ writes
def _next_id(db) -> str:
    nums = [int(m.group(1)) for (pid,) in db.query(ProductRow.product_id).all() if (m := re.fullmatch(r"P(\d+)", pid))]
    return f"P{(max(nums) if nums else 0) + 1:03d}"


def _move(db, pid: str, size: str, delta: int, balance: int, reason: str, ref: str | None = None) -> None:
    if delta:
        db.add(StockMovementRow(product_id=pid, size=size, delta=delta, balance=balance, reason=reason, ref=ref))


def _apply(row: ProductRow, data: ProductIn) -> None:
    row.product_name, row.description, row.category = data.product_name, data.description.strip(), data.category
    row.price_gbp, row.sizes, row.target_age_segments = round(data.price_gbp, 2), data.sizes, data.target_age_segments
    row.target_gender_or_collection, row.style_tags, row.target_region = data.target_gender_or_collection, data.style_tags, data.target_region or "UK"
    row.product_image, row.seasonal_collection, row.badges = data.product_image, data.seasonal_collection.strip(), data.badges
    row.colour, row.status = data.colour.strip(), data.status
    row.campaign_keywords = list(dict.fromkeys(data.style_tags + [data.target_gender_or_collection]
                                               + ([data.seasonal_collection.strip().lower()] if data.seasonal_collection.strip() else [])))
    row.updated_at = now()


def create_product(data: ProductIn) -> dict:
    with _write_lock, session() as db:
        pid = _next_id(db)
        row = ProductRow(product_id=pid, stock={}, created_at=now())
        _apply(row, data)
        row.stock = dict(data.stock)
        db.add(row)
        for s, v in data.stock.items():
            _move(db, pid, s, v, v, "Initial stock")
        db.commit()
        return _view(row)


def update_product(product_id: str, data: ProductIn) -> dict:
    with _write_lock, session() as db:
        row = db.get(ProductRow, product_id)
        if row is None:
            raise InventoryError(404, f"Product '{product_id}' not found")
        old = dict(row.stock or {})
        _apply(row, data)
        for s in set(old) | set(data.stock):
            before, after = int(old.get(s, 0)), int(data.stock.get(s, 0))
            _move(db, product_id, s, after - before, after, "Back-office edit" if s in data.stock else "Size removed")
        row.stock = dict(data.stock)
        db.commit()
        return _view(row, units_sold())


def set_status(product_id: str, status: str) -> dict:
    with _write_lock, session() as db:
        row = db.get(ProductRow, product_id)
        if row is None:
            raise InventoryError(404, f"Product '{product_id}' not found")
        row.status, row.updated_at = status, now()
        db.commit()
        return _view(row, units_sold())


def adjust_stock(product_id: str, adj: StockAdjust) -> dict:
    with _write_lock, session() as db:
        row = db.get(ProductRow, product_id)
        if row is None:
            raise InventoryError(404, f"Product '{product_id}' not found")
        if adj.size not in row.sizes:
            raise InventoryError(422, f"Size '{adj.size}' is not offered for this product.")
        bal = int((row.stock or {}).get(adj.size, 0)) + adj.delta
        if bal < 0:
            raise InventoryError(409, f"Only {bal - adj.delta} unit(s) of size {adj.size} in stock; cannot remove {-adj.delta}.")
        row.stock = {**row.stock, adj.size: bal}  # reassign so SQLAlchemy persists the JSON change
        row.updated_at = now()
        _move(db, product_id, adj.size, adj.delta, bal, adj.reason.strip() or "Manual adjustment")
        db.commit()
        return _view(row, units_sold())


def place_order(order: OrderIn) -> dict:
    """Check availability for every line and decrement stock atomically; nothing changes if any line is short."""
    with _write_lock, session() as db:
        want: dict[tuple[str, str], int] = defaultdict(int)
        for ln in order.lines:
            want[(ln.product_id, ln.size)] += ln.qty
        rows = {pid: db.get(ProductRow, pid) for pid, _ in want}
        short, lines = [], []
        for (pid, size), qty in want.items():
            r = rows[pid]
            if r is None or r.status != "active":
                short.append({"product_id": pid, "size": size, "requested": qty, "available": 0,
                              "product_name": r.product_name if r else pid, "reason": "no longer available"})
                continue
            have = int((r.stock or {}).get(size, 0)) if size in r.sizes else 0
            if have < qty:
                short.append({"product_id": pid, "size": size, "requested": qty, "available": have, "product_name": r.product_name,
                              "reason": "insufficient stock"})
            lines.append({"product_id": pid, "product_name": r.product_name, "size": size, "qty": qty, "unit_price": r.price_gbp,
                          "product_image": r.product_image})
        if short:
            raise InventoryError(409, "Some items in your bag are no longer available in the requested quantity.", short)
        oid = f"ORD-{uuid.uuid4().hex[:8].upper()}"
        for ln in lines:
            r = rows[ln["product_id"]]
            bal = int(r.stock[ln["size"]]) - ln["qty"]
            r.stock = {**r.stock, ln["size"]: bal}
            r.updated_at = now()
            _move(db, r.product_id, ln["size"], -ln["qty"], bal, "Storefront order", oid)
        row = OrderRow(id=oid, customer_name=order.customer_name.strip() or "Guest shopper", channel="storefront", status="paid",
                       lines=lines, units=sum(ln["qty"] for ln in lines), total_gbp=round(sum(ln["qty"] * ln["unit_price"] for ln in lines), 2),
                       created_at=now())
        db.add(row)
        db.commit()
        return _order(row)


# ------------------------------------------------------------------ orders, movements, summary
def _order(o: OrderRow) -> dict:
    return {"order_id": o.id, "customer_name": o.customer_name, "channel": o.channel, "status": o.status, "lines": o.lines,
            "units": o.units, "total_gbp": o.total_gbp, "created_at": _aware(o.created_at).isoformat()}


def list_orders(page: int = 1, page_size: int = 25, channel: str = "", q: str = "") -> dict:
    with session() as db:
        query = db.query(OrderRow)
        if channel:
            query = query.filter(OrderRow.channel == channel)
        rows = query.order_by(OrderRow.created_at.desc()).all()
        images = {pid: img for pid, img in db.query(ProductRow.product_id, ProductRow.product_image).all()}
    items = [_order(o) for o in rows]
    for o in items:  # historical lines predate images on lines; show the current product photo
        o["lines"] = [{**ln, "product_image": ln.get("product_image") or images.get(ln["product_id"], "")} for ln in o["lines"]]
    if q:
        ql = q.lower()
        items = [o for o in items if ql in o["order_id"].lower() or ql in o["customer_name"].lower()
                 or any(ql in ln["product_name"].lower() for ln in o["lines"])]
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total, "page": page, "page_size": page_size,
            "pages": max(1, -(-total // page_size))}


def movements(product_id: str | None = None, limit: int = 30) -> list[dict]:
    with session() as db:
        q = db.query(StockMovementRow)
        if product_id:
            q = q.filter(StockMovementRow.product_id == product_id)
        rows = q.order_by(StockMovementRow.created_at.desc(), StockMovementRow.id.desc()).limit(limit).all()
        names = {pid: n for pid, n in db.query(ProductRow.product_id, ProductRow.product_name).all()}
    return [{"id": m.id, "product_id": m.product_id, "product_name": names.get(m.product_id, m.product_id), "size": m.size,
             "delta": m.delta, "balance": m.balance, "reason": m.reason, "ref": m.ref, "created_at": _aware(m.created_at).isoformat()} for m in rows]


def summary() -> dict:
    with session() as db:
        rows = db.query(ProductRow).all()
        since = now() - timedelta(days=30)
        orders = db.query(OrderRow).filter(OrderRow.created_at >= since).all()
    sold = units_sold()
    live = [r for r in rows if r.status == "active"]
    sizes = [(r, s, int(v)) for r in live for s, v in (r.stock or {}).items()]
    revenue = round(sum(o.total_gbp for o in orders), 2)
    today = now().date()
    daily = {(today - timedelta(days=d)).isoformat(): {"revenue": 0.0, "orders": 0} for d in range(29, -1, -1)}
    for o in orders:
        k = _aware(o.created_at).date().isoformat()
        if k in daily:
            daily[k]["revenue"] += o.total_gbp
            daily[k]["orders"] += 1
    by_cat: dict[str, dict] = {}
    for r in live:
        c = by_cat.setdefault(r.category, {"category": r.category, "products": 0, "units_in_stock": 0, "units_sold_30d": 0})
        c["products"] += 1
        c["units_in_stock"] += sum(int(v) for v in (r.stock or {}).values())
        c["units_sold_30d"] += sold.get(r.product_id, 0)
    best = sorted(live, key=lambda r: (-sold.get(r.product_id, 0), r.product_id))[:3]
    low = sorted([(r, s, v) for r, s, v in sizes if v <= LOW_STOCK], key=lambda x: (x[2], x[0].product_id))
    return {
        "counts": {"active": len(live), "draft": sum(r.status == "draft" for r in rows), "archived": sum(r.status == "archived" for r in rows)},
        "units_in_stock": sum(v for _, _, v in sizes),
        "stock_value_gbp": round(sum(v * r.price_gbp for r, _, v in sizes), 2),
        "low_stock_sizes": sum(1 for _, _, v in sizes if 0 < v <= LOW_STOCK),
        "sold_out_sizes": sum(1 for _, _, v in sizes if v == 0),
        "orders_30d": len(orders), "revenue_30d": revenue, "units_30d": sum(o.units for o in orders),
        "aov_30d": round(revenue / len(orders), 2) if orders else 0.0,
        "storefront_orders_30d": sum(o.channel == "storefront" for o in orders),
        "bestsellers": [{**_view(r, sold)} for r in best],
        "low_stock": [{"product_id": r.product_id, "product_name": r.product_name, "product_image": r.product_image, "size": s, "stock": v}
                      for r, s, v in low[:8]],
        "by_category": sorted(by_cat.values(), key=lambda c: -c["units_sold_30d"]),
        "daily": [{"date": k, "revenue": round(v["revenue"], 2), "orders": v["orders"]} for k, v in daily.items()],
        "thresholds": {"low_stock_per_size": LOW_STOCK, "low_stock_total": LOW_TOTAL},
    }
