-- Reconcile seven exact retailer package fronts to existing verified
-- manufacturer-current formulas. Retailer images are identity evidence only:
-- never overwrite ingredients and claim no retailer ingredient-version
-- equivalence. Package counts and sizes remain SKU attributes.

UPDATE public.product_data
SET
  product_line = 'Pro Plan Complete Essentials Adult',
  life_stage = 'adult',
  flavor = 'Chicken & Rice Entrée',
  formula_version_provenance =
    coalesce(formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'identity_repair', jsonb_build_object(
        'reviewed_at', '2026-07-27',
        'reason',
          'Exact official Complete Essentials Adult Chicken & Rice Entrée Classic title and package front',
        'ingredient_hash_equality_verified', true
      )
    ),
  updated_at = now()
WHERE cache_key = 'nestle-purina-pro-plan:038100026743'
  AND formula_evidence_tier = 'manufacturer_current_exact'
  AND ingredient_verification_status = 'manufacturer'
  AND encode(digest(trim(regexp_replace(
        coalesce(ingredient_text, ''),
        '\s+',
        ' ',
        'g'
      )), 'sha256'), 'hex')
    = '8765c0115d8d3d3aeb1badd9dd865fb51ca9128bb92c750df2f49e65e5252a8f';

CREATE TEMP TABLE reviewed_visible_package_v176 ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset($aliases$
[
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls natural pate salmon entree wet cat food|cat|unknown|wet||",
    "identity_hash": "35a413c6213e2dee9449bb628aa3ade130a1132315c9f335104e87eb5eb6c7c2",
    "source_url": "https://www.chewy.com/blue-buffalo-tastefuls-natural-pate/dp/879358",
    "source_product_name": "Blue Buffalo Tastefuls Natural Pate Salmon Entree Wet Cat Food",
    "source_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-natural-pate-salmon-entree-wet-cat-food-3oz-can-case-of-12/img-491845._V1_.jpg",
    "source_image_sha256": "b2e8d96a2060de2a8af11119db5e84daf155486019123e786cd7645915c2605a",
    "source_observed_at": "2026-07-24T21:12:21.310Z",
    "official_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/salmon-pate/",
    "official_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_adult_salmon_pate_share.png",
    "official_product_code": "salmon-pate",
    "official_ingredient_hash": "0b8dec294485389be3fd947aa47dbcada3850bad3af08db8bb7e46eb32638cf8",
    "expected_formula_key": "general mills|blue buffalo|blue tastefuls adult wet cat food salmon pate|cat|adult|wet|salmon|",
    "brand": "Blue Buffalo",
    "pet_type": "cat",
    "life_stage": "adult",
    "food_form": "wet",
    "flavor": "Salmon Paté",
    "protected_terms": ["Blue Buffalo","Tastefuls","Salmon","Pate","Wet Cat Food"]
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls salmon entree pate wet cat food|cat|unknown|wet||",
    "identity_hash": "6a5fb625dd8820e3e93be19b3ae0fe351a128e78c0ef14cdf1870de0a867b037",
    "source_url": "https://www.chewy.com/blue-buffalo-tastefuls-salmon-entree/dp/290982",
    "source_product_name": "Blue Buffalo Tastefuls Salmon Entrée Pate Wet Cat Food",
    "source_image_url": "https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-salmon-entre-pate-wet-cat-food-3oz-can-case-of-24/img-312232._V1_.jpg",
    "source_image_sha256": "3215ef4a6812a19da854aeae19c3871d4fddf238b82451f8c31deec56310b4cf",
    "source_observed_at": "2026-07-24T21:12:17.825Z",
    "official_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/salmon-pate/",
    "official_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_adult_salmon_pate_share.png",
    "official_product_code": "salmon-pate",
    "official_ingredient_hash": "0b8dec294485389be3fd947aa47dbcada3850bad3af08db8bb7e46eb32638cf8",
    "expected_formula_key": "general mills|blue buffalo|blue tastefuls adult wet cat food salmon pate|cat|adult|wet|salmon|",
    "brand": "Blue Buffalo",
    "pet_type": "cat",
    "life_stage": "adult",
    "food_form": "wet",
    "flavor": "Salmon Paté",
    "protected_terms": ["Blue Buffalo","Tastefuls","Salmon","Pate","Wet Cat Food"]
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo true solutions perfect coat skin and coat care adult salmon flavor dry cat food|cat|adult|dry||",
    "identity_hash": "d748af4e7fad94141a8493daada4b4e5e01de73d1fc09fa9b383e6540219750f",
    "source_url": "https://www.target.com/p/blue-buffalo-true-solutions-perfect-coat-skin-and-coat-care-adult-salmon-flavor-dry-cat-food/-/A-80837871",
    "source_product_name": "Blue Buffalo True Solutions Perfect Coat Skin and Coat Care Adult Salmon Flavor Dry Cat Food",
    "source_image_url": "https://target.scene7.com/is/image/Target/GUEST_48e4a41f-8019-444c-bccc-80dfb91d7b64",
    "source_image_sha256": "5bb1925024f10b15c95171ea2842d3650ad8c68c76d9126b7947d16500b42546",
    "source_observed_at": "2026-07-24T21:11:55.063Z",
    "official_source_url": "https://www.bluebuffalo.com/dry-cat-food/true-solutions/skin-coat-care/",
    "official_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_perfectcoat.png",
    "official_product_code": "skin-coat-care",
    "official_ingredient_hash": "7c2448391a9e3caf70f6ad191510ea78804a1e3f2b09548be33ff0487ea22aa1",
    "expected_formula_key": "general mills|blue buffalo|blue true solutions skin and coat care salmon and brown rice recipe for adult cats|cat|adult|dry|salmon and brown rice recipe|",
    "brand": "Blue Buffalo",
    "pet_type": "cat",
    "life_stage": "adult",
    "food_form": "dry",
    "flavor": "Salmon & Brown Rice",
    "protected_terms": ["Blue Buffalo","True Solutions","Skin and Coat Care","Adult","Salmon","Dry Cat Food"]
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo true solutions skin and coat care natural salmon adult dry cat food|cat|adult|dry||",
    "identity_hash": "72795245a3c65530a0eb0c60e9fe0dffcd717e285e7512757a5432262dd155ca",
    "source_url": "https://www.chewy.com/blue-buffalo-true-solutions-perfect/dp/244851",
    "source_product_name": "Blue Buffalo True Solutions Skin & Coat Care Natural Salmon Adult Dry Cat Food",
    "source_image_url": "https://image.chewy.com/catalog/general/images/moe/067ebfe6-f7f5-7230-8000-011c0e376434._V1_.jpg",
    "source_image_sha256": "b8c09356d06d7b6adc476f37b438acd5b4f7436f76fc30ad689924d1dc2bc7f7",
    "source_observed_at": "2026-07-24T21:12:18.691Z",
    "official_source_url": "https://www.bluebuffalo.com/dry-cat-food/true-solutions/skin-coat-care/",
    "official_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_perfectcoat.png",
    "official_product_code": "skin-coat-care",
    "official_ingredient_hash": "7c2448391a9e3caf70f6ad191510ea78804a1e3f2b09548be33ff0487ea22aa1",
    "expected_formula_key": "general mills|blue buffalo|blue true solutions skin and coat care salmon and brown rice recipe for adult cats|cat|adult|dry|salmon and brown rice recipe|",
    "brand": "Blue Buffalo",
    "pet_type": "cat",
    "life_stage": "adult",
    "food_form": "dry",
    "flavor": "Salmon & Brown Rice",
    "protected_terms": ["Blue Buffalo","True Solutions","Skin and Coat Care","Adult","Salmon","Dry Cat Food"]
  },
  {
    "alias_formula_key": "purina pro plan|purina pro plan|pro plan complete essentials adult chicken and rice entree classic wet dog food|dog|adult|wet||",
    "identity_hash": "70d1946669dcce153e33839b8280c982edb1f33333fb5c9871054f3191b6c384",
    "source_url": "https://www.petsmart.com/dog/food/canned-food/purina-pro-plan-complete-essentials-adult-wet-dog-food---classic-pate-chicken-and-rice-13-oz-90186.html",
    "source_product_name": "Pro Plan Complete Essentials Adult Chicken & Rice Entrée Classic Wet Dog Food",
    "source_image_url": "https://s7d2.scene7.com/is/image/PetSmart/5067191",
    "source_image_sha256": "e102f79875d690fe152558401f0afd9aa7b42ec1f9fc51efda0e57693f62da02",
    "source_observed_at": "2026-07-16T21:07:41.025Z",
    "official_source_url": "https://www.purina.com/dogs/shop/pro-plan-complete-essentials-chicken-wet-dog-food",
    "official_image_url": "https://www.purina.com/.netlify/images?w=250&h=250&fm=png&q=75&url=https%3A%2F%2Flive.purina.com%2Fsites%2Fdefault%2Ffiles%2Fproducts%2F2024-12%2Fpro-plan-complete-essentials-chicken-rice-wet-dog-food-13-oz-can.png&cd=d6aea20a76babccb15f9850663eea0ed",
    "official_product_code": "038100026743",
    "official_ingredient_hash": "8765c0115d8d3d3aeb1badd9dd865fb51ca9128bb92c750df2f49e65e5252a8f",
    "expected_formula_key": "purina pro plan|purina pro plan|pro plan complete essentials adult|dog|adult|wet|chicken and rice entree|",
    "brand": "Purina Pro Plan",
    "pet_type": "dog",
    "life_stage": "adult",
    "food_form": "wet",
    "flavor": "Chicken & Rice Entrée",
    "protected_terms": ["Pro Plan","Complete Essentials","Adult","Chicken and Rice Entree","Classic","Wet Dog Food"]
  },
  {
    "alias_formula_key": "royal canin|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|kitten|wet||",
    "identity_hash": "98faf56ce1f72b8226a75e1f6a21b6c9c3c81d99741f4821568412e68f237ec7",
    "source_url": "https://www.petsmart.com/cat/food-and-treats/veterinary-diets/royal-canin-feline-gastrointestinal-kitten-ultra-soft-mousse-in-sauce-wet-cat-food-5-1-oz-can-63312.html",
    "source_product_name": "Feline Gastrointestinal Kitten Ultra Soft Mousse in Sauce",
    "source_image_url": "https://s7d2.scene7.com/is/image/PetSmart/5306078",
    "source_image_sha256": "c220a3aec8e4e7943f29a936fb16f6edefc1e06f5f2cf929f595bfdd4d42d55a",
    "source_observed_at": "2026-07-16T21:07:42.079Z",
    "official_source_url": "https://www.royalcanin.com/us/cats/products/vet-products/gastrointestinal-kitten-ultra-soft-mousse-in-sauce-1227",
    "official_image_url": "https://marspetcareaprimocdn.petcare.global/e86de548-ef98-4cc6-b865-b1ef000edb0c/e86de548-ef98-4cc6-b865-b1ef000edb0c_DownloadAsJpg.jpg",
    "official_product_code": "030111474797",
    "official_ingredient_hash": "e7eb249637edcc8ad23e479c8d0ffaf0c059d7f513b6ecb4ce0f28c3b1187eab",
    "expected_formula_key": "royal canin mars petcare|royal canin|feline gastrointestinal kitten ultra soft mousse in sauce|cat|adult kitten|wet||",
    "brand": "Royal Canin",
    "pet_type": "cat",
    "life_stage": "kitten",
    "food_form": "wet mousse",
    "flavor": "Gastrointestinal Kitten",
    "protected_terms": ["Royal Canin","Feline","Gastrointestinal","Kitten","Ultra Soft Mousse","Sauce"]
  },
  {
    "alias_formula_key": "royal canin|royal canin|west highland white terrier adult dry dog food|dog|adult|dry||",
    "identity_hash": "b3872a6218d87cd63e04a1636cb87856b1bea085a549ae41881d91b97b5da455",
    "source_url": "https://www.petsmart.com/dog/food/dry-food/royal-canin-breed-health-nutrition-west-highland-white-terrier-adult-dry-dog-food-97308.html",
    "source_product_name": "West Highland White Terrier Adult Dry Dog Food",
    "source_image_url": "https://s7d2.scene7.com/is/image/PetSmart/5377041",
    "source_image_sha256": "95157c55bd584fd6e8860dc2a8c55341068536e8bb34f9a279eecf3862e334d4",
    "source_observed_at": "2026-07-16T21:07:41.630Z",
    "official_source_url": "https://www.royalcanin.com/us/dogs/products/retail-products/west-highland-white-terrier-adult-3981",
    "official_image_url": "https://cdn.royalcanin-weshare-online.io/3z9BvYcBRYZmsWpc_fgm/v15/center-front-hero-image-3981-030111513601-dog-01-jpg",
    "official_product_code": "030111513601",
    "official_ingredient_hash": "be1660fdde9f2c498b0720de9b1e06b89bd3a91c7ddce2b23ffb57f38d90d51e",
    "expected_formula_key": "royal canin mars petcare|royal canin|west highland white terrier adult dry dog food|dog|adult mature|dry||",
    "brand": "Royal Canin",
    "pet_type": "dog",
    "life_stage": "adult",
    "food_form": "dry",
    "flavor": "West Highland White Terrier",
    "protected_terms": ["Royal Canin","West Highland White Terrier","Adult","Dry Dog Food"]
  }
]
$aliases$::jsonb)
AS row(
  alias_formula_key text,
  identity_hash text,
  source_url text,
  source_product_name text,
  source_image_url text,
  source_image_sha256 text,
  source_observed_at timestamptz,
  official_source_url text,
  official_image_url text,
  official_product_code text,
  official_ingredient_hash text,
  expected_formula_key text,
  brand text,
  pet_type text,
  life_stage text,
  food_form text,
  flavor text,
  protected_terms jsonb
);

WITH verified AS (
  SELECT reviewed.*, formula.id AS formula_id, formula.promoted_cache_key
  FROM reviewed_visible_package_v176 reviewed
  JOIN public.catalog_formulas formula
    ON formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'manufacturer_current_exact'
   AND formula.formula_key = reviewed.expected_formula_key
   AND formula.source_url = reviewed.official_source_url
   AND formula.front_image_url = reviewed.official_image_url
   AND encode(digest(trim(regexp_replace(
         coalesce(formula.ingredient_text, ''),
         '\s+',
         ' ',
         'g'
       )), 'sha256'), 'hex') = reviewed.official_ingredient_hash
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, created_at, updated_at
)
SELECT
  verified.alias_formula_key,
  verified.formula_id,
  verified.identity_hash,
  'manual_review',
  verified.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_wave', 'v176',
    'review_method', 'exact_official_identity_and_ingredient_hash_review',
    'source_product_name', verified.source_product_name,
    'source_image_url', verified.source_image_url,
    'source_image_sha256', verified.source_image_sha256,
    'source_observed_at', verified.source_observed_at,
    'official_source_url', verified.official_source_url,
    'official_image_url', verified.official_image_url,
    'official_product_code', verified.official_product_code,
    'official_ingredient_hash', verified.official_ingredient_hash,
    'expected_formula_key', verified.expected_formula_key,
    'protected_terms', verified.protected_terms,
    'source_version_policy',
      'select exact verified canonical formula; never overwrite ingredients; no retailer ingredient-version equivalence claimed',
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  now(),
  now()
FROM verified
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

WITH verified AS (
  SELECT reviewed.*, formula.id AS formula_id, formula.promoted_cache_key
  FROM reviewed_visible_package_v176 reviewed
  JOIN public.catalog_formulas formula
    ON formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'manufacturer_current_exact'
   AND formula.formula_key = reviewed.expected_formula_key
)
INSERT INTO public.catalog_manual_evidence_reviews (
  review_key, target_formula_key, corrected_formula_key, brand, product_name,
  search_query, discovery_urls, authoritative_source_url,
  authoritative_source_type, expected_identity, resolved_identity,
  evidence_status, quarantine_reason, authoritative_content_hash,
  ingredient_text_hash, front_image_url_hash, observed_at, formula_id,
  promoted_cache_key, attempt_count, review_notes, ingredient_evidence_url,
  ingredient_evidence_mode, ingredient_original_text_hash,
  ingredient_corrections, updated_at
)
SELECT
  'manual-visible-package-alias:v176:' || verified.identity_hash,
  verified.alias_formula_key,
  verified.expected_formula_key,
  verified.brand,
  verified.source_product_name,
  verified.source_product_name || ' exact package ingredients',
  jsonb_build_array(
    verified.source_url,
    verified.official_source_url,
    verified.source_image_url,
    verified.official_image_url
  ),
  verified.official_source_url,
  'manufacturer_page',
  jsonb_build_object(
    'brand', verified.brand,
    'pet_type', verified.pet_type,
    'life_stage', verified.life_stage,
    'food_form', verified.food_form,
    'flavor', verified.flavor
  ),
  jsonb_build_object(
    'formula_id', verified.formula_id,
    'source_product_code', verified.official_product_code,
    'source_front_image_sha256', verified.source_image_sha256,
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  'promoted',
  NULL,
  encode(digest(
    verified.source_url || '|' || verified.source_image_sha256 || '|' ||
    verified.official_source_url || '|' || verified.official_ingredient_hash,
    'sha256'
  ), 'hex'),
  verified.official_ingredient_hash,
  encode(digest(verified.official_image_url, 'sha256'), 'hex'),
  verified.source_observed_at,
  verified.formula_id,
  verified.promoted_cache_key,
  1,
  'Reviewed exact title and package-front identity select one verified manufacturer-current formula. The retailer page is identity evidence only; no retailer ingredient-version equivalence is claimed.',
  verified.official_source_url,
  'source_text_exact',
  verified.official_ingredient_hash,
  '[]'::jsonb,
  now()
FROM verified
ON CONFLICT (review_key) DO UPDATE
SET corrected_formula_key = excluded.corrected_formula_key,
    discovery_urls = excluded.discovery_urls,
    expected_identity = excluded.expected_identity,
    resolved_identity = excluded.resolved_identity,
    evidence_status = 'promoted',
    quarantine_reason = NULL,
    authoritative_content_hash = excluded.authoritative_content_hash,
    ingredient_text_hash = excluded.ingredient_text_hash,
    front_image_url_hash = excluded.front_image_url_hash,
    observed_at = excluded.observed_at,
    formula_id = excluded.formula_id,
    promoted_cache_key = excluded.promoted_cache_key,
    attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
    review_notes = excluded.review_notes,
    ingredient_evidence_url = excluded.ingredient_evidence_url,
    ingredient_evidence_mode = excluded.ingredient_evidence_mode,
    ingredient_original_text_hash = excluded.ingredient_original_text_hash,
    ingredient_corrections = excluded.ingredient_corrections,
    updated_at = now();

DO $$
DECLARE
  v_aliases integer;
  v_reviews integer;
  v_pro_plan_repairs integer;
BEGIN
  SELECT count(*) INTO v_aliases
  FROM public.catalog_formula_aliases
  WHERE metadata->>'review_wave' = 'v176'
    AND metadata->>'review_method'
      = 'exact_official_identity_and_ingredient_hash_review';

  SELECT count(*) INTO v_reviews
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key LIKE 'manual-visible-package-alias:v176:%'
    AND evidence_status = 'promoted';

  SELECT count(*) INTO v_pro_plan_repairs
  FROM public.product_data
  WHERE cache_key = 'nestle-purina-pro-plan:038100026743'
    AND product_line = 'Pro Plan Complete Essentials Adult'
    AND life_stage = 'adult'
    AND flavor = 'Chicken & Rice Entrée';

  IF v_aliases <> 7 OR v_reviews <> 7 OR v_pro_plan_repairs <> 1 THEN
    RAISE EXCEPTION
      'Visible-package alias v176 incomplete: aliases %, reviews %, repairs %',
      v_aliases, v_reviews, v_pro_plan_repairs;
  END IF;
END
$$;
