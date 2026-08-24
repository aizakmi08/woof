-- Reconcile the exact unconflicted 5 lb Chewy Love Made Fresh chicken roll to
-- its manufacturer-current formula. The neighboring beef package remains
-- quarantined because it has unresolved formula-version evidence. Chewy
-- supplies identity/package-image evidence only, never ingredients, formula
-- version, complete-food proof, serving content, or scores.

CREATE TEMP TABLE blue_lmf_chewy_roll_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh chicken with carrots and peas fresh refrigerated dog food|dog|unknown|fresh||",
    "retailer_title":"Blue Buffalo Love Made Fresh Chicken with Carrots & Peas Fresh Refrigerated Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-love-made-fresh-chicken/dp/3699006",
    "retailer_product_id":"3699006",
    "retailer_observed_at":"2026-08-05T02:25:06.163Z",
    "retailer_content_hash":"3f4e28b0475f04abbdf904a54b9c4fd2034dc2a95b044cddd69ca883c23b7384",
    "retailer_image_url":"https://image.chewy.com/catalog/general/images/moe/06937170-d859-7020-8000-4b4445e42632._V1_.jpg",
    "retailer_image_sha256":"007ca3133b4a91f7445f2a212ddf7d9189dfcdb6d80a70cc88ad7d4604a8b4ae",
    "retailer_ocr":"-Love- Refrigerated Food for Made Fr&sh'\" Adult Dogs BLUE BUFFALO- CHICKEN RECIPE WITH CARROTS & PEAS Real Chicken #i Ingredient 5LBS Fully Cooked V Use as a Me81 or Topper",
    "visual_label_text":"Blue Buffalo Love Made Fresh Chicken Recipe with Carrots and Peas Refrigerated Food for Adult Dogs roll 5 lb",
    "visual_presentation":"roll",
    "package_size":"5 lb",
    "target_formula_id":33092,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken recipe roll adult dog food|dog|adult|fresh|chicken recipe|",
    "target_identity_hash":"7db78e1a78feeffdb991b38c38a37c09a31eac44a132dd10a601fa89193e8e64",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken recipe roll adult dog food love-made-fresh chicken-stew-adult-dog-meat-roll",
    "target_product_name":"Love Made Fresh Chicken Recipe Roll | Adult Dog Food",
    "target_flavor":"Chicken Recipe",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-meat-roll/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_chicken.png",
    "target_ingredient_count":55,
    "target_database_ingredient_hash":"3646979f420ad391a01765cc5d22bfaada2d830041416bb0d3ee5541d9398fde",
    "target_raw_ingredient_hash":"e1914b82351148cb660b1e6f763ab9cc7be876a1d55ae0fe930455146935d5b9",
    "breed_size":"standard",
    "recipe_term":"chicken"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_product_id TEXT,
  retailer_observed_at TIMESTAMPTZ,
  retailer_content_hash TEXT,
  retailer_image_url TEXT,
  retailer_image_sha256 TEXT,
  retailer_ocr TEXT,
  visual_label_text TEXT,
  visual_presentation TEXT,
  package_size TEXT,
  target_formula_id BIGINT,
  target_formula_key TEXT,
  target_identity_hash TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_flavor TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  breed_size TEXT,
  recipe_term TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_lmf_chewy_roll_payload) <> 1
     OR EXISTS (
       SELECT 1 FROM blue_lmf_chewy_roll_payload payload
       WHERE payload.normalized_alias IS NULL
          OR payload.alias_formula_key NOT LIKE 'blue buffalo|blue buffalo|%'
          OR payload.target_formula_key NOT LIKE '%|adult|fresh|%'
          OR payload.target_identity_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_content_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_image_sha256 !~ '^[a-f0-9]{64}$'
          OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_source_url <>
             'https://www.chewy.com/blue-buffalo-love-made-fresh-chicken/dp/3699006'
          OR payload.retailer_image_url NOT LIKE 'https://image.chewy.com/%'
          OR payload.target_source_url <>
             'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/chicken-stew-adult-dog-meat-roll/'
          OR payload.target_image_url NOT LIKE
             'https://www.bluebuffalo.com/%/dog-fresh-food/love-made-fresh/%'
          OR payload.target_ingredient_count <> 55
          OR payload.breed_size <> 'standard'
          OR payload.recipe_term <> 'chicken'
          OR payload.visual_presentation <> 'roll'
          OR payload.visual_label_text NOT ILIKE '%adult dogs%'
          OR payload.visual_label_text NOT ILIKE '%chicken recipe%'
          OR payload.package_size <> '5 lb'
     ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll payload changed';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_lmf_chewy_roll_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.identity_hash AS canonical_identity_hash
FROM blue_lmf_chewy_roll_payload payload
JOIN public.catalog_formulas formula
  ON formula.id = payload.target_formula_id
 AND formula.formula_key = payload.target_formula_key
 AND formula.identity_hash = payload.target_identity_hash
 AND formula.promoted_cache_key = payload.target_cache_key
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_evidence_tier = 'manufacturer_current_exact'
 AND formula.is_complete_food
 AND lower(btrim(formula.brand)) = 'blue buffalo'
 AND formula.product_name = payload.target_product_name
 AND lower(btrim(formula.product_line)) = 'love made fresh'
 AND lower(btrim(formula.flavor)) = lower(btrim(payload.target_flavor))
 AND formula.pet_type = 'dog'
 AND formula.life_stage = 'adult'
 AND formula.food_form = 'fresh'
 AND formula.source_url = payload.target_source_url
 AND formula.front_image_url = payload.target_image_url
 AND formula.source_authority = 'manufacturer'
 AND formula.ingredient_verification_status = 'manufacturer'
 AND formula.image_verification_status = 'manufacturer'
 AND cardinality(formula.ingredients) = payload.target_ingredient_count
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
     ), 'hex') = payload.target_raw_ingredient_hash
JOIN public.product_data serving
  ON serving.cache_key = payload.target_cache_key
 AND serving.product_name = payload.target_product_name
 AND lower(btrim(serving.product_line)) = 'love made fresh'
 AND lower(btrim(serving.flavor)) = lower(btrim(payload.target_flavor))
 AND serving.pet_type = 'dog'
 AND serving.life_stage = 'adult'
 AND serving.food_form = 'fresh'
 AND serving.source_url = payload.target_source_url
 AND serving.image_url = payload.target_image_url
 AND serving.ingredient_count = payload.target_ingredient_count
 AND serving.formula_evidence_tier = 'manufacturer_current_exact'
 AND serving.source_quality = 'manufacturer'
 AND serving.ingredient_verification_status = 'manufacturer'
 AND serving.image_verification_status = 'manufacturer'
 AND serving.is_complete_food
 AND serving.catalog_exclusion_reason IS NULL
 AND serving.expires_at > now();

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_lmf_chewy_roll_resolved) <> 1 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll did not resolve exactly';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll search alias collision';
  END IF;
END
$resolution_guard$;

INSERT INTO public.catalog_source_runs (
  run_key, source_slug, source_type, coverage_role, status, started_at,
  finished_at, expected_count, observed_count, accepted_count,
  rejected_count, pagination_complete, source_content_hash, checkpoint,
  metadata, updated_at
)
SELECT
  'chewy-public-sitemap:blue-lmf-chicken-roll:3699006:20260805',
  'chewy-public-sitemap', 'retailer', 'verification', 'completed',
  retailer_observed_at, retailer_observed_at,
  1, 1, 1, 0, TRUE, retailer_content_hash,
  jsonb_build_object('last_product_id', retailer_product_id),
  jsonb_build_object(
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'formula_version_conflict_checked', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'formula_evidence_tier', 'unverified',
    'package_size_is_sku_only', TRUE,
    'neighboring_beef_package_remains_quarantined', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  now()
FROM blue_lmf_chewy_roll_resolved
ON CONFLICT (run_key) DO UPDATE
SET status = 'completed', finished_at = EXCLUDED.finished_at,
    expected_count = 1, observed_count = 1, accepted_count = 1,
    rejected_count = 0, pagination_complete = TRUE,
    source_content_hash = EXCLUDED.source_content_hash,
    checkpoint = EXCLUDED.checkpoint, metadata = EXCLUDED.metadata,
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
  source_run.id, resolved.formula_id, 'chewy-public-sitemap',
  resolved.retailer_product_id, resolved.retailer_source_url,
  'retailer_verified', NULL, 'general mills', 'blue buffalo',
  resolved.retailer_title, 'Love Made Fresh', 'dog', 'adult', 'fresh',
  resolved.target_flavor, '', resolved.package_size, NULL,
  resolved.retailer_image_url, TRUE, TRUE, resolved.retailer_observed_at,
  resolved.retailer_content_hash, 'accepted', ARRAY[]::TEXT[],
  jsonb_build_object(
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'front_image_sha256', resolved.retailer_image_sha256,
    'front_package_ocr', resolved.retailer_ocr,
    'front_package_visual_label_text', resolved.visual_label_text,
    'visual_presentation', resolved.visual_presentation,
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'formula_version_conflict_checked', TRUE,
    'neighboring_beef_package_remains_quarantined', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'complete_food_status_from_official_target', TRUE,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  'unverified',
  jsonb_build_object(
    'version_status', 'identity_only',
    'captured_at', resolved.retailer_observed_at,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_product_id', resolved.retailer_product_id,
    'front_image_sha256', resolved.retailer_image_sha256,
    'manufacturer_current_equivalence', TRUE,
    'ingredient_evidence_from_retailer', FALSE
  )
FROM blue_lmf_chewy_roll_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-lmf-chicken-roll:3699006:20260805'
ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    manufacturer = EXCLUDED.manufacturer,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    product_line = EXCLUDED.product_line,
    pet_type = EXCLUDED.pet_type,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    flavor = EXCLUDED.flavor,
    package_size = EXCLUDED.package_size,
    front_image_url = EXCLUDED.front_image_url,
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
  resolved.formula_id, NULL, resolved.package_size, 1,
  'chewy-public-sitemap', resolved.retailer_product_id,
  resolved.retailer_source_url, TRUE, resolved.retailer_observed_at,
  resolved.retailer_observed_at, now()
FROM blue_lmf_chewy_roll_resolved resolved
ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
SET formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, updated_at
)
SELECT
  resolved.alias_formula_key, resolved.formula_id,
  resolved.canonical_identity_hash, 'manual_review',
  resolved.retailer_source_url,
  jsonb_build_object(
    'source', 'blue_lmf_chewy_chicken_roll_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
    'formula_version_conflict_checked', TRUE,
    'neighboring_beef_package_remains_quarantined', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_source_slug', 'chewy-public-sitemap',
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_observed_at', resolved.retailer_observed_at,
    'retailer_front_image_url', resolved.retailer_image_url,
    'retailer_front_image_sha256', resolved.retailer_image_sha256,
    'front_package_ocr', resolved.retailer_ocr,
    'front_package_visual_label_text', resolved.visual_label_text,
    'official_source_url', resolved.target_source_url,
    'official_database_image_url', resolved.target_image_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_lmf_chewy_roll_resolved resolved
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
SELECT
  resolved.target_cache_key, resolved.retailer_title,
  resolved.normalized_alias, resolved.retailer_source_url,
  'retailer_identity', resolved.retailer_observed_at,
  jsonb_build_object(
    'source', 'blue_lmf_chewy_chicken_roll_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
    'formula_version_conflict_checked', TRUE,
    'neighboring_beef_package_remains_quarantined', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_source_slug', 'chewy-public-sitemap',
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_sha256', resolved.retailer_image_sha256,
    'official_source_url', resolved.target_source_url,
    'formula_id', resolved.formula_id,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  TRUE, now()
FROM blue_lmf_chewy_roll_resolved resolved
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = public.catalog_verified_product_search_aliases.provenance
      || EXCLUDED.provenance,
    updated_at = now()
WHERE public.catalog_verified_product_search_aliases.cache_key =
      EXCLUDED.cache_key;

INSERT INTO public.catalog_field_evidence (
  formula_id, observation_id, field_name, field_value, source_url,
  source_authority, accepted, observed_at, content_hash
)
SELECT
  resolved.formula_id, observation.id,
  'retailer_exact_front_package_identity_alias',
  jsonb_build_object(
    'source', 'blue_lmf_chewy_chicken_roll_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
    'formula_version_conflict_checked', TRUE,
    'neighboring_beef_package_remains_quarantined', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_url', resolved.retailer_image_url,
    'retailer_front_image_sha256', resolved.retailer_image_sha256,
    'front_package_ocr', resolved.retailer_ocr,
    'front_package_visual_label_text', resolved.visual_label_text,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  resolved.retailer_source_url, 'retailer_identity', TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_lmf_chewy_chicken_roll_identity|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.retailer_image_sha256,
    'sha256'
  ), 'hex')
FROM blue_lmf_chewy_roll_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-lmf-chicken-roll:3699006:20260805'
JOIN public.catalog_observations observation
  ON observation.run_id = source_run.id
 AND observation.source_slug = 'chewy-public-sitemap'
 AND observation.source_external_id = resolved.retailer_product_id
 AND observation.content_hash = resolved.retailer_content_hash
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET observation_id = EXCLUDED.observation_id,
    field_value = EXCLUDED.field_value,
    source_authority = EXCLUDED.source_authority,
    accepted = TRUE,
    observed_at = EXCLUDED.observed_at;

DO $postconditions$
DECLARE
  v_row RECORD;
  v_top_cache_key TEXT;
BEGIN
  IF (
    SELECT count(*)
    FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_lmf_chewy_chicken_roll_identity_20260805'
      AND (alias.metadata ->> 'presentation_is_hard_boundary')::BOOLEAN
      AND (alias.metadata ->> 'formula_version_conflict_checked')::BOOLEAN
      AND (alias.metadata ->> 'neighboring_beef_package_remains_quarantined')::BOOLEAN
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_lmf_chewy_chicken_roll_identity_20260805'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_source_runs source_run
      ON source_run.run_key =
         'chewy-public-sitemap:blue-lmf-chicken-roll:3699006:20260805'
    JOIN public.catalog_observations observation
      ON observation.run_id = source_run.id
     AND observation.formula_id = resolved.formula_id
     AND observation.source_external_id = resolved.retailer_product_id
     AND observation.content_hash = resolved.retailer_content_hash
    WHERE observation.validation_status = 'accepted'
      AND observation.formula_evidence_tier = 'unverified'
      AND observation.ingredient_text IS NULL
      AND observation.front_image_url = resolved.retailer_image_url
      AND observation.raw_payload ->> 'front_image_sha256' =
          resolved.retailer_image_sha256
      AND observation.raw_payload ->> 'visual_presentation' = 'roll'
      AND (observation.raw_payload ->> 'formula_version_conflict_checked')::BOOLEAN
      AND (observation.raw_payload ->> 'neighboring_beef_package_remains_quarantined')::BOOLEAN
      AND (observation.raw_payload ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (observation.raw_payload ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll observation postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_chewy_roll_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_lmf_chewy_chicken_roll_identity_20260805'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Chewy chicken roll evidence postcondition failed';
  END IF;

  SELECT * INTO v_row FROM blue_lmf_chewy_roll_resolved;
  SELECT result.cache_key INTO v_top_cache_key
  FROM public.search_verified_products(v_row.retailer_title, 8) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
    RAISE EXCEPTION
      'Blue Love Made Fresh Chewy chicken roll search expected %, got %',
      v_row.target_cache_key,
      v_top_cache_key;
  END IF;
END
$postconditions$;
