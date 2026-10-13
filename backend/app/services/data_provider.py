"""Data access abstraction. Influencers come from the mock social-data service (synthetic seed); swap it for an
authorised real integration by implementing the same interface. Products come from the inventory database that
the back office manages, so a product saved there is immediately available for campaigns."""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..config import get_settings
from ..data.seed_generator import load_seed
from ..schemas.models import Influencer, Product
from . import inventory


class DataProvider(Protocol):
    def products(self) -> list[Product]: ...
    def influencers(self) -> list[Influencer]: ...


class MockProvider:
    def __init__(self, seed_dir: str | None = None):
        _, self._influencers = load_seed(Path(seed_dir or get_settings().seed_dir))
        self._imap = {i.influencer_id: i for i in self._influencers}

    def products(self) -> list[Product]:
        """Products currently on sale (status 'active')."""
        return inventory.products("active")

    def influencers(self) -> list[Influencer]:
        return self._influencers

    def product(self, product_id: str) -> Product | None:
        """Any product by id, including drafts and archived ones referenced by past campaigns. A collection id
        (COL-...) resolves to the collection as one virtual product, so collection campaigns match the same way."""
        from . import collections
        if collections.is_collection_id(product_id):
            c = collections.get(product_id)
            return collections.as_product(c) if c else None
        return inventory.get_product(product_id)

    def influencer(self, influencer_id: str) -> Influencer | None:
        """A creator from Zylo's dataset, or one fetched earlier from an outside provider over MCP."""
        hit = self._imap.get(influencer_id)
        if hit is None and not influencer_id.startswith("I"):
            from .external_creators import cached
            hit = cached(influencer_id)
        return hit


_provider: MockProvider | None = None


def get_provider() -> MockProvider:
    global _provider
    if _provider is None:
        _provider = MockProvider()
    return _provider


def set_provider(p: MockProvider | None) -> None:
    global _provider
    _provider = p
