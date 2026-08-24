WITH reviewed_alias (
  alias_formula_key,
  retailer_source_url,
  official_source_url
) AS (
  VALUES
    ('blue buffalo|blue buffalo|blue buffalo wilderness red meat and grains rocky mountain recipe high protein large breed adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/blue-buffalo-wilderness-rocky/dp/1300366', 'https://www.bluebuffalo.com/dry-dog-food/wilderness/rocky-mountain-large-breed-red-meat-wholesome-grain-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness red meat rocky mountain recipe high protein healthy weight adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/blue-buffalo-wilderness-rocky/dp/1300334', 'https://www.bluebuffalo.com/dry-dog-food/wilderness/rocky-mountain-healthy-weight-red-meat-wholesome-grain-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo true solutions large breed care formula adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/blue-buffalo-true-solutions-livin/dp/291011', 'https://www.bluebuffalo.com/dry-dog-food/true-solutions/large-breed/'),
    ('blue buffalo|blue buffalo|blue buffalo blue s hunter s stew grain free canned dog food|dog|unknown|wet||', 'https://www.chewy.com/blue-buffalo-blues-hunters-stew-grain/dp/112803', 'https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-hunters-stew/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness chicken high protein grain free pate adult wet cat food|cat|adult|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-chicken-grain/dp/3283926', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/chicken/'),
    ('blue buffalo|blue buffalo|blue buffalo freedom senior chicken recipe grain free canned dog food|dog|senior|wet||', 'https://www.chewy.com/blue-buffalo-freedom-senior-chicken/dp/111954', 'https://www.bluebuffalo.com/wet-dog-food/freedom/senior-chicken/'),
    ('blue buffalo|blue buffalo|blue buffalo freedom senior grain free chicken and potatoes dry dog food|dog|senior|dry||', 'https://www.chewy.com/blue-buffalo-freedom-senior-chicken/dp/103613', 'https://www.bluebuffalo.com/dry-dog-food/freedom/senior-chicken-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness denali dinner high protein grain free wild salmon venison and halibut wet dog food|dog|unknown|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-denali-dinner/dp/123529', 'https://www.bluebuffalo.com/wet-dog-food/wilderness/denali-dinner-wild-salmon-venison-halibut-dinner/'),
    ('blue buffalo|blue buffalo|blue buffalo homestyle recipe chicken dinner with garden vegetables senior wet dog food|dog|senior|wet||', 'https://www.chewy.com/blue-buffalo-homestyle-recipe-senior/dp/2955366', 'https://www.bluebuffalo.com/wet-dog-food/blue-specialty/senior-homestyle-recipe-chicken-dinner/'),
    ('blue buffalo|blue buffalo|blue buffalo basics skin and stomach care grain free formula lamb and potato recipe large breed adult dry dog food|dog|adult|dry||', 'https://www.chewy.com/blue-buffalo-basics-skin-stomach-care/dp/103559', 'https://www.bluebuffalo.com/dry-dog-food/basics/large-breed-grain-free-lamb-potato-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness rocky mountain recipe flaked trout feast adult grain free canned cat food|cat|adult|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-rocky/dp/112017', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/flaked-trout/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness wild delights adult chicken and trout recipe in tasty gravy high protein grain free flaked wet cat food|cat|adult|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/103529', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/flaked-chicken-trout/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness wild delights minced chicken and trout recipe in tasty gravy high protein grain free wet cat food|cat|unknown|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/112003', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/minced-chicken-trout/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness wild delights flaked chicken and turkey grain free canned cat food|cat|unknown|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/103528', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/flaked-chicken-turkey/'),
    ('blue buffalo|blue buffalo|blue buffalo freedom small breed grain free chicken and potatoes dry dog food|dog|unknown|dry||', 'https://www.chewy.com/blue-buffalo-freedom-small-breed/dp/35938', 'https://www.bluebuffalo.com/dry-dog-food/freedom/small-breed-chicken-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula natural grain free chicken and potatoes small breed dry dog food|dog|unknown|dry||', 'https://www.chewy.com/blue-buffalo-life-protection-formula/dp/3929270', 'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/adult-small-breed-grain-free-chicken-potato-recipe/'),
    ('blue buffalo|blue buffalo|blue buffalo life protection formula healthy weight large breed adult weight control chicken and brown rice recipe dry dog food|dog|adult|dry||', 'https://www.chewy.com/blue-buffalo-life-protection-formula/dp/383368', 'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/large-breed-healthy-weight-chicken-brown-rice/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew adult high protein grain free natural hearty savory salmon stew wet dog food|dog|adult|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-wolf-creek/dp/103667', 'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness salmon grain free canned cat food|cat|unknown|wet||', 'https://www.chewy.com/blue-buffalo-wilderness-salmon-grain/dp/506918', 'https://www.bluebuffalo.com/wet-cat-food/wilderness/salmon/'),
    ('blue buffalo|blue buffalo|blue buffalo wilderness puppy chicken recipe high protein grain free dry dog food|dog|puppy|dry||', 'https://www.chewy.com/blue-buffalo-wilderness-puppy-chicken/dp/36718', 'https://www.bluebuffalo.com/dry-dog-food/wilderness/puppy-chicken-grain-free-recipe/')
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
