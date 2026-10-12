"""Pydantic schemas shared by data, services, API and agents."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

AgeSegment = Literal["children", "teens", "18-24", "25-34", "35-54", "55+"]
AGE_SEGMENTS: list[str] = ["children", "teens", "18-24", "25-34", "35-54", "55+"]
Target = Literal["women", "men", "unisex", "couple", "family", "kids"]
TARGETS: list[str] = ["women", "men", "unisex", "couple", "family", "kids"]
Platform = Literal["Instagram", "TikTok", "YouTube"]


class Collaboration(BaseModel):
    collaboration_id: str
    influencer_id: str
    product_id: Optional[str] = None
    campaign_type: str
    promotional_views: int
    engagement: int
    clicks: int  # simulated
    conversions: int  # simulated
    campaign_outcome: Literal["strong", "average", "weak"]
    recorded_at: str


class PromoPost(BaseModel):
    post_id: str
    influencer_id: str
    views: int
    likes: int
    posted_at: str


class Influencer(BaseModel):
    influencer_id: str
    display_name: str
    username: str
    platform: Optional[str] = None
    bio: Optional[str] = None
    creator_content_style: Optional[str] = None
    follower_count: Optional[int] = None
    median_recent_views: Optional[int] = None
    median_promotional_views: Optional[int] = None  # None = unverified/missing
    engagement_rate: Optional[float] = None  # percent
    audience_age_distribution: dict[str, float] = Field(default_factory=dict)
    audience_gender_distribution: dict[str, float] = Field(default_factory=dict)
    audience_location_distribution: dict[str, float] = Field(default_factory=dict)
    interests: list[str] = Field(default_factory=list)
    fashion_categories: list[str] = Field(default_factory=list)
    content_tags: list[str] = Field(default_factory=list)
    brand_affinity_score: Optional[float] = None  # 0-100
    collaboration_history: list[Collaboration] = Field(default_factory=list)
    brand_safety_status: Literal["clear", "flagged", "unknown"] = "clear"
    data_quality_status: Literal["verified", "partial", "unreliable"] = "verified"
    is_synthetic: bool = True


class Product(BaseModel):
    product_id: str
    product_name: str
    description: str
    category: str
    price_gbp: float
    sizes: list[str]
    target_age_segments: list[str]
    target_gender_or_collection: str
    style_tags: list[str]
    target_region: str = "UK"
    campaign_keywords: list[str] = Field(default_factory=list)
    product_image: str = ""
    seasonal_collection: str = ""
    badges: list[str] = Field(default_factory=list)


class FilterConfig(BaseModel):
    min_followers: int = 1000
    min_promo_views: int = 500
    require_brand_safety: bool = True
    min_audience_match: float = 55.0  # Level 2 minimum audience+style match (0-100)


class ScoreWeights(BaseModel):
    audience_fit: float = 25
    content_fit: float = 25
    engagement: float = 15
    promo_views: float = 15
    collaboration: float = 10
    brand_affinity: float = 5
    region: float = 5

    def normalised(self) -> dict[str, float]:
        d = self.model_dump()
        total = sum(d.values()) or 1.0
        return {k: v / total for k, v in d.items()}


class CampaignBrief(BaseModel):
    product_id: str
    objective: str = "awareness"
    target_age_segments: list[str]
    target: str
    location: str = "UK"
    budget_gbp: Optional[float] = None
    preferred_interests: list[str] = Field(default_factory=list)
    prioritise_micro: bool = False
    filters: FilterConfig = Field(default_factory=FilterConfig)
    weights: ScoreWeights = Field(default_factory=ScoreWeights)
    notes: list[str] = Field(default_factory=list)
    needs_clarification: list[str] = Field(default_factory=list)


class Exclusion(BaseModel):
    influencer_id: str
    display_name: str
    username: str
    level: Literal[1, 2]
    status: Literal["excluded", "needs_review"]
    reason_codes: list[str]
    reasons: list[str]


class Criterion(BaseModel):
    name: str
    status: Literal["satisfied", "partial", "not_satisfied"]
    detail: str


class MatchResult(BaseModel):
    rank: int
    influencer_id: str
    display_name: str
    username: str
    platform: str
    follower_count: int
    median_promotional_views: int
    engagement_rate: float
    is_micro: bool
    audience_fit_pct: float  # % of audience in target age segments (+ gender)
    relevant_audience: dict[str, float]
    scores: dict[str, float]  # sub-scores 0-100
    contributions: dict[str, float]  # weighted points toward overall
    overall_score: float
    criteria: list[Criterion]
    rationale: str
    concerns: list[str]
    data_confidence: Literal["high", "medium", "low"]
    insight: Optional[str] = None  # LLM-generated, optional


class FilterStats(BaseModel):
    retrieved: int
    eligible: int
    excluded_l1: int
    review_required: int
    passed_l2: int
    excluded_l2: int
    ranked: int
    thresholds: dict
    warnings: list[str] = Field(default_factory=list)


class MatchOutput(BaseModel):
    stats: FilterStats
    ranked: list[MatchResult]
    excluded: list[Exclusion]
