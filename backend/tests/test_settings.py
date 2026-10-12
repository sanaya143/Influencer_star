import os

os.environ["LLM_MODE"] = "offline"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings, litellm_model
from app.db.database import init_db
from app.main import app
from app.services import runtime_settings

SECRET = "sk-test-SECRET-1234567890"


@pytest.fixture
def client():
    init_db("sqlite:///:memory:")
    runtime_settings.reset()
    with TestClient(app) as c:
        yield c
    runtime_settings.reset()


def test_save_masks_token_and_applies(client):
    r = client.put("/api/settings", json={"use_ai": True, "provider": "openrouter", "model": "some/model:free", "api_key": SECRET}).json()
    assert r["has_key"] and r["key_hint"] == "…7890" and r["key_source"] == "saved" and r["keys_saved"]["openrouter"]
    assert SECRET not in client.get("/api/settings").text
    s = get_settings()
    assert (s.llm_provider, s.llm_model, s.llm_api_key, s.effective_mode()) == ("openrouter", "some/model:free", SECRET, "llm")
    assert litellm_model(s.llm_provider, s.llm_model) == "openrouter/some/model:free"


def test_blank_token_keeps_saved_and_clear_removes(client):
    client.put("/api/settings", json={"provider": "openai", "model": "gpt-4o-mini", "api_key": SECRET})
    again = client.put("/api/settings", json={"provider": "openai", "model": "gpt-4o", "api_key": ""}).json()
    assert again["has_key"] and again["model"] == "gpt-4o"
    cleared = client.put("/api/settings", json={"provider": "openai", "model": "gpt-4o", "clear_key": True}).json()
    assert not cleared["has_key"] and cleared["effective_mode"] == "offline"  # no token -> auto mode falls back to offline


def test_offline_switch_and_validation(client):
    r = client.put("/api/settings", json={"use_ai": False, "provider": "gemini", "model": "gemini-2.5-flash", "api_key": SECRET}).json()
    assert r["effective_mode"] == "offline" and not r["use_ai"]
    assert client.put("/api/settings", json={"provider": "nope", "model": "x"}).status_code == 422
    assert client.put("/api/settings", json={"provider": "gemini", "model": " "}).status_code == 422


def test_connection_success_and_failure_never_leak_token(client, monkeypatch):
    import litellm

    class Resp:
        class choices:  # noqa: N801
            message = type("M", (), {"content": "OK"})
        choices = [type("C", (), {"message": type("M", (), {"content": "OK"})})()]
        usage = type("U", (), {"prompt_tokens": 9, "completion_tokens": 2})()

    seen = {}

    async def ok(**kw):
        seen.update(kw)
        return Resp()

    monkeypatch.setattr(litellm, "acompletion", ok)
    r = client.post("/api/settings/test", json={"provider": "openrouter", "model": "m:free", "api_key": SECRET}).json()
    assert r["ok"] and r["prompt_tokens"] == 9 and seen["model"] == "openrouter/m:free" and seen["api_key"] == SECRET

    class AuthErr(Exception):
        status_code = 401
        message = f"Invalid key {SECRET}"

    async def bad(**kw):
        raise AuthErr()

    monkeypatch.setattr(litellm, "acompletion", bad)
    r = client.post("/api/settings/test", json={"provider": "openrouter", "model": "m:free", "api_key": SECRET}).json()
    assert not r["ok"] and r["status"] == 401 and SECRET not in str(r) and "rejected" in r["hint"]


def test_connection_uses_saved_token_and_requires_one(client, monkeypatch):
    import litellm

    async def ok(**kw):
        assert kw["api_key"] == SECRET
        return type("R", (), {"choices": [], "usage": None})()

    monkeypatch.setattr(litellm, "acompletion", ok)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    no_key = client.post("/api/settings/test", json={"provider": "openai", "model": "gpt-4o-mini"}).json()
    assert not no_key["ok"] and "token" in no_key["error"]
    client.put("/api/settings", json={"provider": "openai", "model": "gpt-4o-mini", "api_key": SECRET})
    assert client.post("/api/settings/test", json={"provider": "openai", "model": "gpt-4o-mini"}).json()["ok"]


def test_ollama_needs_no_token(client):
    s = client.put("/api/settings", json={"provider": "ollama", "model": "llama3.2"}).json()
    assert s["effective_mode"] == "llm" and s["base_url"] == "http://localhost:11434"
