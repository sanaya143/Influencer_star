"""Deterministic brief parsing helpers. Used by the offline Brief Agent, the test LLM double, and
to fill configured defaults. No LLM involved."""
from __future__ import annotations

import re

from ..schemas.models import AGE_SEGMENTS, TARGETS, CampaignBrief, FilterConfig, Product

STOP = {"the", "a", "an", "our", "for", "to", "and", "of", "find", "suitable", "influencers", "influencer", "promote",
        "new", "collection", "customers", "customer", "aged", "age", "uk", "based", "with", "prioritize", "prioritise",
        "strong", "relevant", "on", "in", "who", "that", "campaign", "launch", "i", "want", "need", "us", "products", "product"}
STYLE_WORDS = ["streetwear", "denim", "y2k", "casual", "workwear", "occasion", "minimal", "classic", "sportswear",
               "accessories", "smart-casual", "couple", "family", "kids"]
CITIES = ["london", "manchester", "birmingham", "leeds", "glasgow", "bristol", "liverpool", "cardiff", "edinburgh"]


def _tokens(s: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9\-]+", s.lower().replace("'s", "").replace("’s", "")) if t not in STOP and len(t) > 1]


def search_products(query: str, products: list[Product], limit: int = 5) -> list[dict]:
    q = set(_tokens(query))
    scored = []
    for p in products:
        name = set(_tokens(p.product_name))
        meta = set(p.style_tags) | {p.category.lower(), p.target_gender_or_collection, p.seasonal_collection.lower()}
        s = 3 * len(q & name) + len(q & meta)
        if s:
            scored.append((s, p))
    scored.sort(key=lambda x: (-x[0], x[1].product_id))
    return [{"product_id": p.product_id, "product_name": p.product_name, "category": p.category,
             "target": p.target_gender_or_collection, "age_segments": p.target_age_segments, "score": s}
            for s, p in scored[:limit]]


def _num(v: str, suffix: str | None) -> float:
    n = float(v.replace(",", ""))
    return n * {"k": 1_000, "m": 1_000_000}.get((suffix or "").lower(), 1)


def parse_ages(text: str) -> list[str]:
    t = text.lower().replace("–", "-").replace("—", "-")
    segs: list[str] = []
    for lo, hi in re.findall(r"(\d{1,2})\s*(?:-|to)\s*(\d{1,2})", t):
        lo, hi = int(lo), int(hi)
        for seg, (a, b) in {"18-24": (18, 24), "25-34": (25, 34), "35-54": (35, 54)}.items():
            if lo <= b and hi >= a and seg not in segs:
                segs.append(seg)
    if re.search(r"\b(55\+|over 55|55 and (above|over)|aged 55)", t) and "55+" not in segs:
        segs.append("55+")
    if re.search(r"\b(teen|teens|teenager|teenagers)\b", t) and "teens" not in segs:
        segs.append("teens")
    if re.search(r"\b(kid|kids|child|children|toddler|toddlers|kidswear)\b", t) and "children" not in segs:
        segs.append("children")
    if re.search(r"\bgen[ -]?z\b", t) and "18-24" not in segs:
        segs.append("18-24")
    return [s for s in AGE_SEGMENTS if s in segs]


def parse_target(text: str) -> str | None:
    t = text.lower()
    for key, pat in [("couple", r"\b(couple|couples|matching)\b"), ("family", r"\b(family|families|mum|mom)\b"),
                     ("kids", r"\b(kid|kids|kidswear|children|toddler)\b"), ("women", r"\b(women|woman|womens|ladies|female)\b"),
                     ("men", r"\b(men|man|mens|male|menswear)\b"), ("unisex", r"\bunisex\b")]:
        if re.search(pat, t.replace("women's", "women").replace("men's", "men")):
            return key
    return None


def extract_fields(text: str) -> dict:
    t = text.lower()
    out: dict = {}
    ages = parse_ages(text)
    if ages:
        out["target_age_segments"] = ages
    tgt = parse_target(text)
    if tgt:
        out["target"] = tgt
    for c in CITIES:
        if c in t:
            out["location"] = c.title()
            break
    else:
        if re.search(r"\b(uk|united kingdom|british)\b", t):
            out["location"] = "UK"
    m = re.search(r"£\s?([\d,.]+)\s?(k|m)?", t)
    if m:
        out["budget_gbp"] = _num(m.group(1), m.group(2))
    m = re.search(r"(?:at least|minimum|min\.?|over|above)\s*([\d,.]+)\s*(k|m)?\s*followers", t)
    if m:
        out["min_followers"] = int(_num(m.group(1), m.group(2)))
    m = re.search(r"(?:at least|minimum|min\.?|over|above)\s*([\d,.]+)\s*(k|m)?\s*(?:promo\w*\s+|median\s+)*views", t)
    if m:
        out["min_promo_views"] = int(_num(m.group(1), m.group(2)))
    out["prioritise_micro"] = bool(re.search(r"\bmicro\b", t))
    for obj, pat in [("sales", r"\b(sales|conversion|conversions|revenue|purchase)\b"), ("engagement", r"\bengagement\b"),
                     ("launch", r"\b(launch|new collection|new drop)\b"), ("awareness", r"\b(awareness|reach|visibility|views)\b")]:
        if re.search(pat, t):
            out["objective"] = obj
            break
    interests = [w for w in STYLE_WORDS if w in t]
    if interests:
        out["preferred_interests"] = interests
    return out


def assemble_brief(product: Product, fields: dict, notes: list[str] | None = None) -> CampaignBrief:
    """Fill configured defaults from the product and validate into a CampaignBrief."""
    ages = [a for a in (fields.get("target_age_segments") or product.target_age_segments) if a in AGE_SEGMENTS]
    target = fields.get("target") or product.target_gender_or_collection
    if target not in TARGETS:
        target = product.target_gender_or_collection
    f = FilterConfig()
    if fields.get("min_followers") is not None:
        f.min_followers = int(fields["min_followers"])
    if fields.get("min_promo_views") is not None:
        f.min_promo_views = int(fields["min_promo_views"])
    return CampaignBrief(
        product_id=product.product_id, objective=fields.get("objective") or "awareness", target_age_segments=ages,
        target=target, location=fields.get("location") or product.target_region or "UK", budget_gbp=fields.get("budget_gbp"),
        preferred_interests=fields.get("preferred_interests") or [], prioritise_micro=bool(fields.get("prioritise_micro")),
        filters=f, notes=notes or [], needs_clarification=list(fields.get("needs_clarification") or []))


def parse_request(text: str, preselected: Product | None, products: list[Product]) -> tuple[Product | None, dict, list[dict]]:
    """Return (product or None, fields, candidates). product is None when it cannot be safely inferred."""
    fields = extract_fields(text)
    if preselected:
        return preselected, fields, []
    cands = search_products(text, products)
    if cands and (len(cands) == 1 or cands[0]["score"] >= cands[1]["score"] + 2):
        pid = cands[0]["product_id"]
        return next(p for p in products if p.product_id == pid), fields, cands
    return None, fields, cands
