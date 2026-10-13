"""Collections: groups of products promoted together (licensed ranges, seasonal edits, sales), plus the extra
products the licensed collections need. All fictional demonstration data; the licensed names assume a licence."""
from __future__ import annotations

from ..schemas.models import Collection, Product
from .seed_generator import COLOURS, PRODUCT_PHOTOS, UNSPLASH

# (id, name, category, target, ages, styles, collection label, price, colour, product whose photo shows the same garment)
COLLECTION_PRODUCTS = [
    ("P101", "Marvel Avengers Graphic Tee", "Unisex", "unisex", ["teens", "18-24", "25-34"], ["streetwear", "casual"], "Marvel & DC", 22, "Black", "P013"),
    ("P102", "Spider-Man Web Hoodie", "Unisex", "unisex", ["teens", "18-24"], ["streetwear", "casual"], "Marvel & DC", 42, "Red", "P001"),
    ("P103", "DC Batman Logo Bomber", "Men", "men", ["18-24", "25-34"], ["streetwear"], "Marvel & DC", 58, "Black", "P022"),
    ("P104", "Wonder Woman Ribbed Tank", "Women", "women", ["18-24", "25-34"], ["casual", "y2k"], "Marvel & DC", 18, "Red", "P004"),
    ("P105", "Kids Marvel Hero Pyjamas", "Kids", "kids", ["children"], ["kids", "casual"], "Marvel & DC", 18, "Navy", "P020"),
    ("P106", "Mickey Mouse Classic Sweatshirt", "Unisex", "unisex", ["18-24", "25-34"], ["casual"], "Disney", 36, "Grey marl", "P024"),
    ("P107", "Minnie Bow Kids Dress", "Kids", "kids", ["children"], ["kids", "occasion"], "Disney", 24, "Red", "P049"),
    ("P108", "Stitch Oversized Hoodie", "Unisex", "unisex", ["teens", "18-24"], ["casual", "streetwear"], "Disney", 40, "Blue", "P025"),
    ("P109", "Disney Princess Pyjama Set", "Kids", "kids", ["children"], ["kids", "family"], "Disney", 20, "Pink", "P032"),
    ("P110", "Toy Story Kids Tee", "Kids", "kids", ["children"], ["kids", "casual"], "Disney", 12, "White", "P023"),
    ("P111", "Fair Isle Christmas Jumper", "Unisex", "unisex", ["18-24", "25-34", "35-54"], ["classic", "casual"], "Winter", 38, "Red", "P015"),
    ("P112", "Longline Puffer Coat", "Women", "women", ["25-34", "35-54"], ["casual", "classic"], "Winter", 85, "Black", "P042"),
    ("P113", "Linen Beach Shorts", "Men", "men", ["18-24", "25-34"], ["casual", "sportswear"], "Summer", 20, "Sand", "P041"),
]

COLLECTIONS = [
    dict(collection_id="COL-MARVEL-DC", name="Marvel & DC Exclusive", kind="licensed",
         tagline="Superhero graphics for fans of every age",
         description="Licensed superhero tees, hoodies and pyjamas. Best promoted by creators who already post about comics, films and cosplay.",
         content_themes=["marvel", "dc", "superheroes", "comics", "cosplay"], product_ids=["P101", "P102", "P103", "P104", "P105"],
         target="unisex", target_age_segments=["teens", "18-24", "25-34"], style_tags=["streetwear", "casual"], image_pid="P102"),
    dict(collection_id="COL-DISNEY", name="Disney Collection", kind="licensed",
         tagline="Classic characters for families and fans",
         description="Mickey, Minnie, Stitch, Toy Story and princess pieces for kids and grown-up fans. Fits family, parenting and theme-park creators.",
         content_themes=["disney", "pixar", "animation", "theme parks", "princess"], product_ids=["P106", "P107", "P108", "P109", "P110"],
         target="family", target_age_segments=["children", "18-24", "25-34"], style_tags=["casual", "family", "kids"], image_pid="P108"),
    dict(collection_id="COL-SUMMER-SALE", name="Summer Sale", kind="sale", discount_pct=30,
         tagline="Up to 30% off holiday and festival pieces",
         description="Linen, festival and active pieces at sale prices. Fits travel, beach and festival creators.",
         content_themes=["summer", "beach", "festival", "travel", "holiday"], product_ids=["P018", "P048", "P053", "P005", "P039", "P045", "P113"],
         target="unisex", target_age_segments=["18-24", "25-34"], style_tags=["casual", "occasion", "sportswear"], image_pid="P053"),
    dict(collection_id="COL-WINTER", name="Winter Collection", kind="seasonal",
         tagline="Coats, knits and festive cosy layers",
         description="Outerwear, knitwear and Christmas pieces. Fits creators who post cosy, knitwear and festive content.",
         content_themes=["winter", "knitwear", "cosy", "christmas", "outerwear"],
         product_ids=["P010", "P015", "P008", "P026", "P042", "P037", "P032", "P050", "P054", "P111", "P112"],
         target="unisex", target_age_segments=["18-24", "25-34", "35-54"], style_tags=["classic", "casual"], image_pid="P111"),
    dict(collection_id="COL-BACK-TO-SCHOOL", name="Back to School", kind="seasonal",
         tagline="Uniform basics and weekend wear for kids and teens",
         description="Polos, raincoats, bombers and cargo shorts. Fits parenting and student-life creators.",
         content_themes=["back to school", "school", "student life", "parenting"], product_ids=["P023", "P022", "P024", "P051", "P019", "P021"],
         target="kids", target_age_segments=["children", "teens"], style_tags=["kids", "casual", "streetwear"], image_pid="P022"),
]

# Words in a free-text request that point at a collection.
COLLECTION_KEYWORDS = {
    "COL-MARVEL-DC": ["marvel", "dc ", "dc comics", "superhero", "avengers", "spider-man", "spiderman", "batman", "wonder woman", "comic"],
    "COL-DISNEY": ["disney", "mickey", "minnie", "pixar", "stitch", "toy story", "princess"],
    "COL-SUMMER-SALE": ["summer sale", "summer", "holiday sale", "beach"],
    "COL-WINTER": ["winter", "christmas", "knitwear", "festive", "cosy", "cozy"],
    "COL-BACK-TO-SCHOOL": ["back to school", "school uniform", "school"],
}


def collection_products(base: list[Product] | None = None) -> list[Product]:
    """The extra products the licensed and seasonal collections add to the catalogue."""
    out = []
    for pid, name, cat, target, ages, styles, coll, price, _, photo in COLLECTION_PRODUCTS:
        src = int(photo[1:]) - 1
        colour = COLOURS[src]  # the reused photo decides the colour, so label and image agree
        sizes = {"Kids": ["3-4Y", "5-6Y", "7-8Y", "9-10Y"]}.get(cat) or ["XS", "S", "M", "L", "XL"]
        stock = {s: (14 + (i * 7 + int(pid[1:])) % 37) for i, s in enumerate(sizes)}
        out.append(Product(
            product_id=pid, product_name=name,
            description=f"{name} in {colour.lower()} from the Zylo {coll} collection. Officially licensed design (demo data).",
            category=cat, price_gbp=float(price), sizes=sizes, target_age_segments=ages, target_gender_or_collection=target,
            style_tags=styles, target_region="UK", campaign_keywords=styles + [target, coll.lower()],
            product_image=UNSPLASH.format(PRODUCT_PHOTOS[src]), seasonal_collection=coll, badges=["New"], colour=colour, stock=stock, status="active"))
    return out


def default_collections() -> list[Collection]:
    return [Collection(**{k: v for k, v in c.items() if k != "image_pid"}) for c in COLLECTIONS]


def image_product(collection_id: str) -> str | None:
    return next((c["image_pid"] for c in COLLECTIONS if c["collection_id"] == collection_id), None)
