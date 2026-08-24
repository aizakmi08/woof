-- Reconcile six additional exact Chewy BLUE canned package fronts to exact
-- current manufacturer formulas. Retailer evidence is identity-only; this
-- migration never rewrites product_data, ingredients, images, or scores.

CREATE TEMP TABLE blue_canned_front_wave_b_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness healthy weight turkey and chicken grill grain free adult canned dog food|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Wilderness Healthy Weight Turkey & Chicken Grill Grain-Free Adult Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-healthy/dp/103624",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"103624",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-healthy-weight-turkey-chicken-grill-grain-free-adult-canned-dog-food-12-5oz-case-of-12/img-230731._V1_.jpg",
    "retailer_front_image_sha256":"0960a579731e67c49fc7331dcb2a6451de7265afe277daac3d5869e0117056ed",
    "retailer_front_ocr":"BLUE WILDERNESS HEALTHY WEIGHT HIGH-PROTEIN FOOD FOR DOGS TURKEY & CHICKEN GRILL 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food - meat-rich turkey chicken grill wilderness small-breed-healthy-weight-turkey-chicken-grill",
    "target_product_name":"BLUE Wilderness Wet Dog Food - Meat-Rich Turkey & Chicken Grill",
    "target_product_line":"BLUE Wilderness Wet - Meat-Rich",
    "target_flavor":"Turkey & Chicken Grill",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "visible_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/wilderness/small-breed-healthy-weight-turkey-chicken-grill/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-hw-turkey-chicken-grill-share.png",
    "official_review_image_sha256":"aaeb2a091c4774dd1a6cae1403c3d4abd197b1583d1b3f90df8ceae43cbc568a",
    "target_ingredient_count":33,
    "target_database_ingredient_hash":"0c4087cb53a3122a1af0b372964f85198db03793883ea9bb69237d6603a70db6",
    "target_raw_ingredient_hash":"32af7e075f9a47f00740e5604b2e4166aae22634cee40220cbb02d3c94fcf40f",
    "family":"wilderness healthy weight",
    "grain_boundary":"grain free",
    "presentation":"grill",
    "breed_size":"standard",
    "required_term_a":"turkey",
    "required_term_b":"chicken",
    "required_term_c":"healthy weight"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness salmon and chicken grill with oats and barley adult wet dog food|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Wilderness Salmon & Chicken Grill with Oats & Barley Adult Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-salmon/dp/269345",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"269345",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-salmon-chicken-grill-with-oats-barley-adult-wet-dog-food-12-5oz-can-case-of-12/img-686208._V1_.jpg",
    "retailer_front_image_sha256":"ebed1375b1e88cb03fad71c7e904d24b7d3d1c731e5541b5a11cfa413a5e30e5",
    "retailer_front_ocr":"BLUE WILDERNESS WHOLESOME GRAINS CHICKEN & SALMON GRILL WITH OATS & BARLEY HIGH-PROTEIN FOOD FOR DOGS 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food - salmon chicken grill wilderness chicken-salmon-grill-with-grains",
    "target_product_name":"BLUE Wilderness Wet Dog Food - Salmon & Chicken Grill",
    "target_product_line":"BLUE Wilderness Wet",
    "target_flavor":"Salmon & Chicken Grill",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "visible_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/wilderness/chicken-salmon-grill-with-grains/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-salmon-chicken-grill-share.png",
    "official_review_image_sha256":"ae51821f0ae06d69d859ba321137161077e5cbf39670b22d29c7420ee7d6933f",
    "target_ingredient_count":29,
    "target_database_ingredient_hash":"3a169d51e02f8e44130820f57d3c7d99df63fb492f95a664d113381ed06cca03",
    "target_raw_ingredient_hash":"ba9b9b333149fe0a07ca043c0ece8e9c7919962acd5b5044e08b781c39c128fe",
    "family":"wilderness wholesome grains",
    "grain_boundary":"with grains",
    "presentation":"grill",
    "breed_size":"standard",
    "required_term_a":"salmon",
    "required_term_b":"chicken",
    "required_term_c":"grains"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness adult wholesome grains beef and chicken grill wet dog food|dog|adult|wet||",
    "retailer_title":"Blue Buffalo Wilderness Adult Wholesome Grains, Beef & Chicken Grill Wet Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-beef-chicken/dp/269341",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"269341",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-wilderness-adult-wholesome-grains-beef-chicken-grill-wet-dog-food-12-5oz-can-12-count/img-315147._V1_.jpg",
    "retailer_front_image_sha256":"afa11fa40088c74f8d97a3a3f6bc5aa7b78bb27cdc7ca16b2be8513629dfbb99",
    "retailer_front_ocr":"BLUE WILDERNESS WHOLESOME GRAINS BEEF & CHICKEN GRILL WITH OATS & BARLEY HIGH-PROTEIN FOOD FOR DOGS 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness beef chicken with grains wet dog food wilderness beef-chicken-grill-with-grains",
    "target_product_name":"BLUE Wilderness Beef & Chicken with Grains Wet Dog Food",
    "target_product_line":"BLUE Wilderness",
    "target_flavor":"Beef & Chicken with Grains",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "visible_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/wilderness/beef-chicken-grill-with-grains/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wildwg_dog_wet_adult_beefchicken_share.png",
    "official_review_image_sha256":"fecdf4ee13f4a48754da41e7cd3aa236de7f42f5ab6012527ec9e52c44aba3b3",
    "target_ingredient_count":32,
    "target_database_ingredient_hash":"c47b1fbde5b4f062a72be93c32b646c946b74586546b3b203f82fe4d8fa4abf3",
    "target_raw_ingredient_hash":"06c588603d0f448208aa4f20274569dc2c955e25514c98cfb3b5919b61c1fcd0",
    "family":"wilderness wholesome grains",
    "grain_boundary":"with grains",
    "presentation":"grill",
    "breed_size":"standard",
    "required_term_a":"beef",
    "required_term_b":"chicken",
    "required_term_c":"grains"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe beef dinner with garden vegetables and sweet potatoes canned dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Beef Dinner with Garden Vegetables & Sweet Potatoes Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-beef/dp/2955358",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"2955358",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068b9ec9-9ec5-7b64-8000-949a98abba32._V1_.jpg",
    "retailer_front_image_sha256":"68113dd09958ad0ab394cd566ff272751c01d8d32206a99b22b51af5e1092fbd",
    "retailer_front_ocr":"BLUE BUFFALO Homestyle Recipe ADULT BEEF DINNER With Garden Vegetables Natural Food for Dogs 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe sup sup wet dog food - beef garden vegetables blue-specialty homestyle-recipe-beef-dinner",
    "target_product_name":"BLUE Homestyle Recipe Wet Dog Food - Beef & Garden Vegetables",
    "target_product_line":"BLUE Homestyle Recipe Wet",
    "target_flavor":"Beef & Garden Vegetables",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "visible_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/homestyle-recipe-beef-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/homestyle-adult-beef-share.png",
    "official_review_image_sha256":"598765190a8c6b8e9f2aca282465039479877d3bf87b341dede3c84d028b8467",
    "target_ingredient_count":38,
    "target_database_ingredient_hash":"f0e9d2c69b6f8a36b9474b2d3995cbefe2efd25390f6779d684352e4f7a7c645",
    "target_raw_ingredient_hash":"57a1c50bf373664dac4d002a07fce74485b91079d2dc92dce28f9d5fa0a32501",
    "family":"homestyle recipe",
    "grain_boundary":"unspecified",
    "presentation":"homestyle",
    "breed_size":"standard",
    "required_term_a":"beef",
    "required_term_b":"garden",
    "required_term_c":"vegetable"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo homestyle recipe large breed chicken dinner with garden vegetables canned dog food|dog|unknown|wet||",
    "retailer_title":"Blue Buffalo Homestyle Recipe Large Breed Chicken Dinner with Garden Vegetables Canned Dog Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-homestyle-recipe-large/dp/32013",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"32013",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/blue-buffalo-homestyle-recipe-large-breed-chicken-dinner-with-garden-vegetables-canned-dog-food-12-5oz-case-of-12/img-438200._V1_.jpg",
    "retailer_front_image_sha256":"74dc1aa36077abd7031817e9fcfc09c9ccce6fe02eaddda87a666fc293055804",
    "retailer_front_ocr":"LARGE BREED BLUE BUFFALO Homestyle Recipe LARGE BREED CHICKEN DINNER With Garden Vegetables 12.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue homestyle recipe sup sup wet dog food large breed - chicken garden vegetables blue-specialty large-breed-homestyle-recipe-chicken-dinner",
    "target_product_name":"BLUE Homestyle Recipe Wet Dog Food (Large Breed) - Chicken & Garden Vegetables",
    "target_product_line":"BLUE Homestyle Recipe Wet (Large Breed)",
    "target_flavor":"BLUE Homestyle Recipe",
    "target_pet_type":"dog",
    "target_life_stage":"unknown",
    "visible_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-dog-food/blue-specialty/large-breed-homestyle-recipe-chicken-dinner/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/blue/share-product-image/homestyle-lb-adult-chicken-share.png",
    "official_review_image_sha256":"b761bfc95c29809bcc8343eb4e5f813e0f37af5f04e5d8c80d4f5a7c14da9593",
    "target_ingredient_count":38,
    "target_database_ingredient_hash":"c2307b932df1fa4902004ef4fefa55368232cb5cb28b177ffbeab860cca35b4e",
    "target_raw_ingredient_hash":"58bd14a2770854bb769309fa695a6e2258d07ee1b289b3771979cc907c30109b",
    "family":"homestyle recipe",
    "grain_boundary":"unspecified",
    "presentation":"homestyle",
    "breed_size":"large",
    "required_term_a":"chicken",
    "required_term_b":"garden",
    "required_term_c":"large breed"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo wilderness kitten salmon grain free canned cat food|cat|kitten|wet||",
    "retailer_title":"Blue Buffalo Wilderness Kitten Salmon Grain-Free Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-wilderness-kitten-salmon/dp/103520",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"103520",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/06a3a599-1568-7631-8000-15015f36ca12._V1_.jpg",
    "retailer_front_image_sha256":"58b15970028f06c4980567d5519d4af97598f0e84a16463929f4b80937634034",
    "retailer_front_ocr":"BLUE BUFFALO WILDERNESS SALMON RECIPE GRAIN FREE FOR KITTENS 5.5 oz",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue wilderness wet kitten food - salmon wilderness kitten-salmon",
    "target_product_name":"BLUE Wilderness Wet Kitten Food - Salmon",
    "target_product_line":"BLUE Wilderness Wet",
    "target_flavor":"Salmon",
    "target_pet_type":"cat",
    "target_life_stage":"kitten",
    "visible_life_stage":"kitten",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/wilderness/kitten-salmon/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/wilderness/share-product-image/wild-cat-wet-kitten-salmon-share.png",
    "official_review_image_sha256":"83005feee95dd31d4fa41115d1505769f661b6ed09820a83b081347a9b4e3884",
    "target_ingredient_count":37,
    "target_database_ingredient_hash":"fa99218679b5147e976b5683cfbe5eda5478a6b7fb6db432dd48e0c4631970eb",
    "target_raw_ingredient_hash":"af80e510bd059743a2c668033d096e81541559b5dbc6c97fd3fa9aedb67518c5",
    "family":"wilderness",
    "grain_boundary":"grain free",
    "presentation":"canned",
    "breed_size":"standard",
    "required_term_a":"salmon",
    "required_term_b":"kitten",
    "required_term_c":"wilderness"
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
  visible_life_stage TEXT,
  target_source_url TEXT,
  target_image_url TEXT,
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  family TEXT,
  grain_boundary TEXT,
  presentation TEXT,
  breed_size TEXT,
  required_term_a TEXT,
  required_term_b TEXT,
  required_term_c TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_canned_front_wave_b_payload) <> 6
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_canned_front_wave_b_payload) <> 6
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_canned_front_wave_b_payload) <> 6
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_canned_front_wave_b_payload) <> 6
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_canned_front_wave_b_payload) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned wave B payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_canned_front_wave_b_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_pet_type NOT IN ('dog', 'cat')
       OR payload.target_life_stage NOT IN ('unknown', 'kitten')
       OR payload.visible_life_stage NOT IN ('adult', 'kitten')
       OR payload.grain_boundary NOT IN ('grain free', 'with grains', 'unspecified')
       OR payload.presentation NOT IN ('grill', 'homestyle', 'canned')
       OR payload.breed_size NOT IN ('standard', 'large')
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_a || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_b || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_c || '%'
       OR (payload.target_pet_type = 'cat' AND payload.target_life_stage <> 'kitten')
       OR (payload.target_pet_type = 'cat' AND payload.visible_life_stage <> 'kitten')
       OR (payload.target_pet_type = 'dog' AND payload.visible_life_stage <> 'adult')
       OR (payload.breed_size = 'large' AND payload.retailer_front_ocr NOT ILIKE '%large breed%')
       OR (payload.grain_boundary = 'with grains' AND payload.retailer_front_ocr NOT ILIKE '%oats%barley%')
       OR (payload.grain_boundary = 'grain free' AND payload.retailer_title NOT ILIKE '%grain-free%')
  ) THEN
    RAISE EXCEPTION 'BLUE canned wave B evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_canned_front_wave_b_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_canned_front_wave_b_payload payload
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
  IF (SELECT count(*) FROM blue_canned_front_wave_b_resolved) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned wave B identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_canned_front_wave_b_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE canned wave B formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_canned_front_wave_b_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE canned wave B search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_canned_front_wave_b_resolved resolved
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
    RAISE EXCEPTION 'BLUE canned wave B serving precondition changed';
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805',
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
    'target_life_stage', resolved.target_life_stage,
    'visible_life_stage', resolved.visible_life_stage,
    'family', resolved.family,
    'grain_boundary', resolved.grain_boundary,
    'presentation', resolved.presentation,
    'breed_size', resolved.breed_size,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_canned_front_wave_b_resolved resolved
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805',
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
    'grain_boundary', resolved.grain_boundary,
    'breed_size', resolved.breed_size,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_canned_front_wave_b_resolved resolved
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
    'source', 'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805',
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
    'target_life_stage', resolved.target_life_stage,
    'visible_life_stage', resolved.visible_life_stage,
    'grain_boundary', resolved.grain_boundary,
    'presentation', resolved.presentation,
    'breed_size', resolved.breed_size,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_canned_front_package_wave_b|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_canned_front_wave_b_resolved resolved
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
    FROM blue_canned_front_wave_b_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned wave B formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_canned_front_wave_b_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned wave B search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_canned_front_wave_b_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_canned_front_package_reconciliation_wave_b_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE canned wave B evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_canned_front_wave_b_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE canned wave B exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> v_row.target_pet_type
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'BLUE canned wave B search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
