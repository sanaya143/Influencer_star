import asyncio
import os

import pytest

from app.agents.workflow import run_brief, run_match
from app.schemas.models import CampaignBrief


@pytest.fixture
def fake_llm(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")


def test_llm_path_reports_actual_tokens(fake_llm):
    async def go():
        b = await run_brief("women 18-24 London at least 5k followers", "P001")
        assert b["brief"]["location"] == "London" and b["brief"]["filters"]["min_followers"] == 5000
        assert b["usage"]["token_source"] == "actual" and b["usage"]["total_tokens"] > 0
        m = await run_match(CampaignBrief(**b["brief"]), "c1", b["trace"])
        assert m["status"] == "Completed" and not m["insights"]["fallback"]
        assert m["usage"]["input_tokens"] > 0 and m["usage"]["estimated_cost_usd"] is None
    asyncio.run(go())


def test_llm_path_matches_deterministic_engine(fake_llm, monkeypatch):
    from app.services.data_provider import get_provider
    from app.services.ranking_engine import run_matching
    brief = CampaignBrief(product_id="P011", target_age_segments=["18-24", "25-34"], target="men")
    p = get_provider()
    expected = run_matching(brief, p.product("P011"), p.influencers())
    m = asyncio.run(run_match(brief, "c2"))
    assert [r["influencer_id"] for r in m["output"]["ranked"]] == [r.influencer_id for r in expected.ranked]
    assert m["output"]["stats"]["passed_l2"] == expected.stats.passed_l2
