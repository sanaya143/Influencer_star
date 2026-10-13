"""Run recorder: builds the observable execution trace + token usage for an agent run."""
from __future__ import annotations

import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable

from ..config import get_settings

SECRET_KEY = re.compile(r"(key|token|secret|password|authorization|credential)", re.I)

AGENT_META = {
    "CampaignBriefAgent": ("Campaign Brief Agent", "Turns a marketing request into a validated CampaignBrief."),
    "MatchingCoordinatorAgent": ("Matching Coordinator Agent", "Runs the deterministic Python L1 filter, L2 matcher and ranking engine."),
    "CampaignInsightsAgent": ("Campaign Insights Agent", "Explains the ranked results and suggests next steps."),
    "ConciergeAgent": ("Concierge Agent", "Chat coordinator: decides which specialist agents to call and writes the answer."),
    "InventoryAgent": ("Inventory Agent", "Catalogue, stock levels, orders and sales."),
    "CreatorAgent": ("Creator Agent", "Browses and inspects the creator dataset."),
    "MatchingAgent": ("Matching Agent", "Ranks creators for a product with the deterministic engine."),
    "CampaignAgent": ("Campaign Agent", "Saved campaigns: results, explanations, launching the agent workflow."),
}


def ts() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def redact(obj: Any, depth: int = 0) -> Any:
    """Remove secrets and shrink large payloads for storage in the trace."""
    if depth > 4:
        return "…"
    if isinstance(obj, dict):
        return {k: ("[REDACTED]" if SECRET_KEY.search(str(k)) else redact(v, depth + 1)) for k, v in list(obj.items())[:25]}
    if isinstance(obj, (list, tuple)):
        head = [redact(v, depth + 1) for v in obj[:5]]
        return head + [f"… (+{len(obj) - 5} more)"] if len(obj) > 5 else head
    if isinstance(obj, str):
        return obj if len(obj) <= 400 else obj[:400] + "…"
    return obj


def _short(obj: Any, n: int = 300) -> str:
    import json
    try:
        s = json.dumps(obj, default=str, ensure_ascii=False)
    except Exception:
        s = str(obj)
    return s if len(s) <= n else s[: n - 1] + "…"


def estimate_tokens(text: str) -> int:
    """Documented approximation: ~4 characters per token (used only when the provider reports no usage)."""
    return max(1, len(text) // 4) if text else 0


class Recorder:
    def __init__(self, kind: str, campaign_id: str | None, agent_names: list[str], on_change: Callable[[dict], None] | None = None):
        s = get_settings()
        self.on_change = on_change
        self._t0: dict[str, float] = {}
        self.trace: dict[str, Any] = {
            "run_id": f"run_{uuid.uuid4().hex[:10]}", "campaign_id": campaign_id, "kind": kind, "status": "Pending",
            "started_at": ts(), "completed_at": None, "mode": s.effective_mode(),
            "provider": s.llm_provider if s.effective_mode() == "llm" else "none (offline deterministic mode)",
            "model": s.llm_model if s.effective_mode() == "llm" else None, "summary": None, "steps": [],
            "agents": [self._new_agent(n) for n in agent_names], "brain": [],
        }

    @staticmethod
    def _new_agent(name: str) -> dict:
        label, desc = AGENT_META.get(name, (name, ""))
        return {"id": name, "name": label, "role": desc, "status": "Pending", "started_at": None, "completed_at": None,
                "duration_ms": None, "tools": [], "output_summary": None, "input_tokens": 0, "output_tokens": 0,
                "total_tokens": 0, "token_source": "none", "llm_calls": 0, "errors": [], "retries": 0}

    @property
    def run_id(self) -> str:
        return self.trace["run_id"]

    def agent(self, name: str) -> dict:
        for a in self.trace["agents"]:
            if a["id"] == name:
                return a
        a = self._new_agent(name)
        self.trace["agents"].append(a)
        return a

    def _changed(self) -> None:
        if self.on_change:
            self.on_change(self.trace)

    MAX_BRAIN = 300

    def brain(self, agent: str, kind: str, **data: Any) -> None:
        """Append one entry to the agent-brain timeline. kind: llm (a model turn), tool, rule (deterministic decision), note."""
        b = self.trace["brain"]
        if len(b) >= self.MAX_BRAIN:
            return
        b.append({"seq": len(b) + 1, "ts": ts(), "agent": agent, "kind": kind, **{k: v for k, v in data.items() if v not in (None, "", [])}})
        self._changed()

    def step(self, agent: str, kind: str, detail: str) -> None:
        self.trace["steps"].append({"ts": ts(), "agent": agent, "kind": kind, "detail": detail})

    def start_run(self) -> None:
        self.trace["status"] = "Running"
        self._changed()

    def start_agent(self, name: str) -> None:
        a = self.agent(name)
        if a["status"] == "Running":
            return
        a["status"], a["started_at"] = "Running", ts()
        self._t0[name] = time.perf_counter()
        self.step(name, "agent_start", f"{a['name']} started")
        self._changed()

    def end_agent(self, name: str, summary: str | None = None, status: str = "Completed") -> None:
        a = self.agent(name)
        if a["status"] in ("Failed",) and status == "Completed":
            return
        a["status"], a["completed_at"] = status, ts()
        a["duration_ms"] = round((time.perf_counter() - self._t0.get(name, time.perf_counter())) * 1000)
        if summary:
            a["output_summary"] = summary
        self.step(name, "agent_end", f"{a['name']} {status.lower()}")
        self._changed()

    def tool_call(self, agent: str, tool: str, tool_input: Any, output: Any, duration_ms: float, error: str | None = None) -> None:
        a = self.agent(agent)
        a["tools"].append({"name": tool, "input": redact(tool_input), "output": redact(output), "duration_ms": round(duration_ms, 1),
                           "error": error, "at": ts()})
        if error:
            a["errors"].append(f"{tool}: {error}")
        self.step(agent, "tool_call", f"{tool}" + (f" failed: {error}" if error else " ok"))
        out = redact(output)
        self.brain(agent, "tool", name=tool, args=redact(tool_input), result=None if error else _short(out), error=error, duration_ms=round(duration_ms, 1))
        self._changed()

    def add_usage(self, agent: str, input_tokens: int | None, output_tokens: int | None, fallback_text_in: str = "", fallback_text_out: str = "") -> None:
        a = self.agent(agent)
        a["llm_calls"] += 1
        if input_tokens is not None or output_tokens is not None:
            a["input_tokens"] += input_tokens or 0
            a["output_tokens"] += output_tokens or 0
            a["token_source"] = "actual" if a["token_source"] in ("none", "actual") else "mixed"
        else:
            a["input_tokens"] += estimate_tokens(fallback_text_in)
            a["output_tokens"] += estimate_tokens(fallback_text_out)
            a["token_source"] = "estimated" if a["token_source"] in ("none", "estimated") else "mixed"
        a["total_tokens"] = a["input_tokens"] + a["output_tokens"]
        self._changed()

    def error(self, agent: str, msg: str) -> None:
        a = self.agent(agent)
        a["errors"].append(msg)
        self.step(agent, "error", msg)
        self.brain(agent, "note", level="error", text=msg[:400])

    def finish(self, status: str, summary: str) -> dict:
        self.trace["status"], self.trace["completed_at"], self.trace["summary"] = status, ts(), summary
        self._changed()
        return self.trace

    def usage(self) -> dict:
        s = get_settings()
        agents = self.trace["agents"]
        tin = sum(a["input_tokens"] for a in agents)
        tout = sum(a["output_tokens"] for a in agents)
        sources = {a["token_source"] for a in agents if a["llm_calls"]}
        source = "none" if not sources else sources.pop() if len(sources) == 1 else "mixed"
        cost = None
        if s.price_in_per_m is not None and s.price_out_per_m is not None and source != "none":
            cost = round(tin / 1e6 * s.price_in_per_m + tout / 1e6 * s.price_out_per_m, 6)
        mode = self.trace["mode"]
        note = ("Offline deterministic mode: no LLM was called, so no tokens were used." if mode == "offline" else
                "Token counts reported by the model provider." if source == "actual" else
                "Provider did not report usage; counts are estimates (~4 characters per token)." if source in ("estimated", "mixed") else "")
        if s.llm_provider == "ollama" and mode == "llm":
            note += " Local models (e.g. Ollama) have no per-token API fee but still consume local compute."
        return {
            "run_id": self.run_id, "model": self.trace["model"], "provider": self.trace["provider"], "mode": mode,
            "input_tokens": tin, "output_tokens": tout, "total_tokens": tin + tout, "token_source": source,
            "estimated_cost_usd": cost, "cost_note": None if cost is not None else "No pricing configured (set LLM_PRICE_INPUT_PER_M / LLM_PRICE_OUTPUT_PER_M).",
            "note": note.strip(), "executed_at": self.trace["completed_at"] or self.trace["started_at"],
            "per_agent": [{"agent": a["name"], "input_tokens": a["input_tokens"], "output_tokens": a["output_tokens"],
                           "total_tokens": a["total_tokens"], "token_source": a["token_source"]} for a in agents],
        }
