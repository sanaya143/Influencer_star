"""Creator (influencer) search over the mock social-data service. Shared by the REST API and the MCP server."""
from __future__ import annotations

from typing import Literal, Optional

from ..schemas.models import Influencer
from .data_provider import get_provider

CreatorSort = Literal["id", "followers", "promo_views", "engagement"]

_SORT_KEYS = {
    "id": lambda i: i.influencer_id,
    "followers": lambda i: -(i.follower_count or 0),
    "promo_views": lambda i: -(i.median_promotional_views or 0),
    "engagement": lambda i: -(i.engagement_rate or 0),
}


def search(q: str = "", platform: str = "", category: str = "", min_followers: int = 0,
           max_followers: Optional[int] = None, sort: CreatorSort = "id") -> list[Influencer]:
    items = get_provider().influencers()
    if q:
        ql = q.lower()
        items = [i for i in items if ql in i.display_name.lower() or ql in i.username.lower() or any(ql in t for t in i.content_tags)]
    if platform:
        items = [i for i in items if (i.platform or "").lower() == platform.lower()]
    if category:
        items = [i for i in items if category in i.fashion_categories]
    items = [i for i in items if (i.follower_count or 0) >= min_followers and (max_followers is None or (i.follower_count or 0) <= max_followers)]
    return sorted(items, key=_SORT_KEYS[sort])
