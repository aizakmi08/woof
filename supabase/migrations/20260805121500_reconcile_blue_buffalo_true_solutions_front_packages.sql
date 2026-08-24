-- Reconcile six exact Chewy BLUE True Solutions package fronts to exact
-- current manufacturer formulas. Retailer evidence is identity-only; this
-- migration never rewrites product_data, ingredients, images, or scores.

CREATE TEMP TABLE blue_true_solutions_front_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions mobility care formula dry dog food|dog|unknown|dry||",
    "retailer_title":"Blue Buffalo True Solutions Mobility Care Formula Dry Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-jolly/dp/244858",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"244858",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfe5-be76-7487-8000-3cc17ee73938._V1_.jpg",
    "retailer_front_image_sha256":"823c85380eaea412644e3f0a292a4898f6b24f9008aa36649d12603efdb9d397",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Mobility Care Chicken & Oatmeal Recipe adult food for dogs mobility support",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions mobility care chicken oatmeal recipe for adult dogs true-solutions mobility-support",
    "target_product_name":"BLUE True Solutions Mobility Care Chicken & Oatmeal Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Mobility Care",
    "target_flavor":"Chicken & Oatmeal Recipe",
    "target_pet_type":"dog",
    "target_source_url":"https://www.bluebuffalo.com/dry-dog-food/true-solutions/mobility-support/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share__truesolutions_dry_dog_jollyjoints.png",
    "official_review_image_sha256":"d3cc1ac34c7c4a36095cb6f978de2f535904770adba7532e9c59607d162032a1",
    "target_ingredient_count":72,
    "target_database_ingredient_hash":"4adbf8bf5a5fc47aa346908de4d749df688fa9b571e370439e5becc368e1e415",
    "target_raw_ingredient_hash":"3cd2b18dd9c607601a56612b7383b7e7542712c123a05fb9d714c3124dfc4465",
    "condition_boundary":"mobility care",
    "breed_size":"standard",
    "recipe_starch":"oatmeal"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions digestive care adult chicken dry dog food|dog|adult|dry||",
    "retailer_title":"Blue Buffalo True Solutions Digestive Care Adult Chicken Dry Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-blissful/dp/244834",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"244834",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfe9-725b-7771-8000-cab9832ae1e0._V1_.jpg",
    "retailer_front_image_sha256":"8e5ab18ee84341a13c21f699efd5810d4c9215d14d1383d07890783e0b1e87ca",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Digestive Care Chicken & Oatmeal Recipe adult food for dogs digestive health",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken oatmeal recipe for adult dogs true-solutions digestive-care",
    "target_product_name":"BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Digestive Care",
    "target_flavor":"Chicken & Oatmeal Recipe",
    "target_pet_type":"dog",
    "target_source_url":"https://www.bluebuffalo.com/dry-dog-food/true-solutions/digestive-care/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share__truesolutions_dry_dog_blissfulbelly.png",
    "official_review_image_sha256":"bfbfa4dba761d7800e48aa27ee83e60596c239a938c6d01a7fa94321017acf97",
    "target_ingredient_count":66,
    "target_database_ingredient_hash":"5f8533ac1226a1531d58605bc99c10f95a8a8219a8acf260bae25a9382624bdc",
    "target_raw_ingredient_hash":"90554ee2d56bffb263be45945f0274bcb9f48e1f4674df2cf9220d07a9d9f7f4",
    "condition_boundary":"digestive care",
    "breed_size":"standard",
    "recipe_starch":"oatmeal"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions natural weight control chicken adult dry dog food|dog|adult|dry||",
    "retailer_title":"Blue Buffalo True Solutions Natural Weight Control Chicken Adult Dry Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-healthy/dp/244824",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"244824",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfea-e452-702e-8000-29c37c0ad82f._V1_.jpg",
    "retailer_front_image_sha256":"f82a22084659c66fb0e56c64b40fd0217e71e09c8b71b4e0d23dea5fb280699d",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Weight Control Chicken & Oatmeal Recipe adult food for dogs safe and effective weight loss",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions weight control chicken oatmeal recipe for adult dogs true-solutions weight-control",
    "target_product_name":"BLUE True Solutions Weight Control Chicken & Oatmeal Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Weight Control",
    "target_flavor":"Chicken & Oatmeal Recipe",
    "target_pet_type":"dog",
    "target_source_url":"https://www.bluebuffalo.com/dry-dog-food/true-solutions/weight-control/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share_truesolutions_dry_dog_weightcare.png",
    "official_review_image_sha256":"db4e451651fadab291b92f6fdfad7a94af76a93bdd6b502cdb2a046f9ed7ae6f",
    "target_ingredient_count":72,
    "target_database_ingredient_hash":"a3ab199e30dcc37e6399dded1b5e2560f94d58f2724c541b3c669d4bce70cd74",
    "target_raw_ingredient_hash":"32fb68f2acdb2fcf4a10989e1b0f8711df5f65faeb35267fdee994d88e51f765",
    "condition_boundary":"weight control",
    "breed_size":"standard",
    "recipe_starch":"oatmeal"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions total support medium breed adult dry dog food|dog|adult|dry||",
    "retailer_title":"Blue Buffalo True Solutions Total Support Medium Breed Adult Dry Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-best-life/dp/290995",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"290995",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfde-c6aa-7a99-8000-966151d492b9._V1_.jpg",
    "retailer_front_image_sha256":"22be74e122fa5f2f3bc1e3063fe49ac6a784d49660352766268f5971f1f8d382",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Total Support Chicken & Oatmeal Recipe adult food for dogs immune digestive and lean muscle support",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions total support chicken oatmeal recipe for adult dogs true-solutions everyday-needs",
    "target_product_name":"BLUE True Solutions Total Support Chicken & Oatmeal Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Total Support",
    "target_flavor":"Chicken & Oatmeal Recipe",
    "target_pet_type":"dog",
    "target_source_url":"https://www.bluebuffalo.com/dry-dog-food/true-solutions/everyday-needs/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share__truesolutions_dry_dog_bestlife.png",
    "official_review_image_sha256":"2daae206601e4712acaba22d8d317fc36c7d9fc208447154a5e2a976e2e4564e",
    "target_ingredient_count":69,
    "target_database_ingredient_hash":"0f03f914bd455f91b4f7758334c04e108b4b0261bf46ecacb98216e31444053b",
    "target_raw_ingredient_hash":"4f96a9c37bf2032a51b2a662fa644e663517d50f482219ac6e27db65f26c6875",
    "condition_boundary":"total support",
    "breed_size":"standard",
    "recipe_starch":"oatmeal"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions large breed care formula adult dry dog food|dog|adult|dry||",
    "retailer_title":"Blue Buffalo True Solutions Large Breed Care Formula Adult Dry Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-livin/dp/291010",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"291010",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfde-4137-7661-8000-e2f4c0b95c9b._V1_.jpg",
    "retailer_front_image_sha256":"41e6307bc279f21911f46045c8926ee9c2b9f657384cdbfb329ecbf4d83854bf",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Large Breed Care Chicken & Oatmeal Recipe adult food for dogs over 55 lbs",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions large breed care chicken oatmeal recipe for adult dogs true-solutions large-breed",
    "target_product_name":"BLUE True Solutions Large Breed Care Chicken & Oatmeal Recipe for Adult Dogs",
    "target_product_line":"BLUE True Solutions Large Breed Care",
    "target_flavor":"Chicken & Oatmeal Recipe",
    "target_pet_type":"dog",
    "target_source_url":"https://www.bluebuffalo.com/dry-dog-food/true-solutions/large-breed/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share__truesolutions_dry_dog_livinlarge.png",
    "official_review_image_sha256":"d4e2994c12c01a3c498018bc1edb51edd2c08372202400334ae2faed1ca91278",
    "target_ingredient_count":70,
    "target_database_ingredient_hash":"d8f8c52c2fc7ec005f7b5b019f063522f99d0d6a25ed704b8dd1b5277f6f1100",
    "target_raw_ingredient_hash":"ff9cd961ba9abb3192cfa9d43d6b19e217e1a3d44bd497a2271709a0349e0138",
    "condition_boundary":"large breed care",
    "breed_size":"large",
    "recipe_starch":"oatmeal"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo true solutions digestive care formula dry cat food|cat|unknown|dry||",
    "retailer_title":"Blue Buffalo True Solutions Digestive Care Formula Dry Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-true-solutions-blissful/dp/244841",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"244841",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/067ebfe8-1e46-7bd3-8000-fb702e36c182._V1_.jpg",
    "retailer_front_image_sha256":"b034e0e59355ffcf7bdef926f06e88385c8bd39128c27fca21b076049c4ebbb5",
    "retailer_front_ocr":"BLUE BUFFALO True Solutions Digestive Care Chicken & Barley Recipe adult food for cats digestive health",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken barley recipe for adult cats true-solutions digestive-care",
    "target_product_name":"BLUE True Solutions Digestive Care Chicken & Barley Recipe for Adult Cats",
    "target_product_line":"BLUE True Solutions Digestive Care",
    "target_flavor":"Chicken & Barley Recipe",
    "target_pet_type":"cat",
    "target_source_url":"https://www.bluebuffalo.com/dry-cat-food/true-solutions/digestive-care/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_blissfulbelly.png",
    "official_review_image_sha256":"a043171441b3565f82c56e353bd56cc387eb71e76ff4ba336311afa296773316",
    "target_ingredient_count":70,
    "target_database_ingredient_hash":"5d98cf910bfa5e00b13d20e7300c3b6b7b6aab022c0055b19186261143060743",
    "target_raw_ingredient_hash":"9d96e0b83c12184544750d943261724fb326317fb66ca576e1c06142b74b798f",
    "condition_boundary":"digestive care",
    "breed_size":"standard",
    "recipe_starch":"barley"
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
  target_pet_type TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  condition_boundary TEXT,
  breed_size TEXT,
  recipe_starch TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_true_solutions_front_payload) <> 6
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_true_solutions_front_payload) <> 6
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_true_solutions_front_payload) <> 6
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_true_solutions_front_payload) <> 6
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_true_solutions_front_payload) <> 6 THEN
    RAISE EXCEPTION 'BLUE True Solutions payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_true_solutions_front_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/dry-%-food/true-solutions/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.condition_boundary NOT IN (
         'mobility care', 'digestive care', 'weight control',
         'total support', 'large breed care'
       )
       OR payload.breed_size NOT IN ('standard', 'large')
       OR payload.recipe_starch NOT IN ('oatmeal', 'barley')
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE BUFFALO%'
       OR payload.retailer_front_ocr NOT ILIKE '%True Solutions%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.condition_boundary || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%Chicken%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.recipe_starch || '%'
       OR (payload.target_pet_type = 'dog' AND payload.retailer_front_ocr NOT ILIKE '%dog%')
       OR (payload.target_pet_type = 'cat' AND payload.retailer_front_ocr NOT ILIKE '%cat%')
       OR (payload.breed_size = 'large' AND payload.retailer_front_ocr NOT ILIKE '%large breed%')
       OR (payload.recipe_starch = 'barley' AND payload.target_pet_type <> 'cat')
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_true_solutions_front_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_true_solutions_front_payload payload
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
 AND coalesce(nullif(lower(btrim(formula.life_stage)), ''), 'unknown') = 'adult'
 AND formula.food_form = 'dry'
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
    AND exact.pet_type = payload.target_pet_type
    AND exact.food_form = 'dry'
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND exact.product_name ILIKE '%' || payload.condition_boundary || '%'
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_true_solutions_front_resolved) <> 6 THEN
    RAISE EXCEPTION 'BLUE True Solutions identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_true_solutions_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_true_solutions_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE True Solutions search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_true_solutions_front_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = resolved.target_pet_type
        AND coalesce(nullif(lower(btrim(product.life_stage)), ''), 'unknown') = 'adult'
        AND product.food_form = 'dry'
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
    RAISE EXCEPTION 'BLUE True Solutions serving precondition changed';
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
    'source', 'blue_buffalo_true_solutions_front_package_reconciliation_20260805',
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
    'official_review_image_url', resolved.target_image_url,
    'official_review_image_sha256', resolved.official_review_image_sha256,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'target_pet_type', resolved.target_pet_type,
    'target_life_stage', 'adult',
    'family', 'true solutions',
    'condition_boundary', resolved.condition_boundary,
    'breed_size', resolved.breed_size,
    'recipe_starch', resolved.recipe_starch,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_true_solutions_front_resolved resolved
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
    'source', 'blue_buffalo_true_solutions_front_package_reconciliation_20260805',
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
    'target_pet_type', resolved.target_pet_type,
    'target_life_stage', 'adult',
    'condition_boundary', resolved.condition_boundary,
    'breed_size', resolved.breed_size,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_true_solutions_front_resolved resolved
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
    'source', 'blue_buffalo_true_solutions_front_package_reconciliation_20260805',
    'retailer_identity_only', TRUE,
    'retailer_ingredient_verification', FALSE,
    'retailer_title', resolved.retailer_title,
    'retailer_product_id', resolved.retailer_product_id,
    'retailer_front_image_url', resolved.retailer_front_image_url,
    'retailer_front_image_sha256', resolved.retailer_front_image_sha256,
    'retailer_front_ocr', resolved.retailer_front_ocr,
    'official_source_url', resolved.target_source_url,
    'official_review_image_url', resolved.target_image_url,
    'official_review_image_sha256', resolved.official_review_image_sha256,
    'official_cache_key', resolved.target_cache_key,
    'canonical_formula_key', resolved.canonical_formula_key,
    'database_ingredient_text_hash', resolved.target_database_ingredient_hash,
    'raw_current_ingredient_hash', resolved.target_raw_ingredient_hash,
    'target_pet_type', resolved.target_pet_type,
    'target_life_stage', 'adult',
    'family', 'true solutions',
    'condition_boundary', resolved.condition_boundary,
    'breed_size', resolved.breed_size,
    'recipe_starch', resolved.recipe_starch,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_true_solutions_front_package|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_true_solutions_front_resolved resolved
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
    FROM blue_true_solutions_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_true_solutions_front_package_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE True Solutions formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_true_solutions_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_true_solutions_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE True Solutions search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_true_solutions_front_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_true_solutions_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE True Solutions evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_true_solutions_front_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE True Solutions exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> v_row.target_pet_type
         OR result.food_form <> 'dry'
    ) THEN
      RAISE EXCEPTION 'BLUE True Solutions search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
