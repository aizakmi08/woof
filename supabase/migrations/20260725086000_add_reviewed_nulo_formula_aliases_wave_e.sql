WITH reviewed_alias (
  alias_formula_key,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    ('nulo|nulo|nulo freestyle chicken duck and pumpkin stew wet cat food|cat|unknown|wet||', 'https://www.chewy.com/nulo-freestyle-chicken-duck-pumpkin/dp/355556', 'https://nulo.com/products/freestyle-signature-stews-chicken-duck-pumpkin-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle turkey and duck recipe with omega fatty acids high protein and grain free dry cat and kitten food|cat|kitten|dry||', 'https://www.chewy.com/nulo-freestyle-turkey-duck-recipe/dp/281457', 'https://nulo.com/products/freestyle-turkey-duck-recipe-for-cats'),
    ('nulo|nulo|nulo grain free chicken and chicken liver pate wet canned food for cats and kittens|cat|unknown|wet||', 'https://www.chewy.com/nulo-freestyle-chicken-chicken-liver/dp/355548', 'https://nulo.com/products/freestyle-pate-chicken-chicken-liver-recipe-for-cats'),
    ('nulo|nulo|nulo grain free yellowfin tuna and shrimp recipe pate wet canned food for cats and kittens|cat|unknown|wet||', 'https://www.chewy.com/nulo-freestyle-yellowfin-tuna-shrimp/dp/355552', 'https://nulo.com/products/freestyle-pate-yellowfin-tuna-shrimp-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle limited ingredient pollock and lentil recipe high protein and grain free adult and puppy dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-freestyle-limited-alaska-pollock/dp/279386', 'https://nulo.com/products/freestyle-limited-alaska-pollock-lentils-recipe-for-dogs'),
    ('nulo|nulo|nulo grain free chicken and salmon recipe pate wet canned food for cats and kittens|cat|unknown|wet||', 'https://www.chewy.com/nulo-freestyle-chicken-salmon-pate/dp/355550', 'https://nulo.com/products/freestyle-pate-chicken-salmon-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle hairball management turkey and cod recipe with omega fatty acids high protein and grain free dry cat food|cat|unknown|dry||', 'https://www.chewy.com/nulo-freestyle-hairball-management/dp/277895', 'https://nulo.com/products/freestyle-hairball-management-turkey-cod-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle limited ingredient turkey recipe small breed high protein and grain free puppy and adult dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-freestyle-limited-turkey-recipe/dp/281453', 'https://nulo.com/products/freestyle-limited-small-breed-turkey-recipe-for-dogs'),
    ('nulo|nulo|nulo freestyle limited ingredient salmon recipe high protein and grain free puppy and adult dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-freestyle-limited-salmon-recipe/dp/277888', 'https://nulo.com/products/freestyle-limited-salmon-recipe-for-dogs'),
    ('nulo|nulo|nulo freestyle salmon and lentils recipe with l carnitine and probiotics high protein and grain free adult trim dry cat food|cat|adult|dry||', 'https://www.chewy.com/nulo-freestyle-salmon-lentils-recipe/dp/277884', 'https://nulo.com/products/freestyle-adult-trim-salmon-lentils-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle chicken and cod recipe with omega fatty acids high protein and grain free dry cat and kitten food|cat|kitten|dry||', 'https://www.chewy.com/nulo-freestyle-chicken-cod-recipe/dp/281455', 'https://nulo.com/products/freestyle-chicken-cod-recipe-for-cats'),
    ('nulo|nulo|nulo chicken and salmon recipe grain free pate wet cat and kitten food cup twinpack|cat|kitten|wet||', 'https://www.chewy.com/nulo-chicken-salmon-recipe-grain-free/dp/2293174', 'https://nulo.com/products/split-cup-pates-chicken-salmon-recipe-for-cats'),
    ('nulo|nulo|nulo chicken and lamb with organ meats shredded canned wet cat food|cat|unknown|wet||', 'https://www.chewy.com/nulo-chicken-lamb-organ-meats/dp/1297950', 'https://nulo.com/products/real-shreds-with-organ-meat-chicken-lamb-recipe-for-cats'),
    ('nulo|nulo|nulo challenger puppy and adult small breed northern catch haddock salmon and acadian redfish dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-challenger-puppy-adult-small/dp/1375606', 'https://nulo.com/products/challenger-small-breed-organic-ancient-grains-haddock-salmon-acadian-redfish-recipe-for-dogs'),
    ('nulo|nulo|nulo challenger puppy and adult gamebird quarry duck turkey and guinea fowl dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-challenger-puppy-adult-gamebird/dp/1375694', 'https://nulo.com/products/challenger-organic-ancient-grains-duck-turkey-guinea-fowl-recipe-for-dogs'),
    ('nulo|nulo|nulo challenger alpine ranch beef lamb and pork large breed puppy dry dog food|dog|puppy|dry||', 'https://www.chewy.com/nulo-challenger-alpine-ranch-beef/dp/1375646', 'https://nulo.com/products/challenger-large-breed-puppy-organic-ancient-grains-beef-lamb-pork-recipe-for-dogs'),
    ('nulo|nulo|nulo chicken and beef with organ meats shredded canned wet cat food|cat|unknown|wet||', 'https://www.chewy.com/nulo-chicken-beef-organ-meats/dp/1297902', 'https://nulo.com/products/real-shreds-with-organ-meat-chicken-beef-recipe-for-cats'),
    ('nulo|nulo|nulo chicken whitefish and tuna recipe grain free pate wet cat and kitten food cup twinpack|cat|kitten|wet||', 'https://www.chewy.com/nulo-chicken-whitefish-tuna-recipe/dp/2293182', 'https://nulo.com/products/split-cup-pates-chicken-whitefish-tuna-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle mackerel shrimp and mussels stew wet cat food|cat|unknown|wet||', 'https://www.chewy.com/nulo-freestyle-mackerel-shrimp/dp/355558', 'https://nulo.com/products/freestyle-signature-stews-mackerel-shrimp-mussels-recipe-for-cats'),
    ('nulo|nulo|nulo freestyle grain free chicken cod dry cat food|cat|unknown|dry||', 'https://www.walmart.com/ip/Nulo-Freestyle-Grain-Free-Chicken-Cod-Dry-Cat-Food-5-Lb/854719059', 'https://nulo.com/products/freestyle-chicken-cod-recipe-for-cats')
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
    'evidence', 'exact official manufacturer PDP identity, ingredients, front image, life stage, recipe, and form'
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
