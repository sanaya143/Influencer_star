"""Connection test for the model/token entered on the Settings page."""
from __future__ import annotations

import asyncio
import re
import time

from ..config import PROVIDERS, litellm_model

HINTS = {
    401: "The access token was rejected. Check that it is correct, active and for this provider.",
    403: "The token is valid but not allowed to use this model or endpoint.",
    404: "Model or endpoint not found. Check the model id (and base URL for Ollama/custom).",
    408: "The provider timed out. Free models can be slow; try again.",
    502: "The provider's upstream service is unavailable. Free models do this often; retry in a few seconds.",
    503: "The provider's upstream service is overloaded. Free models do this often; retry in a few seconds.",
    429: "Rate limited or out of quota. Free models have tight limits; wait a moment and retry.",
}


def clean(msg: str, secret: str | None) -> str:
    msg = " ".join(str(msg).split())
    if secret:
        msg = msg.replace(secret, "***")
        if len(secret) >= 10:  # providers sometimes echo a partially masked key (sk-abc***1234)
            msg = msg.replace(secret[:8], "***").replace(secret[-4:], "***")
    msg = re.sub(r"\b(?:sk|AIza|gsk|xai)[-_A-Za-z0-9*]{6,}", "***", msg)
    return msg[:500]


async def test_connection(provider: str, model: str, api_key: str | None, base_url: str | None,
                          tls_mode: str | None = None, ca_bundle: str | None = None, proxy: str | None = None) -> dict:
    spec = PROVIDERS.get(provider)
    if spec is None:
        return {"ok": False, "error": f"Unknown provider '{provider}'.", "hint": None}
    if not model.strip():
        return {"ok": False, "error": "Enter a model id.", "hint": None}
    if spec["needs_key"] and not api_key:
        return {"ok": False, "error": f"{spec['label']} needs an access token.", "hint": "Paste the token above, or save one first."}
    import litellm  # imported lazily so the API starts even if litellm is missing

    from . import tls
    tls.apply(provider, tls_mode, ca_bundle, proxy)  # the certificate check and proxy being tested (may differ from the saved ones)
    used_proxy, proxy_source = tls.proxy_in_use(proxy)
    route = {"url": base_url or PROVIDERS[provider].get("endpoint"), "proxy": tls.mask_proxy(used_proxy), "proxy_source": proxy_source,
             "certificate_check": tls_mode or tls.for_provider(provider)["mode"]}

    name = litellm_model(provider, model.strip())
    kwargs: dict = {"model": name, "messages": [{"role": "user", "content": "Reply with the single word OK."}], "max_tokens": 64, "timeout": 60}
    if api_key:
        kwargs["api_key"] = api_key
    if base_url:
        kwargs["api_base"] = base_url
    t0 = time.perf_counter()
    try:
        resp = await litellm.acompletion(**kwargs)
    except Exception as e:  # provider/network errors vary widely; report them without leaking the token
        problem = tls.ssl_problem(e)
        details = tls.error_chain(e, api_key)
        if problem:  # LiteLLM reports these as "InternalServerError 500 ... Connection error", which hides the cause
            hint = tls.SSL_HINT
            if (tls_mode or tls.for_provider(provider)["mode"]) == "off":
                hint = ("Certificate checking is already off, so the TLS connection itself is failing: usually a company proxy the app "
                        "is not using. Enter the proxy in Settings (the same one curl uses: run  echo %HTTPS_PROXY%  or check your "
                        "browser's proxy settings), or check the base URL's scheme and port.")
            return {"ok": False, "error": problem, "status": None, "ssl": True, "hint": hint, "details": details, "route": route,
                    "latency_ms": round((time.perf_counter() - t0) * 1000)}
        status = getattr(e, "status_code", None)
        if status == 500 and re.search(r"connection error|cannot connect|connecterror|timed out", details, re.I):
            status = None  # a network failure, not a server's HTTP 500
        return {"ok": False, "error": clean(getattr(e, "message", None) or str(e), api_key), "status": status, "details": details, "route": route,
                "hint": HINTS.get(status) if status else "Could not reach the provider. Check your network and base URL.",
                "latency_ms": round((time.perf_counter() - t0) * 1000)}
    usage = getattr(resp, "usage", None)
    text = ""
    try:
        text = (resp.choices[0].message.content or "").strip()
    except Exception:
        pass
    return {"ok": True, "latency_ms": round((time.perf_counter() - t0) * 1000), "model": name, "reply": clean(text, api_key)[:80],
            "prompt_tokens": getattr(usage, "prompt_tokens", None), "completion_tokens": getattr(usage, "completion_tokens", None),
            "supports_tools": await _probe_tools(litellm, kwargs)}


async def _probe_tools(litellm, base_kwargs: dict) -> bool | None:
    """Ask the model to call a trivial tool. True = it did, False = it answered without one, None = probe failed."""
    kw = {**base_kwargs, "max_tokens": 128, "messages": [{"role": "user", "content": "Call the ping tool with value 'hi'."}],
          "tools": [{"type": "function", "function": {"name": "ping", "description": "Echo a value.",
                                                      "parameters": {"type": "object", "properties": {"value": {"type": "string"}}, "required": ["value"]}}}]}
    for attempt in range(2):  # one retry: free models return transient 503s
        try:
            resp = await litellm.acompletion(**kw)
            return bool(resp.choices[0].message.tool_calls)
        except Exception:
            if attempt == 0:
                await asyncio.sleep(2)
    return None
