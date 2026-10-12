"""Settings API: choose provider/model, store the access token, test the connection.
The token is write-only: it is never returned, only a masked hint."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import PROVIDERS, PROVIDER_ALIASES, env_key_for, get_settings
from ..services import llm_client, runtime_settings

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
