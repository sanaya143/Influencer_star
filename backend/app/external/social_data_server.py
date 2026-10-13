"""A stand-in for an outside creator-data provider, reachable only over MCP.

Zylo's Matching Coordinator connects to it as an MCP *client* to pull creators that are not in Zylo's own dataset.
In production this would be a real provider's MCP server (point ZYLO_EXTERNAL_MCP_URL at it); this mock serves
synthetic profiles from data/external/creators.json.

Run it the way the client does:  python -m app.external.social_data_server   (stdio)
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Any

from mcp.server.fastmcp import FastMCP
from pydantic import Field

DATA = Path(__file__).resolve().parents[3] / "data" / "external" / "creators.json"
PROVIDER = "SocialGraph (mock MCP provider)"

mcp = FastMCP("socialgraph-mock", log_level="WARNING", instructions=(
    "Outside creator-data provider (mock). Search creators by the themes they post about, platform and size. "
    "All profiles are synthetic demonstration data."))

_cache: list[dict] | None = None


def _creators() -> list[dict]:
    global _cache
    if _cache is None:
        if not DATA.exists():  # first run on a fresh checkout
            from app.data.seed_generator import write_external
            write_external()
        _cache = json.loads(DATA.read_text("utf-8"))
    return _cache


@mcp.tool()
def search_creators(themes: Annotated[list[str], Field(description="Content themes, e.g. ['marvel', 'comics']; empty = any")] = [],  # noqa: B006
                    platforms: Annotated[list[str], Field(description="Instagram, TikTok, YouTube; empty = any")] = [],  # noqa: B006
                    min_followers: Annotated[int, Field(ge=0)] = 0,
                    limit: Annotated[int, Field(ge=1, le=300)] = 100) -> dict[str, Any]:
    """Creators who post about any of the given themes, with full profiles (audience, metrics, rate card)."""
    want = {t.lower() for t in themes}
    plats = {p.lower() for p in platforms}
    hits = [c for c in _creators()
            if (not want or want & {t.lower() for t in c.get("content_themes", [])})
            and (not plats or (c.get("platform") or "").lower() in plats)
            and (c.get("follower_count") or 0) >= min_followers]
    hits.sort(key=lambda c: (-len(want & set(c.get("content_themes", []))), c["influencer_id"]))
    return {"provider": PROVIDER, "total_matches": len(hits), "returned": min(limit, len(hits)), "creators": hits[:limit],
            "data_note": "Synthetic demonstration data"}


@mcp.tool()
def get_creator(influencer_id: str) -> dict[str, Any]:
    """One creator's full profile by id (X0001...)."""
    c = next((c for c in _creators() if c["influencer_id"] == influencer_id), None)
    if c is None:
        raise ValueError(f"Creator '{influencer_id}' not found at {PROVIDER}")
    return c


@mcp.resource("socialgraph://about", mime_type="text/markdown")
def about() -> str:
    """What this provider offers."""
    return f"# {PROVIDER}\n\n{len(_creators())} creator profiles with content themes, audience mix and rate cards. Synthetic data."


if __name__ == "__main__":
    mcp.run()  # stdio
