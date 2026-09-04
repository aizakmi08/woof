WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url) AS (
  VALUES
    ('royal canin|royal canin|royal canin hairball care|cat|adult|wet||', 'https://www.petsmart.com/cat/food-and-treats/canned-food/royal-canin-hairball-care-12-ct-36-oz-78496.html', 'https://www.royalcanin.com/us/cats/products/retail-products/hairball-care-thin-slices-in-gravy-1589'),
    ('royal canin|royal canin|royal canin canine health nutrition puppy canned dog food|dog|puppy|wet||', 'https://www.chewy.com/royal-canin-puppy-canned-dog-food/dp/169383', 'https://www.royalcanin.com/us/dogs/products/retail-products/puppy-loaf-in-sauce-4300/2'),
    ('royal canin|royal canin|royal canin feline care nutrition weight care loaf pate wet cat food|cat|unknown|wet||', 'https://www.chewy.com/royal-canin-feline-care-nutrition/dp/115772', 'https://www.royalcanin.com/us/cats/products/retail-products/weight-care-loaf-in-sauce-1478/1'),
    ('royal canin|royal canin|royal canin veterinary diet adult calm small breed dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/43684', 'https://www.royalcanin.com/us/dogs/products/vet-products/calm-dog-dry-3956'),
    ('royal canin|royal canin|royal canin veterinary diet adult hydrolyzed protein potato and soy formula dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/34025', 'https://www.royalcanin.com/us/dogs/products/vet-products/canine-hydrolyzed-protein-ps-dry-dog-food-3947'),
    ('royal canin|royal canin|royal canin feline care nutrition digestive care adult gravy wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-feline-care-nutrition/dp/127186', 'https://www.royalcanin.com/us/cats/products/retail-products/digestive-care-thin-slices-in-gravy-1430/1'),
    ('royal canin|royal canin|royal canin hp hypoallergenic hydrolyzed protein dog food 7 vegetable of 1|dog|unknown|unknown||', 'https://www.walmart.com/ip/Royal-Canin-HP-Hypoallergenic-Hydrolyzed-Protein-Dog-Food-7-7-lb-Vegetable-7-7-Pound-Pack-of-1/229912959', 'https://www.royalcanin.com/us/dogs/products/vet-products/hydrolyzed-protein-hp-3910')
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, species, life stage, veterinary condition, recipe, texture, package size or GTIN where published, and form'
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
