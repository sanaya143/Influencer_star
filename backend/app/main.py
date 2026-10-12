"""THREADORA backend entrypoint:  uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

import warnings
from contextlib import asynccontextmanager

warnings.filterwarnings("ignore", category=FutureWarning)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import router
from .api.settings_routes import router as settings_router
from .config import ROOT, get_settings
from .db.database import init_db
from .services import runtime_settings
from .services.data_provider import get_provider


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    runtime_settings.load()  # provider/model/token saved from the Settings page
    get_provider()  # load/generate synthetic seed data
    yield


app = FastAPI(title="THREADORA Influencer Matching & Campaign Intelligence API", version="1.0.0", lifespan=lifespan,
              description="Agentic (Google ADK) orchestration over deterministic Python filtering and ranking. All data is synthetic.")
app.add_middleware(CORSMiddleware, allow_origins=get_settings().cors_origins.split(","), allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.include_router(settings_router)

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
