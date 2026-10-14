"""Zylo backend entrypoint:  uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

import warnings
from contextlib import asynccontextmanager

warnings.filterwarnings("ignore", category=FutureWarning)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.chat_routes import router as chat_router
from .api.inventory_routes import router as inventory_router
from .api.mcp_routes import router as mcp_router
from .api.routes import router
from .api.settings_routes import router as settings_router
from .config import ROOT, get_settings
from .db.database import init_db
from .mcp_server import McpHttpMount
from .security import SecurityHeadersMiddleware
from .services import runtime_settings
from .services.data_provider import get_provider


mcp_mount = McpHttpMount()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    runtime_settings.load()  # provider/model/token saved from the Settings page
    from .services import tls
    tls.apply(get_settings().llm_provider)  # certificate check for model calls (Windows store by default)
    get_provider()  # load/generate synthetic seed data
    async with mcp_mount.running():  # MCP server (Streamable HTTP) lives and dies with the app
        yield


app = FastAPI(title="Zylo Influencer Matching & Campaign Intelligence API", version="1.0.0", lifespan=lifespan,
              description="Agentic (Google ADK) orchestration over deterministic Python filtering and ranking. All data is synthetic.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins.split(","), allow_methods=["*"], allow_headers=["*"])
app.add_middleware(SecurityHeadersMiddleware)  # CSP and hardening headers on every Zylo Reach response (see app/security.py)
app.include_router(router)
app.include_router(inventory_router)
app.include_router(mcp_router)
app.include_router(chat_router)
app.include_router(settings_router)
app.add_route("/mcp", mcp_mount, include_in_schema=False)  # Model Context Protocol endpoint (see app/mcp_server.py)
app.add_route("/mcp/", mcp_mount, include_in_schema=False)

# Optional single-process mode: if the frontend was built (`npm run build`), serve it from this server.
_dist = ROOT / "frontend" / "dist"
if _dist.exists():
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        if path.startswith("api/"):
            raise HTTPException(404, "Not found")
        f = (_dist / path).resolve()
        if path and f.is_file() and _dist.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")
