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


# ------------------------------------------------------------------ base URL from the Settings page
def _save(client, **over):
    body = {"use_ai": True, "provider": "openai", "model": "gpt-4o-mini", **over}
    return client.put("/api/settings", json=body)


def test_base_url_is_saved_per_provider_and_used_by_the_agents(client, monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    v = _save(client, base_url="https://gateway.example.com/openai/v1/").json()
    assert v["base_url"] == "https://gateway.example.com/openai/v1" and v["base_url_source"] == "saved"  # trailing slash trimmed
    _save(client, provider="ollama", model="llama3.2", base_url="http://gpu-box.local:11434")
    v = client.get("/api/settings").json()
    assert v["base_urls"] == {"openai": "https://gateway.example.com/openai/v1", "ollama": "http://gpu-box.local:11434"}
    assert get_settings().llm_base_url == "http://gpu-box.local:11434"
    # switching back keeps that provider's own URL, and the agents' model client receives it
    _save(client, base_url="https://gateway.example.com/openai/v1")
    s = get_settings()
    assert s.llm_provider == "openai" and s.llm_base_url == "https://gateway.example.com/openai/v1"
    from app.agents.workflow import make_model
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-real-0000")
    assert make_model()._additional_args.get("api_base") == "https://gateway.example.com/openai/v1"


def test_blank_base_url_means_the_provider_default(client, monkeypatch):
    monkeypatch.delenv("LLM_BASE_URL", raising=False)
    _save(client, base_url="https://gateway.example.com/v1")
    v = _save(client, base_url="").json()
    assert v["base_url"] is None and v["base_url_source"] == "default" and "openai" not in v["base_urls"]
    endpoints = {p["id"]: p["endpoint"] for p in v["providers"]}
    assert endpoints["openai"] == "https://api.openai.com/v1" and endpoints["ollama"] == "http://localhost:11434"
    monkeypatch.setenv("LLM_BASE_URL", "https://env-gateway.example.com")
    assert get_settings().base_url_source == "environment"  # environment is a fallback only
    _save(client, base_url="https://ui-wins.example.com")
    assert get_settings().llm_base_url == "https://ui-wins.example.com"


@pytest.mark.parametrize("bad", ["ftp://example.com", "example.com/v1", "https://user:pw@example.com", "https://example.com/v1?key=1",
                                 "https://exa mple.com", "javascript:alert(1)", "https://" + "a" * 300 + ".com"])
def test_invalid_base_urls_are_rejected(client, bad):
    r = _save(client, base_url=bad)
    assert r.status_code == 422
    assert client.post("/api/settings/test", json={"provider": "openai", "model": "gpt-4o-mini", "base_url": bad}).status_code == 422


def test_connection_test_uses_the_saved_base_url(client, monkeypatch):
    seen = {}

    async def fake(provider, model, api_key, base_url):
        seen["base"] = base_url
        return {"ok": True}
    from app.services import llm_client
    monkeypatch.setattr(llm_client, "test_connection", fake)
    _save(client, base_url="https://gateway.example.com/v1", api_key="sk-test-not-real-1111")
    client.post("/api/settings/test", json={"provider": "openai", "model": "gpt-4o-mini"})
    assert seen["base"] == "https://gateway.example.com/v1"
    client.post("/api/settings/test", json={"provider": "openai", "model": "gpt-4o-mini", "base_url": "https://other.example.com"})
    assert seen["base"] == "https://other.example.com"  # an unsaved URL typed in the form is what gets tested
