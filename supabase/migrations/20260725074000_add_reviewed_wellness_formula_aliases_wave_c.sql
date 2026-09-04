UPDATE public.product_data
SET
  food_form = 'dry',
  life_stage = 'adult',
  updated_at = now()
WHERE lower(regexp_replace(source_url, '/+$', '')) =
      lower(regexp_replace('https://www.wellnesspetfood.com/product-catalog/wellness-core-grain-free-ocean-whitefish-herring-salmon/', '/+$', ''))
  AND ingredient_verification_status = 'manufacturer'
  AND image_verification_status = 'manufacturer';

UPDATE public.product_data
SET
  food_form = 'wet',
  life_stage = 'senior',
  updated_at = now()
WHERE lower(regexp_replace(source_url, '/+$', '')) =
      lower(regexp_replace('https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-age-advantage-tuna-salmon/', '/+$', ''))
  AND ingredient_verification_status = 'manufacturer'
  AND image_verification_status = 'manufacturer';

UPDATE public.product_data
SET
  food_form = 'wet',
  updated_at = now()
WHERE lower(regexp_replace(source_url, '/+$', '')) =
      lower(regexp_replace('https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-sliced-sliced-turkey-salmon-entree/', '/+$', ''))
  AND ingredient_verification_status = 'manufacturer'
  AND image_verification_status = 'manufacturer';

WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'wellness pet company|wellness|wellness core adult grain free high protein natural ocean whitefish herring and salmon dry dog food|dog|adult|dry||',
      'a9a9c397423d963a0972512000cb36510f1ff63d8bc44fb11832c13bfbe87f99',
      'https://www.chewy.com/wellness-core-ocean-whitefish-herring/dp/34337',
      'https://www.wellnesspetfood.com/product-catalog/wellness-core-grain-free-ocean-whitefish-herring-salmon/'
    ),
    (
      'wellness pet company|wellness|wellness complete health age advantage senior pate tuna and salmon natural grain free wet cat food|cat|senior|wet||',
      '2941ffb029290e2815fb12148e9fae139a8b067d9e9923485bb206d9d518d9b4',
      'https://www.chewy.com/wellness-complete-health-age/dp/390142',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-age-advantage-tuna-salmon/'
    ),
    (
      'wellness pet company|wellness|wellness complete health sliced turkey and salmon dinner natural grain free wet cat food|cat|unknown|wet||',
      'e016fe73bd1e5ae6ae5d7b0713f96b8234b5a5fc6ee316188786e26502fac1c6',
      'https://www.chewy.com/wellness-complete-health-sliced/dp/37279',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-sliced-sliced-turkey-salmon-entree/'
    )
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
  reviewed_alias.identity_hash,
  'manual_review',
  reviewed_alias.retailer_source_url,
  jsonb_build_object(
    'official_source_url', reviewed_alias.official_source_url,
    'reviewed_at', '2026-07-25',
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, life stage, and form'
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
