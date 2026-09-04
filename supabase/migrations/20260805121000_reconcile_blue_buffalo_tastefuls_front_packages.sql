-- Reconcile six exact Chewy BLUE Tastefuls package fronts to exact current
-- manufacturer formulas. Retailer evidence is identity-only; this migration
-- never rewrites product_data, ingredients, images, or scores.

CREATE TEMP TABLE blue_tastefuls_front_payload
ON COMMIT DROP
AS
SELECT
  raw.*,
  public.normalize_verified_product_search_query(raw.retailer_title)
    AS normalized_alias
FROM jsonb_to_recordset($json$
[
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls chicken entree pate wet cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Chicken Entrée Pate Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-chicken-entree/dp/1055750",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"1055750",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068794fa-fa9c-7a73-8000-1033ce782934._V1_.jpg",
    "retailer_front_image_sha256":"1a93b705d4ed7152c3807e97c4a0f1416ed42b7fffaf147559525c7fdfeb573e",
    "retailer_front_ocr":"BLUE Tastefuls Chicken Entree PATE Food for Cats NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - chicken pat tastefuls chicken-pate",
    "target_product_name":"BLUE Tastefuls Adult Wet Cat Food - Chicken Paté",
    "target_product_line":"BLUE Tastefuls Adult Wet",
    "target_flavor":"Chicken",
    "target_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/chicken-pate/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_adult_chicken_pate_share.png",
    "official_review_image_sha256":"0dc7cee7893f17a61a5ceb876af0736fb73d9c63be6304e5c02294b5ca38cf9a",
    "target_ingredient_count":35,
    "target_database_ingredient_hash":"bd22225c318b117a7bd8262577efb52e7e936d1880c06225482610413c3c22b6",
    "target_raw_ingredient_hash":"36e3823bdbb2ae766794f1af0aeb4e3eb891520a831246b972910f62ae50306b",
    "presentation":"pate",
    "required_term_a":"chicken",
    "required_term_b":"tastefuls",
    "required_term_c":"pate"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls tuna entree in gravy flaked wet cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Tuna Entrée in Gravy Flaked Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-tuna-entree-in/dp/1055814",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"1055814",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068794fb-2df6-7e65-8000-667160b290b0._V1_.jpg",
    "retailer_front_image_sha256":"90934b3f77702a164edb066df2542c36327cfdc8728d8fab2cd9118485e6bcc1",
    "retailer_front_ocr":"BLUE Tastefuls Tuna Entree in Gravy FLAKED Food for Cats NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - flaked tuna in gravy tastefuls tuna-flaked",
    "target_product_name":"BLUE Tastefuls Adult Wet Cat Food - Flaked Tuna in Gravy",
    "target_product_line":"BLUE Tastefuls Adult Wet - Flaked",
    "target_flavor":"Tuna",
    "target_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/tuna-flaked/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_adult_tuna_flake_share.png",
    "official_review_image_sha256":"4315367f79c0f01c6da99e66cc9c06850614dfeb7b8b8bed94704ad4f9990a20",
    "target_ingredient_count":37,
    "target_database_ingredient_hash":"f34d9620d2abd813cae61bdc75c7606b87ed94f60bb36f47ba3a2f1783f0a565",
    "target_raw_ingredient_hash":"7e612719f7e5bfb17faa3df747ec545a72281b1b25297302e8ce86ead612dfbc",
    "presentation":"flaked in gravy",
    "required_term_a":"tuna",
    "required_term_b":"flaked",
    "required_term_c":"gravy"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls fish and shrimp entree in gravy flaked wet cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Fish & Shrimp Entrée in Gravy Flaked Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-fish-shrimp/dp/1055774",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"1055774",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068794fb-242f-726d-8000-d245635dfef7._V1_.jpg",
    "retailer_front_image_sha256":"2cf918181d1b7f64e65edfb4dc6be1b141085fc9a18e94bf671b746892b12089",
    "retailer_front_ocr":"BLUE Tastefuls Fish and Shrimp Entree in Gravy FLAKED Food for Cats NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - flaked fish shrimp in gravy tastefuls fish-shrimp-flaked",
    "target_product_name":"BLUE Tastefuls Adult Wet Cat Food - Flaked Fish & Shrimp in Gravy",
    "target_product_line":"BLUE Tastefuls Adult Wet - Flaked Fish & Shrimp in Gravy",
    "target_flavor":"",
    "target_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/fish-shrimp-flaked/",
    "target_image_url":"https://www.bluebuffalo.com/contentassets/86b8c2568b3348ce9fa1fbde7367b585/tastefuls_cat_wet_adult_shrimp_flake_share.png",
    "official_review_image_sha256":"62b5c15f1817a4d2961e3b050b01d889d3134ec36fd8bf7731574d24c1d6f3a1",
    "target_ingredient_count":38,
    "target_database_ingredient_hash":"c6df4a128c28dc61ea20841f0dd785dd677639b1a3548d34fbf051c207315202",
    "target_raw_ingredient_hash":"16b6f2ac4e3cf07497710615b6c880d8408f70da0ffc9ae2d76e5ca307909214",
    "presentation":"flaked in gravy",
    "required_term_a":"fish",
    "required_term_b":"shrimp",
    "required_term_c":"flaked"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls salmon entree pate wet cat food|cat|unknown|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Salmon Entrée Pate Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-salmon-entree/dp/1055830",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"1055830",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068794fb-037f-7f1b-8000-137bc6bbdeca._V1_.jpg",
    "retailer_front_image_sha256":"426611bef9a52534a1081e0f7ddf023fcd314bcb25a72ea9770aa620ec9dbdb4",
    "retailer_front_ocr":"BLUE Tastefuls Salmon Entree PATE Food for Cats NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls adult wet cat food - salmon pat tastefuls salmon-pate",
    "target_product_name":"BLUE Tastefuls Adult Wet Cat Food - Salmon Paté",
    "target_product_line":"BLUE Tastefuls Adult Wet",
    "target_flavor":"Salmon",
    "target_life_stage":"adult",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/salmon-pate/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_adult_salmon_pate_share.png",
    "official_review_image_sha256":"a073b9a530e698605535dd66848ac1ab1acd6c782583283e4d2365e12fb7d6dd",
    "target_ingredient_count":34,
    "target_database_ingredient_hash":"1af4a08f040176464b3a1a0e53c417f8210fea00f39d1cb22a1dbcb967fff719",
    "target_raw_ingredient_hash":"0b8dec294485389be3fd947aa47dbcada3850bad3af08db8bb7e46eb32638cf8",
    "presentation":"pate",
    "required_term_a":"salmon",
    "required_term_b":"tastefuls",
    "required_term_c":"pate"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls chicken entree pate kitten canned cat food|cat|kitten|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Chicken Entrée Pate Kitten Canned Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-chicken-entree/dp/3283902",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"3283902",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068c47c9-2273-7338-8000-6e5da25329dd._V1_.jpg",
    "retailer_front_image_sha256":"8d9637014b5ddc3378f0471599af9274d099ebc6e41c68b2b8d3eb57910840d7",
    "retailer_front_ocr":"BLUE Tastefuls Chicken Entree PATE Food for Kittens NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls kitten wet cat food - chicken pat tastefuls kitten-chicken",
    "target_product_name":"BLUE Tastefuls Kitten Wet Cat Food - Chicken Paté",
    "target_product_line":"BLUE Tastefuls Wet",
    "target_flavor":"Chicken",
    "target_life_stage":"kitten",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/kitten-chicken/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_kitten_chicken_pate_share.png",
    "official_review_image_sha256":"b14fe9c4491f1d1e7c7b618b65106d1b36201c20623a3906b87cdac5dc0d2c59",
    "target_ingredient_count":36,
    "target_database_ingredient_hash":"314fd33ba08d1842dbb9a2e59495f81954a33c165575e2c4e2627d8b2c7fb0f3",
    "target_raw_ingredient_hash":"a7fcb49035e70bd2da984431667c211fa2199503a5ffff45048051409b49f692",
    "presentation":"pate",
    "required_term_a":"chicken",
    "required_term_b":"kitten",
    "required_term_c":"pate"
  },
  {
    "alias_formula_key":"blue buffalo|blue buffalo|blue buffalo tastefuls chicken entree mature cats pate wet cat food|cat|senior|wet||",
    "retailer_title":"Blue Buffalo Tastefuls Chicken Entrée Mature Cats Pate Wet Cat Food",
    "retailer_source_url":"https://www.chewy.com/blue-buffalo-tastefuls-chicken-entree/dp/3283910",
    "retailer_source_slug":"chewy-public-sitemap",
    "retailer_product_id":"3283910",
    "retailer_front_image_url":"https://image.chewy.com/catalog/general/images/moe/068c47c8-f142-7b58-8000-77793d46711d._V1_.jpg",
    "retailer_front_image_sha256":"b24b7fa859358f940e23206bca38753990823de2c62dd3963699c00611525f08",
    "retailer_front_ocr":"BLUE Tastefuls Chicken Entree for Mature Cats Food for Mature Cats PATE NET WT. 3 oz.",
    "target_cache_key":"blue-buffalo-general-mills:blue buffalo blue tastefuls pat for mature cats tastefuls mature-chicken-pate",
    "target_product_name":"BLUE Tastefuls Paté for Mature Cats",
    "target_product_line":"BLUE Tastefuls Paté for Mature Cats",
    "target_flavor":"",
    "target_life_stage":"senior",
    "target_source_url":"https://www.bluebuffalo.com/wet-cat-food/tastefuls/mature-chicken-pate/",
    "target_image_url":"https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/tastefuls/share-product-image/tastefuls_cat_wet_mature_chicken_pate_share.png",
    "official_review_image_sha256":"ade2755422eeed93b090d900ae35ea59b4bc74a6d4229d0c4a3d1a5e96198028",
    "target_ingredient_count":35,
    "target_database_ingredient_hash":"38ab19207e75185ea9bfe6630f4acb346aef7f2a1be4e6f051e5566bb4ca883a",
    "target_raw_ingredient_hash":"e017bf9de8ac190efbc993c736fa67c2c1019965b2a4f179728fc4d34428f6a4",
    "presentation":"pate",
    "required_term_a":"chicken",
    "required_term_b":"mature",
    "required_term_c":"pate"
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
  official_review_image_sha256 TEXT,
  target_ingredient_count INTEGER,
  target_database_ingredient_hash TEXT,
  target_raw_ingredient_hash TEXT,
  presentation TEXT,
  required_term_a TEXT,
  required_term_b TEXT,
  required_term_c TEXT
);

DO $payload_guard$
BEGIN
  IF (SELECT count(*) FROM blue_tastefuls_front_payload) <> 6
     OR (SELECT count(DISTINCT alias_formula_key) FROM blue_tastefuls_front_payload) <> 6
     OR (SELECT count(DISTINCT retailer_source_url) FROM blue_tastefuls_front_payload) <> 6
     OR (SELECT count(DISTINCT target_cache_key) FROM blue_tastefuls_front_payload) <> 6
     OR (SELECT count(DISTINCT normalized_alias) FROM blue_tastefuls_front_payload) <> 6 THEN
    RAISE EXCEPTION 'BLUE Tastefuls payload count or uniqueness changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_tastefuls_front_payload payload
    WHERE payload.normalized_alias IS NULL
       OR payload.retailer_source_slug <> 'chewy-public-sitemap'
       OR payload.retailer_source_url NOT LIKE 'https://www.chewy.com/%'
       OR payload.target_source_url NOT LIKE 'https://www.bluebuffalo.com/wet-cat-food/tastefuls/%'
       OR payload.target_image_url NOT LIKE 'https://www.bluebuffalo.com/%'
       OR payload.target_life_stage NOT IN ('adult', 'kitten', 'senior')
       OR payload.presentation NOT IN ('pate', 'flaked in gravy')
       OR payload.target_ingredient_count < 5
       OR payload.retailer_front_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.official_review_image_sha256 !~ '^[a-f0-9]{64}$'
       OR payload.target_database_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.target_raw_ingredient_hash !~ '^[a-f0-9]{64}$'
       OR payload.retailer_front_ocr NOT ILIKE '%BLUE%'
       OR payload.retailer_front_ocr NOT ILIKE '%Tastefuls%'
       OR (payload.retailer_front_ocr NOT ILIKE '%Cat%'
           AND payload.retailer_front_ocr NOT ILIKE '%Kitten%')
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_a || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_b || '%'
       OR payload.retailer_front_ocr NOT ILIKE '%' || payload.required_term_c || '%'
       OR (payload.target_life_stage = 'kitten' AND payload.retailer_front_ocr NOT ILIKE '%kitten%')
       OR (payload.target_life_stage = 'senior' AND payload.retailer_front_ocr NOT ILIKE '%mature%')
       OR (payload.presentation = 'flaked in gravy'
           AND (payload.retailer_front_ocr NOT ILIKE '%flaked%'
             OR payload.retailer_front_ocr NOT ILIKE '%gravy%'))
  ) THEN
    RAISE EXCEPTION 'BLUE Tastefuls evidence crossed a protected boundary';
  END IF;
END
$payload_guard$;

CREATE TEMP TABLE blue_tastefuls_front_resolved
ON COMMIT DROP
AS
SELECT
  payload.*,
  formula.id AS formula_id,
  formula.formula_key AS canonical_formula_key,
  formula.identity_hash AS canonical_identity_hash,
  observation.id AS observation_id,
  observation.observed_at AS retailer_observed_at
FROM blue_tastefuls_front_payload payload
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
    AND exact.product_name ILIKE '%' || payload.required_term_a || '%'
    AND exact.product_name ILIKE '%' || payload.required_term_b || '%'
    AND exact.product_name ILIKE '%' || payload.required_term_c || '%'
    AND nullif(public.catalog_normalize_ingredient_evidence(exact.ingredient_text), '') IS NULL
    AND coalesce(exact.formula_version_provenance ->> 'version_status', '') <> 'source_versioned'
  ORDER BY exact.observed_at DESC, exact.created_at DESC, exact.id DESC
  LIMIT 1
) observation ON TRUE;

DO $resolution_guard$
BEGIN
  IF (SELECT count(*) FROM blue_tastefuls_front_resolved) <> 6 THEN
    RAISE EXCEPTION 'BLUE Tastefuls identities did not resolve uniquely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_tastefuls_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id <> resolved.formula_id
  ) THEN
    RAISE EXCEPTION 'BLUE Tastefuls formula alias collision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM blue_tastefuls_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key <> resolved.target_cache_key
  ) THEN
    RAISE EXCEPTION 'BLUE Tastefuls search alias collision';
  END IF;

  IF EXISTS (
    SELECT 1 FROM blue_tastefuls_front_resolved resolved
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
    RAISE EXCEPTION 'BLUE Tastefuls serving precondition changed';
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
    'source', 'blue_buffalo_tastefuls_front_package_reconciliation_20260805',
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
    'target_pet_type', 'cat',
    'target_life_stage', resolved.target_life_stage,
    'family', 'tastefuls',
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE,
    'reviewed_at', now()
  ),
  now()
FROM blue_tastefuls_front_resolved resolved
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
    'source', 'blue_buffalo_tastefuls_front_package_reconciliation_20260805',
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
    'target_pet_type', 'cat',
    'target_life_stage', resolved.target_life_stage,
    'presentation', resolved.presentation,
    'source_version_equivalence_required', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  TRUE,
  now()
FROM blue_tastefuls_front_resolved resolved
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
    'source', 'blue_buffalo_tastefuls_front_package_reconciliation_20260805',
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
    'target_pet_type', 'cat',
    'target_life_stage', resolved.target_life_stage,
    'family', 'tastefuls',
    'presentation', resolved.presentation,
    'package_size_is_sku_only', TRUE,
    'ingredient_or_image_rewrite', FALSE
  ),
  resolved.retailer_source_url,
  'retailer_identity',
  TRUE,
  resolved.retailer_observed_at,
  encode(digest(
    resolved.formula_id::TEXT || '|blue_buffalo_tastefuls_front_package|'
    || resolved.alias_formula_key || '|' || resolved.retailer_source_url
    || '|' || resolved.target_database_ingredient_hash,
    'sha256'
  ), 'hex')
FROM blue_tastefuls_front_resolved resolved
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
    FROM blue_tastefuls_front_resolved resolved
    JOIN public.catalog_formula_aliases alias USING (alias_formula_key)
    WHERE alias.formula_id = resolved.formula_id
      AND alias.metadata ->> 'source' =
          'blue_buffalo_tastefuls_front_package_reconciliation_20260805'
      AND (alias.metadata ->> 'retailer_identity_only')::BOOLEAN
      AND NOT (alias.metadata ->> 'retailer_ingredient_verification')::BOOLEAN
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE Tastefuls formula alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_tastefuls_front_resolved resolved
    JOIN public.catalog_verified_product_search_aliases alias
      ON alias.active AND alias.normalized_alias = resolved.normalized_alias
    WHERE alias.cache_key = resolved.target_cache_key
      AND alias.source_authority = 'retailer_identity'
      AND alias.provenance ->> 'source' =
          'blue_buffalo_tastefuls_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE Tastefuls search alias postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM blue_tastefuls_front_resolved resolved
    JOIN public.catalog_field_evidence evidence
      ON evidence.formula_id = resolved.formula_id
     AND evidence.observation_id = resolved.observation_id
     AND evidence.field_name = 'retailer_exact_front_package_identity_alias'
     AND evidence.source_url = resolved.retailer_source_url
    WHERE evidence.accepted
      AND evidence.source_authority = 'retailer_identity'
      AND evidence.field_value ->> 'source' =
          'blue_buffalo_tastefuls_front_package_reconciliation_20260805'
  ) <> 6 THEN
    RAISE EXCEPTION 'BLUE Tastefuls evidence postcondition failed';
  END IF;

  FOR v_row IN SELECT * FROM blue_tastefuls_front_resolved LOOP
    SELECT result.cache_key INTO v_top_cache_key
    FROM public.search_verified_products(v_row.retailer_title, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_row.target_cache_key THEN
      RAISE EXCEPTION
        'BLUE Tastefuls exact-title search expected %, got %',
        v_row.target_cache_key,
        v_top_cache_key;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.search_verified_products(v_row.retailer_title, 8) result
      WHERE lower(btrim(result.brand)) <> 'blue buffalo'
         OR result.pet_type <> 'cat'
         OR result.food_form <> 'wet'
    ) THEN
      RAISE EXCEPTION 'BLUE Tastefuls search crossed an identity boundary';
    END IF;
  END LOOP;
END
$postconditions$;
