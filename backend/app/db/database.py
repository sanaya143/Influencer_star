"""SQLite persistence (PostgreSQL-compatible: only generic SQLAlchemy types are used)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, create_engine
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


def session() -> Session:
    if _Session is None:
        init_db()
    return _Session()


def jsonable(obj):
    """Round-trip through json to guarantee JSON-column compatibility."""
    return json.loads(json.dumps(obj, default=str))
