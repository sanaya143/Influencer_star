"""Settings. Precedence: values saved from the UI (Settings page, stored in SQLite) > environment/.env > defaults.
No secrets or model names are hard-coded."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _load_dotenv() -> None:
    f = ROOT / ".env"
    if not f.exists():
        return
    for line in f.read_text("utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

# All providers are called through LiteLLM (used by Google ADK's LiteLlm adapter), so each one just needs a
# LiteLLM model prefix, an optional key env var and a few suggested models (any model id can be typed in).
PROVIDERS: dict[str, dict] = {
    "gemini": {"label": "Google Gemini", "prefix": "gemini/", "env_keys": ["GOOGLE_API_KEY", "GEMINI_API_KEY"], "needs_key": True, "base_url": False,
               "endpoint": "https://generativelanguage.googleapis.com", "default_model": "gemini-2.5-flash", "models": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"]},
    "openrouter": {"label": "OpenRouter", "prefix": "openrouter/", "env_keys": ["OPENROUTER_API_KEY"], "needs_key": True, "base_url": False,
                   "endpoint": "https://openrouter.ai/api/v1",
                   "default_model": "nvidia/nemotron-3-ultra-550b-a55b:free",
                   "models": ["nvidia/nemotron-3-ultra-550b-a55b:free", "meta-llama/llama-3.3-70b-instruct:free", "google/gemini-2.5-flash", "openai/gpt-4o-mini"]},
    "openai": {"label": "OpenAI", "prefix": "openai/", "env_keys": ["OPENAI_API_KEY"], "needs_key": True, "base_url": False, "endpoint": "https://api.openai.com/v1",
               "default_model": "gpt-4o-mini", "models": ["gpt-4o-mini", "gpt-4o"]},
    "anthropic": {"label": "Anthropic", "prefix": "anthropic/", "env_keys": ["ANTHROPIC_API_KEY"], "needs_key": True, "base_url": False, "endpoint": "https://api.anthropic.com",
                  "default_model": "claude-haiku-5-5", "models": ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]},
    "ollama": {"label": "Ollama (local)", "prefix": "ollama_chat/", "env_keys": [], "needs_key": False, "base_url": True,
               "default_base_url": "http://localhost:11434", "default_model": "llama3.2", "models": ["llama3.2", "qwen2.5", "mistral"]},
    "custom": {"label": "Custom (LiteLLM model string)", "prefix": "", "env_keys": ["LLM_API_KEY"], "needs_key": False, "base_url": True,
               "default_model": "", "models": []},
}
PROVIDER_ALIASES = {"litellm": "custom"}


def default_database_path() -> Path:
    """data/zylo.db. A database from before the Zylo rebrand (data/threadora.db) is copied over once, so saved
    settings, campaigns and inventory carry across; the old file is left untouched."""
    new, old = ROOT / "data" / "zylo.db", ROOT / "data" / "threadora.db"
    if not new.exists() and old.exists():
        import shutil
        shutil.copy2(old, new)
    return new


def litellm_model(provider: str, model: str) -> str:
    return PROVIDERS.get(provider, PROVIDERS["custom"])["prefix"] + model


def env_key_for(provider: str) -> str | None:
    for name in PROVIDERS.get(provider, {}).get("env_keys", []):
        if os.getenv(name):
            return os.environ[name]
    return None


@dataclass
class Settings:
    llm_mode: str = "auto"  # auto | llm | offline
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.5-flash"
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    key_source: str = "none"  # saved | environment | none
    base_url_source: str = "default"  # saved | environment | default
    database_url: str = ""
    seed_dir: str = ""
    price_in_per_m: float | None = None  # optional USD per 1M tokens; cost shown only when both are set
    price_out_per_m: float | None = None
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    def llm_available(self) -> bool:
        if self.llm_provider == "fake":
            return True
        p = PROVIDERS.get(self.llm_provider)
        if p is None:
            return False
        if p["needs_key"]:
            return bool(self.llm_api_key)
        return True

    def effective_mode(self) -> str:
        if self.llm_mode == "offline":
            return "offline"
        if self.llm_mode == "llm":
            return "llm"
        return "llm" if self.llm_available() else "offline"


def _price(name: str) -> float | None:
    return float(os.environ[name]) if os.getenv(name) else None


def get_settings() -> Settings:
    from .services import runtime_settings  # lazy: avoids a circular import with the DB layer

    ov = runtime_settings.overrides()
    provider = ov.get("provider") or os.getenv("LLM_PROVIDER") or "gemini"
    provider = PROVIDER_ALIASES.get(provider.lower(), provider.lower())
    spec = PROVIDERS.get(provider)
    model = ov.get("model") or os.getenv("LLM_MODEL") or (spec or {}).get("default_model", "")
    # Base URL, most specific first: the one saved in Settings for this provider, then LLM_BASE_URL, then the
    # provider's own default (only Ollama needs one; for the others a blank URL means the provider's standard endpoint).
    saved_urls = ov.get("base_urls") or {}
    if not saved_urls and ov.get("base_url") and ov.get("provider") == provider:  # settings saved before per-provider URLs
        saved_urls = {provider: ov["base_url"]}
    env_url = os.getenv("LLM_BASE_URL")
    if saved_urls.get(provider):
        base_url, base_url_source = saved_urls[provider], "saved"
    elif env_url:
        base_url, base_url_source = env_url, "environment"
    else:
        base_url, base_url_source = (spec or {}).get("default_base_url") or None, "default"
    saved_key = (ov.get("keys") or {}).get(provider)
    env_key = env_key_for(provider)
    api_key, source = (saved_key, "saved") if saved_key else ((env_key, "environment") if env_key else (None, "none"))
    mode = ov.get("mode") or os.getenv("LLM_MODE", "auto").lower()
    return Settings(
        llm_mode=mode, llm_provider=provider, llm_model=model, llm_base_url=base_url, base_url_source=base_url_source,
        llm_api_key=api_key, key_source=source,
        database_url=os.getenv("DATABASE_URL") or f"sqlite:///{default_database_path()}",
        seed_dir=os.getenv("SEED_DIR", str(ROOT / "data" / "seed")),
        price_in_per_m=_price("LLM_PRICE_INPUT_PER_M"), price_out_per_m=_price("LLM_PRICE_OUTPUT_PER_M"),
        cors_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"))
