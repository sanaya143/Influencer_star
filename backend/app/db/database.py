"""SQLite persistence (PostgreSQL-compatible: only generic SQLAlchemy types are used)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from ..config import get_settings


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class CampaignRow(Base):
    __tablename__ = "campaigns"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String)
    brief: Mapped[dict] = mapped_column(JSON)
    brief_trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # Campaign Brief Agent run, if any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class RunRow(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    campaign_id: Mapped[str | None] = mapped_column(ForeignKey("campaigns.id"), nullable=True)
    kind: Mapped[str] = mapped_column(String)  # brief | match
    status: Mapped[str] = mapped_column(String, default="Pending")
    brief: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # brief snapshot used for this run
    output: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # MatchOutput + insights
    trace: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    usage: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class SettingRow(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class ProductRow(Base):
    """Product catalogue owned by the back office; the storefront and the matching engine read from here."""
    __tablename__ = "products"
    product_id: Mapped[str] = mapped_column(String, primary_key=True)
    product_name: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String, index=True)
    price_gbp: Mapped[float] = mapped_column(Float)
    sizes: Mapped[list] = mapped_column(JSON)
    stock: Mapped[dict] = mapped_column(JSON)
    target_age_segments: Mapped[list] = mapped_column(JSON)
    target_gender_or_collection: Mapped[str] = mapped_column(String)
    style_tags: Mapped[list] = mapped_column(JSON)
    target_region: Mapped[str] = mapped_column(String, default="UK")
    campaign_keywords: Mapped[list] = mapped_column(JSON)
    product_image: Mapped[str] = mapped_column(String, default="")
    seasonal_collection: Mapped[str] = mapped_column(String, default="")
    badges: Mapped[list] = mapped_column(JSON)
    colour: Mapped[str] = mapped_column(String, default="")
    status: Mapped[str] = mapped_column(String, default="active", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class OrderRow(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    customer_name: Mapped[str] = mapped_column(String)
    channel: Mapped[str] = mapped_column(String)  # storefront | seed
    status: Mapped[str] = mapped_column(String, default="paid")
    lines: Mapped[list] = mapped_column(JSON)  # [{product_id, product_name, size, qty, unit_price}]
    units: Mapped[int] = mapped_column(Integer)
    total_gbp: Mapped[float] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class StockMovementRow(Base):
    """Audit trail of every stock change (back-office edits, restocks and storefront orders)."""
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(String, index=True)
    size: Mapped[str] = mapped_column(String)
    delta: Mapped[int] = mapped_column(Integer)
    balance: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String)
    ref: Mapped[str | None] = mapped_column(String, nullable=True)  # order id, if any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


_engine = None
_Session = None


def init_db(url: str | None = None) -> None:
    global _engine, _Session
    url = url or get_settings().database_url
    if url.startswith("sqlite:///") and url != "sqlite:///:memory:":
        Path(url.replace("sqlite:///", "", 1)).parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"connect_args": {"check_same_thread": False}} if url.startswith("sqlite") else {}
    if url == "sqlite:///:memory:":
        from sqlalchemy.pool import StaticPool
        kwargs["poolclass"] = StaticPool
    _engine = create_engine(url, **kwargs)
    Base.metadata.create_all(_engine)
    _Session = sessionmaker(_engine, expire_on_commit=False)
    from ..services.inventory import seed_if_empty  # lazy: the service imports this module
    seed_if_empty()


def session() -> Session:
    if _Session is None:
        init_db()
    return _Session()


def jsonable(obj):
    """Round-trip through json to guarantee JSON-column compatibility."""
    return json.loads(json.dumps(obj, default=str))
