"""Product image uploads from the back office. Files are type-checked by their magic bytes (not the client's
claim), size-limited, renamed to a random id and served back from /api/uploads/{name}. SVG is not accepted
because it can carry script."""
from __future__ import annotations

import base64
import binascii
import os
import re
import uuid
from pathlib import Path

from ..config import ROOT

MAX_BYTES = 4 * 1024 * 1024
NAME_RE = re.compile(r"^[0-9a-f]{32}\.(png|jpg|webp|gif)$")
MEDIA = {"png": "image/png", "jpg": "image/jpeg", "webp": "image/webp", "gif": "image/gif"}


class UploadError(ValueError):
    pass


def upload_dir() -> Path:
    return Path(os.getenv("UPLOAD_DIR", str(ROOT / "data" / "uploads")))


def sniff(data: bytes) -> str | None:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    return None


def save(data_b64: str) -> str:
    payload = data_b64.split(",", 1)[1] if data_b64.startswith("data:") else data_b64
    if len(payload) > MAX_BYTES * 4 // 3 + 16:
        raise UploadError("Image is larger than 4 MB.")
    try:
        data = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError):
        raise UploadError("The file could not be read as an image.") from None
    if len(data) > MAX_BYTES:
        raise UploadError("Image is larger than 4 MB.")
    ext = sniff(data)
    if ext is None:
        raise UploadError("Only PNG, JPEG, WebP or GIF images are accepted.")
    d = upload_dir()
    d.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{ext}"
    (d / name).write_bytes(data)
    return f"/api/uploads/{name}"


def resolve(name: str) -> tuple[Path, str] | None:
    if not NAME_RE.fullmatch(name):
        return None
    f = upload_dir() / name
    return (f, MEDIA[name.rsplit(".", 1)[1]]) if f.is_file() else None
