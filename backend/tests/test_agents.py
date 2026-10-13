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


def test_brain_records_model_turns_tools_and_rules(fake_llm, monkeypatch):
    async def go():
        b = await run_brief("women 18-24 London at least 5k followers", "P001")
        brain = b["trace"]["brain"]
        turns = [e for e in brain if e["kind"] == "llm"]
        assert [e["seq"] for e in brain] == list(range(1, len(brain) + 1))
        assert turns[0]["agent"] == "CampaignBriefAgent" and turns[0]["calls"][0]["name"] == "submit_brief" and "London" in str(turns[0]["calls"][0]["args"])
        assert turns[0]["input"].startswith("user:") and turns[0]["tokens"]["in"] > 0 and turns[0]["duration_ms"] >= 0
        assert any(e["kind"] == "tool" and e["name"] == "submit_brief" and e["result"] for e in brain)
        assert any(e["kind"] == "llm" and e["input"].startswith("tool:") for e in brain)  # the model saw the tool result
        m = await run_match(CampaignBrief(**b["brief"]), "c-brain", b["trace"])
        mb = m["trace"]["brain"]
        assert any(e["kind"] == "llm" and e["agent"] == "CampaignInsightsAgent" and e["output"] for e in mb)
        assert any(e["kind"] == "rule" and e["agent"] == "MatchingCoordinatorAgent" and "deterministic Python" in e["text"] for e in mb)
    asyncio.run(go())


def test_brain_explains_rule_based_agents_without_a_model(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "offline")

    async def go():
        b = await run_brief("UK women 18-24 streetwear", "P001")
        rules = [e for e in b["trace"]["brain"] if e["kind"] == "rule"]
        assert rules and "No language model" in rules[0]["text"] and "Oversized Graphic Hoodie" in rules[0]["text"]
        m = await run_match(CampaignBrief(**b["brief"]), "c-brain2", b["trace"])
        agents = {e["agent"] for e in m["trace"]["brain"] if e["kind"] == "rule"}
        assert {"MatchingCoordinatorAgent", "CampaignInsightsAgent"} <= agents
    asyncio.run(go())
