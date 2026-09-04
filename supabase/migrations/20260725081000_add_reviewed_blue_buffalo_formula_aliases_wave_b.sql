WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'blue buffalo|blue buffalo|blue buffalo basics skin and stomach care grain free fish and potato recipe dry cat food|cat|unknown|dry||',
      '57f8f589f505e262612e2db70e87a573fa80c109c0c28da8c94d0e155793df29',
      'https://www.chewy.com/blue-buffalo-basics-skin-stomach-care/dp/103464',
      'https://www.bluebuffalo.com/dry-cat-food/basics/indoor-grain-free-fish-potato/'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo wilderness chicken recipe high protein large breed adult dry dog food|dog|adult|dry||',
      '235bdcf85db63802645b4c5bf012e17be35c963be533b8b1568fdb64d1aeae11',
      'https://www.chewy.com/blue-buffalo-wilderness-large-breed/dp/733454',
      'https://www.bluebuffalo.com/dry-dog-food/wilderness/large-breed-adult-grain-free-chicken/'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo wilderness chicken recipe high protein healthy weight adult dry dog food|dog|adult|dry||',
      '4b8d6b51491c4e136945d8cbb208534f258522a803262cd2c23acc214fee76d0',
      'https://www.chewy.com/blue-buffalo-wilderness-healthy/dp/735502',
      'https://www.bluebuffalo.com/dry-dog-food/wilderness/healthy-weight-chicken-wholesome-grain-recipe/'
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
