"""Data access abstraction. MockProvider serves synthetic data; swap for an authorised real
integration by implementing the same interface."""
from __future__ import annotations

from pathlib import Path
from typing import Protocol

from ..config import get_settings
from ..data.seed_generator import load_seed
from ..schemas.models import Influencer, Product


class DataProvider(Protocol):
    def products(self) -> list[Product]: ...
    def influencers(self) -> list[Influencer]: ...


class MockProvider:
    def __init__(self, seed_dir: str | None = None):
        self._products, self._influencers = load_seed(Path(seed_dir or get_settings().seed_dir))
        self._pmap = {p.product_id: p for p in self._products}
        self._imap = {i.influencer_id: i for i in self._influencers}

    def products(self) -> list[Product]:
        return self._products

    def influencers(self) -> list[Influencer]:
        return self._influencers

    def product(self, product_id: str) -> Product | None:
        return self._pmap.get(product_id)

    def influencer(self, influencer_id: str) -> Influencer | None:
        return self._imap.get(influencer_id)


_provider: MockProvider | None = None


def get_provider() -> MockProvider:
    global _provider
    if _provider is None:
        _provider = MockProvider()
    return _provider


def set_provider(p: MockProvider | None) -> None:
    global _provider
    _provider = p
