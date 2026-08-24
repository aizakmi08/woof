WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'wellness pet company|wellness|wellness complete health grain free indoor healthy weight chicken recipe natural dry cat food|cat|unknown|dry||',
      '17b1c4f8573f21c8913aec34ae614a482737034af1c8baa328c0174f7e064fbd',
      'https://www.chewy.com/wellness-complete-health-grain-free/dp/172379',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grain-free-indoor-healthy-weight-chicken-recipe/'
    ),
    (
      'wellness pet company|wellness|wellness core indoor pate chicken and chicken liver natural grain free wet cat food|cat|unknown|wet||',
      '992bc23a18714f3ab2053619126797a5efd6d7c7c905b13b12ab8f112c650bb4',
      'https://www.chewy.com/wellness-core-grain-free-indoor/dp/37154',
      'https://www.wellnesspetfood.com/product-catalog/wellness-core-plus-pate-indoor-chicken-chicken-liver/'
    ),
    (
      'wellness pet company|wellness|wellness simple limited ingredient small breed adult grain free natural salmon and potato dry dog food|dog|adult|dry||',
      'f1e32f0297cdf627b65548c0cc63a566c4ade9550712b155d630438191dc702a',
      'https://www.chewy.com/wellness-simple-limited-ingredient/dp/103215',
      'https://www.wellnesspetfood.com/product-catalog/wellness-simple-grain-free-small-breed-salmon-and-potato-recipe/'
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, and front image'
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
