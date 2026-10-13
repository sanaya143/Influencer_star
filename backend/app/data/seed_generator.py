"""Reproducible synthetic data generator. All data is fictional demonstration data."""
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

from ..schemas.models import AGE_SEGMENTS, Collaboration, Influencer, Product, PromoPost

SEED_DIR = Path(__file__).resolve().parents[3] / "data" / "seed"

FIRST = ["Ava", "Maya", "Zara", "Isla", "Nia", "Ella", "Priya", "Leah", "Amira", "Freya", "Chloe", "Tia",
         "Jaden", "Leo", "Kai", "Noah", "Idris", "Theo", "Rohan", "Sam", "Ollie", "Jude", "Marcus", "Dev",
         "Alex", "Robin", "Jo", "Sasha", "Ari", "Remy"]
LAST = ["Hart", "Osei", "Patel", "Bennett", "Rowe", "Clarke", "Singh", "Mills", "Adeyemi", "Walsh", "Frost",
        "Nair", "Quinn", "Moss", "Reid", "Okafor", "Lowe", "Hayes", "Khan", "Doyle"]
CITIES = ["London", "Manchester", "Birmingham", "Leeds", "Glasgow", "Bristol", "Liverpool", "Cardiff", "Edinburgh"]
COUNTRIES_OTHER = ["US", "IE", "DE", "FR", "AU"]
PLATFORMS = ["Instagram", "TikTok", "YouTube"]

# archetype: audience age skew, gender skew, styles, categories, content style
ARCHETYPES = {
    "gen_z_streetwear": dict(age="18-24", gender="women", styles=["streetwear", "y2k", "denim", "casual"], cats=["women", "unisex"], style="Streetwear hauls & GRWM"),
    "lad_streetwear": dict(age="18-24", gender="men", styles=["streetwear", "sportswear", "denim"], cats=["men", "unisex"], style="Streetwear & sneakers"),
    "young_pro_women": dict(age="25-34", gender="women", styles=["workwear", "minimal", "occasion"], cats=["women"], style="Capsule wardrobe & workwear"),
    "menswear": dict(age="25-34", gender="men", styles=["smart-casual", "denim", "workwear"], cats=["men"], style="Menswear edit"),
    "mum_family": dict(age="35-54", gender="women", styles=["family", "casual", "kids"], cats=["kids", "family", "women"], style="Family life & kids outfits"),
    "kids_parent": dict(age="25-34", gender="women", styles=["kids", "family", "casual"], cats=["kids", "family"], style="Parenting & kidswear"),
    "teen": dict(age="teens", gender="women", styles=["y2k", "streetwear", "casual"], cats=["women", "unisex"], style="Teen trends & school-run style"),
    "couple": dict(age="25-34", gender="mixed", styles=["couple", "casual", "occasion"], cats=["couple", "unisex"], style="Couple outfits & date nights"),
    "mature_style": dict(age="55+", gender="women", styles=["classic", "occasion", "minimal"], cats=["women"], style="Timeless style over 55"),
    "sport": dict(age="18-24", gender="mixed", styles=["sportswear", "casual", "streetwear"], cats=["unisex", "men", "women"], style="Gym & athleisure"),
    "lifestyle": dict(age="25-34", gender="mixed", styles=["casual", "minimal", "occasion"], cats=["unisex", "women", "men"], style="Lifestyle & travel"),
    "accessories": dict(age="18-24", gender="women", styles=["accessories", "minimal", "y2k"], cats=["accessories", "women"], style="Bags, jewellery & styling"),
}

INTERESTS = ["fashion", "thrifting", "music", "fitness", "travel", "beauty", "parenting", "sneakers", "weddings",
             "lifestyle", "festival", "student life", "career", "home", "gaming"]

# (name, category, target, ages, styles, collection, price)
PRODUCT_TEMPLATES = [
    ("Oversized Graphic Hoodie", "Women", "women", ["18-24"], ["streetwear", "casual"], "Street Edit", 32),
    ("Cargo Parachute Trousers", "Women", "women", ["18-24"], ["streetwear", "y2k"], "Street Edit", 38),
    ("Baggy Wide-Leg Jeans", "Women", "women", ["18-24", "25-34"], ["denim", "streetwear"], "Denim Lab", 35),
    ("Ribbed Baby Tee", "Women", "women", ["18-24"], ["y2k", "casual"], "Y2K Revival", 12),
    ("Satin Slip Midi Dress", "Women", "women", ["25-34", "18-24"], ["occasion", "minimal"], "Occasion", 45),
    ("Tailored Wool-Blend Blazer", "Women", "women", ["25-34", "35-54"], ["workwear", "minimal"], "Workwear", 58),
    ("Pleated Wide Trousers", "Women", "women", ["25-34", "35-54"], ["workwear", "minimal"], "Workwear", 36),
    ("Relaxed Knit Cardigan", "Women", "women", ["35-54", "55+"], ["classic", "casual"], "Everyday", 34),
    ("Floral Wrap Dress", "Women", "women", ["35-54", "25-34"], ["occasion", "classic"], "Occasion", 42),
    ("Classic Trench Coat", "Women", "women", ["25-34", "35-54", "55+"], ["classic", "workwear"], "Heritage", 79),
    ("Utility Boiler Jacket", "Men", "men", ["18-24", "25-34"], ["streetwear", "workwear"], "Street Edit", 54),
    ("Washed Straight Jeans", "Men", "men", ["18-24", "25-34"], ["denim", "casual"], "Denim Lab", 36),
    ("Heavyweight Boxy Tee", "Men", "men", ["18-24"], ["streetwear", "casual"], "Street Edit", 16),
    ("Slim Chino Trousers", "Men", "men", ["25-34", "35-54"], ["smart-casual", "workwear"], "Workwear", 32),
    ("Merino Crew Jumper", "Men", "men", ["25-34", "35-54"], ["smart-casual", "classic"], "Heritage", 44),
    ("Tech Track Jacket", "Men", "men", ["18-24"], ["sportswear", "streetwear"], "Active", 40),
    ("Single-Breasted Suit Jacket", "Men", "men", ["25-34", "35-54"], ["occasion", "workwear"], "Occasion", 89),
    ("Linen-Blend Shirt", "Men", "men", ["35-54", "25-34"], ["smart-casual", "classic"], "Summer", 28),
    ("Mini Rainbow Raincoat", "Kids", "kids", ["children"], ["kids", "casual"], "Little Threads", 24),
    ("Kids Dino Pyjama Set", "Kids", "kids", ["children"], ["kids", "casual"], "Little Threads", 14),
    ("Kids Denim Dungarees", "Kids", "kids", ["children"], ["kids", "denim"], "Little Threads", 22),
    ("Teen Varsity Bomber", "Kids", "kids", ["teens"], ["streetwear", "casual"], "Teen Edit", 38),
    ("Kids School Polo 2-Pack", "Kids", "kids", ["children"], ["kids", "classic"], "Back to School", 10),
    ("Teen Graphic Sweatshirt", "Kids", "kids", ["teens"], ["streetwear", "y2k"], "Teen Edit", 22),
    ("Unisex Essential Hoodie", "Unisex", "unisex", ["18-24", "25-34"], ["casual", "streetwear"], "Everyday", 30),
    ("Unisex Sherpa Fleece", "Unisex", "unisex", ["18-24", "25-34", "35-54"], ["casual", "sportswear"], "Everyday", 42),
    ("Unisex Cord Bucket Hat", "Unisex", "unisex", ["18-24"], ["streetwear", "accessories"], "Street Edit", 14),
    ("Unisex Coach Jacket", "Unisex", "unisex", ["18-24", "25-34"], ["streetwear", "sportswear"], "Active", 36),
    ("Matching Knit Set - His", "Couple Looks", "couple", ["25-34", "18-24"], ["couple", "casual"], "Twinning", 36),
    ("Matching Knit Set - Hers", "Couple Looks", "couple", ["25-34", "18-24"], ["couple", "casual"], "Twinning", 36),
    ("Couple Check Shirt & Dress", "Couple Looks", "couple", ["25-34", "35-54"], ["couple", "occasion"], "Twinning", 64),
    ("Family Christmas Pyjama Set", "Couple Looks", "family", ["25-34", "35-54", "children"], ["family", "kids"], "Festive", 48),
    ("Family Denim Jacket Trio", "Couple Looks", "family", ["25-34", "35-54", "children"], ["family", "denim"], "Twinning", 72),
    ("Leather-Look Shoulder Bag", "Accessories", "women", ["18-24", "25-34"], ["accessories", "minimal"], "Accessories", 26),
    ("Layered Chain Necklace Set", "Accessories", "women", ["18-24"], ["accessories", "y2k"], "Accessories", 9),
    ("Canvas Tote Bag", "Accessories", "unisex", ["18-24", "25-34"], ["accessories", "casual"], "Accessories", 12),
    ("Wool Scarf", "Accessories", "unisex", ["25-34", "35-54", "55+"], ["accessories", "classic"], "Heritage", 18),
    ("Plaid Baseball Cap", "Accessories", "men", ["18-24"], ["accessories", "streetwear"], "Street Edit", 11),
    ("Seamless Gym Leggings", "Women", "women", ["18-24", "25-34"], ["sportswear", "casual"], "Active", 22),
    ("Sports Bra Longline", "Women", "women", ["18-24", "25-34"], ["sportswear"], "Active", 16),
    ("Dry-Fit Training Shorts", "Men", "men", ["18-24", "25-34"], ["sportswear"], "Active", 18),
    ("Quilted Puffer Gilet", "Women", "women", ["35-54", "55+"], ["casual", "classic"], "Heritage", 49),
    ("Tweed Skirt Suit", "Women", "women", ["55+", "35-54"], ["classic", "occasion"], "Heritage", 69),
    ("Corduroy Overshirt", "Men", "men", ["25-34", "18-24"], ["casual", "workwear"], "Everyday", 34),
    ("Y2K Low-Rise Mini Skirt", "Women", "women", ["18-24"], ["y2k", "streetwear"], "Y2K Revival", 18),
    ("Prom Sequin Gown", "Women", "women", ["18-24"], ["occasion"], "Occasion", 85),
    ("Wedding Guest Jumpsuit", "Women", "women", ["25-34", "35-54"], ["occasion", "minimal"], "Occasion", 62),
    ("Festival Fringe Jacket", "Women", "women", ["18-24"], ["streetwear", "y2k"], "Summer", 44),
    ("Mum & Mini Matching Dresses", "Couple Looks", "family", ["25-34", "35-54", "children"], ["family", "kids", "occasion"], "Twinning", 55),
    ("Toddler Knit Beanie Set", "Kids", "kids", ["children"], ["kids", "casual"], "Little Threads", 8),
    ("Teen Cargo Shorts", "Kids", "kids", ["teens"], ["streetwear", "casual"], "Teen Edit", 16),
    ("Slim Fit Dress Shirt", "Men", "men", ["25-34", "35-54"], ["workwear", "smart-casual"], "Workwear", 25),
    ("Linen Co-ord Set", "Women", "women", ["25-34", "35-54"], ["minimal", "occasion"], "Summer", 52),
    ("Padded Shacket", "Men", "men", ["25-34", "35-54"], ["casual", "workwear"], "Everyday", 56),
    ("Silver Hoop Earrings", "Accessories", "women", ["18-24", "25-34"], ["accessories", "minimal"], "Accessories", 7),
    ("Belt Bag Crossbody", "Accessories", "unisex", ["18-24"], ["accessories", "streetwear"], "Accessories", 19),
    ("Jersey Wide-Leg Joggers", "Unisex", "unisex", ["18-24", "25-34"], ["sportswear", "casual"], "Active", 24),
    ("Matching Denim Jackets", "Couple Looks", "couple", ["18-24", "25-34"], ["couple", "denim"], "Twinning", 78),
    ("Maxi Knit Dress", "Women", "women", ["35-54", "55+"], ["classic", "casual"], "Everyday", 40),
    ("Oversized Blazer Dress", "Women", "women", ["18-24", "25-34"], ["workwear", "streetwear"], "Workwear", 48),
]
BADGES = ["New", "Bestseller", "Trending", "Sale", "Eco-edit"]
SIZES = {"Kids": ["3-4Y", "5-6Y", "7-8Y", "9-10Y"], "Accessories": ["One size"]}

# Product photography: one hand-picked Unsplash photo per product (Unsplash License: free to use, hotlinking
# images.unsplash.com is the documented way to serve them). Each was chosen so the photo shows the labelled item.
UNSPLASH = "https://images.unsplash.com/photo-{}?auto=format&fit=crop&w=800&h=1067&q=75"
PRODUCT_PHOTOS = [
    "1773984159844-35cba1600d92", "1789110520465-efc5ff05c95e", "1683126257977-5142e52acc7e", "1737085725626-dcdacbaf33d2",
    "1790802243983-e6de0e275f59", "1604904612715-47bf9d9bc670", "1789110520755-058df30bf9cb", "1610288311735-39b7facbd095",
    "1759992878336-a5dd342ea245", "1633821879282-0c4e91f96232", "1625327009034-039a65fa3153", "1754555009601-498e9873197e",
    "1521572163474-6864f9cf17ab", "1473966968600-fa801b869a1a", "1630254688956-40da9f30216a", "1643622782660-30dedcd8d75a",
    "1617137984095-74e4e5e3613f", "1713881587420-113c1c43e28a", "1781735974892-360b1cbf8765", "1778283222098-da1f8fc1e5ea",
    "1541015492536-31d513c59861", "1663374723561-885d23959717", "1778788732561-a6f28431a2bd", "1781935542639-72c9373f085f",
    "1620799140188-3b2a02fd9a77", "1771074153183-5849e68c5da6", "1648422204972-4278784a9863", "1620636371503-3bd6f660c369",
    "1610901157620-340856d0a50f", "1629580626780-7fe7fb0523e9", "1754359555458-1f29d13d332e", "1670906230394-d5b332a2113b",
    "1790443036439-0495dc83ee42", "1594633313593-bab3825d0caf", "1635767798638-3e25273a8236", "1574365569389-a10d488ca3fb",
    "1789845137280-8fd8eee7e691", "1521369909029-2afed882baee", "1641808887823-b3201916a57d", "1594730036615-a0f77497536f",
    "1785926262431-ad6a88990c2e", "1636529109797-0749811c4916", "1649937408746-4d2f603f91c8", "1594201658541-52380e1ca6df",
    "1582142306909-195724d33ffc", "1772615071677-6441340349fd", "1767077280665-c3e251378f9e", "1650338524059-f0ae486cfa66",
    "1560707856-3af2ff5ea652", "1685458249619-b78fe5ee7abe", "1740512922260-543b1b83c986", "1598033129183-c4f50c736f10",
    "1726591383658-37fc19442523", "1645106281801-32a3e43b2d49", "1602722872368-0cfc00f748ff", "1588596589966-3260ee9d8b3e",
    "1552902875-9ac1f9fe0c07", "1535821768496-80f6b2bd573a", "1789110520279-49e8a3a6fb91", "1779400202247-2a9da5b4027c",
]
COLOURS = [
    "Black", "Lavender", "Light wash", "Cream", "Silver", "Charcoal", "Black", "Mustard", "Floral print", "Stone",
    "Olive", "Indigo", "White", "Stone", "Oatmeal", "Red", "Navy", "White", "Yellow", "Teal",
    "Mid wash", "Red", "Navy", "Lilac", "White", "Cream", "Black", "Black", "Forest green", "Cream",
    "Floral print", "Red check", "Light wash", "Tan", "Gold", "Natural", "Tartan", "Charcoal", "Black", "White",
    "Black", "Black", "Brown tweed", "Tan", "White", "Champagne", "Khaki", "Tan", "Floral print", "White",
    "Khaki", "White", "Cream", "Check", "Silver", "Cream", "Black", "Mid wash", "Grey marl", "Black",
]


def _stock(rnd: random.Random, sizes: list[str]) -> dict[str, int]:
    out = {}
    for s in sizes:
        r = rnd.random()
        out[s] = 0 if r < 0.07 else rnd.randint(1, 4) if r < 0.17 else rnd.randint(8, 60)
    return out


def generate_products(seed: int = 42) -> list[Product]:
    rnd = random.Random(seed)
    stock_rnd = random.Random(seed + 1)  # separate stream so badges stay identical to earlier seeds
    out = []
    for i, (name, cat, target, ages, styles, coll, price) in enumerate(PRODUCT_TEMPLATES, start=1):
        sizes = SIZES.get(cat) or ["XS", "S", "M", "L", "XL"]
        colour = COLOURS[i - 1]
        out.append(Product(
            product_id=f"P{i:03d}", product_name=name,
            description=(f"{name} in {colour.lower()} from the Zylo {coll} collection. "
                         "Affordable, trend-led and made to be worn on repeat."),
            category=cat, price_gbp=float(price), sizes=sizes, target_age_segments=ages,
            target_gender_or_collection=target, style_tags=styles, target_region="UK",
            campaign_keywords=styles + [target, coll.lower()],
            product_image=UNSPLASH.format(PRODUCT_PHOTOS[i - 1]),
            seasonal_collection=coll, badges=rnd.sample(BADGES, k=rnd.choice([0, 1, 1, 2])),
            colour=colour, stock=_stock(stock_rnd, sizes), status="active"))
    return out


SHOPPER_FIRST = ["Amelia", "Olivia", "Isla", "Ava", "Mia", "Noah", "Oliver", "George", "Leo", "Arthur", "Priya", "Aisha",
                 "Hannah", "Grace", "Ruby", "Jack", "Harry", "Kai", "Sophie", "Ella", "Zara", "Omar", "Lucy", "Ben"]
SHOPPER_LAST = "ABCDEFGHJKLMNOPRSTW"


def generate_orders(products: list[Product], n: int = 1200, seed: int = 42) -> list[dict]:
    """Synthetic order history (last 90 days). Timestamps are relative ('days_ago') so KPIs stay current."""
    rnd = random.Random(seed + 7)
    weights = [1.0 + 2.0 * ("Bestseller" in p.badges) + 1.0 * ("Trending" in p.badges) + 30.0 / p.price_gbp for p in products]
    orders = []
    for k in range(n):
        days_ago = round(min(90.0, rnd.expovariate(1 / 30)), 3)  # more orders recently
        lines = []
        for p in rnd.choices(products, weights=weights, k=rnd.choices([1, 2, 3], weights=[6, 3, 1])[0]):
            if any(line["product_id"] == p.product_id for line in lines):
                continue
            lines.append({"product_id": p.product_id, "size": rnd.choice(p.sizes), "qty": rnd.choices([1, 2], weights=[5, 1])[0],
                          "unit_price": p.price_gbp})
        orders.append({"order_id": f"ORD-{100001 + k}", "customer_name": f"{rnd.choice(SHOPPER_FIRST)} {rnd.choice(SHOPPER_LAST)}.",
                       "days_ago": days_ago, "lines": lines})
    return orders


def _dist(rnd: random.Random, keys: list[str], peak: str | None, peak_share: float, spread: float = 0.5) -> dict[str, float]:
    raw = {k: rnd.random() * spread + 0.02 for k in keys}
    if peak:
        raw[peak] += peak_share * sum(raw.values()) / max(1e-9, (1 - peak_share))
    tot = sum(raw.values())
    return {k: round(v / tot * 100, 1) for k, v in raw.items()}


DEFAULT_INFLUENCERS = 1200
# Extra names for creators beyond the original 300 (drawn from a separate random stream so the first
# 300 profiles stay byte-identical to earlier seeds and existing campaign runs remain readable).
FIRST_EXTRA = ["Olivia", "Amelia", "Grace", "Lily", "Sophie", "Ruby", "Evie", "Poppy", "Aisha", "Hana", "Mei", "Sienna",
               "Harper", "Willow", "Esme", "Imogen", "Maryam", "Zainab", "Layla", "Erin", "Oliver", "George", "Harry",
               "Jack", "Arthur", "Finley", "Reuben", "Callum", "Ethan", "Yusuf", "Kofi", "Tomas", "Mateo", "Luca",
               "Rafael", "Hugo", "Ezra", "Felix", "Max", "Ibrahim", "Charlie", "Riley", "Morgan", "Jamie", "Kit", "Rowan"]
LAST_EXTRA = ["Taylor", "Brown", "Wilson", "Evans", "Thomas", "Roberts", "Johnson", "Lewis", "Walker", "Wright", "Green",
              "Hall", "Wood", "Hughes", "Edwards", "Turner", "Murphy", "Kelly", "Campbell", "Stewart", "Ahmed", "Hussain",
              "Begum", "Chowdhury", "Mensah", "Boateng", "Nwosu", "Kowalski", "Novak", "Rossi", "Silva", "Costa",
              "Fernandes", "Chen", "Wong", "Kim", "Park", "Nakamura", "Byrne", "Fraser", "Price", "Jenkins", "Lloyd",
              "Bell", "Ward", "Cole", "Shaw", "Holt"]


def generate_influencers(n: int = DEFAULT_INFLUENCERS, seed: int = 42) -> tuple[list[Influencer], list[PromoPost], list[Collaboration]]:
    rnd = random.Random(seed)
    name_rnd = random.Random(seed + 3)
    products = generate_products(seed)
    infl, posts, collabs = [], [], []
    handles: set[str] = set()
    arche_names = list(ARCHETYPES)
    today = date(2026, 6, 1)
    for i in range(1, n + 1):
        a_name = rnd.choice(arche_names)
        a = ARCHETYPES[a_name]
        first, last = rnd.choice(FIRST), rnd.choice(LAST)
        if i > 300:
            first, last = name_rnd.choice(FIRST + FIRST_EXTRA), name_rnd.choice(LAST + LAST_EXTRA)
        platform = rnd.choices(PLATFORMS, weights=[5, 4, 2])[0]
        tier = rnd.choices(["nano", "micro", "mid", "macro"], weights=[30, 40, 20, 10])[0]
        followers = {"nano": rnd.randint(300, 9_999), "micro": rnd.randint(10_000, 99_999),
                     "mid": rnd.randint(100_000, 499_999), "macro": rnd.randint(500_000, 2_500_000)}[tier]
        # micros often outperform on view-rate; some big accounts underperform on promo posts
        view_rate = rnd.uniform(0.02, 0.35) if tier in ("nano", "micro") else rnd.uniform(0.005, 0.12)
        median_recent = int(followers * view_rate)
        median_promo = max(40, int(median_recent * rnd.uniform(0.35, 1.1)))
        eng = round(max(0.4, min(14.0, rnd.gauss(5.5 if tier in ("nano", "micro") else 2.8, 1.6))), 2)

        age = _dist(rnd, AGE_SEGMENTS, a["age"], rnd.uniform(0.35, 0.7))
        if a["gender"] == "mixed":
            w = round(rnd.uniform(40, 60), 1)
            gender = {"women": w, "men": round(100 - w, 1)}
        else:
            main = round(rnd.uniform(60, 88), 1)
            other = "men" if a["gender"] == "women" else "women"
            gender = {a["gender"]: main, other: round(100 - main, 1)}
        uk_share = round(rnd.uniform(0.45, 0.95), 2)
        locs: dict[str, float] = {}
        base_cities = rnd.sample(CITIES, 3)
        c_raw = [rnd.random() + 0.3 for _ in base_cities]
        for c, r in zip(base_cities, c_raw):
            locs[c] = round(uk_share * 100 * r / sum(c_raw), 1)
        oc = rnd.sample(COUNTRIES_OTHER, 2)
        rest = round(100 - sum(locs.values()), 1)
        locs[oc[0]] = round(rest * 0.65, 1)
        locs[oc[1]] = round(rest - locs[oc[0]], 1)

        interests = list(dict.fromkeys(["fashion"] + rnd.sample(INTERESTS, 3)))
        if a_name in ("mum_family", "kids_parent"):
            interests.append("parenting")
        if a_name == "couple":
            interests.append("weddings")
        if a_name in ("lad_streetwear", "gen_z_streetwear"):
            interests.append("sneakers")
        tags = list(dict.fromkeys(a["styles"] + rnd.sample(["ootd", "grwm", "haul", "try-on", "thrift", "lookbook"], 2)))
        affinity = round(max(5, min(98, rnd.gauss(55, 22))), 1)

        safety = rnd.choices(["clear", "flagged", "unknown"], weights=[93, 4, 3])[0]
        quality = rnd.choices(["verified", "partial", "unreliable"], weights=[82, 12, 6])[0]

        handle = f"{first}{last}".lower() + str(rnd.randint(1, 99))
        while handle in handles and i > 300:
            handle = f"{first}{last}".lower() + str(name_rnd.randint(100, 9999))
        handles.add(handle)
        inf = Influencer(
            influencer_id=f"I{i:04d}", display_name=f"{first} {last}", username=f"@{handle}", platform=platform,
            bio=f"{a['style']} | {rnd.choice(CITIES)} based | DMs open for collabs",
            creator_content_style=a["style"], follower_count=followers, median_recent_views=median_recent,
            median_promotional_views=median_promo, engagement_rate=eng, audience_age_distribution=age,
            audience_gender_distribution=gender, audience_location_distribution=locs, interests=interests,
            fashion_categories=a["cats"], content_tags=tags, brand_affinity_score=affinity,
            brand_safety_status=safety, data_quality_status=quality)

        # missing metrics are None (never zero) so they stay distinguishable from verified low values
        r = rnd.random()
        if r < 0.04:
            inf.median_promotional_views = None
        elif r < 0.06:
            inf.engagement_rate = None
        elif r < 0.07:
            inf.follower_count = None
        elif r < 0.08:
            inf.platform = None
        # deliberately thin promo performance so Level 1 has work to do
        elif rnd.random() < 0.06:
            inf.median_promotional_views = rnd.randint(40, 450)
        infl.append(inf)

        if inf.median_promotional_views:
            for _ in range(rnd.choice([1, 2, 2, 3])):
                v = int(inf.median_promotional_views * rnd.uniform(0.6, 1.5))
                posts.append(PromoPost(post_id=f"PP{len(posts)+1:05d}", influencer_id=inf.influencer_id, views=v,
                                       likes=int(v * eng / 100),
                                       posted_at=str(today - timedelta(days=rnd.randint(5, 300)))))

    # ~1.25 collaborations per creator; outcome correlates with creator/product fit so history carries signal
    for k in range(max(100, round(n * 1.25))):
        inf = rnd.choice(infl)
        prod = rnd.choice(products)
        base = inf.median_promotional_views or 500
        fit = len(set(prod.style_tags) & set(inf.content_tags)) + (2 if prod.target_gender_or_collection in inf.fashion_categories else 0)
        mult = 0.7 + 0.25 * fit + rnd.uniform(-0.2, 0.3)
        views = int(base * max(0.3, mult))
        outcome = "strong" if mult > 1.3 else "average" if mult > 0.85 else "weak"
        c = Collaboration(
            collaboration_id=f"C{k+1:04d}", influencer_id=inf.influencer_id, product_id=prod.product_id,
            campaign_type=rnd.choice(["paid post", "gifted", "affiliate", "story set"]),
            promotional_views=views, engagement=int(views * (inf.engagement_rate or 3) / 100),
            clicks=int(views * rnd.uniform(0.005, 0.03)), conversions=int(views * rnd.uniform(0.0005, 0.006)),
            campaign_outcome=outcome, recorded_at=str(today - timedelta(days=rnd.randint(10, 400))))
        inf.collaboration_history.append(c)
        collabs.append(c)
    return infl, posts, collabs


def write_seed(n_influencers: int = DEFAULT_INFLUENCERS, seed: int = 42, out: Path = SEED_DIR) -> None:
    out.mkdir(parents=True, exist_ok=True)
    products = generate_products(seed)
    infl, posts, collabs = generate_influencers(n_influencers, seed)
    compact = {"separators": (",", ":")}  # large files stay compact; products stay human-readable
    (out / "products.json").write_text(json.dumps([p.model_dump() for p in products], indent=1), "utf-8")
    (out / "influencers.json").write_text(json.dumps([i.model_dump() for i in infl], **compact), "utf-8")
    (out / "promo_posts.json").write_text(json.dumps([p.model_dump() for p in posts], **compact), "utf-8")
    (out / "collaborations.json").write_text(json.dumps([c.model_dump() for c in collabs], **compact), "utf-8")
    (out / "orders.json").write_text(json.dumps(generate_orders(products, seed=seed), **compact), "utf-8")


def load_seed(out: Path = SEED_DIR) -> tuple[list[Product], list[Influencer]]:
    if not (out / "influencers.json").exists():
        write_seed(out=out)
    prods = [Product(**p) for p in json.loads((out / "products.json").read_text("utf-8"))]
    infl = [Influencer(**i) for i in json.loads((out / "influencers.json").read_text("utf-8"))]
    return prods, infl


def load_seed_products(out: Path = SEED_DIR) -> list[Product]:
    if not (out / "products.json").exists():
        write_seed(out=out)
    return [Product(**p) for p in json.loads((out / "products.json").read_text("utf-8"))]


def load_seed_orders(out: Path = SEED_DIR) -> list[dict]:
    f = out / "orders.json"
    if f.exists():
        return json.loads(f.read_text("utf-8"))
    return generate_orders(load_seed_products(out))


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--influencers", type=int, default=DEFAULT_INFLUENCERS)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    write_seed(args.influencers, args.seed)
    print(f"Wrote seed data to {SEED_DIR}")
