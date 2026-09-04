WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'blue buffalo|blue buffalo|blue buffalo freedom indoor weight control chicken recipe grain free dry cat food|cat|unknown|dry||',
      '747604fdbd0359151144e7038738df0aee17efd8d4d69c1f511af4ab0b5154f8',
      'https://www.chewy.com/blue-buffalo-freedom-indoor-weight/dp/49677',
      'https://www.bluebuffalo.com/dry-cat-food/freedom/indoor-weight-control-chicken/'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo baby blue healthy growth formula grain free high protein turkey and potato recipe puppy wet food|dog|puppy|wet||',
      'e59f5c822a9a2486567dde3ac955c3dcfc2b33f8da968f31a84bf2cc6ec5368f',
      'https://www.chewy.com/blue-buffalo-baby-blue-healthy-growth/dp/502158',
      'https://www.bluebuffalo.com/wet-dog-food/baby-blue/puppy-turkey-potato/'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo homestyle recipe senior natural ingredients beef dinner with garden vegetables canned wet dog food|dog|senior|wet||',
      '8ddbf9c677c62192cb397cffa4758c2b4e4c25cfe947ce94d130cf43912e5ac6',
      'https://www.chewy.com/blue-buffalo-homestyle-recipe-senior/dp/1345446',
      'https://www.bluebuffalo.com/wet-dog-food/blue-specialty/senior-homestyle-recipe-beef-dinner/'
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
