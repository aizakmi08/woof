-- Reconcile four exact Chewy Love Made Fresh meatball package fronts to
-- already verified manufacturer formulas. The Chewy evidence proves package
-- identity only. It never supplies ingredients, complete-food classification,
-- formula version, catalog image, score, or other serving content.

CREATE TEMP TABLE blue_lmf_meatball_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh fully cooked natural beef meatball fresh dog food pouch|dog|unknown|fresh||",
    "retailer_title":"Blue Buffalo Love Made Fresh Fully Cooked Natural Beef Meatball Fresh Dog Food, pouch",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-love-made-fresh-fully/dp/3821014",
    "retailer_product_id":"3821014",
    "retailer_observed_at":"2026-08-05T02:25:56.877Z",
    "retailer_content_hash":"8fb982199109ee2bdb0d862b4ee2ad7962fd6f268c5e19dc1cded8c2efbcca79",
    "retailer_image_url":"https://image.chewy.com/catalog/general/images/moe/0696a909-5baa-7172-8000-2826b8780392._V1_.jpg",
    "retailer_image_sha256":"01ffa714a2456c99f6af796f608eabd429b7aa70fc035577b03e37b102ce044e",
    "retailer_ocr":"FROZEN BLUE BUFFALO- -Love- M8de Fre8h~ BEEF RECIPE Use as a Meal or Topper Refrigerated Food for Adult Dogs 1.5 LBS.",
    "package_size":"1.5 lb",
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
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh fully cooked natural chicken meatball fresh dog food pouch|dog|unknown|fresh||",
    "retailer_title":"Blue Buffalo Love Made Fresh Fully Cooked Natural Chicken Meatball Fresh Dog Food, pouch",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-love-made-fresh-fully/dp/3821038",
    "retailer_product_id":"3821038",
    "retailer_observed_at":"2026-08-05T02:25:56.861Z",
    "retailer_content_hash":"a23cc77c9df14c5bd05d0b37dac5c55ef74acb0e42f41019440c199abb3d0c5a",
    "retailer_image_url":"https://image.chewy.com/catalog/general/images/moe/0696a908-a655-7788-8000-7388496a719c._V1_.jpg",
    "retailer_image_sha256":"bec8ffd87d97ed20efc99aac742dbe0836dafa6ad06ac9dce5dcd796dc22a07a",
    "retailer_ocr":"*FROZEN BLUE BUFFALO- -Love- M8de Fresh- CHICKEN RECIPE WITH CARROTS & PEAS, Ib Use as a Meal or Topper Refrigerated Food for Adult Dogs LB",
    "package_size":"1.5 lb",
    "target_formula_id":33090,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken meatballs adult dog food|dog|adult|fresh|chicken|",
    "target_identity_hash":"b8c31a935957a7ddfcd431d5ea71d5c201cc6943c7477e1ba8be720b73bd00c7",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken meatballs adult dog food love-made-fresh adult-dog-chicken-meatball-recipe",
    "target_product_name":"Love Made Fresh Chicken Meatballs | Adult Dog Food",
    "target_flavor":"Chicken",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/adult-dog-chicken-meatball-recipe/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_pouch_chicken.png",
    "target_ingredient_count":45,
    "target_database_ingredient_hash":"983584ead9802ce6be56660ca80e7c0831dc67648f79d98def90ece988e4539b",
    "target_raw_ingredient_hash":"4226c6ebc1aa87e9b89747c060bef784604675767897fcd45e02177850c2d477",
    "breed_size":"standard",
    "recipe_term":"chicken"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh fully cooked natural chicken meatball small breed dog food pouch|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Fully Cooked Natural Chicken Meatball Small Breed Dog Food, pouch",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-love-made-fresh-fully/dp/3820990",
    "retailer_product_id":"3820990",
    "retailer_observed_at":"2026-08-05T02:25:56.821Z",
    "retailer_content_hash":"79ddbb59e0625287ebe31242fd5088159e494ee6f58ee8f6a696e94cc13b3a05",
    "retailer_image_url":"https://image.chewy.com/catalog/general/images/moe/0696a90f-1c39-75b8-8000-494ea1088f7f._V1_.jpg",
    "retailer_image_sha256":"40f14b92d4d602fc011b414adbda82fd3c1c5a7778b99347e7fa9fa845915a1b",
    "retailer_ocr":"FROZEN BLUE ° BUFFALO- -Love- J Made Fr&sh- CHICKEN RECIPE WITH CARROTS & PE*A*s~- Use as a Meal or Topper Refrigerated Food for Adult Dogs Sfflall Bree LB",
    "package_size":"1 lb",
    "target_formula_id":33091,
    "target_formula_key":"general mills|blue buffalo|love made fresh chicken meatballs small adult dog food|dog|adult|fresh|chicken|",
    "target_identity_hash":"e576266286fb44e421ebd963bf54fff8c95518995abb63695ee595f5a65d95a5",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo love made fresh chicken meatballs small adult dog food love-made-fresh small-breed-dog-chicken-meatball-recipe",
    "target_product_name":"Love Made Fresh Chicken Meatballs | Small Adult Dog Food",
    "target_flavor":"Chicken",
    "target_source_url":"https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/small-breed-dog-chicken-meatball-recipe/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-fresh-food/love-made-fresh/share-product-image/share_fresh_pouch_sb_chicken.png",
    "target_ingredient_count":46,
    "target_database_ingredient_hash":"94f193467abf3c52083ac77ceca1afcd1c4652d8d37c2892a1bd688e1e5b1dfd",
    "target_raw_ingredient_hash":"48ddfcc51086e2b7741db87b9429410bc420b326142a36e7c00a3191a84e6507",
    "breed_size":"small breed",
    "recipe_term":"chicken"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo love made fresh fully cooked natural beef meatball small breed dog food pouch|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Love Made Fresh Fully Cooked Natural Beef Meatball Small Breed Dog Food, pouch",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-love-made-fresh-fully/dp/3820998",
    "retailer_product_id":"3820998",
    "retailer_observed_at":"2026-08-05T02:25:56.913Z",
    "retailer_content_hash":"bfaf82b93553481eb977a1e18db931b5a1091d2bf18953892d7b96de53dbd1ba",
    "retailer_image_url":"https://image.chewy.com/catalog/general/images/moe/0696a909-fae6-7e10-8000-245360de3c71._V1_.jpg",
    "retailer_image_sha256":"8fa4c6b26167de4d1efcad302156c2d50017a3a890ee5ea2283f861f4d60ab92",
    "retailer_ocr":"SFROZEN BLUE BUFFALO- -Love- J Made Fr&sh- BEEF RECIPE WITH CARROTS & PEA Use as a Meal or Topper Refrigerated Food for Adult Dogs Sfflall Bree LB",
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
  IF (SELECT count(*) FROM blue_lmf_meatball_payload) <> 4
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_lmf_meatball_payload) <> 4
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_lmf_meatball_payload) <> 4
     OR (SELECT count(DISTINCT retailer_product_id) FROM blue_lmf_meatball_payload) <> 4
     OR (SELECT count(DISTINCT target_formula_id) FROM blue_lmf_meatball_payload) <> 4
     OR EXISTS (
       SELECT 1 FROM blue_lmf_meatball_payload payload
       WHERE payload.normalized_alias IS NULL
          OR payload.alias_formula_key NOT LIKE 'blue buffalo|blue buffalo|%'
          OR payload.target_formula_key NOT LIKE '%|fresh|%'
          OR payload.target_identity_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_content_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_image_sha256 !~ '^[a-f0-9]{64}$'
          OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
          OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%/dp/%'
          OR payload.retailer_image_url NOT LIKE 'https://image.chewy.com/%'
          OR payload.target_source_url NOT LIKE
             'https://www.bluebuffalo.com/fresh-dog-food/love-made-fresh/%'
          OR payload.target_image_url NOT LIKE
             'https://www.bluebuffalo.com/%/dog-fresh-food/love-made-fresh/%'
          OR payload.target_ingredient_count < 5
          OR payload.breed_size NOT IN ('standard', 'small breed')
          OR payload.recipe_term NOT IN ('beef', 'chicken')
          OR payload.retailer_ocr NOT ILIKE '%adult dogs%'
          OR payload.retailer_ocr NOT ILIKE '%refrigerated food%'
          OR payload.retailer_ocr NOT ILIKE '%meal or topper%'
     ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball payload changed';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_lmf_meatball_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.identity_hash AS canonical_identity_hash
FROM blue_lmf_meatball_payload payload
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
  IF (SELECT count(*) FROM blue_lmf_meatball_resolved) <> 4 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatballs did not resolve to four exact manufacturer formulas';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball search alias collision';
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
  'chewy-public-sitemap:blue-lmf-meatballs:20260805-reviewed-fronts',
  'chewy-public-sitemap',
  'retailer',
  'verification',
  'completed',
  min(retailer_observed_at),
  max(retailer_observed_at),
  4, 4, 4, 0, TRUE,
  encode(digest(string_agg(retailer_content_hash, '|' ORDER BY retailer_product_id), 'sha256'), 'hex'),
  jsonb_build_object('last_product_id', max(retailer_product_id)),
  jsonb_build_object(
    'review_method', 'exact_front_package_ocr_identity_only',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'formula_evidence_tier', 'unverified',
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  now()
FROM blue_lmf_meatball_resolved
ON CONFLICT (run_key) DO UPDATE
SET status = 'completed',
    finished_at = EXCLUDED.finished_at,
    expected_count = 4,
    observed_count = 4,
    accepted_count = 4,
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
  source_run.id,
  resolved.formula_id,
  'chewy-public-sitemap',
  resolved.retailer_product_id,
  resolved.retailer_source_url,
  'retailer_verified',
  NULL,
  'general mills',
  'blue buffalo',
  resolved.retailer_title,
  'Love Made Fresh',
  'dog',
  'adult',
  'fresh',
  resolved.target_flavor,
  '',
  resolved.package_size,
  NULL,
  resolved.retailer_image_url,
  TRUE,
  TRUE,
  resolved.retailer_observed_at,
  resolved.retailer_content_hash,
  'accepted',
  ARRAY[]::TEXT[],
  jsonb_build_object(
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'front_image_sha256', resolved.retailer_image_sha256,
    'front_package_ocr', resolved.retailer_ocr,
    'review_method', 'exact_front_package_ocr_identity_only',
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
FROM blue_lmf_meatball_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-lmf-meatballs:20260805-reviewed-fronts'
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
  resolved.formula_id,
  NULL,
  resolved.package_size,
  1,
  'chewy-public-sitemap',
  resolved.retailer_product_id,
  resolved.retailer_source_url,
  TRUE,
  resolved.retailer_observed_at,
  resolved.retailer_observed_at,
  now()
FROM blue_lmf_meatball_resolved resolved
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
  resolved.alias_formula_key,
  resolved.formula_id,
  resolved.canonical_identity_hash,
  'manual_review',
  resolved.retailer_source_url,
  jsonb_build_object(
    'source', 'blue_lmf_chewy_front_package_identity_20260805',
    'review_method', 'exact_front_package_ocr_identity_only',
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
FROM blue_lmf_meatball_resolved resolved
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
  resolved.target_cache_key,
  resolved.retailer_title,
  resolved.normalized_alias,
  resolved.retailer_source_url,
  'retailer_identity',
  resolved.retailer_observed_at,
  jsonb_build_object(
    'source', 'blue_lmf_chewy_front_package_identity_20260805',
    'review_method', 'exact_front_package_ocr_identity_only',
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
  TRUE,
  now()
FROM blue_lmf_meatball_resolved resolved
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
  resolved.formula_id,
  observation.id,
  'retailer_exact_front_package_identity_alias',
  jsonb_build_object(
    'source', 'blue_lmf_chewy_front_package_identity_20260805',
    'review_method', 'exact_front_package_ocr_identity_only',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_complete_food_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_url', resolved.retailer_image_url,
    'retailer_front_image_sha256', resolved.retailer_image_sha256,
    'front_package_ocr', resolved.retailer_ocr,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.target_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_serving_content_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_lmf_chewy_front_package_identity|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.retailer_image_sha256,
    'sha256'
  ), 'hex')
FROM blue_lmf_meatball_resolved resolved
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
     'chewy-public-sitemap:blue-lmf-meatballs:20260805-reviewed-fronts'
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
    FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_lmf_chewy_front_package_identity_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_lmf_chewy_front_package_identity_20260805'
  ) <> 4 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_source_runs source_run
      ON source_run.run_key =
         'chewy-public-sitemap:blue-lmf-meatballs:20260805-reviewed-fronts'
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
      AND (observation.raw_payload ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (observation.raw_payload ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball identity-only observation postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_lmf_meatball_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_lmf_chewy_front_package_identity_20260805'
  ) <> 4 THEN
    RAISE EXCEPTION 'Blue Love Made Fresh meatball field evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_lmf_meatball_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'Blue Love Made Fresh meatball search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;
  END LOOP;
END
$postconditions$;
