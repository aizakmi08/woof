-- Reconcile four Chewy BLUE Wilderness Wild Delights package fronts to exact
-- current manufacturer formulas. Retailer evidence is identity-only; this
-- migration never rewrites product_data, ingredients, images, or scores.

CREATE TEMP TABLE blue_wild_delights_front_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness wild delights flaked chicken and trout in tasty gravy for kittens grain free canned cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Wilderness Wild Delights Flaked Chicken & Trout in Tasty Gravy for Kittens Grain-Free Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/111993",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"111993",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-wild-delights-flaked-chicken-trout-in-tasty-gravy-for-kittens-grain-free-canned-cat-food-3oz-case-of-24/img-689149._V1_.jpg",
    "retailer_front_image_sha256":"7d719bba7a2867791c0754591ae2f613876526c410f98f3e965acb20403c033c",
    "retailer_front_ocr":"BLUE Wilderness Wild Delights Chicken & Trout Recipe in Tasty Gravy for Kittens Flaked Grain Free 3 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wild delights wet kitten food - flaked chicken trout wilderness kitten-flaked-chicken-trout",
    "target_product_name":"BLUE Wilderness Wild Delights Wet Kitten Food - Flaked Chicken & Trout",
    "target_product_line":"BLUE Wilderness Wild Delights Wet - Flaked",
    "target_flavor":"Chicken & Trout",
    "target_life_stage":"kitten",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/kitten-flaked-chicken-trout/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/cat_wild_delights_flaked_kitten_trout_wet_share.png",
    "target_ingredient_count":34,
    "target_database_ingredient_hash":"69fe9ec508f630c98415fb196602905a45bf2de0508552c959dd68acc9f00f16",
    "target_raw_ingredient_hash":"7b746a4a7d4ab1b647f318cccaca64776c3d140e5c0e9252ff7d5352bc4b3df7",
    "official_artifact_image_sha256":"77c95e2cc7b0737af99b37a41f6a93396ac7e0b1a98fbb5249d7d12edaa1cd08",
    "presentation":"flaked",
    "recipe_a":"chicken",
    "recipe_b":"trout"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness wild delights meaty morsels chicken and trout recipe in tasty gravy high protein grain free wet cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Wilderness Wild Delights Meaty Morsels Chicken & Trout Recipe in Tasty Gravy High-Protein Grain-Free Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/36915",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"36915",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-wild-delights-meaty-morsels-chicken-trout-recipe-in-tasty-gravy-high-protein-grain-free-wet-cat-food-3oz-can-24-count/img-351537._V1_.jpg",
    "retailer_front_image_sha256":"3ca6fd4b2d555ba6c6fff7b619114c34cdf5c581b161cd67495287fdc2be9861",
    "retailer_front_ocr":"BLUE Wilderness Wild Delights Chicken & Trout Recipe in Tasty Gravy Meaty Morsels Grain Free 3 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wild delights wet cat food - chicken trout wilderness chicken-trout",
    "target_product_name":"BLUE Wilderness Wild Delights Wet Cat Food - Chicken & Trout",
    "target_product_line":"BLUE Wilderness Wild Delights Wet",
    "target_flavor":"Chicken & Trout",
    "target_life_stage":"unknown",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/chicken-trout/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/wild-delights-chicken-trout-share.png",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"e096cdb7e1c5f274d227d77d33ceb960c5361712b11db8368d1fd5a6c29f96de",
    "target_raw_ingredient_hash":"4d881954f90619071eeab4eb3075fc459ce3b878701dc8c9b96cdb972eb75e04",
    "official_artifact_image_sha256":"16f214b9a12468e1f36525aa7179a516571ffcfe00176e632527a710a7fe6101",
    "presentation":"meaty morsels",
    "recipe_a":"chicken",
    "recipe_b":"trout"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness wild delights meaty morsels chicken and turkey recipe in gravy high protein grain free canned cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Wilderness Wild Delights Meaty Morsels Chicken & Turkey Recipe in Gravy High-Protein Grain-Free Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/36916",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"36916",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-wild-delights-meaty-morsels-chicken-turkey-recipe-in-gravy-high-protein-grain-free-canned-cat-food-3oz-case-of-24/img-472751._V1_.jpg",
    "retailer_front_image_sha256":"2d727e8eb3ef1c1fec4ab6be7760249bfdeebd3ed48118870ae909aa3802da48",
    "retailer_front_ocr":"BLUE Wilderness Wild Delights Chicken & Turkey Recipe in Tasty Gravy Meaty Morsels Grain Free 3 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wild delights wet cat food - chicken turkey wilderness chicken-turkey",
    "target_product_name":"BLUE Wilderness Wild Delights Wet Cat Food - Chicken & Turkey",
    "target_product_line":"BLUE Wilderness Wild Delights Wet",
    "target_flavor":"Chicken & Turkey",
    "target_life_stage":"unknown",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/chicken-turkey/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/wild-delights-chicken-turkey-share.png",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"48e0bbc051c8abedd4e4cf537ca43b837301e8a418ba0bece7c3c001c5332807",
    "target_raw_ingredient_hash":"7133fd4fa55ac3f652ffd167584a44e2af7788769f14dd8ef3ca53a72b69b1b2",
    "official_artifact_image_sha256":"31604adbc06bd60cf622bc655b312d89739070293b1678de67793916cf81e2bd",
    "presentation":"meaty morsels",
    "recipe_a":"chicken",
    "recipe_b":"turkey"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness wild delights chicken and salmon in tasty gravy grain free canned cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Wilderness Wild Delights Chicken & Salmon in Tasty Gravy Grain-Free Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-wild-delights/dp/36914",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"36914",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-wild-delights-chicken-salmon-in-tasty-gravy-grain-free-canned-cat-food-3oz-case-of-24/img-676041._V1_.jpg",
    "retailer_front_image_sha256":"99b766a7c43fff713c3d832f5e530ce5755a65ca73acacf0b951708dcc9037cb",
    "retailer_front_ocr":"BLUE Wilderness Wild Delights Chicken & Salmon Recipe in Tasty Gravy Meaty Morsels Grain Free 3 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wild delights wet cat food - chicken salmon wilderness chicken-salmon",
    "target_product_name":"BLUE Wilderness Wild Delights Wet Cat Food - Chicken & Salmon",
    "target_product_line":"BLUE Wilderness Wild Delights Wet",
    "target_flavor":"Chicken & Salmon",
    "target_life_stage":"unknown",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/chicken-salmon/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/wild-delights-chicken-salmon-share.png",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"9b77a79c80909bb331c89e6c1a7512dd9ba6fd92ab76fe89b36b694929ed7827",
    "target_raw_ingredient_hash":"4b34757dd364b07bbc6c0206cb7333cc211af7e6569ad3c585be930490eeaea7",
    "official_artifact_image_sha256":"00c73000d905209ff4a24517e553146793fb01a0f1ff5c0f1b0a60286f6e60a9",
    "presentation":"meaty morsels",
    "recipe_a":"chicken",
    "recipe_b":"salmon"
  }
]
$json$::JSONB) AS raw(
  alias_formula_key TEXT,
  retailer_title TEXT,
  retailer_source_url TEXT,
  retailer_source_slug TEXT,
  retailer_product_id TEXT,
  retailer_front_image_url TEXT,
  retailer_front_image_sha256 TEXT,
  retailer_front_ocr TEXT,
  target_cache_key TEXT,
  target_product_name TEXT,
  target_product_line TEXT,
  target_flavor TEXT,
  target_life_stage TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  official_artifact_image_sha256 TEXT,
  presentation TEXT,
  recipe_a TEXT,
  recipe_b TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_wild_delights_front_payload) <> 4
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_wild_delights_front_payload) <> 4
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_wild_delights_front_payload) <> 4
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_wild_delights_front_payload) <> 4
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_wild_delights_front_payload) <> 4 THEN
    RAISE EXCEPTION 'BLUE Wild Delights payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_wild_delights_front_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_life_stage NOT IN ('unknown', 'kitten')
       OR payload.presentation NOT IN ('flaked', 'meaty morsels')
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_artifact_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE%Wilderness%Wild Delights%Grain Free%3 OZ%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.presentation || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.recipe_a || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.recipe_b || '%'
       OR (
         payload.target_life_stage = 'kitten'
         AND (
           payload.presentation <> 'flaked'
           OR payload.retailer_title NOT ILIKE '%kitten%'
           OR payload.retailer_front_ocr NOT ILIKE '%kitten%'
         )
       )
       OR (
         payload.target_life_stage = 'unknown'
         AND (
           payload.presentation <> 'meaty morsels'
           OR payload.retailer_title ILIKE '%kitten%'
         )
       )
  ) THEN
    RAISE EXCEPTION 'BLUE Wild Delights evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_wild_delights_front_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_wild_delights_front_payload payload
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
 AND formula.pet_type = 'cat'
 AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') =
     payload.target_life_stage
 AND formula.food_form = 'wet'
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
     ), 'hex') = payload.target_raw_ingredient_hash
JOIN LATERAL (
  SELECT exact.id, exact.observed_at
  FROM public.catalog_observations exact
  WHERE exact.source_slug = payload.retailer_source_slug
    AND exact.source_external_id = payload.retailer_product_id
    AND lower(regexp_replace(exact.source_url, '/+$', '')) =
        lower(regexp_replace(payload.retailer_source_url, '/+$', ''))
    AND lower(btrim(exact.brand)) = 'blue buffalo'
    AND exact.pet_type = 'cat'
    AND exact.food_form = 'wet'
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND exact.product_name ILIKE '%Wild Delights%'
    AND exact.product_name ILIKE '%' || payload.recipe_a || '%'
    AND exact.product_name ILIKE '%' || payload.recipe_b || '%'
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_wild_delights_front_resolved) <> 4 THEN
    RAISE EXCEPTION 'BLUE Wild Delights identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_wild_delights_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE Wild Delights formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_wild_delights_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE Wild Delights search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_wild_delights_front_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = 'cat'
        AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') =
            resolved.target_life_stage
        AND product.food_form = 'wet'
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
    RAISE EXCEPTION 'BLUE Wild Delights serving precondition changed';
  END IF;
END
$resolution_guard$;

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
    'source', 'blue_buffalo_wild_delights_front_package_reconciliation_20260805',
    'review_method', 'exact_retailer_front_package_to_current_manufacturer_package',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_image_identity_only', TRUE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_title', resolved.retailer_title,
    'retailer_source_url', resolved.retailer_source_url,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
    'retailer_front_ocr', resolved.retailer_front_ocr,
    'official_source_url', resolved.target_source_url,
    'official_database_image_url', resolved.target_image_url,
    'official_artifact_image_sha256', resolved.official_artifact_image_sha256,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'target_life_stage', resolved.target_life_stage,
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_wild_delights_front_resolved resolved
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
    'source', 'blue_buffalo_wild_delights_front_package_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_source_slug', resolved.retailer_source_slug,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
    'retailer_front_ocr', resolved.retailer_front_ocr,
    'official_source_url', resolved.target_source_url,
    'formula_id', resolved.formula_id,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'target_life_stage', resolved.target_life_stage,
    'presentation', resolved.presentation,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_wild_delights_front_resolved resolved
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
SELECT
  resolved.formula_id,
  resolved.observation_id,
  'retailer_exact_front_package_identity_alias',
  jsonb_build_object(
    'source', 'blue_buffalo_wild_delights_front_package_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
    'retailer_front_ocr', resolved.retailer_front_ocr,
    'official_source_url', resolved.target_source_url,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'target_life_stage', resolved.target_life_stage,
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_wild_delights_front_package|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_wild_delights_front_resolved resolved
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
    FROM blue_wild_delights_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_wild_delights_front_package_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 4 THEN
    RAISE EXCEPTION 'BLUE Wild Delights formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_wild_delights_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_wild_delights_front_package_reconciliation_20260805'
  ) <> 4 THEN
    RAISE EXCEPTION 'BLUE Wild Delights search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_wild_delights_front_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_wild_delights_front_package_reconciliation_20260805'
  ) <> 4 THEN
    RAISE EXCEPTION 'BLUE Wild Delights evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_wild_delights_front_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE Wild Delights exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> 'cat'
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'BLUE Wild Delights exact-title search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
