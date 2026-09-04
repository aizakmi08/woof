WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url) AS (
  VALUES
    ('blue buffalo|blue buffalo|blue buffalo wilderness indoor hairball weight control dry cat food chicken|cat|unknown|dry||', 'https://www.walmart.com/ip/Blue-Buffalo-Wilderness-Indoor-Hairball-Weight-Control-Dry-Cat-Food-Chicken-11-lb-Bag/43712387', 'https://www.bluebuffalo.com/dry-cat-food/wilderness/indoor-weight-control-hairball-chicken/'),
    ('blue buffalo|blue buffalo|blue buffalo basics grain free adult wet dog food turkey|dog|adult|wet||', 'https://www.walmart.com/ip/Blue-Buffalo-Basics-Grain-Free-Adult-Wet-Dog-Food-Turkey-12-5-oz-Can/35328814', 'https://www.bluebuffalo.com/wet-dog-food/basics/grain-free-turkey-and-potato-recipe/'),
    ('tiki cat|tiki cat|tiki cat luau wild salmon and chicken pate wet cat food|cat|unknown|wet||', 'https://www.chewy.com/tiki-cat-luau-wild-salmon-chicken/dp/526230', 'https://tikipets.com/product/tiki-cat/tiki-cat-wet-food/shredded-cat/luau/wild-salmon-chicken-pate/'),
    ('wellness pet company|wellness|wellness complete health small breed turkey oatmeal dry dog food 3|dog|unknown|dry||', 'https://www.walmart.com/ip/Wellness-Complete-Health-Small-Breed-Turkey-Oatmeal-Dry-Dog-Food-3-75-lb/19948251980', 'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grained-small-breed-turkey-oatmeal/'),
    ('wellness pet company|wellness|wellness complete health natural grain free deboned chicken chicken meal dry cat food 5|cat|unknown|dry||', 'https://www.walmart.com/ip/Wellness-Complete-Health-Natural-Grain-Free-Deboned-Chicken-Chicken-Meal-Dry-Cat-Food-5-5-Pound-Bag/657550757', 'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-deboned-chicken-chicken-meal-2/'),
    ('wellness pet company|wellness|wellness complete health grain free indoor deboned chicken recipe dry cat food 11|cat|unknown|dry||', 'https://www.walmart.com/ip/Wellness-Complete-Health-Grain-Free-Indoor-Deboned-Chicken-Recipe-Dry-Cat-Food-11-5-Pound-Bag/987613214', 'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-indoor-deboned-chicken/')
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url, metadata
)
SELECT
  reviewed_alias.alias_formula_key,
  formula.id,
  encode(extensions.digest(reviewed_alias.alias_formula_key, 'sha256'), 'hex'),
  'manual_review',
  reviewed_alias.retailer_source_url,
  jsonb_build_object(
    'official_source_url', reviewed_alias.official_source_url,
    'reviewed_at', '2026-07-25',
    'evidence', 'exact current manufacturer ingredients, matching front image, complete-food status, species, product line, protected recipe and texture terms, and reviewed retailer identity'
  )
FROM reviewed_alias
JOIN public.catalog_formulas AS formula
  ON lower(regexp_replace(formula.source_url, '/+$', '')) =
     lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
  AND formula.active
  AND formula.verification_status = 'verified'
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now();
