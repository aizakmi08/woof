-- Make the current smallbatch Beef Patties package presentation searchable
-- without creating a second formula. The exact current official Patties and
-- Sliders pages publish the same improved ingredient formula. The obsolete
-- /-test page has a different historical ingredient statement and remains
-- preserved in source observations, never merged into the current version.

DO $migration$
DECLARE
  v_formula_key CONSTANT TEXT :=
    'smallbatch|smallbatch|frozen raw|dog|all life stages|frozen|beef|';
  v_cache_key CONSTANT TEXT :=
    'smallbatch-pets:smallbatch frozen raw beef sliders for dogs products frozen-raw-beef-sliders';
  v_slider_url CONSTANT TEXT :=
    'https://smallbatchpets.com/products/frozen-raw-beef-sliders';
  v_patty_url CONSTANT TEXT :=
    'https://smallbatchpets.com/products/frozen-raw-beef-sliders-for-dogs';
  v_test_url CONSTANT TEXT :=
    'https://smallbatchpets.com/products/frozen-raw-beef-sliders-for-dogs-test';
  v_slider_image CONSTANT TEXT :=
    'https://smallbatchpets.com/cdn/shop/files/Beef-Frozen-Raw-Sliders-3lb-MAIN_450x450.png?v=1772044354';
  v_patty_image CONSTANT TEXT :=
    'https://smallbatchpets.com/cdn/shop/files/Beef-Frozen-Raw-Patties-3lb-MAIN_ad66a961-f017-4283-9cc5-a4bab8532a4d_450x450.png?v=1784834343';
  v_current_hash CONSTANT TEXT :=
    'd6555a1ab0e9fb25c719b8ae83ff0de81323ec3e2af87507de43ff407b7d53cf';
  v_historical_hash CONSTANT TEXT :=
    '284e08d51e5b4448c6104407a5d7dffb6eb9cf706b1d01ba970aef332b8ab4d1';
  v_formula_id BIGINT;
  v_top TEXT;
BEGIN
  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = v_formula_key
    AND brand = 'smallbatch'
    AND pet_type = 'dog'
    AND life_stage = 'all life stages'
    AND food_form = 'frozen'
    AND flavor = 'beef'
    AND verification_status = 'verified'
    AND active
    AND formula_evidence_tier = 'manufacturer_current_exact'
    AND promoted_cache_key = v_cache_key
    AND source_url = v_slider_url
    AND front_image_url = v_slider_image
    AND cardinality(ingredients) = 21
    AND encode(digest(
      public.catalog_normalize_ingredient_evidence(ingredient_text),
      'sha256'
    ), 'hex') = v_current_hash;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key = v_cache_key
      AND source_url = v_slider_url
      AND image_url = v_slider_image
      AND product_name = 'Frozen Raw Beef Sliders for Dogs'
      AND brand = 'smallbatch'
      AND pet_type = 'dog'
      AND life_stage = 'all life stages'
      AND food_form = 'frozen'
      AND flavor = 'Beef'
      AND package_size = '3 lb sliders'
      AND ingredient_count = 21
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_current_hash
  ) THEN
    RAISE EXCEPTION 'smallbatch Beef canonical serving changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.product_data
    WHERE cache_key =
      'smallbatch-pets:smallbatch frozen raw beef patties for dogs 6 lb patties products frozen-raw-beef-sliders-for-dogs'
      AND source_url = v_patty_url
      AND image_url = v_patty_image
      AND product_name = 'Frozen Raw Beef Patties for Dogs'
      AND package_size = '6 lb patties'
      AND NOT is_complete_food
      AND catalog_exclusion_reason = 'duplicate_canonical_formula_sku_variant'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_current_hash
  ) THEN
    RAISE EXCEPTION 'smallbatch current Beef Patties SKU serving changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE formula_id = v_formula_id
      AND source_url = v_patty_url
      AND product_name = 'Frozen Raw Beef Patties for Dogs'
      AND validation_status = 'accepted'
      AND formula_evidence_tier = 'manufacturer_current_exact'
      AND front_image_url = v_patty_image
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_current_hash
  ) <> 1 OR (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE formula_id = v_formula_id
      AND source_url = v_test_url
      AND product_name = 'Frozen Raw Beef Patties for Dogs'
      AND validation_status = 'accepted'
      AND encode(digest(
        public.catalog_normalize_ingredient_evidence(ingredient_text),
        'sha256'
      ), 'hex') = v_historical_hash
  ) <> 1 THEN
    RAISE EXCEPTION 'smallbatch current/historical Beef evidence changed';
  END IF;

  IF v_current_hash = v_historical_hash THEN
    RAISE EXCEPTION 'smallbatch historical/current formula boundary collapsed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND source_url = v_patty_url
      AND active
      AND package_size IN ('6 lb patties', '18 lb patties')
  ) <> 2 THEN
    RAISE EXCEPTION 'smallbatch Beef Patties package SKUs changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases search_alias
    WHERE search_alias.normalized_alias =
        public.normalize_verified_product_search_query(
          'smallbatch Frozen Raw Beef Patties for Dogs'
        )
      AND search_alias.active
      AND search_alias.cache_key <> v_cache_key
  ) THEN
    RAISE EXCEPTION 'smallbatch Beef Patties search alias conflict';
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
    v_patty_url,
    'manufacturer',
    '2026-07-26T03:22:33.706Z'::TIMESTAMPTZ,
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'manufacturer_current', TRUE,
      'formula_id', v_formula_id,
      'canonical_formula_key', v_formula_key,
      'recipe_boundary', 'Beef',
      'species_boundary', 'dog',
      'food_form_boundary', 'frozen',
      'package_form', 'patties',
      'package_size_is_sku_only', TRUE,
      'current_ingredient_hash', v_current_hash,
      'historical_test_route_ingredient_hash', v_historical_hash,
      'historical_test_route_excluded', TRUE,
      'captured_at', '2026-07-26T03:22:33.706Z'
    ),
    TRUE,
    NOW()
  FROM (VALUES
    ('smallbatch Frozen Raw Beef Patties for Dogs')
  ) alias(alias_text)
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      updated_at = NOW();

  UPDATE public.catalog_formulas
  SET formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB) ||
        jsonb_build_object(
          'current_package_variants', jsonb_build_array(
            jsonb_build_object(
              'package_form', 'sliders',
              'package_size', '3 lb sliders',
              'source_url', v_slider_url,
              'front_image_url', v_slider_image
            ),
            jsonb_build_object(
              'package_form', 'patties',
              'package_sizes', jsonb_build_array(
                '6 lb patties', '18 lb patties'
              ),
              'source_url', v_patty_url,
              'front_image_url', v_patty_image
            )
          ),
          'historical_test_route', jsonb_build_object(
            'source_url', v_test_url,
            'ingredient_text_hash', v_historical_hash,
            'current_formula_equivalence', FALSE,
            'serving_policy', 'preserve_observation_do_not_auto_select'
          ),
          'package_size_is_sku_only', TRUE,
          'package_variant_search_reconciled_at', NOW()
        ),
      updated_at = NOW()
  WHERE id = v_formula_id;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'smallbatch Frozen Raw Beef Patties for Dogs', 1
  );
  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'smallbatch Beef Patties exact search failed: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'smallbatch Frozen Raw Beef Patties for Dogs 6 lb', 1
  );
  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'smallbatch Beef Patties 6 lb search failed: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'smallbatch Frozen Raw Beef Patties for Dogs 18 lb', 1
  );
  IF v_top IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'smallbatch Beef Patties 18 lb search failed: %', v_top;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_verified_product_search_aliases
    WHERE active
      AND source_url = v_test_url
  ) THEN
    RAISE EXCEPTION 'smallbatch obsolete test route became searchable';
  END IF;
END;
$migration$;
