"""Read-only API over the MCP activity log (what outside agents did through the MCP server)."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query

from ..mcp_server import INFO
from ..services import mcp_log

router = APIRouter(prefix="/api/mcp")


@router.get("/calls")
def calls(limit: int = Query(50, ge=1, le=200), status: Literal["", "ok", "error"] = "", tool: str = "", changes_only: bool = False,
          after_id: int = Query(0, ge=0)):
    """Most recent calls first. `after_id` returns only calls newer than that id (for polling)."""
    return {"items": mcp_log.recent(limit, status, tool, changes_only, after_id), "summary": mcp_log.summary(),
            "server": {**INFO, "endpoint": "/mcp"}}
