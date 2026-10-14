"""How model calls check the server's TLS (SSL) certificate, chosen per provider in Settings.

    system  (default) Trust the operating system's certificate store (the Windows store on Windows) through
            `truststore`. Company gateways and proxies whose root certificate IT installed on the machine then work,
            which Python's own bundled list (certifi) would reject with "certificate verify failed".
    custom  Also trust a CA certificate file (.pem / .crt / .cer) the user points to, e.g. a self-signed gateway.
    off     Do not check certificates. Not secure; for local testing only, and labelled as such in the UI.

The choice is applied to LiteLLM (`litellm.ssl_verify`), which every model call goes through: the campaign Insights
agent, the chat assistant and Settings > Test connection.
"""
from __future__ import annotations

import os
import re
import ssl
from functools import lru_cache
from pathlib import Path

from . import runtime_settings

MODES = ("system", "custom", "off")
CA_SUFFIXES = (".pem", ".crt", ".cer")


def saved() -> dict[str, dict]:
    return dict(runtime_settings.overrides().get("tls") or {})


def for_provider(provider: str) -> dict:
    t = saved().get(provider) or {}
    return {"mode": t.get("mode", "system") if t.get("mode") in MODES else "system", "ca_bundle": t.get("ca_bundle") or None}


def check_ca_bundle(path: str | None) -> str:
    """A readable CA certificate file, or ValueError with a message a person can act on."""
    p = (path or "").strip().strip('"')
    if not p:
        raise ValueError("Enter the path to the CA certificate file (.pem, .crt or .cer).")
    f = Path(p).expanduser()
    if f.suffix.lower() not in CA_SUFFIXES:
        raise ValueError("The CA certificate must be a .pem, .crt or .cer file.")
    if not f.is_file():
        raise ValueError(f"No file at {f}. Check the path on the machine running Zylo Reach.")
    try:
        ctx = ssl.create_default_context()
        ctx.load_verify_locations(cafile=str(f))
    except (ssl.SSLError, OSError) as e:
        raise ValueError(f"That file is not a usable CA certificate ({e}). Export it from Windows as Base-64 (.cer) or PEM.") from None
    return str(f)


@lru_cache(maxsize=8)
def _context(mode: str, ca_bundle: str | None):
    if mode == "off":
        return False
    try:
        import truststore
        ctx = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)  # the OS certificate store
    except Exception:  # truststore missing: fall back to Python's bundle
        import certifi
        ctx = ssl.create_default_context(cafile=certifi.where())
    if mode == "custom" and ca_bundle:
        ctx.load_verify_locations(cafile=ca_bundle)
    return ctx


def verify_setting(provider: str, mode: str | None = None, ca_bundle: str | None = None):
    """The value for litellm's ssl_verify: an SSLContext, or False when checking is off."""
    t = for_provider(provider)
    mode = mode or t["mode"]
    ca = ca_bundle if ca_bundle is not None else t["ca_bundle"]
    if os.getenv("ZYLO_TLS_MODE") in MODES and mode == "system" and provider not in saved():
        mode = os.environ["ZYLO_TLS_MODE"]  # environment fallback when nothing is chosen in Settings
    return _context(mode, ca if mode == "custom" else None)


# ------------------------------------------------------------------ proxy
# curl and most tools send traffic through the proxy in HTTPS_PROXY / HTTP_PROXY (honouring NO_PROXY); LiteLLM's
# default HTTP layer ignores them, so behind a company proxy the app tried to connect directly and failed. A proxy can
# also be saved in Settings, because PowerShell sessions often lack the variables a bash profile sets.
_ENV_BEFORE: dict[str, str | None] = {}


def saved_proxy() -> str | None:
    return (runtime_settings.overrides().get("proxy") or None)


def proxy_in_use(override: str | None = None) -> tuple[str | None, str]:
    """(proxy URL, source): the one being tested, the one saved in Settings, the environment's, or none."""
    if override:
        return override, "this test"
    if saved_proxy():
        return saved_proxy(), "saved"
    env = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or os.environ.get("HTTP_PROXY") or os.environ.get("http_proxy")
    if env and not _ENV_BEFORE:
        return env, "environment"
    if _ENV_BEFORE and any(v for v in _ENV_BEFORE.values()):
        orig = _ENV_BEFORE.get("HTTPS_PROXY") or _ENV_BEFORE.get("HTTP_PROXY")
        return orig, "environment" if orig else "none"
    return None, "none"


def mask_proxy(url: str | None) -> str | None:
    return re.sub(r"//[^/@]+@", "//***:***@", url) if url else url


def _set_proxy_env(proxy: str | None) -> None:
    for k in ("HTTPS_PROXY", "HTTP_PROXY"):
        if proxy:
            _ENV_BEFORE.setdefault(k, os.environ.get(k))
            os.environ[k] = proxy
        elif k in _ENV_BEFORE:  # proxy cleared in Settings: put the original environment back
            orig = _ENV_BEFORE.pop(k)
            if orig is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = orig


def apply(provider: str, mode: str | None = None, ca_bundle: str | None = None, proxy: str | None = None) -> None:
    """Point every LiteLLM call at the chosen certificate check and proxy (one provider is active at a time)."""
    import litellm
    litellm.aiohttp_trust_env = True  # honour HTTPS_PROXY / HTTP_PROXY / NO_PROXY like curl does
    before = (os.environ.get("HTTPS_PROXY"), os.environ.get("HTTP_PROXY"))
    _set_proxy_env(proxy or saved_proxy())
    new = verify_setting(provider, mode, ca_bundle)
    if litellm.ssl_verify is not new or before != (os.environ.get("HTTPS_PROXY"), os.environ.get("HTTP_PROXY")):
        litellm.ssl_verify = new
        # LiteLLM caches its HTTP clients per endpoint with the certificate setting baked in; drop them so the
        # next call connects with the new setting instead of reusing a client built with the old one.
        try:
            litellm.in_memory_llm_clients_cache.flush_cache()
        except Exception:
            pass


def error_chain(exc: BaseException, secret: str | None = None, limit: int = 1200) -> str:
    """The whole cause chain of an error as text, for the 'technical details' a person can copy and share."""
    parts, x, n = [], exc, 0
    while x is not None and n < 8:
        parts.append(f"{type(x).__name__}: {str(x).strip()[:400]}")
        x = x.__cause__ or x.__context__
        n += 1
    text = "\n  caused by ".join(parts)
    if secret and len(secret) >= 6:
        text = text.replace(secret, "***")
    text = re.sub(r"\b(?:sk|AIza|gsk|xai)[-_A-Za-z0-9*]{6,}", "***", text)
    text = re.sub(r"([?&]key=)[^&\s]+", r"\1***", text)
    return text[:limit]


# ------------------------------------------------------------------ explaining failures
_SSL_PAT = re.compile(r"certificate verify failed|CERTIFICATE_VERIFY_FAILED|SSLCertVerificationError|self[- ]signed certificate|"
                      r"unable to get local issuer certificate|certificate has expired|hostname mismatch|wrong version number|"
                      r"SSLError", re.I)


def ssl_problem(exc: BaseException) -> str | None:
    """If an exception (anywhere in its cause chain) is a TLS certificate failure, a plain explanation of it."""
    seen, x, text = 0, exc, []
    while x is not None and seen < 8:
        text.append(f"{type(x).__name__}: {x}")
        x = x.__cause__ or x.__context__
        seen += 1
    blob = " | ".join(text)
    if not _SSL_PAT.search(blob):
        return None
    if re.search(r"expired", blob, re.I):
        why = "the server's certificate has expired"
    elif re.search(r"hostname mismatch|doesn't match|not valid for", blob, re.I):
        why = "the certificate does not match the base URL's host name"
    elif re.search(r"wrong version number", blob, re.I):
        why = "the server does not speak HTTPS on that address (try http:// or check the port)"
    else:
        why = "the server's certificate is not trusted on this machine (self-signed, or signed by a company CA)"
    return f"SSL certificate check failed: {why}."


SSL_HINT = ("Ask IT to install the gateway's root certificate in Windows (then keep 'Windows certificates'), or choose "
            "'Use a CA certificate file' and point to the .pem/.crt file. 'Off' works for testing but is not secure.")
