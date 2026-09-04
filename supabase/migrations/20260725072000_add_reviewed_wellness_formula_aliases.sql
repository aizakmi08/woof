WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'wellness pet company|wellness|wellness complete health small breed adult wholesome grains natural turkey and oatmeal dry dog food|dog|adult|dry||',
      'f381d81937ba8fc53b1413b17435ece40dbde790374513ac456d7f1a4738f580',
      'https://www.chewy.com/wellness-small-breed-complete-health/dp/34357',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-grained-small-breed-turkey-oatmeal/'
    ),
    (
      'wellness pet company|wellness|wellness core signature selects shredded chicken and chicken liver entree natural grain free wet cat food|cat|unknown|wet||',
      'f25640355fb40e89207ea421d1248ee9a9632820d89ba43dad224c5c1f3bc304',
      'https://www.chewy.com/wellness-core-signature-selects/dp/147056',
      'https://www.wellnesspetfood.com/product-catalog/wellness-core-signature-selects-shredded-chicken-chicken-liver-in-sauce/'
    ),
    (
      'wellness pet company|wellness|wellness appetizing entrees shredded chicken and duck natural grain free wet cat food pouch|cat|unknown|wet||',
      '1a465343dc805ad94dfdc984bac7bb633fdb52d3df04bfa0ed9d74b1217fd3da',
      'https://www.chewy.com/wellness-appetizing-entrees-chicken/dp/1291302',
      'https://www.wellnesspetfood.com/product-catalog/wellness-appetizing-entrees-shredded-chicken-duck/'
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
