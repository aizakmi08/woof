WITH reviewed_alias (
  alias_formula_key,
  retailer_source_url,
  official_source_url,
  serving_cache_key
) AS (
  VALUES
    ('firstmate|firstmate|firstmate new zealand beef meal and oats formula limited ingredient dry dog food|dog|unknown|dry||', 'https://www.chewy.com/firstmate-new-zealand-beef-meal-oats/dp/1395854', 'https://firstmate.com/product/limited-ingredient-new-zealand-beef/', 'firstmate:firstmate limited ingredient new zealand beef product limited-ingredient-new-zealand-beef'),
    ('firstmate|firstmate|firstmate small bites limited ingredient diet grain free chicken meal with blueberries formula dry dog food|dog|unknown|dry||', 'https://www.chewy.com/firstmate-small-bites-limited/dp/1028454', 'https://firstmate.com/product/chicken-meal-blueberries-formula-small-bites/', 'firstmate:firstmate limited ingredient chicken meal with blueberries formula small bites product chicken-meal-blueberries-formula-small-bites')
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
    'evidence', 'exact current FirstMate PDP ingredients and front image; official Dry Diets or kibble evidence; official adult or all-life-stages adequacy evidence; exact protected recipe and small-bite boundary'
  )
FROM reviewed_alias
JOIN LATERAL (
  SELECT candidate.id
  FROM public.catalog_formulas AS candidate
  WHERE lower(regexp_replace(candidate.source_url, '/+$', '')) =
        lower(regexp_replace(reviewed_alias.official_source_url, '/+$', ''))
    AND candidate.active
    AND candidate.verification_status = 'verified'
  ORDER BY
    (candidate.promoted_cache_key = reviewed_alias.serving_cache_key) DESC,
    candidate.updated_at DESC,
    candidate.id DESC
  LIMIT 1
) AS formula ON TRUE
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now();
