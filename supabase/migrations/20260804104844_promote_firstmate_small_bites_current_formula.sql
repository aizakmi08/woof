-- Promote the exact current FirstMate Cage Free Duck Meal & Pumpkin Formula
-- Small Bites page. The official page's generic Open Graph image points to a
-- KASIKS lamb sibling, but its product-local WooCommerce variation payload
-- publishes the matching Small Bites image, two package UPCs, and package
-- sizes. The page also publishes the complete nested ingredient list.
--
-- Keep Small Bites separate from the regular-size kibble formula. Archive the
-- old bad-image serving artifact as rejected historical evidence, stage the
-- exact current evidence first, and create the ready serving row only through
-- the gated promotion function.

DO $migration$
DECLARE
  v_run_key CONSTANT TEXT :=
    'firstmate:bounded-exact-evidence:ad60a15424dbd643299cec4d';
  v_formula_key CONSTANT TEXT :=
    'firstmate pet foods|firstmate|cage free small bites|dog|all life stages|dry|duck meal and pumpkin formula|';
  v_identity_hash CONSTANT TEXT :=
    '76d18e2eeb461235bf254ba61a6aee7ad98eafe6829ee3a86dfcbae6f4f19e35';
  v_discovery_key CONSTANT TEXT :=
    'firstmate|firstmate|firstmate small bites cage free duck meal and pumpkin formula grain free dry dog food|dog|unknown|dry||';
  v_official_url CONSTANT TEXT :=
    'https://firstmate.com/product/cage-free-duck-meal-pumpkin-formula-small-bites/';
  v_chewy_url CONSTANT TEXT :=
    'https://www.chewy.com/firstmate-small-bites-cage-free-duck/dp/680662';
  v_front_image CONSTANT TEXT :=
    'https://firstmate.com/wp-content/uploads/2022/08/6.6KG_FMLID_DuckPumpkin-Left-600x600-No-BG.png';
  v_legacy_image CONSTANT TEXT :=
    'https://firstmate.com/wp-content/uploads/2022/09/kasiks-free-range-lamb-meal-formula-2.3kg-600x600-Recovered.png';
  v_legacy_cache CONSTANT TEXT :=
    'firstmate:firstmate cage free duck meal pumpkin formula small bites';
  v_observed_at CONSTANT TIMESTAMPTZ :=
    '2026-08-04T10:48:03.271Z'::TIMESTAMPTZ;
  v_ingredient_text CONSTANT TEXT := btrim($ingredients$
Duck Meal, Burbank Potato, Norkotah Potato, Pumpkin, Chicken Fat (preserved with mixed tocopherols), Brewer's Dried Yeast, Potassium Chloride, Choline Chloride, DL–Methionine, Blueberries, Raspberries, Cranberries, Threonine, Calcium Propionate (a preservative), Taurine, Minerals (Zinc Proteinate, Iron Proteinate, Manganese Proteinate, Copper Proteinate, Selenium Yeast, Calcium Iodate), Vitamins (Vitamin E Supplement, Niacin, Thiamine Mononitrate, Vitamin A Supplement, D-calcium pantothenate, Riboflavin, Pyridoxine Hydrochloride, Biotin, Vitamin B12 Supplement, Vitamin D3 Supplement, Folic Acid), Rosemary extract
$ingredients$);
  v_ingredients CONSTANT JSONB := $json$
[
  "Duck Meal",
  "Burbank Potato",
  "Norkotah Potato",
  "Pumpkin",
  "Chicken Fat (preserved with mixed tocopherols)",
  "Brewer's Dried Yeast",
  "Potassium Chloride",
  "Choline Chloride",
  "DL–Methionine",
  "Blueberries",
  "Raspberries",
  "Cranberries",
  "Threonine",
  "Calcium Propionate (a preservative)",
  "Taurine",
  "Zinc Proteinate",
  "Iron Proteinate",
  "Manganese Proteinate",
  "Copper Proteinate",
  "Selenium Yeast",
  "Calcium Iodate",
  "Vitamin E Supplement",
  "Niacin",
  "Thiamine Mononitrate",
  "Vitamin A Supplement",
  "D-calcium pantothenate",
  "Riboflavin",
  "Pyridoxine Hydrochloride",
  "Biotin",
  "Vitamin B12 Supplement",
  "Vitamin D3 Supplement",
  "Folic Acid",
  "Rosemary extract"
]
$json$::JSONB;
  v_run JSONB;
  v_common JSONB;
  v_payload JSONB;
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_discovery_formula_id BIGINT;
  v_discovery_identity_hash TEXT;
  v_cache_key TEXT;
  v_top TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_source_runs
    WHERE run_key = v_run_key
  ) THEN
    RAISE EXCEPTION 'FirstMate Small Bites exact-evidence run already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_formula_key
       OR (active AND identity_hash = v_identity_hash)
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin IN ('072318100949', '072318100932')
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites current formula or published UPC already exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_legacy_cache
      AND source_url = v_official_url
      AND product_name =
        'Cage Free Duck Meal & Pumpkin Formula Small Bites'
      AND brand = 'FirstMate'
      AND pet_type = 'dog'
      AND ingredient_count = 17
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'unverified'
      AND NOT is_complete_food
      AND catalog_exclusion_reason = 'official_primary_image_mismatch'
      AND image_url = v_legacy_image
  ) OR (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key = v_legacy_cache
  ) <> 1 THEN
    RAISE EXCEPTION
      'FirstMate Small Bites excluded legacy serving evidence changed';
  END IF;

  SELECT formula.id, formula.identity_hash
  INTO STRICT v_discovery_formula_id, v_discovery_identity_hash
  FROM public.catalog_formulas formula
  WHERE formula.formula_key = v_discovery_key
    AND formula.source_url = v_chewy_url
    AND lower(formula.brand) = 'firstmate'
    AND formula.pet_type = 'dog'
    AND formula.food_form = 'dry'
    AND formula.verification_status = 'discovered'
    AND formula.formula_evidence_tier = 'unverified'
    AND formula.active
    AND formula.promoted_cache_key IS NULL
    AND formula.ingredient_text = ''
    AND cardinality(formula.ingredients) = 0;

  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.formula_id = v_discovery_formula_id
      AND observation.source_slug = 'chewy-public-sitemap'
      AND observation.source_external_id = '680662'
      AND observation.source_url = v_chewy_url
      AND observation.pet_type = 'dog'
      AND observation.food_form = 'dry'
      AND observation.validation_status = 'accepted'
      AND observation.formula_evidence_tier = 'unverified'
      AND observation.ingredient_text = ''
  ) <> 1 OR (
    SELECT count(*)
    FROM public.catalog_skus sku
    WHERE sku.formula_id = v_discovery_formula_id
      AND sku.source_slug = 'chewy-public-sitemap'
      AND sku.source_external_id = '680662'
      AND sku.source_url = v_chewy_url
      AND sku.gtin IS NULL
  ) <> 1 OR EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence
    WHERE formula_id = v_discovery_formula_id
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites Chewy discovery evidence changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_discovery_key
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites discovery key already has an alias';
  END IF;

  v_run := jsonb_build_object(
    'run_key', v_run_key,
    'source_slug', 'firstmate',
    'source_type', 'manufacturer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', v_observed_at,
    'expected_count', 2,
    'pagination_complete', FALSE,
    'truncated', FALSE,
    'cap_reached', FALSE,
    'source_content_hash',
      'ad60a15424dbd643299cec4d06201ac1f1b3c9c6e02942d1640ff180bb842551',
    'checkpoint', jsonb_build_object(
      'feed_row_count', 2,
      'accepted_observation_count', 2,
      'canonical_formula_count', 1
    ),
    'metadata', jsonb_build_object(
      'brand', 'FirstMate',
      'manufacturer', 'FirstMate Pet Foods',
      'source_authority', 'manufacturer',
      'exact_formula_evidence', TRUE,
      'package_size_is_sku_only', TRUE,
      'official_inventory_full', FALSE,
      'bounded_exact_evidence', TRUE,
      'current_official_sku_cache_keys',
        jsonb_build_array('firstmate:072318100949', 'firstmate:072318100932'),
      'current_serving_cache_keys',
        jsonb_build_array('firstmate:072318100949', 'firstmate:072318100932')
    )
  );

  v_common := jsonb_build_object(
    'formula_key', v_formula_key,
    'identity_hash', v_identity_hash,
    'manufacturer', 'FirstMate Pet Foods',
    'brand', 'FirstMate',
    'product_name', 'Cage Free Duck Meal & Pumpkin Formula Small Bites',
    'product_line', 'Cage Free',
    'pet_type', 'dog',
    'life_stage', 'all life stages',
    'food_form', 'dry',
    'flavor', 'Duck Meal & Pumpkin Formula',
    'diet_condition', '',
    'source_slug', 'firstmate',
    'source_url', v_official_url,
    'source_authority', 'manufacturer',
    'ingredient_text', v_ingredient_text,
    'ingredients', v_ingredients,
    'front_image_url', v_front_image,
    'is_complete_food', TRUE,
    'available_in_us', TRUE,
    'protected_terms', jsonb_build_array(
      'FirstMate', 'Cage Free', 'Small Bites',
      'Duck Meal & Pumpkin Formula', 'dog', 'all life stages', 'dry'
    ),
    'observed_at', v_observed_at,
    'validation_status', 'accepted',
    'validation_reasons', '[]'::JSONB,
    'ingredient_verification_status', 'manufacturer',
    'image_verification_status', 'manufacturer',
    'coverage_tier', 'tier_2_us_retail'
  );

  v_payload := jsonb_build_array(
    v_common || jsonb_build_object(
      'source_external_id', 'firstmate:072318100949',
      'gtin', '072318100949',
      'package_size', '5.44 kg (12 lb)',
      'content_hash',
        '7542717ecbd61d82030aa612c714d7e132a9853dfe98052855c3e839739e3151',
      'raw_payload', jsonb_build_object(
        'cache_key', 'firstmate:072318100949',
        'ingredient_source_url', v_official_url,
        'image_source_url', v_official_url,
        'canonical_formula_identity', jsonb_build_object(
          'manufacturer', 'firstmate pet foods',
          'brand', 'firstmate',
          'product_line', 'cage free small bites',
          'pet_type', 'dog',
          'life_stage', 'all life stages',
          'food_form', 'dry',
          'flavor', 'duck meal and pumpkin formula',
          'diet_condition', ''
        ),
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE,
        'woocommerce_variation_id', 28021
      )
    ),
    v_common || jsonb_build_object(
      'source_external_id', 'firstmate:072318100932',
      'gtin', '072318100932',
      'package_size', '1.8 kg (4 lb)',
      'content_hash',
        'ab386b44f0e5d23590d929cb1f2c92c046a9b5301551ce08fb6da1c7c97823b7',
      'raw_payload', jsonb_build_object(
        'cache_key', 'firstmate:072318100932',
        'ingredient_source_url', v_official_url,
        'image_source_url', v_official_url,
        'canonical_formula_identity', jsonb_build_object(
          'manufacturer', 'firstmate pet foods',
          'brand', 'firstmate',
          'product_line', 'cage free small bites',
          'pet_type', 'dog',
          'life_stage', 'all life stages',
          'food_form', 'dry',
          'flavor', 'duck meal and pumpkin formula',
          'diet_condition', ''
        ),
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE,
        'woocommerce_variation_id', 28020
      )
    )
  );

  PERFORM public.stage_catalog_census_batch(v_run, v_payload);

  SELECT id
  INTO STRICT v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = v_run_key
    AND source_slug = 'firstmate'
    AND source_type = 'manufacturer'
    AND expected_count = 2
    AND observed_count = 2
    AND accepted_count = 2
    AND rejected_count = 0
    AND metadata->>'bounded_exact_evidence' = 'true'
    AND metadata->>'exact_formula_evidence' = 'true';

  SELECT DISTINCT formula.id
  INTO STRICT v_formula_id
  FROM public.catalog_observations observation
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE observation.run_id = v_run_id
    AND observation.validation_status = 'accepted'
    AND formula.formula_key = v_formula_key
    AND formula.identity_hash = v_identity_hash
    AND formula.source_url = v_official_url
    AND formula.brand = 'FirstMate'
    AND formula.pet_type = 'dog'
    AND formula.life_stage = 'all life stages'
    AND formula.food_form = 'dry'
    AND formula.flavor = 'Duck Meal & Pumpkin Formula'
    AND cardinality(formula.ingredients) = 33
    AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text)
        = public.catalog_normalize_ingredient_evidence(v_ingredient_text)
    AND formula.front_image_url = v_front_image;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND validation_status = 'accepted'
      AND gtin IN ('072318100949', '072318100932')
  ) <> 2 OR (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND source_slug = 'firstmate'
      AND active
      AND (
        (gtin = '072318100949' AND package_size = '5.44 kg (12 lb)')
        OR (gtin = '072318100932' AND package_size = '1.8 kg (4 lb)')
      )
  ) <> 2 THEN
    RAISE EXCEPTION
      'FirstMate Small Bites staging did not preserve both package UPCs';
  END IF;

  UPDATE public.catalog_formulas formula
  SET product_line = 'Cage Free Small Bites',
      complete_food_evidence =
        'Exact current official FirstMate product page publishes the complete Small Bites dog formula, full nested ingredient statement, AAFCO all-life-stages statement, two package UPCs, and matching product-local front image.',
      protected_terms = ARRAY[
        'FirstMate', 'Cage Free', 'Small Bites',
        'Duck Meal', 'Pumpkin', 'dog', 'all life stages', 'dry'
      ]::TEXT[],
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = jsonb_build_object(
        'version_status', 'manufacturer_current',
        'source', 'firstmate',
        'source_url', v_official_url,
        'captured_at', v_observed_at,
        'ingredient_text_hash',
          encode(digest(v_ingredient_text, 'sha256'), 'hex'),
        'front_image_url', v_front_image,
        'published_gtins',
          jsonb_build_array('072318100949', '072318100932'),
        'woocommerce_variation_ids', jsonb_build_array(28021, 28020),
        'generic_page_image_rejected', v_legacy_image,
        'exact_formula_evidence', TRUE,
        'package_size_is_sku_only', TRUE,
        'small_bites_identity_boundary', TRUE
      ),
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = TRUE,
      is_popular_brand = TRUE,
      absent_since = NULL,
      updated_at = NOW()
  WHERE formula.id = v_formula_id;

  UPDATE public.catalog_observations observation
  SET product_line = 'Cage Free Small Bites',
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = formula.formula_version_provenance
  FROM public.catalog_formulas formula
  WHERE observation.run_id = v_run_id
    AND observation.formula_id = v_formula_id
    AND formula.id = v_formula_id;

  UPDATE public.catalog_observations
  SET formula_id = v_formula_id
  WHERE formula_id = v_discovery_formula_id;

  UPDATE public.catalog_field_evidence
  SET formula_id = v_formula_id
  WHERE formula_id = v_discovery_formula_id;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key,
    formula_id,
    identity_hash,
    match_reason,
    source_url,
    metadata,
    updated_at
  ) VALUES (
    v_discovery_key,
    v_formula_id,
    v_discovery_identity_hash,
    'manual_review',
    v_chewy_url,
    jsonb_build_object(
      'reason',
        'Exact Chewy Small Bites Duck Meal & Pumpkin dry dog discovery reconciled to the exact current official FirstMate Small Bites formula.',
      'official_source_url', v_official_url,
      'retailer_source_url', v_chewy_url,
      'retailer_source_external_id', '680662',
      'consumer_brand_boundary', 'FirstMate',
      'species_boundary', 'dog',
      'food_form_boundary', 'dry',
      'small_bites_identity_boundary', TRUE,
      'recipe_boundary', 'Duck Meal & Pumpkin Formula',
      'package_size_is_sku_only', TRUE,
      'reviewed_at', NOW()
    ),
    NOW()
  );

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = FALSE,
      absent_since = COALESCE(absent_since, NOW()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Reconciled exact Chewy discovery identity to the current official FirstMate Small Bites Duck Meal & Pumpkin formula.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'duplicate_of_formula_id', v_formula_id,
          'canonical_source_url', v_official_url,
          'retailer_source_url', v_chewy_url,
          'small_bites_identity_boundary', TRUE,
          'reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_discovery_formula_id;

  INSERT INTO public.catalog_product_evidence (
    id,
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url,
    ingredient_source_url,
    image_source_url,
    ingredient_verification_status,
    image_verification_status,
    content_hash,
    extractor_version,
    review_state,
    rejection_reason,
    evidence,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    legacy.cache_key,
    legacy.gtin,
    legacy.product_name,
    legacy.brand,
    legacy.pet_type,
    legacy.source,
    legacy.source_quality,
    legacy.source_url,
    legacy.source_url,
    legacy.source_url,
    legacy.ingredient_verification_status,
    legacy.image_verification_status,
    encode(digest(concat_ws(
      '|', legacy.cache_key, legacy.ingredient_text,
      legacy.image_url, legacy.source_url
    ), 'sha256'), 'hex'),
    'firstmate-product-local-variation-v1',
    'rejected',
    'official_primary_image_mismatch_superseded_by_product_local_variation_evidence',
    jsonb_build_object(
      'archived_at', NOW(),
      'ingredient_text', legacy.ingredient_text,
      'ingredients', to_jsonb(legacy.ingredients),
      'front_image_url', legacy.image_url,
      'product_line', legacy.product_line,
      'life_stage', legacy.life_stage,
      'food_form', legacy.food_form,
      'flavor', legacy.flavor,
      'package_size', legacy.package_size,
      'prior_catalog_exclusion_reason', legacy.catalog_exclusion_reason,
      'corrected_formula_id', v_formula_id,
      'corrected_source_url', v_official_url,
      'corrected_front_image_url', v_front_image,
      'product_local_woocommerce_variation_evidence', TRUE,
      'formula_version_boundary_preserved', TRUE
    ),
    NOW(),
    NOW()
  FROM public.product_data legacy
  WHERE legacy.cache_key = v_legacy_cache
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_product_evidence archived
      WHERE archived.cache_key = legacy.cache_key
        AND archived.rejection_reason =
          'official_primary_image_mismatch_superseded_by_product_local_variation_evidence'
        AND archived.content_hash = encode(digest(concat_ws(
          '|', legacy.cache_key, legacy.ingredient_text,
          legacy.image_url, legacy.source_url
        ), 'sha256'), 'hex')
    );

  IF (
    SELECT count(*)
    FROM public.catalog_product_evidence
    WHERE cache_key = v_legacy_cache
      AND rejection_reason =
        'official_primary_image_mismatch_superseded_by_product_local_variation_evidence'
      AND evidence->>'front_image_url' = v_legacy_image
      AND evidence->>'corrected_front_image_url' = v_front_image
  ) <> 1 THEN
    RAISE EXCEPTION
      'FirstMate Small Bites rejected legacy evidence was not archived';
  END IF;

  PERFORM *
  FROM public.promote_catalog_formula_without_exact_evidence_reuse(
    v_formula_id
  );

  UPDATE public.catalog_skus
  SET formula_id = v_formula_id,
      updated_at = NOW()
  WHERE formula_id = v_discovery_formula_id;

  SELECT promoted_cache_key
  INTO STRICT v_cache_key
  FROM public.catalog_formulas
  WHERE id = v_formula_id
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key IS NOT NULL;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    WHERE search_alias.active
      AND search_alias.normalized_alias IN (
        public.normalize_verified_product_search_query(
          'FirstMate Cage Free Duck Meal & Pumpkin Formula Small Bites'
        ),
        public.normalize_verified_product_search_query(
          'FirstMate Small Bites Cage Free Duck Meal & Pumpkin Formula Grain Free Dry Dog Food'
        )
      )
      AND search_alias.cache_key <> v_cache_key
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites exact search alias belongs to another product';
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    updated_at
  )
  SELECT
    v_cache_key,
    alias.alias_text,
    public.normalize_verified_product_search_query(alias.alias_text),
    v_official_url,
    'manufacturer',
    v_observed_at,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'formula_id', v_formula_id,
      'product_line', 'Cage Free Small Bites',
      'species_boundary', 'dog',
      'food_form_boundary', 'dry',
      'recipe_boundary', 'Duck Meal & Pumpkin Formula',
      'small_bites_identity_boundary', TRUE,
      'captured_at', v_observed_at
    ),
    TRUE,
    NOW()
  FROM unnest(ARRAY[
    'FirstMate Cage Free Duck Meal & Pumpkin Formula Small Bites',
    'FirstMate Small Bites Cage Free Duck Meal & Pumpkin Formula Grain Free Dry Dog Food'
  ]::TEXT[]) AS alias(alias_text)
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key = v_cache_key
      AND serving.product_name =
        'Cage Free Duck Meal & Pumpkin Formula Small Bites'
      AND serving.brand = 'FirstMate'
      AND serving.product_line = 'Cage Free Small Bites'
      AND serving.flavor = 'Duck Meal & Pumpkin Formula'
      AND serving.pet_type = 'dog'
      AND serving.life_stage = 'all life stages'
      AND serving.food_form = 'dry'
      AND serving.ingredient_count = 33
      AND cardinality(serving.ingredients) = 33
      AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_ingredient_text
          )
      AND serving.image_url = v_front_image
      AND serving.source_url = v_official_url
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND serving.expires_at > NOW()
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites exact serving-row postcondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND gtin IN ('072318100949', '072318100932')
  ) <> 2 OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE gtin IN ('072318100949', '072318100932')
      AND formula_id <> v_formula_id
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites UPC/formula relationship is not unique';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('072318100949', 8)
  ) <> 1 OR (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('072318100949', 1)
  ) IS DISTINCT FROM v_cache_key OR (
    SELECT package_size
    FROM public.resolve_verified_product_by_gtin('072318100949', 1)
  ) IS DISTINCT FROM '5.44 kg (12 lb)' OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('072318100932', 8)
  ) <> 1 OR (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('072318100932', 1)
  ) IS DISTINCT FROM v_cache_key OR (
    SELECT package_size
    FROM public.resolve_verified_product_by_gtin('072318100932', 1)
  ) IS DISTINCT FROM '1.8 kg (4 lb)' THEN
    RAISE EXCEPTION
      'FirstMate Small Bites published UPC lookup failed';
  END IF;

  SELECT cache_key
  INTO v_top
  FROM public.search_verified_products(
    'FirstMate Cage Free Duck Meal & Pumpkin Formula Small Bites',
    1
  );

  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'FirstMate Small Bites exact search is not rank one: % / %',
      v_top,
      v_cache_key;
  END IF;

  SELECT cache_key
  INTO v_top
  FROM public.search_verified_products(
    'FirstMate Small Bites Cage Free Duck Meal & Pumpkin Formula Grain Free Dry Dog Food',
    1
  );

  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION
      'FirstMate Small Bites Chewy-title search is not rank one: % / %',
      v_top,
      v_cache_key;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key = v_discovery_key
      AND formula_id = v_formula_id
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites discovery alias postcondition failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = v_discovery_formula_id
      AND (active OR verification_status <> 'quarantined')
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites discovery formula quarantine failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_discovery_formula_id
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites discovery observations were not reconciled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_discovery_formula_id
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites discovery SKUs were not reconciled';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_legacy_cache
       OR (
         source_url = v_official_url
         AND image_url = v_legacy_image
       )
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites bad-image serving artifact survived promotion';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_product_evidence
    WHERE cache_key = v_legacy_cache
      AND rejection_reason =
        'official_primary_image_mismatch_superseded_by_product_local_variation_evidence'
      AND evidence->>'front_image_url' = v_legacy_image
      AND evidence->>'corrected_front_image_url' = v_front_image
  ) THEN
    RAISE EXCEPTION
      'FirstMate Small Bites rejected legacy evidence archive was lost';
  END IF;
END;
$migration$;
