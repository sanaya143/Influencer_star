"""Token usage and cost across everything that calls a model: campaign runs (Insights agent), older runs that still
had the Brief agent, and assistant chat turns.

Cost = tokens x the model's price per million tokens. Prices come from, in order: a price saved in Settings, the
LLM_PRICE_INPUT_PER_M / LLM_PRICE_OUTPUT_PER_M environment variables, the default list below, or zero for free and
local models. A model with no known price is reported as unpriced rather than guessed.
"""
from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from ..db.database import CampaignRow, ChatTurnRow, RunRow, now, session
from . import runtime_settings

# USD per 1M tokens (input, output). Published list prices when this was written; providers change them, so they
# can be edited in Settings.
DEFAULT_PRICES: dict[str, tuple[float, float]] = {
    "gpt-4o-mini": (0.15, 0.60), "gpt-4o": (2.50, 10.00),
    "gemini-2.5-flash": (0.30, 2.50), "gemini-2.5-pro": (1.25, 10.00), "gemini-2.0-flash": (0.10, 0.40),
}


def _bare(model: str) -> str:
    """'openai/gpt-4o-mini' -> 'gpt-4o-mini', 'google/gemini-2.5-flash' -> 'gemini-2.5-flash'."""
    return model.split("/")[-1] if model else ""


def price_for(model: str | None, provider: str | None = None) -> dict | None:
    """{input, output, source} in USD per 1M tokens, or None when the price is unknown."""
    if provider == "fake" or model == "fake-llm":  # scripted test double
        return {"input": 0.0, "output": 0.0, "source": "test model"}
    if not model:
        return None
    saved = (runtime_settings.overrides().get("prices") or {})
    if model in saved:
        p = saved[model]
        return {"input": float(p["input"]), "output": float(p["output"]), "source": "saved in Settings"}
    if model.endswith(":free") or provider == "ollama":
        return {"input": 0.0, "output": 0.0, "source": "free model" if model.endswith(":free") else "local model, no API fee"}
    if os.getenv("LLM_PRICE_INPUT_PER_M") and os.getenv("LLM_PRICE_OUTPUT_PER_M"):
        return {"input": float(os.environ["LLM_PRICE_INPUT_PER_M"]), "output": float(os.environ["LLM_PRICE_OUTPUT_PER_M"]), "source": "environment"}
    if _bare(model) in DEFAULT_PRICES:
        i, o = DEFAULT_PRICES[_bare(model)]
        return {"input": i, "output": o, "source": "default list price"}
    return None


def cost(model: str | None, tokens_in: int, tokens_out: int, provider: str | None = None) -> float | None:
    p = price_for(model, provider)
    if p is None:
        return None
    return round(tokens_in / 1e6 * p["input"] + tokens_out / 1e6 * p["output"], 6)


def save_price(model: str, input_per_m: float | None, output_per_m: float | None) -> None:
    values = dict(runtime_settings.overrides())
    prices = dict(values.get("prices") or {})
    if input_per_m is None or output_per_m is None:
        prices.pop(model, None)
    else:
        prices[model] = {"input": float(input_per_m), "output": float(output_per_m)}
    values["prices"] = prices
    runtime_settings.save(values)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _records(since: datetime) -> list[dict]:
    out: list[dict] = []
    with session() as db:
        runs = db.query(RunRow).filter(RunRow.created_at >= since).all()
        names = {c.id: c.name for c in db.query(CampaignRow).filter(CampaignRow.id.in_({r.campaign_id for r in runs if r.campaign_id})).all()} if runs else {}
        for r in runs:
            u = r.usage or {}
            tin, tout = int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0)
            if not (tin or tout):
                continue
            out.append({"kind": "Campaign run" if r.kind == "match" else "Brief (retired agent)", "id": r.id, "at": _aware(r.created_at),
                        "label": names.get(r.campaign_id) or ("Brief interpretation" if r.kind == "brief" else r.id),
                        "link": f"/admin/campaigns/{r.campaign_id}/agents" if r.campaign_id else "/admin/agents",
                        "model": u.get("model") or (r.trace or {}).get("model"), "provider": u.get("provider") or (r.trace or {}).get("provider"),
                        "in": tin, "out": tout, "token_source": u.get("token_source"), "per_agent": u.get("per_agent") or []})
        for t in db.query(ChatTurnRow).filter(ChatTurnRow.created_at >= since).all():
            u = t.usage or {}
            tin, tout = int(u.get("input_tokens") or 0), int(u.get("output_tokens") or 0)
            if not (tin or tout):
                continue
            out.append({"kind": "Assistant chat", "id": t.id, "at": _aware(t.created_at), "label": t.user_text[:60], "link": "/admin/assistant",
                        "model": t.model or u.get("model"), "provider": u.get("provider"), "in": tin, "out": tout,
                        "token_source": u.get("token_source"), "per_agent": u.get("per_agent") or []})
    for r in out:
        r["cost_usd"] = cost(r["model"], r["in"], r["out"], r["provider"])
    return out


def _total(rows: list[dict]) -> dict:
    tin, tout = sum(r["in"] for r in rows), sum(r["out"] for r in rows)
    priced = [r for r in rows if r["cost_usd"] is not None]
    return {"calls": len(rows), "input_tokens": tin, "output_tokens": tout, "total_tokens": tin + tout,
            "cost_usd": round(sum(r["cost_usd"] for r in priced), 6), "unpriced_calls": len(rows) - len(priced),
            "estimated_tokens": any(r["token_source"] in ("estimated", "mixed") for r in rows)}


def summary(days: int = 30) -> dict:
    t = now()
    rows = _records(t - timedelta(days=days))
    today = [r for r in rows if r["at"] >= t.replace(hour=0, minute=0, second=0, microsecond=0)]
    by_kind: dict[str, list[dict]] = defaultdict(list)
    by_model: dict[str, list[dict]] = defaultdict(list)
    by_agent: dict[str, dict] = defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0})
    for r in rows:
        by_kind[r["kind"]].append(r)
        by_model[r["model"] or "unknown"].append(r)
        for a in r["per_agent"]:
            if a.get("total_tokens"):
                by_agent[a["agent"]]["input_tokens"] += int(a.get("input_tokens") or 0)
                by_agent[a["agent"]]["output_tokens"] += int(a.get("output_tokens") or 0)
    from ..config import get_settings
    s = get_settings()
    current = s.llm_model if s.effective_mode() == "llm" else None
    models = [{"model": m, **_total(rs), "price": price_for(m, rs[0]["provider"])} for m, rs in sorted(by_model.items(), key=lambda kv: -sum(r["in"] + r["out"] for r in kv[1]))]
    agents = []
    for name, v in sorted(by_agent.items(), key=lambda kv: -(kv[1]["input_tokens"] + kv[1]["output_tokens"])):
        agents.append({"agent": name, **v, "total_tokens": v["input_tokens"] + v["output_tokens"]})
    return {
        "period_days": days, "totals": _total(rows), "today": _total(today),
        "by_source": [{"source": k, **_total(v)} for k, v in sorted(by_kind.items())],
        "by_model": models, "by_agent": agents,
        "recent": [{k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in r.items() if k != "per_agent"}
                   for r in sorted(rows, key=lambda r: r["at"], reverse=True)[:8]],
        "current_model": current, "current_price": price_for(current, s.llm_provider) if current else None,
        "unpriced_models": [m["model"] for m in models if m["price"] is None and m["model"] != "unknown"],
        "note": "Cost = tokens x price per million tokens. Free and local models cost nothing per token; prices can be edited in Settings.",
    }
