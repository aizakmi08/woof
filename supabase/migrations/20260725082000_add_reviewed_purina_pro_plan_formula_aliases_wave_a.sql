WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'purina pro plan|purina pro plan|purina pro plan sport small bites all life stages high protein lamb and rice formula dry dog food|dog|all life stages|dry||',
      'e3e54720f6e8e4669f77366b529aa999bf72bc53556d618196476c798b541c54',
      'https://www.chewy.com/purina-pro-plan-sport-small-bites-all/dp/52434',
      'https://www.purina.com/dogs/shop/pro-plan-sport-27-17-small-bites-lamb-rice-dry-dog-food'
    ),
    (
      'purina pro plan|purina pro plan|purina pro plan sensitive skin and stomach turkey and oat meal dry dog food|dog|unknown|dry||',
      '0ffd50b4aa4a09406a73a99e37b8d0a70a4a48452764847e1fe8f6ced34c9860',
      'https://www.chewy.com/purina-pro-plan-sensitive-skin/dp/298056',
      'https://www.purina.com/dogs/shop/pro-plan-specialized-nutrition-sensitive-skin-stomach-turkey-oatmeal-probiotics-dry-dog'
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
    'evidence', 'exact official manufacturer PDP and label PDF identity, ingredients, front image, life stage, and form'
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
