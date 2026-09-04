-- Reconcile six exact Chewy BLUE canned package fronts to exact current
-- manufacturer formulas. Retailer evidence is identity-only. This migration
-- never rewrites product_data, ingredients, images, scores, or formula versions.

CREATE TEMP TABLE blue_canned_front_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe senior 7 turkey and vegetable dinner pate canned wet dog food|dog|senior|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Senior 7+ Turkey & Vegetable Dinner Pate Canned Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-senior/dp/3488782",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"3488782",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068dbe4d-a8f7-73c9-8000-f44a35ae2e18._V1_.jpg",
    "retailer_front_image_sha256":"cd4c366c5ae7b89fe039d6e8a5bd50417ba2e85868a38d461358e5dee62cbf0f",
    "retailer_front_ocr":"SENIOR 7+ Helps promote Joint Health Brain & Eye Health BLUE BUFFALO Homestyle Recipe SENIOR 7+ TURKEY & VEGETABLE DINNER 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe senior dog food turkey veggies blue-specialty homestyle-recipe-senior-turkey-vegetable-dinner",
    "target_product_name":"BLUE Homestyle Recipe Senior Dog Food | Turkey & Veggies",
    "target_product_line":"BLUE Homestyle Recipe Senior",
    "target_flavor":"Turkey & Veggies",
    "target_pet_type":"dog",
    "target_life_stage":"senior",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/homestyle-recipe-senior-turkey-vegetable-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/share_homestylerecipe_wet_dog_snrtky.png",
    "target_ingredient_count":40,
    "target_database_ingredient_hash":"bd393e49f6c0bbddd4e26d2945065925f75cd29d5b5f2db4908b12ad15783240",
    "target_raw_ingredient_hash":"5a8ec28aba81344f49dc676e1f34d5d59214b87786a31c99b9391d573cc20258",
    "official_artifact_image_sha256":"cc5943626bde072a6cd0f3aeebd80b47c1e03799265369d030c5027862687a9c",
    "family":"homestyle recipe",
    "presentation":"pate",
    "required_term_a":"turkey",
    "required_term_b":"vegetable",
    "required_term_c":"senior",
    "visible_life_stage":"senior"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe senior 7 lamb and vegetable dinner pate canned wet dog food|dog|senior|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Senior 7+ Lamb & Vegetable Dinner Pate Canned Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-senior/dp/3488790",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"3488790",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068dbe4d-7859-7e33-8000-112c22a0e453._V1_.jpg",
    "retailer_front_image_sha256":"2755e1903f19b1da31d7d70b512a60ff2ed22d0e8dc4de2490e2fc4e39d23862",
    "retailer_front_ocr":"SENIOR 7+ Helps promote Joint Health Brain & Eye Health BLUE BUFFALO Homestyle Recipe SENIOR 7+ LAMB & VEGETABLE DINNER 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe senior dog food lamb veggies blue-specialty homestyle-recipe-senior-lamb-vegetable-dinner",
    "target_product_name":"BLUE Homestyle Recipe Senior Dog Food | Lamb & Veggies",
    "target_product_line":"BLUE Homestyle Recipe Senior",
    "target_flavor":"Lamb & Veggies",
    "target_pet_type":"dog",
    "target_life_stage":"senior",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/homestyle-recipe-senior-lamb-vegetable-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/share_homestylerecipe_wet_dog_snrlamb.png",
    "target_ingredient_count":42,
    "target_database_ingredient_hash":"33bc060ffb0690760ddb3e52b3c0a4e42f5f91af77a080378f6ba406724c3e00",
    "target_raw_ingredient_hash":"5da9e2ea80a119df44d04e71275dbedd57019ddc191c2e77924823f66b723b01",
    "official_artifact_image_sha256":"1df903dce4442674653b23ba8dd51890df6da8c3505fc161f15d5b05813972b3",
    "family":"homestyle recipe",
    "presentation":"pate",
    "required_term_a":"lamb",
    "required_term_b":"vegetable",
    "required_term_c":"senior",
    "visible_life_stage":"senior"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe turkey meatloaf dinner with garden vegetables canned dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Turkey Meatloaf Dinner with Garden Vegetables Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-turkey/dp/31985",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"31985",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-homestyle-recipe-turkey-meatloaf-dinner-with-garden-vegetables-canned-dog-food-12-5oz-case-of-12/img-624578._V1_.jpg",
    "retailer_front_image_sha256":"35902f2f7c088fb76268dcd22279ec8e8e86d1ec9b46c2865c020c1a8f51f83f",
    "retailer_front_ocr":"TURKEY Healthy Holistic BLUE Homestyle Recipe TURKEY MEATLOAF DINNER With Garden Vegetables Natural Food for Dogs 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe sup sup wet dog food - turkey meatloaf garden vegetables blue-specialty homestyle-recipe-turkey-meatloaf-dinner",
    "target_product_name":"BLUE Homestyle Recipe Wet Dog Food - Turkey Meatloaf & Garden Vegetables",
    "target_product_line":"BLUE Homestyle Recipe Wet",
    "target_flavor":"Turkey",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/homestyle-recipe-turkey-meatloaf-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/homestyle-adult-turkey-share.png",
    "target_ingredient_count":37,
    "target_database_ingredient_hash":"9092903084982f7a89004ab9355524a8c3984d7a4d412a4f795f67da0db6ded3",
    "target_raw_ingredient_hash":"57655ee84069bd6783e03be7ea38a20d50fcd9b3be397b7a62339242cd1de969",
    "official_artifact_image_sha256":"a26b251b5b9011450a16b8994b53d477ab41201f537d60d79c2eb45d5d9c9cd4",
    "family":"homestyle recipe",
    "presentation":"meatloaf",
    "required_term_a":"turkey",
    "required_term_b":"meatloaf",
    "required_term_c":"vegetable",
    "visible_life_stage":"adult"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe chicken dinner with garden vegetables and brown rice puppy canned dog food|dog|puppy|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Chicken Dinner with Garden Vegetables & Brown Rice Puppy Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-puppy/dp/112797",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"112797",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-homestyle-recipe-chicken-dinner-with-garden-vegetables-brown-rice-puppy-canned-dog-food-12-5oz-case-of-12/img-498123._V1_.jpg",
    "retailer_front_image_sha256":"299eb9da55636f4d0561e8ce38296679f49966e5a675929bbe3000e9424ad3e0",
    "retailer_front_ocr":"Healthy Holistic BLUE Homestyle Recipe PUPPY CHICKEN DINNER With Garden Vegetables Natural Food for Puppies",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe wet puppy food - chicken garden vegetables blue-specialty puppy-homestyle-recipe-chicken-dinner",
    "target_product_name":"BLUE Homestyle Recipe Wet Puppy Food - Chicken & Garden Vegetables",
    "target_product_line":"BLUE Homestyle Recipe Wet",
    "target_flavor":"Chicken & Garden Vegetables",
    "target_pet_type":"dog",
    "target_life_stage":"puppy",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/puppy-homestyle-recipe-chicken-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/homestyle-puppy-chicken-share.png",
    "target_ingredient_count":40,
    "target_database_ingredient_hash":"6170b50e0b9b7e82b3e16b61ea46cc5ca28c6b72a0d400b57c970fcc21aa1fa9",
    "target_raw_ingredient_hash":"e7010a8deb3650ce9974dd433742853f69e4a321003523a7bf3b4df7a3198039",
    "official_artifact_image_sha256":"8cb9d91838c3bc5699338bc7ffb1832572dfac84bef551b47273b195dedbeaaf",
    "family":"homestyle recipe",
    "presentation":"homestyle",
    "required_term_a":"chicken",
    "required_term_b":"puppy",
    "required_term_c":"vegetable",
    "visible_life_stage":"puppy"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness turkey grain free canned cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Wilderness Turkey Grain-Free Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-turkey-grain/dp/36711",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"36711",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-turkey-grain-free-canned-cat-food-5-5oz-case-of-24/img-664028._V1_.jpg",
    "retailer_front_image_sha256":"544a58242dece76414821d1f3922660cc284e435257d8b0d5a2907bfd749ef11",
    "retailer_front_ocr":"NATURAL FOOD FOR ADULT CATS BLUE BUFFALO WILDERNESS TURKEY RECIPE",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wet cat food turkey recipe wilderness turkey",
    "target_product_name":"BLUE Wilderness Wet Cat Food Turkey Recipe",
    "target_product_line":"BLUE Wilderness Wet",
    "target_flavor":"Turkey Recipe",
    "target_pet_type":"cat",
    "target_life_stage":"unknown",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/turkey/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/large-product-image/wild_cat_wet_adult_turkey.png",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"a00054e2ff1cfcccdfe6a044e36cb7b90ff204100866f8dfe43d53093f422c4f",
    "target_raw_ingredient_hash":"5309cde9aa7f097db34a35c319eca882d7f29129600a4d207c514479f00551d0",
    "official_artifact_image_sha256":"a7cb9cdc179e69c6cf7ccdc4d115190c60540797c9181ec5227487e0bcaef036",
    "family":"wilderness",
    "presentation":"canned",
    "required_term_a":"turkey",
    "required_term_b":"wilderness",
    "required_term_c":"adult cats",
    "visible_life_stage":"adult"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness turkey and chicken grill grain free senior canned dog food|dog|senior|wet||",
    "retailer_title":"Blue Buffalo Wilderness Turkey & Chicken Grill Grain-Free Senior Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-turkey/dp/103645",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"103645",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-turkey-chicken-grill-grain-free-senior-canned-dog-food-12-5oz-case-of-12/img-368291._V1_.jpg",
    "retailer_front_image_sha256":"6edc926bdc61d4018ad61f63c0646e9ca727036d5d495d1cedf8d740ec55e469",
    "retailer_front_ocr":"Healthy Holistic BLUE WILDERNESS SENIOR HIGH-PROTEIN FOOD FOR DOGS TURKEY & CHICKEN Natural Food for Dogs enhanced with added vitamins & minerals NET WT 12.5 oz GRILL",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food - turkey chicken wilderness senior-turkey-chicken-grill",
    "target_product_name":"BLUE Wilderness Wet Dog Food - Turkey & Chicken",
    "target_product_line":"BLUE Wilderness Wet",
    "target_flavor":"Turkey & Chicken",
    "target_pet_type":"dog",
    "target_life_stage":"senior",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/wilderness/senior-turkey-chicken-grill/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-senior-turkey-chicken-grill-share.png",
    "target_ingredient_count":31,
    "target_database_ingredient_hash":"21a12d6982b86a94cc3bb3edb314a36b9d46671234f6b469bac9c953fb252521",
    "target_raw_ingredient_hash":"e5651eedff0d9c8336920c959141b8222f2bf6711834d3d487f3b045bbbc514d",
    "official_artifact_image_sha256":"016faa68016956bcf96e64b629a012a7fef0e16eac9e4ce68b5f3bdbeef2ad57",
    "family":"wilderness",
    "presentation":"grill",
    "required_term_a":"turkey",
    "required_term_b":"chicken",
    "required_term_c":"senior",
    "visible_life_stage":"senior"
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
  target_life_stage TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  official_artifact_image_sha256 TEXT,
  family TEXT,
  presentation TEXT,
  required_term_a TEXT,
  required_term_b TEXT,
  required_term_c TEXT,
  visible_life_stage TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_canned_front_payload) <> 6
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_canned_front_payload) <> 6
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_canned_front_payload) <> 6
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_canned_front_payload) <> 6
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_canned_front_payload) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned front payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_canned_front_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.target_life_stage NOT IN ('unknown', 'puppy', 'senior')
       OR payload.family NOT IN ('homestyle recipe', 'wilderness')
       OR payload.presentation NOT IN ('pate', 'meatloaf', 'homestyle', 'canned', 'grill')
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_artifact_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_a || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_b || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_c || '%'
       OR (
         payload.target_life_stage = 'senior'
         AND payload.visible_life_stage <> 'senior'
       )
       OR (
         payload.target_life_stage = 'puppy'
         AND payload.visible_life_stage <> 'puppy'
       )
       OR (
         payload.target_pet_type = 'cat'
         AND payload.visible_life_stage <> 'adult'
       )
  ) THEN
    RAISE EXCEPTION 'BLUE canned front evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_canned_front_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_canned_front_payload payload
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
    AND exact.pet_type = payload.target_pet_type
    AND exact.food_form = 'wet'
    AND exact.formula_evidence_tier = 'unverified'
    AND exact.front_image_url = payload.retailer_front_image_url
    AND exact.product_name ILIKE '%' || payload.required_term_a || '%'
    AND exact.product_name ILIKE '%' || payload.required_term_b || '%'
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_canned_front_resolved) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned front identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_canned_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE canned front formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_canned_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE canned front search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_canned_front_resolved resolved
    WHERE NOT EXISTS (
      SELECT 1 FROM public.product_data product
      WHERE product.cache_key = resolved.target_cache_key
        AND product.product_name = resolved.target_product_name
        AND product.product_line = resolved.target_product_line
        AND coalesce(product.flavor, '') = resolved.target_flavor
        AND product.pet_type = resolved.target_pet_type
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
    RAISE EXCEPTION 'BLUE canned front serving precondition changed';
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_20260805',
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
    'target_pet_type', resolved.target_pet_type,
    'target_life_stage', resolved.target_life_stage,
    'visible_life_stage', resolved.visible_life_stage,
    'family', resolved.family,
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_canned_front_resolved resolved
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_20260805',
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
    'target_life_stage', resolved.target_life_stage,
    'visible_life_stage', resolved.visible_life_stage,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_canned_front_resolved resolved
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_20260805',
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
    'target_pet_type', resolved.target_pet_type,
    'target_life_stage', resolved.target_life_stage,
    'visible_life_stage', resolved.visible_life_stage,
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_canned_front_package|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_canned_front_resolved resolved
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
    FROM blue_canned_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned front formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_canned_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned front search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_canned_front_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned front evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_canned_front_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE canned exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> v_row.target_pet_type
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'BLUE canned exact-title search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
