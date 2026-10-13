"""Chat assistant API. A message starts a turn that runs in the background; the client polls the turn to watch the
agent 'brain' fill in live (same pattern as campaign runs)."""
from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func

from ..agents import concierge
from ..config import get_settings
from ..db.database import ChatSessionRow, ChatTurnRow, jsonable, now, session
from ..services import agent_tools as at

router = APIRouter(prefix="/api/chat")
_tasks: set[asyncio.Task] = set()


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _turn(r: ChatTurnRow) -> dict:
    return {"turn_id": r.id, "session_id": r.session_id, "idx": r.idx, "user_text": r.user_text, "answer": r.answer, "status": r.status, "mode": r.mode,
            "model": r.model, "note": r.note, "brain": r.brain or [], "cards": r.cards or [], "agents": r.agents or [], "usage": r.usage,
            "created_at": _iso(r.created_at), "completed_at": _iso(r.completed_at)}


def _consulted(trace: dict) -> list[str]:
    seen: list[str] = []
    for e in trace.get("brain", []):
        if e["kind"] == "tool" and e["agent"] not in seen:
            seen.append(e["agent"])
    return seen


@router.get("/capabilities")
def capabilities():
    s = get_settings()
    return {"mode": s.effective_mode(), "provider": s.llm_provider, "model": s.llm_model if s.effective_mode() == "llm" else None,
            "agents": [{"name": n, "role": spec["role"],
                        "tools": [{"name": t.__name__, "summary": " ".join((t.__doc__ or "").split()).split(". ")[0]} for t in spec["tools"]]}
                       for n, spec in at.SPECIALISTS.items()]}


@router.post("/sessions", status_code=201)
def create_session():
    sid = f"chat_{uuid.uuid4().hex[:10]}"
    with session() as db:
        db.add(ChatSessionRow(id=sid))
        db.commit()
    return {"session_id": sid}


@router.get("/sessions")
def list_sessions(limit: int = 20):
    with session() as db:
        counts = dict(db.query(ChatTurnRow.session_id, func.count(ChatTurnRow.id)).group_by(ChatTurnRow.session_id).all())
        rows = db.query(ChatSessionRow).order_by(ChatSessionRow.updated_at.desc()).limit(200).all()
    items = [{"session_id": r.id, "title": r.title, "updated_at": _iso(r.updated_at), "turns": counts[r.id]} for r in rows if counts.get(r.id)]
    return {"items": items[: max(1, min(limit, 50))]}


def _session_or_404(db, sid: str) -> ChatSessionRow:
    row = db.get(ChatSessionRow, sid)
    if row is None:
        raise HTTPException(404, f"Chat '{sid}' not found")
    return row


@router.get("/sessions/{sid}")
def get_session(sid: str):
    with session() as db:
        row = _session_or_404(db, sid)
        turns = db.query(ChatTurnRow).filter(ChatTurnRow.session_id == sid).order_by(ChatTurnRow.idx).all()
        return {"session_id": row.id, "title": row.title, "turns": [_turn(t) for t in turns]}


@router.delete("/sessions/{sid}", status_code=204)
def delete_session(sid: str):
    with session() as db:
        row = _session_or_404(db, sid)
        db.query(ChatTurnRow).filter(ChatTurnRow.session_id == sid).delete()
        db.delete(row)
        db.commit()


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    rules_only: bool = False  # skip the language model and use the rule-based router


async def _run(turn_id: str, sid: str, text: str, history: list[dict], rules_only: bool) -> None:
    def on_change(trace: dict, cards: list) -> None:
        with session() as db:
            r = db.get(ChatTurnRow, turn_id)
            if r:
                r.brain, r.cards, r.agents = jsonable(trace["brain"]), jsonable(cards), _consulted(trace)
                db.commit()

    try:
        out = await concierge.run_turn(sid, text, history, on_change, force_rules=rules_only)
        fields: dict[str, Any] = {"answer": out["answer"], "status": out["status"], "mode": out["mode"], "model": out["model"], "note": out["note"],
                                  "brain": jsonable(out["trace"]["brain"]), "cards": jsonable(out["cards"]), "agents": _consulted(out["trace"]),
                                  "usage": jsonable(out["usage"])}
    except Exception as e:  # last-resort guard so a turn never stays 'Running'
        fields = {"answer": "Sorry, something went wrong while answering. Please try again.", "status": "Failed", "note": f"{type(e).__name__}: {e}"[:300]}
    with session() as db:
        r = db.get(ChatTurnRow, turn_id)
        for k, v in fields.items():
            setattr(r, k, v)
        r.completed_at = now()
        sess = db.get(ChatSessionRow, sid)
        if sess:
            sess.updated_at = now()
        db.commit()


@router.post("/sessions/{sid}/messages", status_code=202)
async def send_message(sid: str, body: MessageIn):
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Type a message first.")
    with session() as db:
        sess = _session_or_404(db, sid)
        prior = db.query(ChatTurnRow).filter(ChatTurnRow.session_id == sid).order_by(ChatTurnRow.idx).all()
        if any(t.status == "Running" for t in prior):
            raise HTTPException(409, "The assistant is still answering the previous message.")
        history = [{"user_text": t.user_text, "answer": t.answer} for t in prior]
        turn_id = f"turn_{uuid.uuid4().hex[:10]}"
        db.add(ChatTurnRow(id=turn_id, session_id=sid, idx=len(prior) + 1, user_text=text, status="Running", brain=[], cards=[], agents=[]))
        if not prior:
            sess.title = text[:60] + ("…" if len(text) > 60 else "")
        sess.updated_at = now()
        db.commit()
    task = asyncio.create_task(_run(turn_id, sid, text, history, body.rules_only))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"turn_id": turn_id, "session_id": sid, "status": "Running"}


@router.get("/turns/{turn_id}")
def get_turn(turn_id: str):
    with session() as db:
        r = db.get(ChatTurnRow, turn_id)
        if r is None:
            raise HTTPException(404, f"Turn '{turn_id}' not found")
        return _turn(r)
