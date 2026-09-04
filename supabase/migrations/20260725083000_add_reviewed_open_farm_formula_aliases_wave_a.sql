WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    (
      'open farm|open farm|open farm grain free salmon recipe dog food|dog|unknown|unknown||',
      'd1d6bcdcf030758e0c41c1c9e068dcfb2b62650984e77eb084a7aad318b5098d',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Salmon-Recipe-Dog-Food-24-Lb/938323571',
      'https://openfarmpet.com/products/wild-caught-salmon-dry-dog-food'
    ),
    (
      'open farm|open farm|open farm grain free salmon recipe dog food 4|dog|unknown|unknown||',
      'fae3f68b2d7991024453034ce89ee466021d44c072800e2ecec660d7676630a5',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Salmon-Recipe-Dog-Food-4-5-lb-Bag/254532378',
      'https://openfarmpet.com/products/wild-caught-salmon-dry-dog-food'
    ),
    (
      'open farm|open farm|open farm grain free turkey chicken recipe dry dog food|dog|unknown|dry||',
      '0de9dc207264a206809019b4184c4c8135b71a4f5617d338c3a0120055e3d1be',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Turkey-Chicken-Recipe-Dry-Dog-Food-24-Lb/692907635',
      'https://openfarmpet.com/products/chicken-and-turkey-dry-dog-food'
    ),
    (
      'open farm|open farm|open farm grain free turkey chicken recipe dry dog food 4|dog|unknown|dry||',
      'e4b40edccf4213a6f98ba338e2b2fbb2ceabfe830597d34ab5a5d67f8029a923',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Turkey-Chicken-Recipe-Dry-Dog-Food-4-5-lb-Bag/396198948',
      'https://openfarmpet.com/products/chicken-and-turkey-dry-dog-food'
    ),
    (
      'open farm|open farm|open farm grain free lamb recipe dry dog food|dog|unknown|dry||',
      'a1efcaa811fa72984c404d57fc5186f957cc6d1137dab932aab57f8d2f82c346',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Lamb-Recipe-Dry-Dog-Food-12-lb-Bag/416263385',
      'https://openfarmpet.com/products/lamb-dry-dog-food'
    ),
    (
      'open farm|open farm|open farm grain free lamb recipe dry dog food 4|dog|unknown|dry||',
      'bf6eb31cf4088312260ed4fa4c220ad309d82fbf55ed3dd2e42434ca5dbaa916',
      'https://www.walmart.com/ip/Open-Farm-Grain-Free-Lamb-Recipe-Dry-Dog-Food-4-5-Lb/540368196',
      'https://openfarmpet.com/products/lamb-dry-dog-food'
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, complete-food status, and package-size variants'
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
