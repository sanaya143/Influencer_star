"""Collections: groups of products a campaign can promote together. A collection is matched like one product whose
audience, styles and region come from the collection, plus content themes that creators must post about."""
from __future__ import annotations

import re

from ..data.collections import COLLECTION_KEYWORDS, default_collections, image_product
from ..db.database import CollectionRow, session
from ..schemas.models import AGE_SEGMENTS, TARGETS, Collection, Product
from . import inventory


def ensure_defaults() -> None:
    """Seed the built-in collections (idempotent; collections edited or added later are kept)."""
    with session() as db:
        have = {cid for (cid,) in db.query(CollectionRow.id).all()}
        added = [c for c in default_collections() if c.collection_id not in have]
        for c in added:
            db.add(CollectionRow(id=c.collection_id, data=c.model_dump()))
        if added:
            db.commit()


def all_collections() -> list[Collection]:
    with session() as db:
        return [Collection(**r.data) for r in db.query(CollectionRow).order_by(CollectionRow.created_at, CollectionRow.id).all()]


def get(collection_id: str) -> Collection | None:
    with session() as db:
        r = db.get(CollectionRow, collection_id)
        return Collection(**r.data) if r else None


def is_collection_id(pid: str | None) -> bool:
    return bool(pid) and pid.startswith("COL-")


def _members(c: Collection) -> list[Product]:
    out = []
    for pid in c.product_ids:
        p = inventory.get_product(pid)
        if p is not None and p.status != "archived":
            out.append(p)
    return out


def as_product(c: Collection) -> Product:
    """The collection as one 'virtual product' the matching engine can score creators against."""
    members = _members(c)
    price = round(sum(p.price_gbp for p in members) / len(members), 2) if members else 30.0
    price = round(price * (1 - c.discount_pct / 100), 2)
    img_pid = image_product(c.collection_id) or (c.product_ids[0] if c.product_ids else None)
    img = c.image or next((p.product_image for p in members if p.product_id == img_pid), members[0].product_image if members else "")
    styles = list(dict.fromkeys(c.style_tags + [t for p in members for t in p.style_tags]))[:8]
    return Product(product_id=c.collection_id, product_name=c.name, description=c.description or c.tagline, category="Collection",
                   price_gbp=price, sizes=["Range"], target_age_segments=[a for a in c.target_age_segments if a in AGE_SEGMENTS] or ["18-24", "25-34"],
                   target_gender_or_collection=c.target if c.target in TARGETS else "unisex", style_tags=styles, target_region="UK",
                   campaign_keywords=c.content_themes, product_image=img, seasonal_collection=c.name,
                   badges=["Sale"] if c.discount_pct else [], stock={"Range": sum(sum(p.stock.values()) for p in members)},
                   status="active", content_themes=c.content_themes)


def view(c: Collection, influencers: list | None = None) -> dict:
    members = _members(c)
    themed = None
    if influencers is not None:
        want = set(c.content_themes)
        themed = sum(1 for i in influencers if want & set(i.content_themes))
    p = as_product(c)
    return {**c.model_dump(), "image": p.product_image, "avg_price_gbp": p.price_gbp, "products": [
        {"product_id": m.product_id, "product_name": m.product_name, "price_gbp": m.price_gbp, "product_image": m.product_image,
         "colour": m.colour, "category": m.category, "total_stock": sum(m.stock.values())} for m in members],
        "total_stock": p.stock["Range"], "creators_with_themes": themed}


def find_in_text(text: str) -> list[str]:
    """Collection ids a free-text request points at, most specific first."""
    t = f" {text.lower()} "
    hits = []
    for cid, words in COLLECTION_KEYWORDS.items():
        score = sum(len(w) for w in words if re.search(rf"(?<![a-z]){re.escape(w.strip())}(?![a-z])", t))
        if score:
            hits.append((score, cid))
    return [cid for _, cid in sorted(hits, reverse=True)]


def create(c: Collection) -> Collection:
    with session() as db:
        if db.get(CollectionRow, c.collection_id):
            raise ValueError(f"Collection '{c.collection_id}' already exists.")
        db.add(CollectionRow(id=c.collection_id, data=c.model_dump()))
        db.commit()
    return c
