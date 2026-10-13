"""Zylo Reach security: response headers and limits on everything that spends model tokens.

Security headers
    Every Zylo Reach response (/admin pages, /api, /mcp) gets a strict Content-Security-Policy and the usual hardening
    headers. The policy allows only this server, Google Fonts, Unsplash images and the one inline theme script in
    index.html (by its SHA-256 hash, computed from the built file), so injected scripts cannot run.

Rate limits (per client IP, sliding window, in process)
    chat_message   20 / minute, 300 / day   POST /api/chat/sessions/{id}/messages
    campaign_run    6 / minute,  60 / day   POST /api/campaigns/{id}/match
    model_test     10 / minute              POST /api/settings/test, /api/settings/external-data/test
    Plus at most 3 campaign runs in flight at once. Over a limit: HTTP 429 with Retry-After.
    Tune with ZYLO_RATE_<NAME>="per_minute,per_day" (e.g. ZYLO_RATE_CHAT_MESSAGE=10,100) or switch all limits off
    with ZYLO_RATE_LIMITS=off (tests do this).

Daily token budget (optional)
    ZYLO_DAILY_TOKEN_BUDGET=200000 refuses new model-using requests (429) once today's recorded tokens reach it.
"""
from __future__ import annotations

import base64
import hashlib
import os
import re
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware

from .config import ROOT

# ------------------------------------------------------------------ security headers
REACH_PREFIXES = ("/admin", "/api", "/mcp")  # Zylo Reach surfaces; the shop's pages are left as they are
_inline_hashes: list[str] | None = None


def inline_script_hashes() -> list[str]:
    """CSP hashes of the inline <script> blocks in the built index.html (computed once)."""
    global _inline_hashes
    if _inline_hashes is None:
        html = ROOT / "frontend" / "dist" / "index.html"
        # raw bytes: the browser hashes the script exactly as served, so newlines must not be translated (CRLF on Windows)
        src = (html if html.exists() else ROOT / "frontend" / "index.html").read_bytes().decode("utf-8")
        blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", src, re.S)
        _inline_hashes = [f"'sha256-{base64.b64encode(hashlib.sha256(b.encode()).digest()).decode()}'" for b in blocks if b.strip()]
    return _inline_hashes


def csp() -> str:
    return "; ".join([
        "default-src 'self'",
        "script-src 'self' " + " ".join(inline_script_hashes()),
        # inline style *attributes* are needed for animations and data-driven widths; no inline <style> injection risk
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://images.unsplash.com",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
    ])


HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith(REACH_PREFIXES):
            for k, v in HEADERS.items():
                response.headers.setdefault(k, v)
            response.headers.setdefault("Content-Security-Policy", csp())
            if path.startswith(("/api", "/mcp")):
                response.headers.setdefault("Cache-Control", "no-store")
            if request.url.scheme == "https":
                response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


# ------------------------------------------------------------------ rate limits
@dataclass(frozen=True)
class Limit:
    per_minute: int
    per_day: int | None = None


DEFAULT_LIMITS = {
    "chat_message": Limit(20, 300),
    "campaign_run": Limit(6, 60),
    "model_test": Limit(10, None),
}
MAX_CONCURRENT_RUNS = 3


def _enabled() -> bool:
    return os.getenv("ZYLO_RATE_LIMITS", "on").lower() not in ("0", "off", "false", "no")


def limit_for(name: str) -> Limit:
    raw = os.getenv(f"ZYLO_RATE_{name.upper()}", "")
    if raw:
        parts = [p.strip() for p in raw.split(",")]
        return Limit(int(parts[0]), int(parts[1]) if len(parts) > 1 and parts[1] else None)
    return DEFAULT_LIMITS[name]


class RateLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()
        self.running_runs = 0

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self.running_runs = 0

    def check(self, name: str, client: str) -> None:
        """Record one request or raise 429 with the number of seconds to wait."""
        if not _enabled():
            return
        lim = limit_for(name)
        now = time.monotonic()
        with self._lock:
            q = self._hits[(name, client)]
            while q and now - q[0] > 86_400:
                q.popleft()
            last_minute = sum(1 for t in q if now - t < 60)
            if last_minute >= lim.per_minute:
                oldest = next(t for t in q if now - t < 60)
                wait = int(60 - (now - oldest)) + 1
                raise HTTPException(429, f"Too many requests: at most {lim.per_minute} per minute. Try again in {wait}s.",
                                    headers={"Retry-After": str(wait)})
            if lim.per_day is not None and len(q) >= lim.per_day:
                wait = int(86_400 - (now - q[0])) + 1
                raise HTTPException(429, f"Daily limit reached: at most {lim.per_day} per day.", headers={"Retry-After": str(wait)})
            q.append(now)

    def start_run(self) -> None:
        if not _enabled():
            return
        with self._lock:
            if self.running_runs >= MAX_CONCURRENT_RUNS:
                raise HTTPException(429, f"{MAX_CONCURRENT_RUNS} campaign runs are already in progress. Try again when one finishes.",
                                    headers={"Retry-After": "15"})
            self.running_runs += 1

    def end_run(self) -> None:
        with self._lock:
            self.running_runs = max(0, self.running_runs - 1)


limiter = RateLimiter()


def client_key(request: Request | None) -> str:
    # The direct peer address. X-Forwarded-For is ignored on purpose: it is set by the caller and trivially spoofed.
    return request.client.host if request is not None and request.client else "local"


def token_budget_check() -> None:
    """Refuse new model-using work once today's recorded tokens reach ZYLO_DAILY_TOKEN_BUDGET (if set)."""
    raw = os.getenv("ZYLO_DAILY_TOKEN_BUDGET", "").strip()
    if not raw:
        return
    from .config import get_settings
    if get_settings().effective_mode() != "llm":
        return  # offline runs spend no tokens
    from .services import usage
    used = usage.summary(1)["today"]["total_tokens"]
    if used >= int(raw):
        raise HTTPException(429, f"Today's model token budget ({int(raw):,}) is used up ({used:,} tokens). It resets at midnight UTC; "
                                 "raise ZYLO_DAILY_TOKEN_BUDGET or switch to offline mode to keep working.", headers={"Retry-After": "3600"})


def guard(name: str, request: Request | None, spends_tokens: bool = True) -> None:
    limiter.check(name, client_key(request))
    if spends_tokens:
        token_budget_check()
