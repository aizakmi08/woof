WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url) AS (
  VALUES
    ('royal canin|royal canin|royal canin veterinary diet adult weight control dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/43720', 'https://www.royalcanin.com/us/cats/products/vet-products/weight-control-cat-dry-2721'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction advanced mobility support satiety dry dog food|dog|unknown|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184766', 'https://www.royalcanin.com/us/dogs/products/vet-products/multifunction-advanced-mobility-+-satiety-4230'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction renal support advanced mobility support dry dog food|dog|unknown|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184718', 'https://www.royalcanin.com/us/dogs/products/vet-products/multifunction-renal-support-+-advanced-mobility-support-1247'),
    ('royal canin|royal canin|royal canin veterinary diet urinary so moderate calorie adult veterinary diet chicken dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/33942', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-moderate-calorie-3800'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35139', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-3913'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35157', 'https://www.royalcanin.com/us/cats/products/vet-products/urinary-so-3901'),
    ('royal canin|royal canin|royal canin veterinary diet skintopic small dog adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-skintopic/dp/968214', 'https://www.royalcanin.com/us/dogs/products/vet-products/skintopictmmc-small-dog-3315'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal loaf wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35359', 'https://www.royalcanin.com/us/dogs/products/vet-products/gastrointestinal-loaf-4038')
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, species, life stage, veterinary condition, recipe, texture, and form'
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
