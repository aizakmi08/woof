WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'wellness pet company|wellness|wellness complete health kitten pate whitefish and tuna natural grain free wet cat food|cat|kitten|wet||',
      'e426b98d9fd87585ab4e16b2539c90f3b634832b5468eff1777f8e837355853a',
      'https://www.chewy.com/wellness-complete-health-kitten/dp/359547',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-kitten-whitefish-tuna/'
    ),
    (
      'wellness pet company|wellness|wellness complete health minced salmon dinner natural grain free wet cat food|cat|unknown|wet||',
      '29495686ca16eab5135bfb6089218e653d7734b9a2cd96af2d3636af941df12c',
      'https://www.chewy.com/wellness-complete-health-natural/dp/37259',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-minced-minced-salmon-entree/'
    ),
    (
      'wellness pet company|wellness|wellness complete health pate chicken and lobster natural grain free cat food|cat|unknown|wet||',
      'eaa04a39ee35aedc4420d5b58e3b16f878324b0845157ab7e1491a68e5ac7152',
      'https://www.chewy.com/wellness-complete-health-chicken/dp/34449',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-chicken-lobster/'
    ),
    (
      'wellness pet company|wellness|wellness complete pate health turkey and salmon natural grain free wet cat food|cat|unknown|wet||',
      '4f64a7e8e28fb3cc4ed198643ff73b22cd1838196a679a7d1b32add28accb1ad',
      'https://www.chewy.com/wellness-complete-health-turkey/dp/1783782',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-pate-turkey-salmon/'
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
