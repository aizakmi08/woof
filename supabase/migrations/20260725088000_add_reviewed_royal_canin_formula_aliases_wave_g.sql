WITH reviewed_alias (alias_formula_key, retailer_source_url, official_source_url) AS (
  VALUES
    ('royal canin|royal canin|royal canin veterinary diet adult advanced mobility support dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/302414', 'https://www.royalcanin.com/us/dogs/products/vet-products/advanced-mobility-support-4221'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so moderate calorie morsels in gravy canned cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/43626', 'https://www.royalcanin.com/us/cats/products/vet-products/urinary-so-moderate-calorie-4080'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal moderate calorie thin slices in gravy canned cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/4023270', 'https://www.royalcanin.com/us/cats/products/vet-products/gastrointestinal-moderate-calorie-thin-slices-in-gravy-3850'),
    ('royal canin|royal canin|royal canin veterinary diet adult satiety support weight management loaf in sauce canned cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/325616', 'https://www.royalcanin.com/us/cats/products/vet-products/satiety-support-weight-management-4251'),
    ('royal canin|royal canin|royal canin veterinary diet adult hydrolyzed protein small breed dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/34020', 'https://www.royalcanin.com/us/dogs/products/vet-products/hydrolyzed-protein-small-dog-3952'),
    ('royal canin|royal canin|royal canin maine coon adult dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-feline-breed-nutrition/dp/53319', 'https://www.royalcanin.com/us/cats/products/retail-products/maine-coon-adult-2550'),
    ('royal canin|royal canin|royal canin veterinary diet adult weight control loaf in sauce canned dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/50172', 'https://www.royalcanin.com/us/dogs/products/vet-products/weight-control-loaf-in-sauce-1318'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal low fat loaf canned dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1216526', 'https://www.royalcanin.com/us/dogs/products/vet-products/gastrointestinal-low-fat-loaf-4029'),
    ('royal canin|royal canin|royal canin veterinary diet skintopic medium and large adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-skintopic/dp/1947374', 'https://www.royalcanin.com/us/dogs/products/vet-products/skintopictmmc-medium-&-large-dog-3314'),
    ('royal canin|royal canin|royal canin veterinary diet adult hydrolyzed protein hp dry cat food|cat|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35480', 'https://www.royalcanin.com/us/cats/products/vet-products/hydrolyzed-protein-hp-3902'),
    ('royal canin|royal canin|royal canin mature adult in gel canned dog food|dog|senior|wet||', 'https://www.chewy.com/royal-canin-mature-adult-in-gel/dp/127200', 'https://www.royalcanin.com/us/dogs/products/retail-products/mature-adult-in-gel-canned-dog-food-4309'),
    ('royal canin|royal canin|royal canin veterinary diet adult renal support d thin slices in gravy wet cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1635646', 'https://www.royalcanin.com/us/cats/products/vet-products/renal-support-d-thin-slices-in-gravy-4167'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so moderate calorie thin slices in gravy wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1108270', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-moderate-calorie-1277'),
    ('royal canin|royal canin|royal canin veterinary diet adult hydrolyzed protein loaf wet dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1392910', 'https://www.royalcanin.com/us/dogs/products/vet-products/hydrolyzed-protein-loaf-4084'),
    ('royal canin|royal canin|royal canin veterinary diet kitten gastrointestinal ultra soft mousse in sauce canned cat food|cat|kitten|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-kitten/dp/254693', 'https://www.royalcanin.com/us/cats/products/vet-products/gastrointestinal-kitten-ultra-soft-mousse-in-sauce-1227'),
    ('royal canin|royal canin|royal canin veterinary diet adult satiety support weight management thin slices in gravy canned cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/171811', 'https://www.royalcanin.com/us/cats/products/vet-products/satiety-support-weight-management-1070'),
    ('royal canin|royal canin|royal canin veterinary diet adult renal support d thin slices in gravy canned dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/118353', 'https://www.royalcanin.com/us/dogs/products/vet-products/renal-support-d-thin-slices-in-gravy-4165'),
    ('royal canin|royal canin|royal canin veterinary diet adult satiety support weight management loaf in sauce canned dog food|dog|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/105406', 'https://www.royalcanin.com/us/dogs/products/vet-products/satiety-support-weight-management-4250'),
    ('royal canin|royal canin|royal canin boxer adult dry dog food|dog|adult|dry||', 'https://www.walmart.com/ip/Royal-Canin-Boxer-Adult-Dry-Dog-Food-17-lb/809840370', 'https://www.royalcanin.com/us/dogs/products/retail-products/boxer-adult-2588')
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
