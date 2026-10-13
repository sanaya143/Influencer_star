"""Activity log of calls made to the MCP server by outside agents. Logging must never break a tool call, so every
write is best-effort."""
from __future__ import annotations

import json
import logging
from collections import Counter
from datetime import datetime, timedelta, timezone

from ..agents.recorder import redact
from ..db.database import McpCallRow, now, session

log = logging.getLogger("zylo.mcp")
MAX_ROWS = 5000  # older rows are pruned
ARGS_LIMIT = 300


def summarize_args(args: object) -> str:
    """Compact JSON of the inputs with secrets masked and long values trimmed."""
    try:
        s = json.dumps(redact(args or {}), default=str, ensure_ascii=False)
    except Exception:
        s = "(unreadable)"
    return s if len(s) <= ARGS_LIMIT else s[: ARGS_LIMIT - 1] + "…"


def record(*, client: str, transport: str, kind: str, name: str, args: object, status: str, error: str | None,
           duration_ms: float, result_hint: str | None, changes_data: bool) -> None:
    try:
        with session() as db:
            row = McpCallRow(client=client[:80], transport=transport, kind=kind, name=name[:120], args=summarize_args(args), status=status,
                             error=(error or None) and error[:300], duration_ms=round(duration_ms, 1), result_hint=result_hint and result_hint[:120],
                             changes_data=int(changes_data))
            db.add(row)
            db.commit()
            if row.id % 200 == 0:
                db.query(McpCallRow).filter(McpCallRow.id <= row.id - MAX_ROWS).delete()
                db.commit()
    except Exception as e:  # never let logging fail a tool call
        log.warning("could not record MCP call: %s", e)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _view(r: McpCallRow) -> dict:
    return {"id": r.id, "at": _aware(r.at).isoformat(), "client": r.client, "transport": r.transport, "kind": r.kind, "name": r.name,
            "args": r.args, "status": r.status, "error": r.error, "duration_ms": r.duration_ms, "result_hint": r.result_hint,
            "changes_data": bool(r.changes_data)}


def recent(limit: int = 50, status: str = "", tool: str = "", changes_only: bool = False, after_id: int = 0) -> list[dict]:
    with session() as db:
        q = db.query(McpCallRow)
        if status:
            q = q.filter(McpCallRow.status == status)
        if tool:
            q = q.filter(McpCallRow.name == tool)
        if changes_only:
            q = q.filter(McpCallRow.changes_data == 1)
        if after_id:
            q = q.filter(McpCallRow.id > after_id)
        return [_view(r) for r in q.order_by(McpCallRow.id.desc()).limit(limit).all()]


def summary() -> dict:
    with session() as db:
        rows = db.query(McpCallRow.at, McpCallRow.name, McpCallRow.client, McpCallRow.status, McpCallRow.changes_data, McpCallRow.duration_ms).all()
    hour = now() - timedelta(hours=1)
    last_hour = [r for r in rows if _aware(r.at) >= hour]
    return {"total": len(rows), "last_hour": len(last_hour), "errors": sum(r.status == "error" for r in rows),
            "changes": sum(bool(r.changes_data) for r in rows),
            "avg_ms": round(sum(r.duration_ms for r in rows) / len(rows), 1) if rows else 0.0,
            "top_tools": [{"name": n, "count": c} for n, c in Counter(r.name for r in rows).most_common(5)],
            "clients": [{"name": n, "count": c} for n, c in Counter(r.client for r in rows).most_common(5)]}
