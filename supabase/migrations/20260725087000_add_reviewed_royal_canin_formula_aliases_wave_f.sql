WITH reviewed_alias (
  alias_formula_key,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    ('royal canin|royal canin|royal canin veterinary diet adult hydrolyzed protein moderate calorie dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/34019', 'https://www.royalcanin.com/us/dogs/products/vet-products/hydrolyzed-protein-moderate-calorie-3964'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so morsels in gravy canned cat food|cat|adult|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/1223886', 'https://www.royalcanin.com/us/cats/products/vet-products/feline-urinary-so-morsels-in-gravy-canned-cat-food-4032'),
    ('royal canin|royal canin|royal canin veterinary diet adult gastrointestinal low fat dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/35122', 'https://www.royalcanin.com/us/dogs/products/vet-products/gastrointestinal-low-fat-3932'),
    ('royal canin|royal canin|royal canin veterinary diet adult satiety support weight management dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/43753', 'https://www.royalcanin.com/us/dogs/products/vet-products/satiety-support-weight-management-3948'),
    ('royal canin|royal canin|royal canin veterinary diet adult satiety support weight management small breed dry dog food|dog|adult|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/105404', 'https://www.royalcanin.com/us/dogs/products/vet-products/satiety-support-weight-management-small-dog-4252'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction urinary so satiety loaf in sauce wet dog food|dog|unknown|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184694', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-+-satiety-1273'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction gastrointestinal low fat hydrolyzed protein dry dog food|dog|unknown|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184854', 'https://www.royalcanin.com/us/dogs/products/vet-products/gastrointestinal-low-fat-+-hydrolyzed-protein-2734'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction feline satiety hydrolyzed protein dry cat food|cat|unknown|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2185078', 'https://www.royalcanin.com/us/cats/products/vet-products/satiety-+-hydrolyzed-protein-1074'),
    ('royal canin|royal canin|royal canin veterinary diet multifunction urinary so satiety calm loaf in sauce wet cat food|cat|unknown|wet||', 'https://www.chewy.com/royal-canin-veterinary-diet/dp/2184614', 'https://www.royalcanin.com/us/cats/products/vet-products/urinary-so-+-satiety-+-calm-1267'),
    ('royal canin|royal canin|royal canin veterinary diet adult urinary so aging 7 dry dog food|dog|senior|dry||', 'https://www.chewy.com/royal-canin-veterinary-diet-adult/dp/230791', 'https://www.royalcanin.com/us/dogs/products/vet-products/urinary-so-aging-7+-1271')
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, life stage, veterinary condition, recipe, and form'
  )
FROM reviewed_alias
JOIN public.catalog_formulas AS formula
  ON lower(regexp_replace(formula.source_url, '/+$', '')) =
     lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
  AND formula.active
  AND formula.verification_status = 'verified'
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();
