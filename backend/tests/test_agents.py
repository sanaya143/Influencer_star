import asyncio

import pytest

from app.agents.brief_parser import interpret
from app.agents.workflow import run_match
from app.schemas.models import CampaignBrief


@pytest.fixture
def fake_llm(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "llm")
    monkeypatch.setenv("LLM_PROVIDER", "fake")


def test_brief_is_prepared_without_a_model():
    r = interpret("women 18-24 London at least 5k followers", "P001")
    b = r["brief"]
    assert r["target_kind"] == "product" and b.location == "London" and b.filters.min_followers == 5000
    assert b.target_age_segments == ["18-24"] and b.target == "women" and not b.collection_id


def test_brief_finds_a_collection_from_the_request():
    r = interpret("Promote our Disney collection to UK families with young kids")
    assert r["target_kind"] == "collection" and r["brief"].product_id == "COL-DISNEY"
    assert "disney" in r["brief"].content_themes
    r = interpret("find influencers for streetwear")
    assert r["brief"] is None and r["needs_clarification"]


def test_llm_path_reports_actual_tokens(fake_llm):
    async def go():
        brief = interpret("women 18-24 London at least 5k followers", "P001")["brief"]
        m = await run_match(brief, "c1")
        assert m["status"] == "Completed" and not m["insights"]["fallback"]
        assert [a["id"] for a in m["trace"]["agents"]] == ["MatchingCoordinatorAgent", "CampaignInsightsAgent"]
        assert m["usage"]["input_tokens"] > 0 and m["usage"]["token_source"] == "actual"
        assert m["usage"]["estimated_cost_usd"] == 0.0  # the scripted test model is priced as free
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


def test_coordinator_runs_every_step_and_plans_the_budget(fake_llm):
    brief = interpret("UK women 18-24 streetwear, budget £3,000", "P001")["brief"]
    m = asyncio.run(run_match(brief, "c-steps"))
    tools = [t["name"] for a in m["trace"]["agents"] if a["id"] == "MatchingCoordinatorAgent" for t in a["tools"]]
    assert tools == ["resolve_target", "retrieve_data", "fetch_external_creators", "level1_eligibility_filter",
                     "level2_audience_matcher", "ranking_engine", "roi_planner"]
    skipped = next(t for a in m["trace"]["agents"] for t in a["tools"] if t["name"] == "fetch_external_creators")
    assert skipped["output"]["skipped"]  # outside data is off in tests
    plan = m["output"]["roi"]
    assert plan["budget_gbp"] == 3000 and 0 < plan["plan"]["spend_gbp"] <= 3000


def test_brain_records_model_turns_tools_and_rules(fake_llm):
    brief = interpret("women 18-24 London at least 5k followers", "P001")["brief"]
    m = asyncio.run(run_match(brief, "c-brain"))
    mb = m["trace"]["brain"]
    assert [e["seq"] for e in mb] == list(range(1, len(mb) + 1))
    assert any(e["kind"] == "llm" and e["agent"] == "CampaignInsightsAgent" and e["output"] and e["tokens"]["in"] > 0 for e in mb)
    assert any(e["kind"] == "rule" and e["agent"] == "MatchingCoordinatorAgent" and "deterministic Python" in e["text"] for e in mb)


def test_brain_explains_rule_based_agents_without_a_model(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "offline")
    brief = interpret("UK women 18-24 streetwear", "P001")["brief"]
    m = asyncio.run(run_match(brief, "c-brain2"))
    agents = {e["agent"] for e in m["trace"]["brain"] if e["kind"] == "rule"}
    assert {"MatchingCoordinatorAgent", "CampaignInsightsAgent"} <= agents
    assert m["usage"]["total_tokens"] == 0


def test_collection_campaign_only_keeps_creators_who_post_about_its_themes(monkeypatch):
    monkeypatch.setenv("LLM_MODE", "offline")
    from app.services.data_provider import get_provider
    brief = interpret("", collection_id="COL-MARVEL-DC")["brief"]
    m = asyncio.run(run_match(brief, "c-col"))
    out = m["output"]
    assert out["ranked"], "some creators post about superheroes"
    themes = set(brief.content_themes)
    for r in out["ranked"]:
        assert themes & set(get_provider().influencer(r["influencer_id"]).content_themes)
        assert r["matched_themes"]
    assert any("NO_CONTENT_THEME" in e["reason_codes"] for e in out["excluded"])


def test_outside_creators_are_fetched_over_mcp(monkeypatch):
    """Spawns the bundled mock provider (a real MCP server over stdio) and pulls creators into the pool."""
    monkeypatch.setenv("LLM_MODE", "offline")
    monkeypatch.setenv("ZYLO_EXTERNAL_MCP", "on")
    from app.services import mcp_log
    from app.services.data_provider import get_provider
    brief = interpret("", collection_id="COL-MARVEL-DC")["brief"]
    m = asyncio.run(run_match(brief, "c-ext"))
    step = next(t for a in m["trace"]["agents"] for t in a["tools"] if t["name"] == "fetch_external_creators")
    assert not step["error"] and step["output"]["new_creators"] > 0
    assert m["output"]["sources"]["outside"] == step["output"]["new_creators"]
    outside = [r for r in m["output"]["ranked"] if r["source"] != "zylo"]
    assert outside and get_provider().influencer(outside[0]["influencer_id"]) is not None  # cached, so profiles still open
    assert any(c["transport"] == "outbound stdio" and c["name"] == "search_creators" for c in mcp_log.recent(10))
