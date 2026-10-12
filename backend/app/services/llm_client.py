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
    msg = re.sub(r"(?:sk|AIza|gsk|xai)[-_A-Za-z0-9*]{6,}", "***", msg)
    return msg[:500]


async def test_connection(provider: str, model: str, api_key: str | None, base_url: str | None) -> dict:
    spec = PROVIDERS.get(provider)
    if spec is None:
        return {"ok": False, "error": f"Unknown provider '{provider}'.", "hint": None}
    if not model.strip():
        return {"ok": False, "error": "Enter a model id.", "hint": None}
    if spec["needs_key"] and not api_key:
        return {"ok": False, "error": f"{spec['label']} needs an access token.", "hint": "Paste the token above, or save one first."}
    import litellm  # imported lazily so the API starts even if litellm is missing

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
        status = getattr(e, "status_code", None)
        return {"ok": False, "error": clean(getattr(e, "message", None) or str(e), api_key), "status": status,
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
