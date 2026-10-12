from app.data.seed_generator import generate_influencers, generate_products
from app.schemas.models import CampaignBrief, FilterConfig, Influencer, ScoreWeights
from app.services.eligibility_filter import level1_filter
from app.services.audience_matcher import audience_fit
from app.services.ranking_engine import run_matching, score_candidate

PRODUCTS = {p.product_id: p for p in generate_products()}
INFL, _, _ = generate_influencers()


def mk(**kw) -> Influencer:
    base = dict(influencer_id="X", display_name="X", username="@x", platform="Instagram", follower_count=5000,
                median_promotional_views=2000, engagement_rate=5.0, audience_age_distribution={"18-24": 70, "25-34": 30},
                audience_gender_distribution={"women": 80, "men": 20}, audience_location_distribution={"London": 80, "US": 20},
                content_tags=["streetwear"], interests=["fashion"], fashion_categories=["women"], brand_affinity_score=60)
    base.update(kw)
    return Influencer(**base)


def brief(**kw) -> CampaignBrief:
    d = dict(product_id="P001", target_age_segments=["18-24"], target="women")
    d.update(kw)
    return CampaignBrief(**d)


def test_followers_threshold_excludes_with_reason():
    r = level1_filter([mk(follower_count=999)], FilterConfig())
    assert r["eligible"] == [] and r["excluded"][0].reason_codes == ["LOW_FOLLOWERS"]


def test_promo_views_threshold():
    r = level1_filter([mk(median_promotional_views=499), mk(influencer_id="Y", median_promotional_views=500)], FilterConfig())
    assert [i.influencer_id for i in r["eligible"]] == ["Y"]
    assert r["excluded"][0].reason_codes == ["LOW_PROMO_VIEWS"]


def test_missing_metric_is_review_not_low():
    r = level1_filter([mk(median_promotional_views=None)], FilterConfig())
    assert r["counts"]["review_required"] == 1 and r["counts"]["excluded"] == 0
    assert r["excluded"][0].status == "needs_review"


def test_brand_safety_flagged_excluded_regardless_of_score():
    r = run_matching(brief(), PRODUCTS["P001"], [mk(brand_safety_status="flagged")])
    assert r.ranked == [] and "BRAND_SAFETY_FLAGGED" in r.excluded[0].reason_codes


def test_micro_not_removed_when_meeting_thresholds():
    r = level1_filter([mk(follower_count=1200, median_promotional_views=600)], FilterConfig())
    assert len(r["eligible"]) == 1


def test_audience_alignment_prefers_target_segment():
    good, _, _ = audience_fit(mk(), brief())
    bad, _, _ = audience_fit(mk(audience_age_distribution={"55+": 80, "35-54": 20}), brief())
    assert good > 80 > 30 > bad


def test_scores_normalised_0_100_and_weights_sum():
    out = run_matching(brief(), PRODUCTS["P001"], INFL)
    for m in out.ranked:
        assert all(0 <= v <= 100 for v in m.scores.values())
        assert 0 <= m.overall_score <= 100
    w = ScoreWeights().normalised()
    assert abs(sum(w.values()) - 1) < 1e-9


def test_ranking_order_and_ranks_sequential():
    out = run_matching(brief(), PRODUCTS["P001"], INFL)
    scores = [m.overall_score for m in out.ranked]
    assert scores == sorted(scores, reverse=True)
    assert [m.rank for m in out.ranked] == list(range(1, len(out.ranked) + 1))


def test_deterministic_same_input_same_output():
    a = run_matching(brief(), PRODUCTS["P001"], INFL).model_dump()
    b = run_matching(brief(), PRODUCTS["P001"], INFL).model_dump()
    assert a == b


def test_missing_data_cannot_boost_score():
    full = mk()
    gap = mk(influencer_id="Y", engagement_rate=None, brand_affinity_score=None)
    out = run_matching(brief(filters=FilterConfig()), PRODUCTS["P001"], [full])
    entry = {"inf": gap, "audience": 90, "content": 90, "region": 90, "relevant": {}, "criteria": [], "details": ("", "", "")}
    scored = score_candidate(entry, PRODUCTS["P001"], ScoreWeights())
    assert scored["missing"] and scored["scores"]["engagement"] <= 30


def test_zero_results_have_warning():
    out = run_matching(brief(filters=FilterConfig(min_followers=10_000_000)), PRODUCTS["P001"], INFL)
    assert out.ranked == [] and out.stats.warnings


def test_follower_count_not_dominant():
    out = run_matching(brief(), PRODUCTS["P001"], INFL)
    top = out.ranked[:10]
    assert min(m.follower_count for m in top) < max(m.follower_count for m in out.ranked)
