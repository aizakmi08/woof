-- Reconcile five visually reviewed Chewy package identities to exact current
-- Blue Buffalo manufacturer formulas. Retailer evidence is identity-only;
-- product_data, ingredients, images, formula versions, and scores stay intact.

CREATE TEMP TABLE blue_exact_package_wave_c_payload
ON COMMIT DROP
AS
SELECT raw.*,
       public.normalize_verified_product_search_query(raw.retailer_title)
         AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo freedom puppy chicken recipe grain free canned dog food|dog|puppy|wet||",
    "retailer_title":"Blue Buffalo Freedom Puppy Chicken Recipe Grain-Free Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-freedom-puppy-chicken/dp/35987",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"35987",
    "retailer_observed_at":"2026-08-05T02:25:21.281Z",
    "retailer_content_hash":"b10a430bfbd811c81b802e4258fe27a0d4c2af68417cc629e3ad95a04956e600",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-freedom-puppy-chicken-recipe-grain-free-canned-dog-food-12-5oz-case-of-12/img-147188._V1_.jpg",
    "retailer_front_image_sha256":"eeb581626bd84d8fdb4ed205a3fa9eb133e210c5c55386a83fad99e19f92241c",
    "retailer_front_visible_identity":"BLUE BUFFALO Freedom GRAIN-FREE Chicken Recipe for Puppies Natural Food for Puppies NET WT. 12.5 oz (354 g)",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue freedom sup sup wet puppy food grain-free - chicken freedom puppy-grain-free-chicken-recipe",
    "target_product_name":"BLUE Freedom Wet Puppy Food Grain-Free - Chicken",
    "target_product_line":"BLUE Freedom Wet Grain-Free",
    "target_flavor":"Chicken",
    "target_pet_type":"dog",
    "target_life_stage":"puppy",
    "target_food_form":"wet",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/freedom/puppy-grain-free-chicken-recipe/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/freedom/share-product-image/freedom-dog-puppy-wet-chicken-share.png",
    "official_review_image_sha256":"2a5e7a600ae357604c048124029550d0e42f4ebdaa5c40c8ff3e4701bb6f2aff",
    "target_ingredient_count":37,
    "target_database_ingredient_hash":"08f14ff0ac39afb7957a5662f44b33f0a2d1e284fb61eee7d7c1af0c0a152d0e",
    "target_raw_ingredient_hash":"392a95cc7e34157b1e870b42dfa2677159e82ed25ea470bdd8ef8053b7c4c2c1",
    "family":"freedom",
    "condition_boundary":"grain free",
    "recipe":"chicken",
    "package_size":"12.5 oz"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions natural weight control chicken adult wet dog food|dog|adult|wet||",
    "retailer_title":"Blue Buffalo True Solutions Natural Weight Control Chicken Adult Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-healthy/dp/3254742",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"3254742",
    "retailer_observed_at":"2026-08-05T02:25:48.356Z",
    "retailer_content_hash":"790aa49ecd4f4bb381134733cdcbfecc213fd9e0dba83cf88bc683d149d8075c",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068b9ac5-78de-7fc5-8000-29597ae49263._V1_.jpg",
    "retailer_front_image_sha256":"8deecc0a99b9bd15b316ea28077c57718369041ea8f99599b4be093b36575344",
    "retailer_front_visible_identity":"BLUE BUFFALO True Solutions WEIGHT CONTROL Chicken Recipe Natural Food for Dogs NET WT. 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions weight control chicken recipe for adult dogs true-solutions weight-control",
    "target_product_name":"BLUE True Solutions Weight Control Chicken Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Weight Control",
    "target_flavor":"Chicken Recipe",
    "target_pet_type":"dog",
    "target_life_stage":"adult",
    "target_food_form":"wet",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/true-solutions/weight-control/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/true-solutions/share-product-image/share_truesolutions_wet_dog_weightcare.png",
    "official_review_image_sha256":"675085794ec6307b532ab44fae4d683ff4f806bb4c6e320e5ccca230464ae761",
    "target_ingredient_count":44,
    "target_database_ingredient_hash":"f81c5a282adb20174645c9271e3e30c58c6a86c467f398d21f093c0153d66c75",
    "target_raw_ingredient_hash":"f1359e4cb8c89dd0809819538816d6f19186c318030bf108e81f20eb71e33cc2",
    "family":"true solutions",
    "condition_boundary":"weight control",
    "recipe":"chicken",
    "package_size":"12.5 oz"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls chicken and brown rice recipe sensitive stomach adult dry cat food|cat|adult|dry||",
    "retailer_title":"Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Sensitive Stomach Adult Dry Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-sensitive/dp/4257918",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"4257918",
    "retailer_observed_at":"2026-08-05T02:25:51.547Z",
    "retailer_content_hash":"6efcae6072fafba3de05d8d443e6daa36df5ef52b71e6e7b1a1ecb6fc822d370",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/069fb9eb-25e9-727c-8000-5c0023986e56._V1_.jpg",
    "retailer_front_image_sha256":"245138cc2d595664533fea80094470b07d244b6d54909cdf412c9e9e36cb6c87",
    "retailer_front_visible_identity":"BLUE BUFFALO Adult Cat WITH PREBIOTICS FOR OPTIMAL DIGESTIBILITY Chicken & Brown Rice Recipe 22 LBS.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult cat sensitive stomach chicken brown rice recipe blue tastefuls-sensitive-stomach-chicken-brown-rice",
    "target_product_name":"BLUE Tastefuls Adult Cat Sensitive Stomach Chicken & Brown Rice Recipe",
    "target_product_line":"BLUE Tastefuls Adult Sensitive Stomach",
    "target_flavor":"chicken and brown rice",
    "target_pet_type":"cat",
    "target_life_stage":"adult",
    "target_food_form":"dry",
    "target_source_url":"https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-sensitive-stomach-chicken-brown-rice/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_sensitivestomach.png",
    "official_review_image_sha256":"a0aba68d58c3139e9cfbd9c0f4c054a775d331d487218919a3ad4a54a02adc48",
    "target_ingredient_count":69,
    "target_database_ingredient_hash":"02ff6f48c9446b61b517ca088d62e497b2819763588dad5a8e313455118df179",
    "target_raw_ingredient_hash":"df8339ca975676ae2faba891e4a4e791a5fa8e5ce242fbaef0cfcdd810d277ec",
    "family":"tastefuls",
    "condition_boundary":"sensitive stomach",
    "recipe":"chicken and brown rice",
    "package_size":"22 lb"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls salmon and brown rice recipe adult indoor dry cat food|cat|adult|dry||",
    "retailer_title":"Blue Buffalo Tastefuls Salmon & Brown Rice Recipe Adult Indoor Dry Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-indoor-natural/dp/4257902",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"4257902",
    "retailer_observed_at":"2026-08-05T02:25:33.425Z",
    "retailer_content_hash":"9a78b09d4f674bff821a4968207899eaf73dce5e743b97290dbdd9478ad9a378",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/069fb9eb-8c57-7cad-8000-4186cd54bdf5._V1_.jpg",
    "retailer_front_image_sha256":"b7a16251ec2e2d7a7812ec1b882deb18956f5f83447417f3e968731c210bf597",
    "retailer_front_visible_identity":"BLUE BUFFALO Adult Indoor Cat REAL SALMON #1 INGREDIENT Salmon & Brown Rice Recipe 22 LBS.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult indoor cat salmon brown rice recipe blue tastefuls-indoor-salmon-brown-rice",
    "target_product_name":"BLUE Tastefuls Adult Indoor Cat Salmon & Brown Rice Recipe",
    "target_product_line":"BLUE Tastefuls Adult Indoor",
    "target_flavor":"Salmon & Brown Rice Recipe",
    "target_pet_type":"cat",
    "target_life_stage":"adult",
    "target_food_form":"dry",
    "target_source_url":"https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-indoor-salmon-brown-rice/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_salmon.png",
    "official_review_image_sha256":"0925e517dca4387ff8d2b75898491dc58b4c4c89fda89654b3805dd666630802",
    "target_ingredient_count":67,
    "target_database_ingredient_hash":"1ecf04a787d62cd640659fb987e3b29f5fe15d6fd4b28535b51977b2245583dd",
    "target_raw_ingredient_hash":"954f167a95ad953d9527113692519301a5e4853742267b78c5989edff38dfb0d",
    "family":"tastefuls",
    "condition_boundary":"indoor",
    "recipe":"salmon and brown rice",
    "package_size":"22 lb"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls chicken and brown rice recipe active adult dry cat food|cat|adult|dry||",
    "retailer_title":"Blue Buffalo Tastefuls Chicken & Brown Rice Recipe Active Adult Dry Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-active-natural/dp/170948",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"170948",
    "retailer_observed_at":"2026-08-05T02:25:34.109Z",
    "retailer_content_hash":"0a86a334cecc4b15440bdd81f8750327f9de85da0ca4e4a3f8af1143b369458d",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-tastefuls-chicken-brown-rice-recipe-active-adult-dry-cat-food-10lb-bag/img-652246._V1_.jpg",
    "retailer_front_image_sha256":"241864d8b232acde15a5f8f907fa71be384265221be608ce4d6b16c6ed9191c8",
    "retailer_front_visible_identity":"BLUE BUFFALO Adult Active Cat Chicken & Brown Rice Recipe with Antioxidant-Rich LifeSource Bits NATURAL FOOD FOR CATS 10 LBS.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult active cat chicken brown rice recipe blue tastefuls-chicken-brown-rice",
    "target_product_name":"BLUE Tastefuls Adult Active Cat Chicken & Brown Rice Recipe",
    "target_product_line":"BLUE Tastefuls Adult Active",
    "target_flavor":"Chicken & Brown Rice Recipe",
    "target_pet_type":"cat",
    "target_life_stage":"adult",
    "target_food_form":"dry",
    "target_source_url":"https://www.bluebuffalo.com/dry-cat-food/blue/tastefuls-chicken-brown-rice/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/tastefuls/share-product-image/share_tastefuls_dry_active.png",
    "official_review_image_sha256":"989d69dbadc9b8f6e0a4450cff972c01725ad86ea3821faa201c405dff141070",
    "target_ingredient_count":68,
    "target_database_ingredient_hash":"8e52e3e2a8ec16903629102d21cdaec0ce1d8d95060eba430c7234a3ef2ed0a4",
    "target_raw_ingredient_hash":"bc3378a5d72b651dd6664b58022f58cea6532a3f24fe0d390e7a0a6571a33b34",
    "family":"tastefuls",
    "condition_boundary":"active",
    "recipe":"chicken and brown rice",
    "package_size":"10 lb"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_source_slug TEXT,
  retailer_product_id TEXT,
  retailer_observed_at TIMESTAMPTZ,
  retailer_content_hash TEXT,
  retailer_front_image_url TEXT,
  retailer_front_image_sha256 TEXT,
  retailer_front_visible_identity TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_pet_type TEXT,
  target_life_stage TEXT,
  target_food_form TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  family TEXT,
  condition_boundary TEXT,
  recipe TEXT,
  package_size TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_c_payload) <> 5
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_exact_package_wave_c_payload) <> 5
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_exact_package_wave_c_payload) <> 5
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_exact_package_wave_c_payload) <> 5
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_exact_package_wave_c_payload) <> 5 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_c_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.target_life_stage NOT IN ('puppy', 'adult')
       OR payload.target_food_form NOT IN ('wet', 'dry')
       OR payload.target_ingredient_count < 30
       OR payload.retailer_observed_at IS NULL
       OR payload.retailer_content_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_visible_identity NOT ILIKE '%BLUE BUFFALO%'
       OR public.normalize_verified_product_search_query(
            payload.retailer_front_visible_identity
          ) NOT LIKE '%' || public.normalize_verified_product_search_query(
            payload.recipe
          ) || '%'
       OR payload.retailer_front_visible_identity NOT ILIKE '%' || payload.package_size || '%'
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_exact_package_wave_c_targets
ON COMMIT DROP
AS
SELECT payload.*,
       formula.id AS formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash
FROM blue_exact_package_wave_c_payload payload
JOIN public.catalog_formulas formula
  ON formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND formula.product_line = payload.target_product_line
 AND coalesce(formula.flavor, '') = payload.target_flavor
 AND formula.pet_type = payload.target_pet_type
 AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') = payload.target_life_stage
 AND formula.food_form = payload.target_food_form
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND coalesce(
       nullif(formula.formula_version_provenance ->> 'ingredient_text_hash', ''),
       encode(digest(
         public.catalog_normalize_ingredient_evidence(formula.ingredient_text),
         'sha256'
       ), 'hex')
     ) = payload.target_database_ingredient_hash
 AND encode(digest(
       btrim(regexp_replace(formula.ingredient_text, '\\s+', ' ', 'g')),
       'sha256'
     ), 'hex') = payload.target_raw_ingredient_hash;

DO $target_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_c_targets) <> 5 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C manufacturer targets did not resolve exactly';
  END IF;
END
$target_guard$;

INSERT INTO public.catalog_source_runs (
  run_key, source_slug, source_type, coverage_role, status, started_at,
  finished_at, expected_count, observed_count, accepted_count,
  rejected_count, pagination_complete, source_content_hash, checkpoint,
  metadata, updated_at
)
SELECT
  'chewy-public-sitemap:blue-exact-package-wave-c:20260805',
  'chewy-public-sitemap', 'retailer', 'verification', 'completed',
  min(retailer_observed_at), max(retailer_observed_at),
  count(*)::INTEGER, count(*)::INTEGER, count(*)::INTEGER, 0, TRUE,
  encode(digest(string_agg(retailer_content_hash, '|' ORDER BY retailer_product_id), 'sha256'), 'hex'),
  jsonb_build_object('last_product_id', max(retailer_product_id)),
  jsonb_build_object(
    'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
    'formula_version_conflict_checked', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'formula_evidence_tier', 'unverified',
    'package_size_is_sku_only', TRUE,
    'quarantined_package_version_candidates', 3,
    'ingredient_or_image_rewrite', FALSE
  ),
  now()
FROM blue_exact_package_wave_c_targets
ON CONFLICT (run_key) DO UPDATE
SET status = 'completed',
    started_at = EXCLUDED.started_at,
    finished_at = EXCLUDED.finished_at,
    expected_count = EXCLUDED.expected_count,
    observed_count = EXCLUDED.observed_count,
    accepted_count = EXCLUDED.accepted_count,
    rejected_count = 0,
    pagination_complete = TRUE,
    source_content_hash = EXCLUDED.source_content_hash,
    checkpoint = EXCLUDED.checkpoint,
    metadata = EXCLUDED.metadata,
    updated_at = now();

INSERT INTO public.catalog_observations (
  run_id, formula_id, source_slug, source_external_id, source_url,
  source_authority, gtin, manufacturer, brand, product_name, product_line,
  pet_type, life_stage, food_form, flavor, diet_condition, package_size,
  ingredient_text, front_image_url, is_complete_food, available_in_us,
  observed_at, content_hash, validation_status, validation_reasons,
  raw_payload, formula_evidence_tier, formula_version_provenance
)
SELECT
  source_run.id, target.formula_id, target.retailer_source_slug,
  target.retailer_product_id, target.retailer_source_url,
  'retailer_verified', NULL, 'general mills', 'blue buffalo',
  target.retailer_title, target.target_product_line,
  target.target_pet_type, target.target_life_stage, target.target_food_form,
  target.target_flavor, '', target.package_size, NULL,
  target.retailer_front_image_url, TRUE, TRUE,
  target.retailer_observed_at, target.retailer_content_hash,
  'accepted', ARRAY[]::TEXT[],
  jsonb_build_object(
    'retailer_product_id', target.retailer_product_id,
    'retailer_title', target.retailer_title,
    'front_image_sha256', target.retailer_front_image_sha256,
    'front_package_visual_label_text', target.retailer_front_visible_identity,
    'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
    'formula_version_conflict_checked', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'complete_food_status_from_official_target', TRUE,
    'official_source_url', target.target_source_url,
    'official_cache_key', target.target_cache_key,
    'official_review_image_sha256', target.official_review_image_sha256,
    'database_ingredient_text_hash', target.target_database_ingredient_hash,
    'raw_current_ingredient_hash', target.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  'unverified',
  jsonb_build_object(
    'version_status', 'identity_only',
    'captured_at', target.retailer_observed_at,
    'retailer_source_url', target.retailer_source_url,
    'retailer_product_id', target.retailer_product_id,
    'front_image_sha256', target.retailer_front_image_sha256,
    'manufacturer_current_equivalence', TRUE,
    'ingredient_evidence_from_retailer', FALSE
  )
FROM blue_exact_package_wave_c_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-exact-package-wave-c:20260805'
ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    manufacturer = EXCLUDED.manufacturer,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    product_line = EXCLUDED.product_line,
    pet_type = EXCLUDED.pet_type,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    flavor = EXCLUDED.flavor,
    package_size = EXCLUDED.package_size,
    ingredient_text = NULL,
    front_image_url = EXCLUDED.front_image_url,
    is_complete_food = TRUE,
    available_in_us = TRUE,
    observed_at = EXCLUDED.observed_at,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = EXCLUDED.raw_payload,
    formula_evidence_tier = 'unverified',
    formula_version_provenance = EXCLUDED.formula_version_provenance;

INSERT INTO public.catalog_skus (
  formula_id, gtin, package_size, package_count, source_slug,
  source_external_id, source_url, active, first_observed_at,
  last_observed_at, updated_at
)
SELECT
  target.formula_id, NULL, target.package_size, 1,
  target.retailer_source_slug, target.retailer_product_id,
  target.retailer_source_url, TRUE, target.retailer_observed_at,
  target.retailer_observed_at, now()
FROM blue_exact_package_wave_c_targets target
ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

CREATE TEMP TABLE blue_exact_package_wave_c_resolved
ON COMMIT DROP
AS
SELECT target.*,
       observation.id AS observation_id
FROM blue_exact_package_wave_c_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-exact-package-wave-c:20260805'
JOIN public.catalog_observations observation
  ON observation.run_id = source_run.id
 AND observation.formula_id = target.formula_id
 AND observation.source_slug = target.retailer_source_slug
 AND observation.source_external_id = target.retailer_product_id
 AND observation.source_url = target.retailer_source_url
 AND observation.product_name = target.retailer_title
 AND observation.pet_type = target.target_pet_type
 AND observation.life_stage = target.target_life_stage
 AND observation.food_form = target.target_food_form
 AND observation.formula_evidence_tier IN ('unverified', 'conflicted')
 AND observation.front_image_url = target.retailer_front_image_url
 AND observation.content_hash = target.retailer_content_hash
 AND nullif(public.catalog_normalize_ingredient_evidence(observation.ingredient_text), '') IS NULL
 AND observation.formula_version_provenance ->> 'version_status' = 'identity_only';

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_c_resolved) <> 5 THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C identities did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_c_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_package_wave_c_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_c_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = resolved.target_pet_type
        AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') = resolved.target_life_stage
        AND product.food_form = resolved.target_food_form
        AND product.source_url = resolved.target_source_url
        AND product.image_url = resolved.target_image_url
        AND product.ingredient_count = resolved.target_ingredient_count
        AND coalesce(
              nullif(product.formula_version_provenance ->> 'ingredient_text_hash', ''),
              encode(digest(
                public.catalog_normalize_ingredient_evidence(product.ingredient_text),
                'sha256'
              ), 'hex')
            ) = resolved.target_database_ingredient_hash
        AND encode(digest(
              btrim(regexp_replace(product.ingredient_text, '\\s+', ' ', 'g')),
              'sha256'
            ), 'hex') = resolved.target_raw_ingredient_hash
        AND product.formula_evidence_tier = 'manufacturer_current_exact'
        AND product.source_quality = 'manufacturer'
        AND product.ingredient_verification_status = 'manufacturer'
        AND product.image_verification_status = 'manufacturer'
        AND product.is_complete_food
        AND product.catalog_exclusion_reason IS NULL
        AND product.expires_at > now()
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C serving precondition changed';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, updated_at
)
SELECT resolved.alias_formula_key,
       resolved.formula_id,
       resolved.canonical_identity_hash,
       'manual_review',
       resolved.retailer_source_url,
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_c_20260805',
         'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_image_identity_only', TRUE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_title', resolved.retailer_title,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', resolved.target_pet_type,
         'target_life_stage', resolved.target_life_stage,
         'target_food_form', resolved.target_food_form,
         'family', resolved.family,
         'condition_boundary', resolved.condition_boundary,
         'recipe', resolved.recipe,
         'package_size', resolved.package_size,
         'package_size_is_sku_only', TRUE,
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE,
         'reviewed_at', now()
       ),
       now()
FROM blue_exact_package_wave_c_resolved resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    identity_hash = EXCLUDED.identity_hash,
    match_reason = EXCLUDED.match_reason,
    source_url = EXCLUDED.source_url,
    metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
    updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key, alias_text, normalized_alias, source_url, source_authority,
  evidence_observed_at, provenance, active, updated_at
)
SELECT resolved.target_cache_key,
       resolved.retailer_title,
       resolved.normalized_alias,
       resolved.retailer_source_url,
       'retailer_identity',
       resolved.retailer_observed_at,
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_c_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_source_slug', resolved.retailer_source_slug,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'formula_id', resolved.formula_id,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'target_pet_type', resolved.target_pet_type,
         'target_life_stage', resolved.target_life_stage,
         'target_food_form', resolved.target_food_form,
         'source_version_equivalence_required', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       TRUE,
       now()
FROM blue_exact_package_wave_c_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = public.catalog_verified_product_search_aliases.provenance || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key = EXCLUDED.cache_key;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT resolved.formula_id,
       resolved.observation_id,
       'retailer_exact_front_package_identity_alias',
       jsonb_build_object(
         'source', 'blue_buffalo_exact_package_wave_c_20260805',
         'retailer_identity_only', TRUE,
         'retailer_ingredient_verification', FALSE,
         'retailer_title', resolved.retailer_title,
         'retailer_product_id', resolved.retailer_product_id,
         'retailer_front_image_url', resolved.retailer_front_image_url,
         'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
         'retailer_front_visible_identity', resolved.retailer_front_visible_identity,
         'official_source_url', resolved.target_source_url,
         'official_review_image_url', resolved.target_image_url,
         'official_review_image_sha256', resolved.official_review_image_sha256,
         'official_cache_key', resolved.target_cache_key,
         'canonical_formula_key', resolved.canonical_formula_key,
         'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
         'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
         'package_size_is_sku_only', TRUE,
         'ingredient_or_image_rewrite', FALSE
       ),
       resolved.retailer_source_url,
       'retailer_identity',
       TRUE,
       resolved.retailer_observed_at,
       encode(digest(
         resolved.formula_id::TEXT || '|blue_buffalo_exact_package_wave_c|'
         || resolved.alias_formula_key || '|' || resolved.retailer_source_url
         || '|' || resolved.target_database_ingredient_hash,
         'sha256'
       ), 'hex')
FROM blue_exact_package_wave_c_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

DO $postcondition_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_package_wave_c_resolved) <> 5
     OR EXISTS (
       SELECT 1 FROM blue_exact_package_wave_c_resolved resolved
       WHERE NOT EXISTS (
         SELECT 1 FROM public.catalog_formula_aliases alias
         WHERE alias.alias_formula_key = resolved.alias_formula_key
           AND alias.formula_id = resolved.formula_id
           AND alias.metadata ->> 'retailer_identity_only' = 'true'
           AND alias.metadata ->> 'retailer_ingredient_verification' = 'false'
           AND alias.metadata ->> 'ingredient_or_image_rewrite' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_verified_product_search_aliases alias
         WHERE alias.active
           AND alias.normalized_alias = resolved.normalized_alias
           AND alias.cache_key = resolved.target_cache_key
           AND alias.provenance ->> 'retailer_identity_only' = 'true'
           AND alias.provenance ->> 'retailer_ingredient_verification' = 'false'
       )
       OR NOT EXISTS (
         SELECT 1 FROM public.catalog_field_evidence evidence
         WHERE evidence.formula_id = resolved.formula_id
           AND evidence.observation_id = resolved.observation_id
           AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
           AND evidence.source_url = resolved.retailer_source_url
           AND evidence.accepted
       )
     ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C alias postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_package_wave_c_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.search_verified_products(resolved.retailer_title, 5) result
      WHERE result.cache_key = resolved.target_cache_key
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo package wave C exact alias is not searchable';
  END IF;
END
$postcondition_guard$;
