"""Settings API: choose provider/model, store the access token, test the connection.
The token is write-only: it is never returned, only a masked hint."""
from __future__ import annotations

from typing import Optional

from pydantic import Field

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import PROVIDERS, PROVIDER_ALIASES, env_key_for, get_settings
import asyncio

from ..services import external_creators, llm_client, runtime_settings, usage

router = APIRouter(prefix="/api/settings")


def _providers() -> list[dict]:
    return [{"id": k, "label": v["label"], "models": v["models"], "default_model": v["default_model"], "needs_key": v["needs_key"],
             "uses_base_url": v["base_url"], "default_base_url": v.get("default_base_url")} for k, v in PROVIDERS.items()]


def _hint(key: str | None) -> str | None:
    return f"…{key[-4:]}" if key and len(key) >= 8 else ("••••" if key else None)


def _view() -> dict:
    s = get_settings()
    saved = runtime_settings.overrides().get("keys", {})
    keys_saved = {p: bool(saved.get(p)) for p in PROVIDERS}
    return {"use_ai": s.llm_mode != "offline", "provider": s.llm_provider, "model": s.llm_model, "base_url": s.llm_base_url,
            "has_key": bool(s.llm_api_key), "key_hint": _hint(s.llm_api_key), "key_source": s.key_source, "keys_saved": keys_saved,
            "effective_mode": s.effective_mode(), "providers": _providers(),
            "note": "Access tokens are stored in the local SQLite database on this machine and are never sent back to the browser."}


class SettingsIn(BaseModel):
    use_ai: bool = True
    provider: str
    model: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None  # omitted/blank = keep the saved token
    clear_key: bool = False


class TestIn(BaseModel):
    provider: str
    model: str
    base_url: Optional[str] = None
    api_key: Optional[str] = None  # blank = use the saved token for this provider


def _norm(provider: str) -> str:
    p = PROVIDER_ALIASES.get(provider.lower(), provider.lower())
    if p not in PROVIDERS:
        raise HTTPException(422, f"Unknown provider '{provider}'.")
    return p


@router.get("")
def read_settings():
    return _view()


@router.put("")
def update_settings(body: SettingsIn):
    provider = _norm(body.provider)
    if body.use_ai and not body.model.strip():
        raise HTTPException(422, "Enter a model id.")
    values = dict(runtime_settings.overrides())
    keys = dict(values.get("keys") or {})
    if body.clear_key:
        keys.pop(provider, None)
    elif body.api_key and body.api_key.strip():
        keys[provider] = body.api_key.strip()
    values.update({"mode": "auto" if body.use_ai else "offline", "provider": provider, "model": body.model.strip(),
                   "base_url": (body.base_url or "").strip() or None, "keys": keys})
    runtime_settings.save(values)
    return _view()


@router.post("/test")
async def test_settings(body: TestIn):
    provider = _norm(body.provider)
    saved = (runtime_settings.overrides().get("keys") or {}).get(provider)
    key = (body.api_key or "").strip() or saved or env_key_for(provider)
    base = (body.base_url or "").strip() or PROVIDERS[provider].get("default_base_url")
    return await llm_client.test_connection(provider, body.model, key, base)


# ------------------------------------------------------------------ model prices (for the token cost dropdown)
class PriceIn(BaseModel):
    model: str = Field(min_length=1, max_length=200)
    input_per_m: Optional[float] = Field(default=None, ge=0, le=1000)  # USD per 1M input tokens; both None = remove
    output_per_m: Optional[float] = Field(default=None, ge=0, le=1000)


def _prices() -> dict:
    s = get_settings()
    saved = runtime_settings.overrides().get("prices") or {}
    models = list(dict.fromkeys([s.llm_model, *saved, *[m for spec in PROVIDERS.values() for m in spec["models"]], *usage.DEFAULT_PRICES]))
    return {"current_model": s.llm_model, "prices": [{"model": m, "price": usage.price_for(m, s.llm_provider if m == s.llm_model else None),
                                                     "saved": m in saved} for m in models if m],
            "note": "USD per 1 million tokens. Defaults are published list prices when this was written; check your provider and edit as needed."}


@router.get("/prices")
def read_prices():
    return _prices()


@router.put("/prices")
def update_price(body: PriceIn):
    usage.save_price(body.model.strip(), body.input_per_m, body.output_per_m)
    return _prices()


# ------------------------------------------------------------------ outside creator data over MCP
class ExternalIn(BaseModel):
    enabled: bool


@router.get("/external-data")
def read_external():
    return {**external_creators.config(), **external_creators.cache_stats()}


@router.put("/external-data")
def update_external(body: ExternalIn):
    external_creators.set_enabled(body.enabled)
    return read_external()


@router.post("/external-data/test")
async def test_external():
    return await asyncio.to_thread(external_creators.probe)
