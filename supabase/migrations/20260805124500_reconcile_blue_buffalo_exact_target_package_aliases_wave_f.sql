-- Reconcile three visually reviewed Target package identities to exact current
-- Blue Buffalo manufacturer formulas. Retailer evidence is identity-only;
-- product_data, ingredients, images, formula versions, and scores stay intact.

CREATE TEMP TABLE blue_exact_target_package_wave_f_payload
ON COMMIT DROP
AS
SELECT raw.*,
       public.normalize_verified_product_search_query(raw.retailer_title)
         AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls savory singles chicken entree cuts in gravy adult wet cat food|cat|adult|wet||",
    "retailer_title": "blue buffalo tastefuls savory singles chicken entree cuts in gravy adult wet cat food",
    "retailer_source_url": "https://www.target.com/p/blue-buffalo-tastefuls-savory-singles-chicken-entree-cuts-in-gravy-adult-wet-cat-food-2-6oz/-/A-85922349",
    "retailer_source_slug": "target-public-sitemap",
    "retailer_product_id": "A-85922349",
    "retailer_observed_at": "2026-08-05T02:27:27.248Z",
    "retailer_content_hash": "36d1a57ffd674fb4093422bc1104367ab2b599b39e6f4b5b7be6436f95bf4777",
    "retailer_front_image_url": "https://target.scene7.com/is/image/Target/GUEST_896759cd-5098-408e-bd48-5d5d16cc9718",
    "retailer_front_image_sha256": "552f97f2e143c556b66c1296ccc6359f4899ff2875d5da38ee59d0052db60524",
    "retailer_front_visible_identity": "BLUE Tastefuls Savory Singles Chicken Entree CUTS IN GRAVY NET WT. 1.3 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls spoonless singles adult wet cat food - chicken cuts in gravy tastefuls chicken-cuts-in-gravy-savory-singles",
    "target_product_name": "BLUE Tastefuls Spoonless Singles Adult Wet Cat Food - Chicken Cuts in Gravy",
    "target_product_line": "BLUE Tastefuls Spoonless Singles Adult Wet",
    "target_flavor": "Chicken",
    "target_pet_type": "cat",
    "target_life_stage": "adult",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/chicken-cuts-in-gravy-savory-singles/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_single_adult_chicken_cutsingravy_share.png",
    "official_review_image_sha256": "565447d04bb3284fe299926d940d67a1f476e262b728dd8947d739502ba3a695",
    "target_ingredient_count": 38,
    "target_database_ingredient_hash": "798f2428b9aa1b6617d1e4ca74a3b83310c5734f2ddeaa5f2a4d8f5022eb38a9",
    "target_raw_ingredient_hash": "33a53eec9e52a243c422a91661a40def5040d19f0bfef13d3bf6a89f7b26cd53",
    "family": "tastefuls",
    "condition_boundary": "cuts in gravy",
    "recipe": "cuts in gravy",
    "package_size": "1.3 oz"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo tastefuls mature cat chicken entree pate senior wet cat food|cat|senior|wet||",
    "retailer_title": "blue buffalo tastefuls mature cat chicken entree pate senior wet cat food",
    "retailer_source_url": "https://www.target.com/p/blue-buffalo-tastefuls-mature-cat-chicken-entree-pate-senior-wet-cat-food-3oz/-/A-80778985",
    "retailer_source_slug": "target-public-sitemap",
    "retailer_product_id": "A-80778985",
    "retailer_observed_at": "2026-08-05T02:26:00.600Z",
    "retailer_content_hash": "7071917cae0bd7d3c8bdfed7096370744039582dfbc90ccc87110149454f3dcf",
    "retailer_front_image_url": "https://target.scene7.com/is/image/Target/GUEST_37b48510-18d4-4260-8605-a8464a0196d8",
    "retailer_front_image_sha256": "be36d12110812dc349030cb64d61ca498064bd9cf1cb0603b5924a697eca4566",
    "retailer_front_visible_identity": "BLUE Tastefuls Chicken Entree for Mature Cats PATE NET WT. 3 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue tastefuls pat for mature cats tastefuls mature-chicken-pate",
    "target_product_name": "BLUE Tastefuls Paté for Mature Cats",
    "target_product_line": "BLUE Tastefuls Paté for Mature Cats",
    "target_flavor": "",
    "target_pet_type": "cat",
    "target_life_stage": "senior",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-cat-food/tastefuls/mature-chicken-pate/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_mature_chicken_pate_share.png",
    "official_review_image_sha256": "86972d5e900219b4bc98ef1712188c27ba85a0b5fa9e90629ee56719a672fb8f",
    "target_ingredient_count": 35,
    "target_database_ingredient_hash": "38ab19207e75185ea9bfe6630f4acb346aef7f2a1be4e6f051e5566bb4ca883a",
    "target_raw_ingredient_hash": "e017bf9de8ac190efbc993c736fa67c2c1019965b2a4f179728fc4d34428f6a4",
    "family": "tastefuls",
    "condition_boundary": "mature pate",
    "recipe": "chicken",
    "package_size": "3 oz"
  },
  {
    "alias_formula_key": "blue buffalo|blue buffalo|blue buffalo wilderness grain free wet dog food snake river grill with trout fish venison 38 rabbit pack|dog|unknown|wet||",
    "retailer_title": "blue buffalo wilderness grain free wet dog food snake river grill with trout fish venison 38 rabbit pack",
    "retailer_source_url": "https://www.target.com/p/blue-buffalo-wilderness-grain-free-wet-dog-food-snake-river-grill-with-trout-fish-venison-38-rabbit-12-5oz-12ct-pack/-/A-76400774",
    "retailer_source_slug": "target-public-sitemap",
    "retailer_product_id": "A-76400774",
    "retailer_observed_at": "2026-08-05T02:27:09.771Z",
    "retailer_content_hash": "ae78fa940e916f36a7a0633130b0b13bb739fbf82c9c665754fd5e2b5b1a5164",
    "retailer_front_image_url": "https://target.scene7.com/is/image/Target/GUEST_2e946b10-b6cf-44fc-ae06-4ea9075b48ea",
    "retailer_front_image_sha256": "93a8d916bd735443cb8f41eb499aae45b10bba41d7d29d345c81338a8a2e35aa",
    "retailer_front_visible_identity": "BLUE WILDERNESS SNAKE RIVER GRILL with Trout, Venison & Rabbit NET WT. 12.5 oz.",
    "target_cache_key": "blue-buffalo-general-mills:blue buffalo blue wilderness snake river grill grain-free wet dog food wilderness snake-river-grill",
    "target_product_name": "BLUE Wilderness Snake River Grill Grain-Free Wet Dog Food",
    "target_product_line": "BLUE Wilderness Snake River Grill Grain-Free Wet",
    "target_flavor": "",
    "target_pet_type": "dog",
    "target_life_stage": "unknown",
    "target_food_form": "wet",
    "target_source_url": "https://www.bluebuffalo.com/wet-dog-food/wilderness/snake-river-grill/",
    "target_image_url": "https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild_dog_wet_adult_snakerivergrill_share.png",
    "official_review_image_sha256": "3eb8b0c8b948493950e045fe64dddd7652574d661aff6693b2dd98f4d4a9e1f3",
    "target_ingredient_count": 32,
    "target_database_ingredient_hash": "0af9f9e6a4b9b25ec8e1a45ccbfa3d892fc240e19c39a5675af1d658b4ce1f6a",
    "target_raw_ingredient_hash": "6c13308eb7629a4a1bc7326ec74301c144ab6a3df1ff4d11d5eee6c336bb08c2",
    "family": "wilderness",
    "condition_boundary": "snake river grill grain free",
    "recipe": "trout venison and rabbit",
    "package_size": "12.5 oz"
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
  IF (SELECT count(*) FROM blue_exact_target_package_wave_f_payload) <> 3
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_exact_target_package_wave_f_payload) <> 3
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_exact_target_package_wave_f_payload) <> 3
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_exact_target_package_wave_f_payload) <> 3
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_exact_target_package_wave_f_payload) <> 3 THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_target_package_wave_f_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'target-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.target.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.target_life_stage NOT IN ('puppy', 'kitten', 'adult', 'senior', 'unknown')
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
    RAISE EXCEPTION 'Blue Buffalo Target package wave F evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_exact_target_package_wave_f_targets
ON COMMIT DROP
AS
SELECT payload.*,
       formula.id AS formula_id,
       formula.formula_key AS canonical_formula_key,
       formula.identity_hash AS canonical_identity_hash
FROM blue_exact_target_package_wave_f_payload payload
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
  IF (SELECT count(*) FROM blue_exact_target_package_wave_f_targets) <> 3 THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F manufacturer targets did not resolve exactly';
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
  'target-public-sitemap:blue-exact-target-package-wave-f:20260805',
  'target-public-sitemap', 'retailer', 'verification', 'completed',
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
    'quarantined_package_version_candidates', 6,
    'ingredient_or_image_rewrite', FALSE
  ),
  now()
FROM blue_exact_target_package_wave_f_targets
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
FROM blue_exact_target_package_wave_f_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'target-public-sitemap:blue-exact-target-package-wave-f:20260805'
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
FROM blue_exact_target_package_wave_f_targets target
ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

CREATE TEMP TABLE blue_exact_target_package_wave_f_resolved
ON COMMIT DROP
AS
SELECT target.*,
       observation.id AS observation_id
FROM blue_exact_target_package_wave_f_targets target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'target-public-sitemap:blue-exact-target-package-wave-f:20260805'
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
  IF (SELECT count(*) FROM blue_exact_target_package_wave_f_resolved) <> 3 THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F identities did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_target_package_wave_f_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_exact_target_package_wave_f_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_target_package_wave_f_resolved resolved
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
    RAISE EXCEPTION 'Blue Buffalo Target package wave F serving precondition changed';
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
         'source', 'blue_buffalo_exact_target_package_wave_f_20260805',
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
FROM blue_exact_target_package_wave_f_resolved resolved
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
         'source', 'blue_buffalo_exact_target_package_wave_f_20260805',
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
FROM blue_exact_target_package_wave_f_resolved resolved
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
         'source', 'blue_buffalo_exact_target_package_wave_f_20260805',
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
         resolved.formula_id::TEXT || '|blue_buffalo_exact_target_package_wave_f|'
         || resolved.alias_formula_key || '|' || resolved.retailer_source_url
         || '|' || resolved.target_database_ingredient_hash,
         'sha256'
       ), 'hex')
FROM blue_exact_target_package_wave_f_resolved resolved
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = EXCLUDED.accepted,
    observed_at = EXCLUDED.observed_at,
    updated_at = now();

DO $postcondition_guard$
BEGIN
  IF (SELECT count(*) FROM blue_exact_target_package_wave_f_resolved) <> 3
     OR EXISTS (
       SELECT 1 FROM blue_exact_target_package_wave_f_resolved resolved
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
    RAISE EXCEPTION 'Blue Buffalo Target package wave F alias postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_exact_target_package_wave_f_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.search_verified_products(resolved.retailer_title, 5) result
      WHERE result.cache_key = resolved.target_cache_key
    )
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo Target package wave F exact alias is not searchable';
  END IF;
END
$postcondition_guard$;

