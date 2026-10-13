"""Outside creator data, fetched over MCP.

Zylo acts as an MCP *client* here: the Matching Coordinator asks an outside provider's MCP server for creators who
post about the campaign's themes and adds them to the pool. By default it launches the bundled mock provider
(app/external/social_data_server.py) over stdio; set ZYLO_EXTERNAL_MCP_URL to use a real provider over Streamable
HTTP instead. Every outbound call is written to the MCP activity log, and fetched profiles are cached so results
and profiles still open later. If the provider cannot be reached, matching carries on with Zylo's own data.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import time
from datetime import timedelta
from pathlib import Path
from typing import Any

from ..db.database import ExternalCreatorRow, now, session
from ..schemas.models import Influencer
from . import mcp_log, runtime_settings

log = logging.getLogger("zylo.external")
BACKEND_DIR = Path(__file__).resolve().parents[2]
TIMEOUT_S = 40.0
CACHE_DAYS = 30


# ------------------------------------------------------------------ configuration
def config() -> dict:
    """Whether outside data is used, and how the provider is reached."""
    saved = (runtime_settings.overrides().get("external_data") or {})
    env = os.getenv("ZYLO_EXTERNAL_MCP", "on").lower()
    enabled = saved.get("enabled", env not in ("0", "off", "false", "no"))
    url = os.getenv("ZYLO_EXTERNAL_MCP_URL", "").strip()
    cmd = os.getenv("ZYLO_EXTERNAL_MCP_CMD", "").strip()
    return {"enabled": bool(enabled), "transport": "http" if url else "stdio", "url": url or None,
            "command": cmd or f"{Path(sys.executable).name} -m app.external.social_data_server",
            "label": "Outside provider over Streamable HTTP" if url else "Bundled mock provider (SocialGraph) over stdio"}


def set_enabled(enabled: bool) -> dict:
    values = dict(runtime_settings.overrides())
    values["external_data"] = {**(values.get("external_data") or {}), "enabled": bool(enabled)}
    runtime_settings.save(values)
    return config()


# ------------------------------------------------------------------ MCP client plumbing
async def _session_call(calls: list[tuple[str, dict]]) -> tuple[str, list[Any]]:
    """Open one MCP session, run the tool calls in order, return (server name, results)."""
    from mcp import ClientSession
    cfg = config()
    if cfg["url"]:
        from mcp.client.streamable_http import streamablehttp_client
        token = os.getenv("ZYLO_EXTERNAL_MCP_TOKEN", "")
        headers = {"Authorization": f"Bearer {token}"} if token else None
        cm = streamablehttp_client(cfg["url"], headers=headers)
    else:
        from mcp.client.stdio import StdioServerParameters, stdio_client
        cmd = os.getenv("ZYLO_EXTERNAL_MCP_CMD", "").split() or [sys.executable, "-m", "app.external.social_data_server"]
        params = StdioServerParameters(command=cmd[0], args=cmd[1:], cwd=str(BACKEND_DIR),
                                       env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"})
        cm = stdio_client(params)
    async with cm as streams:
        read, write = streams[0], streams[1]
        async with ClientSession(read, write) as s:
            init = await s.initialize()
            server = init.serverInfo.name if init and init.serverInfo else "outside provider"
            results = []
            for name, args in calls:
                t0 = time.perf_counter()
                try:
                    res = await s.call_tool(name, args)
                    if res.isError:
                        raise RuntimeError(" ".join(getattr(c, "text", "") for c in res.content) or "tool error")
                    data = res.structuredContent
                    if isinstance(data, dict) and set(data) == {"result"}:
                        data = data["result"]
                    if data is None:
                        data = json.loads(next(c.text for c in res.content if getattr(c, "text", None)))
                    _log(server, cfg, name, args, "ok", None, t0, data)
                    results.append(data)
                except Exception as e:
                    _log(server, cfg, name, args, "error", str(e), t0, None)
                    raise
            return server, results


def _log(server: str, cfg: dict, name: str, args: dict, status: str, error: str | None, t0: float, data: Any) -> None:
    hint = None
    if isinstance(data, dict) and "creators" in data:
        hint = f"{data.get('returned', len(data['creators']))} of {data.get('total_matches', '?')} creators"
    mcp_log.record(client=f"Zylo → {server}", transport=f"outbound {cfg['transport']}", kind="tool", name=name, args=args,
                   status=status, error=error, duration_ms=(time.perf_counter() - t0) * 1000, result_hint=hint, changes_data=False)


def _run_blocking(calls: list[tuple[str, dict]]) -> tuple[str, list[Any]]:
    """Run the client on its own event loop in this (worker) thread. On Windows a Proactor loop is needed to spawn
    the stdio subprocess, whatever loop the web server uses."""
    loop = asyncio.ProactorEventLoop() if sys.platform == "win32" else asyncio.new_event_loop()
    try:
        return loop.run_until_complete(asyncio.wait_for(_session_call(calls), TIMEOUT_S))
    finally:
        loop.close()


# ------------------------------------------------------------------ public API
def fetch(themes: list[str], limit: int = 120, min_followers: int = 0) -> dict:
    """Ask the outside provider for creators who post about any of `themes`. Never raises: on failure returns an
    empty list with the error, so the caller can carry on with Zylo's own data."""
    cfg = config()
    t0 = time.perf_counter()
    args = {"themes": themes, "limit": limit, "min_followers": min_followers}
    try:
        server, (data,) = _run_blocking([("search_creators", args)])
        creators = [Influencer(**c) for c in data.get("creators", [])]
        _cache_put(creators)
        return {"ok": True, "server": server, "transport": cfg["transport"], "creators": creators, "total_matches": data.get("total_matches"),
                "duration_ms": round((time.perf_counter() - t0) * 1000, 1), "error": None}
    except Exception as e:
        msg = f"{type(e).__name__}: {e}" if str(e) else type(e).__name__
        log.warning("outside creator data unavailable: %s", msg)
        return {"ok": False, "server": None, "transport": cfg["transport"], "creators": [], "total_matches": 0,
                "duration_ms": round((time.perf_counter() - t0) * 1000, 1), "error": msg[:300]}


def probe() -> dict:
    """Connection check for the Settings page: connect, list what the provider offers, run one small search."""
    t0 = time.perf_counter()
    try:
        server, (data,) = _run_blocking([("search_creators", {"themes": [], "limit": 1})])
        return {"ok": True, "server": server, "creators_available": data.get("total_matches"), **config(),
                "duration_ms": round((time.perf_counter() - t0) * 1000, 1)}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"[:300], **config(), "duration_ms": round((time.perf_counter() - t0) * 1000, 1)}


# ------------------------------------------------------------------ cache
def _cache_put(creators: list[Influencer]) -> None:
    if not creators:
        return
    try:
        with session() as db:
            for c in creators:
                row = db.get(ExternalCreatorRow, c.influencer_id)
                if row is None:
                    db.add(ExternalCreatorRow(id=c.influencer_id, source=c.source, data=c.model_dump()))
                else:
                    row.data, row.source, row.fetched_at = c.model_dump(), c.source, now()
            db.commit()
    except Exception as e:  # a cache failure must not break matching
        log.warning("could not cache outside creators: %s", e)


def cached(influencer_id: str) -> Influencer | None:
    with session() as db:
        r = db.get(ExternalCreatorRow, influencer_id)
        return Influencer(**r.data) if r else None


def cache_stats() -> dict:
    with session() as db:
        rows = db.query(ExternalCreatorRow.fetched_at, ExternalCreatorRow.source).all()
    fresh = [r for r in rows if r.fetched_at.replace(tzinfo=r.fetched_at.tzinfo or now().tzinfo) >= now() - timedelta(days=CACHE_DAYS)]
    return {"cached_creators": len(rows), "fresh": len(fresh), "sources": sorted({r.source for r in rows})}
