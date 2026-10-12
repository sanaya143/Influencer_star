"""UI-managed settings persisted in SQLite. The access token is stored locally on this machine and is
never returned by any API endpoint (only a masked hint)."""
from __future__ import annotations

from ..db.database import SettingRow, session

_KEY = "llm"
_cache: dict = {}


def overrides() -> dict:
    return _cache


def load() -> None:
    with session() as db:
        row = db.get(SettingRow, _KEY)
    _cache.clear()
    if row and isinstance(row.value, dict):
        _cache.update(row.value)


def save(values: dict) -> None:
    with session() as db:
        row = db.get(SettingRow, _KEY)
        if row is None:
            db.add(SettingRow(key=_KEY, value=values))
        else:
            row.value = values
        db.commit()
    _cache.clear()
    _cache.update(values)


def reset() -> None:
    """Forget in-memory overrides (used by tests)."""
    _cache.clear()
