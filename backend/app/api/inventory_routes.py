"""Back-office inventory API (products, stock, orders, image uploads). Shares the products table with the
storefront (/api/products) and the influencer-matching engine."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from ..schemas.models import AGE_SEGMENTS, BADGES, CATEGORIES, TARGETS, OrderIn, ProductIn, StockAdjust
from ..services import inventory, uploads
from ..services.inventory import InventoryError

router = APIRouter(prefix="/api")

SIZE_PRESETS = {"Clothing": ["XS", "S", "M", "L", "XL"], "Extended": ["XS", "S", "M", "L", "XL", "XXL"],
                "Kids": ["3-4Y", "5-6Y", "7-8Y", "9-10Y"], "Teen": ["10-11Y", "12-13Y", "14-15Y"], "One size": ["One size"],
                "Waist": ["28", "30", "32", "34", "36"]}
STYLE_TAGS = ["streetwear", "casual", "denim", "y2k", "workwear", "minimal", "occasion", "classic", "smart-casual", "sportswear",
              "kids", "family", "couple", "accessories"]


def _err(e: InventoryError) -> JSONResponse:
    return JSONResponse(status_code=e.status, content={"detail": e.message, "items": e.detail})


def paginate(items: list, page: int, page_size: int) -> dict:
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total, "page": page, "page_size": page_size, "pages": max(1, -(-total // page_size))}


@router.get("/inventory/meta")
def inventory_meta():
    collections = sorted({p.seasonal_collection for p in inventory.products(None) if p.seasonal_collection})
    return {"categories": CATEGORIES, "targets": TARGETS, "age_segments": AGE_SEGMENTS, "badges": BADGES, "style_tags": STYLE_TAGS,
            "collections": collections, "size_presets": SIZE_PRESETS, "statuses": ["active", "draft", "archived"],
            "thresholds": {"low_stock_per_size": inventory.LOW_STOCK, "low_stock_total": inventory.LOW_TOTAL}}


@router.get("/inventory/summary")
def inventory_summary():
    return inventory.summary()


@router.get("/inventory/products")
def inventory_products(q: str = "", category: str = "", status: str = "", stock: Literal["", "in_stock", "low", "out", "attention"] = "",
                       sort: Literal["featured", "newest", "updated", "bestsellers", "price_asc", "price_desc", "stock_asc", "name"] = "updated",
                       page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    statuses = [status] if status else ["active", "draft"]  # archived products are hidden unless asked for
    return paginate(inventory.search(statuses, q, category, "", stock, sort), page, page_size)


@router.get("/inventory/products/{product_id}")
def inventory_product(product_id: str):
    p = inventory.product_view(product_id)
    if p is None:
        raise HTTPException(404, f"Product '{product_id}' not found")
    return {**p, "movements": inventory.movements(product_id, 15)}


@router.post("/inventory/products", status_code=201)
def create_product(body: ProductIn):
    return inventory.create_product(body)


@router.put("/inventory/products/{product_id}")
def update_product(product_id: str, body: ProductIn):
    try:
        return inventory.update_product(product_id, body)
    except InventoryError as e:
        return _err(e)


class StatusIn(BaseModel):
    status: Literal["active", "draft", "archived"]


@router.post("/inventory/products/{product_id}/status")
def product_status(product_id: str, body: StatusIn):
    try:
        return inventory.set_status(product_id, body.status)
    except InventoryError as e:
        return _err(e)


@router.delete("/inventory/products/{product_id}")
def archive_product(product_id: str):
    """Soft delete: archived products leave the storefront but past campaigns and orders keep resolving."""
    try:
        return inventory.set_status(product_id, "archived")
    except InventoryError as e:
        return _err(e)


@router.post("/inventory/products/{product_id}/stock")
def adjust_stock(product_id: str, body: StockAdjust):
    try:
        return inventory.adjust_stock(product_id, body)
    except InventoryError as e:
        return _err(e)


@router.get("/inventory/movements")
def stock_movements(product_id: str = "", limit: int = Query(30, ge=1, le=200)):
    return {"items": inventory.movements(product_id or None, limit)}


# ------------------------------------------------------------------ orders
@router.post("/orders", status_code=201)
def place_order(body: OrderIn):
    try:
        return inventory.place_order(body)
    except InventoryError as e:
        return _err(e)


@router.get("/orders")
def orders(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), channel: str = "", q: str = ""):
    return inventory.list_orders(page, page_size, channel, q)


# ------------------------------------------------------------------ uploads
class UploadIn(BaseModel):
    filename: str = Field(default="image", max_length=200)
    data: str  # base64, optionally as a data: URL


@router.post("/uploads", status_code=201)
def upload(body: UploadIn):
    try:
        return {"url": uploads.save(body.data)}
    except uploads.UploadError as e:
        raise HTTPException(422, str(e)) from None


@router.get("/uploads/{name}", include_in_schema=False)
def uploaded(name: str):
    hit = uploads.resolve(name)
    if hit is None:
        raise HTTPException(404, "Not found")
    path, media = hit
    return FileResponse(path, media_type=media, headers={"X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400"})
