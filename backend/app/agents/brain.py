"""Agent 'brain': what a model saw, thought and decided on each turn, captured through ADK model callbacks and stored in
the run trace (`trace["brain"]`). Nothing here changes behaviour; it only observes."""
from __future__ import annotations

import json
import time
from typing import Any

from .recorder import Recorder, redact

INPUT_LIMIT = 600
TEXT_LIMIT = 1500


def _clip(s: str, n: int) -> str:
    s = s.strip()
    return s if len(s) <= n else s[: n - 1] + "…"


def _compact(obj: Any, n: int = 260) -> str:
    try:
        return _clip(json.dumps(redact(obj), default=str, ensure_ascii=False), n)
    except Exception:
        return "(unreadable)"


def describe_request(llm_request: Any) -> str:
    """What the model was just shown: the latest user message or tool result (the long system prompt is not repeated)."""
    try:
        contents = llm_request.contents or []
        if not contents:
            return ""
        last = contents[-1]
        bits = []
        for p in last.parts or []:
            if getattr(p, "function_response", None):
                fr = p.function_response
                bits.append(f"tool result {fr.name} → {_compact(fr.response, 360)}")
            elif getattr(p, "text", None) and not getattr(p, "thought", False):
                bits.append(p.text)
        who = "tool" if any(getattr(p, "function_response", None) for p in last.parts or []) else (last.role or "user")
        return _clip(f"{who}: " + " ".join(bits), INPUT_LIMIT)
    except Exception:
        return ""


def describe_response(llm_response: Any) -> dict:
    thought, output, calls = [], [], []
    content = getattr(llm_response, "content", None)
    for p in (getattr(content, "parts", None) or []):
        if getattr(p, "function_call", None):
            fc = p.function_call
            calls.append({"name": fc.name, "args": redact(dict(fc.args or {}))})
        elif getattr(p, "text", None):
            (thought if getattr(p, "thought", False) else output).append(p.text)
    err = getattr(llm_response, "error_message", None)
    um = getattr(llm_response, "usage_metadata", None)
    return {"thought": _clip("\n".join(thought), TEXT_LIMIT) or None,
            "output": _clip("\n".join(output), TEXT_LIMIT) or (f"(model error: {err})" if err else None),
            "calls": calls, "error": err,
            "tokens": {"in": getattr(um, "prompt_token_count", None), "out": getattr(um, "candidates_token_count", None)} if um else None}


def model_hooks(rec: Recorder, agent: str, model: str | None):
    """ADK (before_model_callback, after_model_callback) pair that records one brain event per model call."""
    state: dict[str, Any] = {}

    def before(callback_context, llm_request):
        state["t0"] = time.perf_counter()
        state["input"] = describe_request(llm_request)
        return None

    def after(callback_context, llm_response):
        d = describe_response(llm_response)
        rec.brain(agent, "llm", model=model, input=state.pop("input", ""), duration_ms=round((time.perf_counter() - state.pop("t0", time.perf_counter())) * 1000),
                  **d)
        return None

    return before, after
