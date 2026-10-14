"""Settings API: choose provider/model, store the access token, test the connection.
The token is write-only: it is never returned, only a masked hint."""
from __future__ import annotations

from typing import Optional

from pydantic import Field

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator
from urllib.parse import urlsplit

from ..config import PROVIDERS, PROVIDER_ALIASES, env_key_for, get_settings
import asyncio

from ..security import guard
from ..services import external_creators, llm_client, runtime_settings, usage

router = APIRouter(prefix="/api/settings")


def _providers() -> list[dict]:
    return [{"id": k, "label": v["label"], "models": v["models"], "default_model": v["default_model"], "needs_key": v["needs_key"],
             "uses_base_url": v["base_url"], "default_base_url": v.get("default_base_url"),
             "endpoint": v.get("endpoint") or v.get("default_base_url")} for k, v in PROVIDERS.items()]


def saved_base_urls() -> dict[str, str]:
    ov = runtime_settings.overrides()
    urls = dict(ov.get("base_urls") or {})
    if not urls and ov.get("base_url") and ov.get("provider"):  # migrate the single pre-v7 value
        urls[ov["provider"]] = ov["base_url"]
    return urls


def clean_base_url(v: Optional[str]) -> Optional[str]:
    """Blank = the provider's standard endpoint. Otherwise an absolute http(s) URL without credentials or spaces."""
    v = (v or "").strip()
    if not v:
        return None
    if len(v) > 300 or any(c.isspace() for c in v):
        raise ValueError("Base URL must be a single URL without spaces (300 characters at most).")
    parts = urlsplit(v)
    if parts.scheme not in ("http", "https") or not parts.netloc:
        raise ValueError("Base URL must start with http:// or https://, for example https://my-gateway.example.com/v1.")
    if parts.username or parts.password:
        raise ValueError("Do not put a username or password in the base URL; use the access token field.")
    if parts.query or parts.fragment:
        raise ValueError("Base URL must not contain ?query or #fragment parts.")
    return v.rstrip("/")


def _hint(key: str | None) -> str | None:
    return f"…{key[-4:]}" if key and len(key) >= 8 else ("••••" if key else None)


def _view() -> dict:
    s = get_settings()
    saved = runtime_settings.overrides().get("keys", {})
    keys_saved = {p: bool(saved.get(p)) for p in PROVIDERS}
    return {"use_ai": s.llm_mode != "offline", "provider": s.llm_provider, "model": s.llm_model, "base_url": s.llm_base_url,
            "base_url_source": s.base_url_source, "base_urls": saved_base_urls(),
            "has_key": bool(s.llm_api_key), "key_hint": _hint(s.llm_api_key), "key_source": s.key_source, "keys_saved": keys_saved,
            "effective_mode": s.effective_mode(), "providers": _providers(),
            "note": "Access tokens are stored in the local SQLite database on this machine and are never sent back to the browser."}


class SettingsIn(BaseModel):
    use_ai: bool = True
    provider: str
    model: str
    base_url: Optional[str] = None  # blank = the provider's standard endpoint; saved per provider
    api_key: Optional[str] = None  # omitted/blank = keep the saved token
    clear_key: bool = False

    _url = field_validator("base_url")(classmethod(lambda cls, v: clean_base_url(v)))


class TestIn(BaseModel):
    provider: str
    model: str
    base_url: Optional[str] = None  # blank = the one saved for this provider, else its standard endpoint
    api_key: Optional[str] = None  # blank = use the saved token for this provider

    _url = field_validator("base_url")(classmethod(lambda cls, v: clean_base_url(v)))


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
    urls = saved_base_urls()
    if body.base_url:
        urls[provider] = body.base_url
    else:
        urls.pop(provider, None)
    values.pop("base_url", None)  # replaced by the per-provider map
    values.update({"mode": "auto" if body.use_ai else "offline", "provider": provider, "model": body.model.strip(),
                   "base_urls": urls, "keys": keys})
    runtime_settings.save(values)
    return _view()


@router.post("/test")
async def test_settings(body: TestIn, request: Request):
    guard("model_test", request)
    provider = _norm(body.provider)
    saved = (runtime_settings.overrides().get("keys") or {}).get(provider)
    key = (body.api_key or "").strip() or saved or env_key_for(provider)
    base = body.base_url or saved_base_urls().get(provider) or PROVIDERS[provider].get("default_base_url")
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
async def test_external(request: Request):
    guard("model_test", request, spends_tokens=False)
    return await asyncio.to_thread(external_creators.probe)
