-- Reconcile three Chewy BLUE Delights package fronts to the exact current
-- manufacturer formulas. Retailer evidence is identity-only: ingredients,
-- images, formula versions, scores, and product_data remain untouched.

CREATE TEMP TABLE blue_delights_front_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo divine delights grilled chicken flavor pate dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Divine Delights Grilled Chicken Flavor Pate Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-divine-delights-grilled/dp/141545",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"141545",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-divine-delights-grilled-chicken-flavor-pate-dog-food-trays-3-5oz-case-of-12/img-520761._V1_.jpg",
    "retailer_front_image_sha256":"f63909eebde200883920b1be40a725fa277573147a24bcc8303a7764dc3f5365",
    "retailer_front_ocr":"BLUE BUFFALO Delights FOR SMALL BREED DOGS GRAIN FREE Grilled Chicken Flavor Pate 3.5 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue delights wet dog food - grilled chicken flavor blue-specialty blue-delights-grilled-chicken-savory-juices",
    "target_product_name":"BLUE Delights Wet Dog Food - Grilled Chicken Flavor",
    "target_product_line":"BLUE Delights Wet - Grilled",
    "target_flavor":"BLUE Delights - Grilled Chicken Flavor",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-delights-grilled-chicken-savory-juices/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/dog_dd_grilled_chicken_front_share.png",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"18fc6e3dc49d2d00d037c000c0638be260a7b5e031589891441c830050b2daec",
    "target_raw_ingredient_hash":"48e0f6920dd6cc388a2ee576a80da42716050eda485c3e34f58c27e74b42083e",
    "official_artifact_image_sha256":"d2c5a96de996229c2cba91025cd8401fa268302e0544fd9c7d9e72bba2854f04",
    "recipe":"grilled chicken flavor"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo divine delights roasted turkey flavor pate dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Divine Delights Roasted Turkey Flavor Pate Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-divine-delights-roasted/dp/141554",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"141554",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-divine-delights-roasted-turkey-flavor-pate-dog-food-trays-3-5oz-case-of-12/img-771190._V1_.jpg",
    "retailer_front_image_sha256":"c2425fd7dfaee60ccb722ad8b17643ebf99644520d87ae868161e57f2234ea63",
    "retailer_front_ocr":"BLUE BUFFALO Delights FOR SMALL BREED DOGS GRAIN FREE Roasted Turkey Flavor Pate 3.5 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue delights wet dog food - roasted turkey flavor blue-specialty blue-delights-roasted-turkey-savory-juices",
    "target_product_name":"BLUE Delights Wet Dog Food - Roasted Turkey Flavor",
    "target_product_line":"BLUE Delights Wet - Roasted",
    "target_flavor":"BLUE Delights - Roasted Turkey Flavor",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-delights-roasted-turkey-savory-juices/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/dog_dd_roasted_turkey_front_share.png",
    "target_ingredient_count":34,
    "target_database_ingredient_hash":"3f7c5e977eaf389bdc2101a59360841ac20b9d669a7f9981877c1c9531d2995b",
    "target_raw_ingredient_hash":"9d1e583e23622076401c3efff67d249a95f86d99c2dba498549cb431d9af2872",
    "official_artifact_image_sha256":"94c465fa58e7619aa816dcb240b01b913bdeb4e9e910fad9a36a836f37838514",
    "recipe":"roasted turkey flavor"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo divine delights porterhouse flavor pate dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Divine Delights Porterhouse Flavor Pate Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-divine-delights/dp/141552",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"141552",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-divine-delights-porterhouse-flavor-pate-dog-food-trays-3-5oz-case-of-12/img-751457._V1_.jpg",
    "retailer_front_image_sha256":"9ba6b4d6c4e14098cf2a1f868a95c067169c75cc9cc2dd363514cb7f19243187",
    "retailer_front_ocr":"BLUE BUFFALO Delights FOR SMALL BREED DOGS GRAIN FREE Porterhouse Flavor Pate 3.5 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue delights wet dog food - porterhouse flavor blue-specialty blue-delights-porterhouse-savory-juices",
    "target_product_name":"BLUE Delights Wet Dog Food - Porterhouse Flavor",
    "target_product_line":"BLUE Delights Wet - Porterhouse Flavor",
    "target_flavor":"BLUE Delights - Porterhouse Flavor",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-delights-porterhouse-savory-juices/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/dog_dd_porterhouse_front_share.png",
    "target_ingredient_count":33,
    "target_database_ingredient_hash":"c3382ec5287e7b845decd75274c5e8bbcfa33e12896b6dd2ec47f42e958730ac",
    "target_raw_ingredient_hash":"36e2845fd2e50b7cb6839f4ac2289be9f8e6a18030280d9d926cdf643d1403c3",
    "official_artifact_image_sha256":"6b746e0b8907c1270a7bba4ab3b11d97de358aa6f0e1374f7f9cef5d735aba44",
    "recipe":"porterhouse flavor"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo divine delights top sirloin flavor pate dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Divine Delights Top Sirloin Flavor Pate Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-divine-delights-top/dp/141561",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"141561",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-divine-delights-top-sirloin-flavor-pate-dog-food-trays-3-5oz-case-of-12/img-522168._V1_.jpg",
    "retailer_front_image_sha256":"d7fab2951a1b5cee943f9a4f5ece585bc4c6b8f836c6d1acc53705be2c9c2ddf",
    "retailer_front_ocr":"BLUE BUFFALO Delights FOR SMALL BREED DOGS GRAIN FREE Top Sirloin Flavor Pate 3.5 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue delights wet dog food - top sirloin flavor blue-specialty blue-delights-top-sirloin-savory-juices",
    "target_product_name":"BLUE Delights Wet Dog Food - Top Sirloin Flavor",
    "target_product_line":"BLUE Delights Wet - Top Sirloin Flavor",
    "target_flavor":"BLUE Delights - Top Sirloin Flavor",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-delights-top-sirloin-savory-juices/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/dog_dd_top_sirloin_front_share.png",
    "target_ingredient_count":33,
    "target_database_ingredient_hash":"6e10d8d85e88259a91cde2b0799a90898cea53f0d46837287b77b49b4b7b8af2",
    "target_raw_ingredient_hash":"e022d6656374fd350f9f0cb73c5fe87ad923b44290de680cc87dae9e930fcd47",
    "official_artifact_image_sha256":"6a4f66205af4c7d8fc9108e8ec0959ffeb83df5e97f52330ae34b52db7085ef8",
    "recipe":"top sirloin flavor"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo divine delights rotisserie chicken flavor in hearty gravy small breed wet dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Divine Delights Rotisserie Chicken Flavor in Hearty Gravy Small Breed Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-divine-delights-roasted/dp/141572",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"141572",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-divine-delights-rotisserie-chicken-flavor-in-hearty-gravy-small-breed-wet-dog-food-3-5oz-tray-case-of-12/img-457428._V1_.jpg",
    "retailer_front_image_sha256":"c30aa102a0e36aff98860676831771f2af62ce6be03f0e90942f59f37f0320a6",
    "retailer_front_ocr":"BLUE BUFFALO Delights FOR SMALL BREED DOGS GRAIN FREE Roasted Chicken Flavor In Gravy 3.5 OZ",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue delights wet dog food - rotisserie chicken flavor blue-specialty blue-delights-rotisserie-chicken-hearty-gravy",
    "target_product_name":"BLUE Delights Wet Dog Food - Rotisserie Chicken Flavor",
    "target_product_line":"BLUE Delights Wet - Rotisserie",
    "target_flavor":"BLUE Delights - Rotisserie Chicken Flavor",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/blue-delights-rotisserie-chicken-hearty-gravy/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/dog_dd_rotisserie_chicken_front_share.png",
    "target_ingredient_count":35,
    "target_database_ingredient_hash":"b615213438169d9332a13ae71c058a56b20dc5d075202abab21dc440f6cc78a5",
    "target_raw_ingredient_hash":"3a9da4e2ff992f1bfbfa34c04d9c7805e405c41ff5bacbcbb1a85b056cdcf9d5",
    "official_artifact_image_sha256":"d5018ffafab07513bab952d746aa72156e16e8c027d3b2fce08bc9f848167e66",
    "recipe":"roasted chicken flavor"
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
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  official_artifact_image_sha256 TEXT,
  recipe TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_delights_front_payload) <> 5
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_delights_front_payload) <> 5
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_delights_front_payload) <> 5
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_delights_front_payload) <> 5
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_delights_front_payload) <> 5 THEN
    RAISE EXCEPTION 'BLUE Delights front-package payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_delights_front_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_artifact_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE%Delights%SMALL BREED DOGS%GRAIN FREE%3.5 OZ%'
       OR (
         payload.retailer_front_ocr NOT ILIKE '%Pate%'
         AND payload.retailer_front_ocr NOT ILIKE '%In Gravy%'
       )
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.recipe || '%'
  ) THEN
    RAISE EXCEPTION 'BLUE Delights front-package evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_delights_front_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_delights_front_payload payload
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
 AND formula.pet_type = 'dog'
 AND coalesce(nullif(lower(btrim(formula.life_stage)), 'unknown'), '') = ''
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
    AND exact.pet_type = 'dog'
    AND coalesce(nullif(lower(btrim(exact.life_stage)), 'unknown'), '') = ''
    AND exact.food_form = 'wet'
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_delights_front_resolved) <> 5 THEN
    RAISE EXCEPTION 'BLUE Delights identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_delights_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE Delights formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_delights_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE Delights search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_delights_front_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = 'dog'
        AND coalesce(nullif(lower(btrim(product.life_stage)), 'unknown'), '') = ''
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
    RAISE EXCEPTION 'BLUE Delights serving precondition changed';
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
    'source', 'blue_buffalo_delights_front_package_reconciliation_20260805',
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
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_delights_front_resolved resolved
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
    'source', 'blue_buffalo_delights_front_package_reconciliation_20260805',
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
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_delights_front_resolved resolved
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
    'source', 'blue_buffalo_delights_front_package_reconciliation_20260805',
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
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_delights_front_package|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_delights_front_resolved resolved
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
    FROM blue_delights_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_delights_front_package_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 5 THEN
    RAISE EXCEPTION 'BLUE Delights formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_delights_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_delights_front_package_reconciliation_20260805'
  ) <> 5 THEN
    RAISE EXCEPTION 'BLUE Delights search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_delights_front_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_delights_front_package_reconciliation_20260805'
  ) <> 5 THEN
    RAISE EXCEPTION 'BLUE Delights evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_delights_front_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE Delights exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> 'dog'
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'BLUE Delights exact-title search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
