-- Reconcile three exact Target Love Made Fresh package fronts to existing
-- manufacturer-current formulas. Presentation is a protected boundary: the
-- cylindrical roll remains separate from the two meatball pouches. Target
-- supplies identity and package-image evidence only, never ingredients,
-- complete-food proof, formula version, serving content, or scores.

CREATE TEMP TABLE blue_lmf_target_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh beef recipe wet dog food for small breed|dog|unknown|wet||",
    "retailer_title":"blue buffalo love made fresh beef recipe wet dog food for small breed",
    "retailer_source_url":"https://www.target.com/p/blue-buffalo-love-made-fresh-beef-recipe-wet-dog-food-for-small-breed-1lb/-/A-94636185",
    "retailer_product_id":"A-94636185",
    "retailer_observed_at":"2026-08-05T02:28:32.465Z",
    "retailer_content_hash":"7ee9a1cd313152f0d7e74fca5ef552380aa8fcd00ecd31eec20881e70f6bad53",
    "retailer_image_url":"https://target.scene7.com/is/image/Target/GUEST_e6995e8d-7462-47b7-ac59-93dcefc18048",
    "retailer_image_sha256":"760cc697ac21378e5936eb0a41df9982d95fa10a5908ac69be3c959cb699b852",
    "retailer_ocr":"BEEF RECIPE WITH CARROTS & PEAS",
    "visual_label_text":"Blue Buffalo Love Made Fresh Beef Recipe with Carrots and Peas Small Breed Adult Dogs roll 1 lb",
    "visual_presentation":"roll",
    "package_size":"1 lb",
    "target_formula_id":33087,
    "target_formula_key":"general mills|blue buffalo|love made fresh beef recipe roll small adult dog food|dog|adult|fresh|beef recipe|",
    "target_identity_hash":"0a9e64b767d97f29f6c45686718b8da302f4f6eb8403fb5c8d709d035cbaec37",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef recipe roll small adult dog food love-made-fresh beef-stew-small-breed-dog-meat-roll",
    "target_product_name":"Love Made Fresh Beef Recipe Roll | Small Adult Dog Food",
    "target_flavor":"Beef Recipe",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/beef-stew-small-breed-dog-meat-roll/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_roll_sb_beef.png",
    "target_ingredient_count":56,
    "target_database_ingredient_hash":"dd34cab1fe2a937fdbd9fc7692735ec1dc70bf55c21d26434e8a6d7cdb69e513",
    "target_raw_ingredient_hash":"002adc9ac3f9c5cdd15a6b7a092b7644b1893e5259f06cc46461ffd9c6d83ff2",
    "breed_size":"small breed",
    "recipe_term":"beef"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh beef small breed stand up resealable pouch wet dog food|dog|unknown|wet||",
    "retailer_title":"blue buffalo love made fresh beef small breed stand up resealable pouch wet dog food",
    "retailer_source_url":"https://www.target.com/p/blue-buffalo-love-made-fresh-beef-small-breed-stand-up-resealable-pouch-wet-dog-food-1lbs/-/A-94897300",
    "retailer_product_id":"A-94897300",
    "retailer_observed_at":"2026-08-05T02:28:38.030Z",
    "retailer_content_hash":"3784964196c44b80e5b830a6408ac428f03e267a5ba3feb3191d204bcc5af3ad",
    "retailer_image_url":"https://target.scene7.com/is/image/Target/GUEST_cab7cdbb-561d-4ac4-b906-ecbfcbe1977f",
    "retailer_image_sha256":"41d5458c23f0219c966a909fe46970fcbf605f31cf8f11a3879a49a717e62ed9",
    "retailer_ocr":"BLUE -Love- J MadeFr&sh\" BEEF RECIPE",
    "visual_label_text":"Blue Buffalo Love Made Fresh Beef Recipe with Carrots and Peas Small Breed Adult Dogs meatball pouch refrigerated food 1 lb",
    "visual_presentation":"meatball",
    "package_size":"1 lb",
    "target_formula_id":33085,
    "target_formula_key":"general mills|blue buffalo|love made fresh beef meatballs small adult dog food|dog|adult|fresh|beef|",
    "target_identity_hash":"37bca52fdaeb8251ca7e57bdb31a9238dcf0a4c885bfde95515ea6300f03206b",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef meatballs small adult dog food love-made-fresh small-breed-dog-beef-meatball-recipe",
    "target_product_name":"Love Made Fresh Beef Meatballs | Small Adult Dog Food",
    "target_flavor":"Beef",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/small-breed-dog-beef-meatball-recipe/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_pouch_sb_beef.png",
    "target_ingredient_count":48,
    "target_database_ingredient_hash":"55155d5bca10cad4ec0dfb4bf2118da34715a9d4a9c5090aabf829fddff160a7",
    "target_raw_ingredient_hash":"1f101e3e72fecd3b0f740172f2cdb5a386acc211406df6fad3ce09f442512a5c",
    "breed_size":"small breed",
    "recipe_term":"beef"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh beef stand up resealable pouch wet dog food|dog|unknown|wet||",
    "retailer_title":"blue buffalo love made fresh beef stand up resealable pouch wet dog food",
    "retailer_source_url":"https://www.target.com/p/blue-buffalo-love-made-fresh-beef-stand-up-resealable-pouch-wet-dog-food-4lbs/-/A-94897291",
    "retailer_product_id":"A-94897291",
    "retailer_observed_at":"2026-08-05T02:27:30.916Z",
    "retailer_content_hash":"7d6894e56c0a3edb0de5d2c4ef9d523e7fda23a429b727a60a3763f120ad7716",
    "retailer_image_url":"https://target.scene7.com/is/image/Target/GUEST_93baef87-70e0-40a0-8fcd-72a5905a0022",
    "retailer_image_sha256":"00b20bcd5b8deb974b8cfa496ed67d9d79e10d76b05a459503e2f5b72c61fad2",
    "retailer_ocr":"BLUE -IA)tE- Made Fr&sh\" -.IdullDogs",
    "visual_label_text":"Blue Buffalo Love Made Fresh Beef Recipe with Carrots and Peas Adult Dogs meatball pouch refrigerated food 4 lb",
    "visual_presentation":"meatball",
    "package_size":"4 lb",
    "target_formula_id":33084,
    "target_formula_key":"general mills|blue buffalo|love made fresh beef meatballs adult dog food|dog|adult|fresh|beef|",
    "target_identity_hash":"39e6c3a4878d28b1b30a0b4782d6ffef86e3e1c0e9dd7949c8691a979304dadc",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh beef meatballs adult dog food love-made-fresh adult-dog-beef-meatball-recipe",
    "target_product_name":"Love Made Fresh Beef Meatballs | Adult Dog Food",
    "target_flavor":"Beef",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/adult-dog-beef-meatball-recipe/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_pouch_beef.png",
    "target_ingredient_count":46,
    "target_database_ingredient_hash":"e6fcc694c51d2ba3e78fa1bb93585e670e69f2c4769a885a8d55075b12b482a1",
    "target_raw_ingredient_hash":"83a3c03d23b585bc1c91658a813632c71775ce8eded14588acbe3c00a8c7833f",
    "breed_size":"standard",
    "recipe_term":"beef"
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
  IF (SELECT count(*) FROM blue_lmf_target_payload) <> 3
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_lmf_target_payload) <> 3
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_lmf_target_payload) <> 3
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_lmf_target_payload) <> 3
     OR EXISTS (
       SELECT 1 FROM blue_lmf_target_payload payload
       WHERE payload.normalized_alias IS NULL
          OR payload.alias_formula_key NOT LIKE 'blue buffalo|blue buffalo|%'
          OR payload.target_formula_key NOT LIKE '%|adult|fresh|%'
          OR payload.target_identity_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_content_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_image_sha256 !~ '^[a-f0-9]{64}$'
          OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_source_url NOT LIKE 'https://www.target.com/%/-/A-%'
          OR payload.retailer_image_url NOT LIKE 'https://target.scene7.com/%'
          OR payload.target_source_url NOT LIKE
             'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/%'
          OR payload.target_image_url NOT LIKE
             'https://www.bluebuffalo.com/%/dog-fresh-food/love-made-fresh/%'
          OR payload.target_ingredient_count < 5
          OR payload.breed_size NOT IN ('standard', 'small breed')
          OR payload.recipe_term <> 'beef'
          OR payload.visual_presentation NOT IN ('roll', 'meatball')
          OR payload.visual_label_text NOT ILIKE '%adult dogs%'
          OR payload.visual_label_text NOT ILIKE '%beef recipe%'
     ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target package payload changed';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_lmf_target_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.identity_hash AS canonical_identity_hash
FROM blue_lmf_target_payload payload
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
  IF (SELECT count(*) FROM blue_lmf_target_resolved) <> 3 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target packages did not resolve to three exact manufacturer formulas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target search alias collision';
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
  'target-public-sitemap:blue-lmf-packages:20260805-reviewed-fronts',
  'target-public-sitemap', 'retailer', 'verification', 'completed',
  min(retailer_observed_at), max(retailer_observed_at),
  3, 3, 3, 0, TRUE,
  encode(digest(string_agg(retailer_content_hash, '|' ORDER BY retailer_product_id), 'sha256'), 'hex'),
  jsonb_build_object('last_product_id', max(retailer_product_id)),
  jsonb_build_object(
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'formula_evidence_tier', 'unverified',
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  now()
FROM blue_lmf_target_resolved
ON CONFLICT (run_key) DO UPDATE
SET status = 'completed', finished_at = EXCLUDED.finished_at,
    expected_count = 3, observed_count = 3, accepted_count = 3,
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
  source_run.id, resolved.formula_id, 'target-public-sitemap',
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
FROM blue_lmf_target_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'target-public-sitemap:blue-lmf-packages:20260805-reviewed-fronts'
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
  'target-public-sitemap', resolved.retailer_product_id,
  resolved.retailer_source_url, TRUE, resolved.retailer_observed_at,
  resolved.retailer_observed_at, now()
FROM blue_lmf_target_resolved resolved
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
    'source', 'blue_lmf_target_front_package_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_source_slug', 'target-public-sitemap',
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
    'retailer_food_form_normalized_to_fresh', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_lmf_target_resolved resolved
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
    'source', 'blue_lmf_target_front_package_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_source_slug', 'target-public-sitemap',
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
FROM blue_lmf_target_resolved resolved
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
    'source', 'blue_lmf_target_front_package_identity_20260805',
    'review_method', 'exact_front_package_visual_identity_only',
    'presentation_is_hard_boundary', TRUE,
    'visual_presentation', resolved.visual_presentation,
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
    resolved.formula_id::TEXT || '|blue_lmf_target_front_package_identity|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.retailer_image_sha256,
    'sha256'
  ), 'hex')
FROM blue_lmf_target_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'target-public-sitemap:blue-lmf-packages:20260805-reviewed-fronts'
JOIN public.catalog_observations observation
  ON observation.run_id = source_run.id
 AND observation.source_slug = 'target-public-sitemap'
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
    FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_lmf_target_front_package_identity_20260805'
      AND (alias.metadata ->> 'presentation_is_hard_boundary')::BOOLEAN
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 3 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_lmf_target_front_package_identity_20260805'
  ) <> 3 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_source_runs source_run
      ON source_run.run_key =
         'target-public-sitemap:blue-lmf-packages:20260805-reviewed-fronts'
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
      AND observation.raw_payload ->> 'visual_presentation' =
          resolved.visual_presentation
      AND (observation.raw_payload ->> 'presentation_is_hard_boundary')::BOOLEAN
      AND (observation.raw_payload ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (observation.raw_payload ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 3 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target identity-only observation postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_target_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_lmf_target_front_package_identity_20260805'
  ) <> 3 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh Target field evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_lmf_target_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'Blue Love Made Fresh Target search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;
  END LOOP;
END
$postconditions$;
