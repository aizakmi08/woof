-- Correct the exact current NutriSource Senior Chicken & Rice identity to dry
-- food and move one stale Walmart dry-package SKU/observation off the distinct
-- Chicken & Rice Senior wet formula. The official page shows a bag, describes
-- probiotics coated on the outside of the kibble, publishes 4/12/26 lb bag
-- sizes, and carries the same 49-item ingredient statement already verified in
-- product_data. No ingredient or image evidence is copied between formulas.

DO $repair$
DECLARE
  v_formula_id CONSTANT BIGINT := 6726;
  v_wet_formula_id CONSTANT BIGINT := 6675;
  v_cache CONSTANT TEXT := 'nutrisource:073893265054';
  v_gtin CONSTANT TEXT := '073893265054';
  v_official_url CONSTANT TEXT :=
    'https://discovernutrisource.com/products/senior-chicken-and-rice-dog-food';
  v_walmart_url CONSTANT TEXT :=
    'https://www.walmart.com/ip/NutriSource-Senior-Chicken-and-Rice-Dry-Dog-Food-15-Lb/951980221';
  v_image CONSTANT TEXT :=
    'https://cdn.shopify.com/s/files/1/0051/2131/0794/files/NSDogGrain_Senior_1e3e20ce-bf9b-41e6-b148-c596c9d7c86a.png?v=1777998917';
  v_old_key CONSTANT TEXT :=
    'nutrisource|nutrisource|senior|dog|senior|unknown|chicken and rice|';
  v_new_key CONSTANT TEXT :=
    'nutrisource|nutrisource|senior|dog|senior|dry|chicken and rice|';
  v_ingredient_hash CONSTANT TEXT :=
    '26fa7fca3b12fb346877a594798b02b4820956b0df61dcbf4b8fba6b9160773b';
  v_top RECORD;
  v_wet_top RECORD;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id = v_formula_id
      AND formula.formula_key = v_old_key
      AND formula.identity_hash =
        '2e622e810f7438af0a52703e5316599e6b7b2cc9590ef2c2ee50be89c02faa90'
      AND formula.food_form = 'unknown'
      AND formula.source_url = v_official_url
      AND formula.front_image_url = v_image
      AND formula.pet_type = 'dog'
      AND formula.life_stage = 'senior'
      AND formula.flavor = 'chicken and rice'
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(formula.ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ),
        'sha256'
      ), 'hex') = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION 'NutriSource Senior dry formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key = v_cache
      AND serving.gtin = v_gtin
      AND serving.source_url = v_official_url
      AND serving.image_url = v_image
      AND serving.pet_type = 'dog'
      AND serving.life_stage = 'senior'
      AND serving.food_form IS NULL
      AND serving.ingredient_count = 49
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.is_complete_food
      AND serving.catalog_exclusion_reason IS NULL
      AND encode(digest(
        regexp_replace(
          lower(COALESCE(serving.ingredient_text, '')),
          '[^a-z0-9]+', '', 'g'
        ),
        'sha256'
      ), 'hex') = v_ingredient_hash
  ) THEN
    RAISE EXCEPTION 'NutriSource Senior dry serving precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    WHERE observation.id = 7163
      AND observation.formula_id = v_formula_id
      AND observation.source_url = v_official_url
      AND observation.gtin = v_gtin
      AND observation.food_form = 'unknown'
      AND observation.validation_status = 'accepted'
      AND observation.source_authority = 'manufacturer'
  ) OR (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.id IN (18286, 24886, 32461)
      AND observation.source_external_id = '951980221'
      AND observation.source_url = v_walmart_url
      AND observation.validation_status = 'accepted'
  ) <> 3 THEN
    RAISE EXCEPTION 'NutriSource Senior observation precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.id = 18046
      AND sku.formula_id = v_wet_formula_id
      AND sku.source_slug = 'walmart-public-sitemap'
      AND sku.source_external_id = '951980221'
      AND sku.source_url = v_walmart_url
      AND sku.active
  ) THEN
    RAISE EXCEPTION 'NutriSource stale cross-form SKU precondition changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    WHERE formula.id <> v_formula_id
      AND (
        formula.formula_key = v_new_key
        OR (
          formula.active
          AND formula.identity_hash = encode(
            digest(v_new_key, 'sha256'),
            'hex'
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'NutriSource corrected dry identity already exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.search_verified_products(
      'NutriSource Senior Chicken and Rice Dry Dog Food',
      5
    )
  ) THEN
    RAISE EXCEPTION 'NutriSource dry search precondition unexpectedly changed';
  END IF;

  UPDATE public.product_data
  SET food_form = 'dry',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'identity_correction',
            'unknown_to_dry_from_official_bag_kibble_and_package_evidence',
          'identity_corrected_at', NOW(),
          'identity_evidence', ARRAY[
            'official_front_bag_image',
            'official_kibble_description',
            'official_4_12_26_lb_package_sizes',
            'exact_walmart_dry_package_title'
          ]::TEXT[]
        ),
      updated_at = NOW()
  WHERE cache_key = v_cache;

  UPDATE public.catalog_formulas
  SET formula_key = v_new_key,
      identity_hash = encode(digest(v_new_key, 'sha256'), 'hex'),
      food_form = 'dry',
      protected_terms = ARRAY(
        SELECT DISTINCT term
        FROM unnest(
          COALESCE(protected_terms, ARRAY[]::TEXT[])
          || ARRAY[
            'NutriSource',
            'Senior',
            'Chicken',
            'Rice',
            'Dog',
            'Dry'
          ]::TEXT[]
        ) term
        ORDER BY term
      ),
      promoted_cache_key = v_cache,
      promoted_at = COALESCE(promoted_at, NOW()),
      complete_food_evidence =
        'Exact current official NutriSource page publishes the complete Senior Chicken & Rice dog formula, bag images, kibble description, full ingredients, and 4/12/26 lb package sizes.',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'identity_correction',
            'unknown_to_dry_from_official_bag_kibble_and_package_evidence',
          'identity_corrected_at', NOW(),
          'canonical_cache_key', v_cache,
          'package_gtin', v_gtin,
          'walmart_size_alias_source_url', v_walmart_url,
          'package_size_is_sku_only', TRUE
        ),
      updated_at = NOW()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET formula_id = v_formula_id,
      food_form = 'dry',
      formula_version_provenance =
        COALESCE(formula_version_provenance, '{}'::JSONB)
        || jsonb_build_object(
          'identity_corrected_at', NOW(),
          'corrected_food_form', 'dry',
          'canonical_formula_id', v_formula_id,
          'package_size_is_sku_only', TRUE
        )
  WHERE id IN (7163, 18286, 24886, 32461);

  UPDATE public.catalog_skus
  SET formula_id = v_formula_id,
      updated_at = NOW()
  WHERE id = 18046;

  INSERT INTO public.catalog_field_evidence (
    formula_id,
    observation_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  ) VALUES (
    v_formula_id,
    7163,
    'food_form',
    to_jsonb('dry'::TEXT),
    v_official_url,
    'manufacturer',
    TRUE,
    '2026-06-30T01:36:47.466Z'::TIMESTAMPTZ,
    encode(digest('dry', 'sha256'), 'hex')
  )
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET observation_id = EXCLUDED.observation_id,
                field_value = EXCLUDED.field_value,
                accepted = TRUE,
                observed_at = EXCLUDED.observed_at;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_formula_id
      AND formula.formula_key = v_new_key
      AND formula.identity_hash = encode(digest(v_new_key, 'sha256'), 'hex')
      AND formula.food_form = 'dry'
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND serving.cache_key = v_cache
      AND serving.gtin = v_gtin
      AND serving.food_form = 'dry'
      AND public.catalog_quality_state(
        serving.pet_type,
        serving.is_complete_food,
        serving.catalog_exclusion_reason,
        serving.ingredient_text,
        serving.ingredient_count,
        serving.ingredient_verification_status,
        serving.image_url,
        serving.image_verification_status,
        serving.source_url,
        serving.expires_at
      ) = 'verified_ready'
  ) THEN
    RAISE EXCEPTION 'NutriSource corrected dry formula is not verified-ready';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.id IN (7163, 18286, 24886, 32461)
      AND observation.formula_id = v_formula_id
      AND observation.food_form = 'dry'
  ) <> 4 OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.id = 18046
      AND sku.formula_id = v_formula_id
      AND sku.source_external_id = '951980221'
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.formula_id = v_wet_formula_id
      AND sku.source_url = v_walmart_url
  ) THEN
    RAISE EXCEPTION 'NutriSource cross-form observation/SKU repair failed';
  END IF;

  SELECT *
  INTO v_top
  FROM public.search_verified_products(
    'NutriSource Senior Chicken and Rice Dry Dog Food',
    5
  )
  LIMIT 1;

  SELECT *
  INTO v_wet_top
  FROM public.search_verified_products(
    'NutriSource Chicken Rice Senior Wet Dog Food',
    5
  )
  LIMIT 1;

  IF v_top.cache_key IS DISTINCT FROM v_cache
    OR v_top.food_form IS DISTINCT FROM 'dry'
    OR v_top.gtin IS DISTINCT FROM v_gtin
    OR v_wet_top.cache_key IS DISTINCT FROM 'nutrisource:073893041016'
    OR v_wet_top.food_form IS DISTINCT FROM 'wet'
  THEN
    RAISE EXCEPTION
      'NutriSource dry/wet exact search boundary failed: %, %, %, %, %',
      v_top.cache_key,
      v_top.food_form,
      v_top.gtin,
      v_wet_top.cache_key,
      v_wet_top.food_form;
  END IF;

  IF (
    SELECT count(*)
    FROM public.search_verified_products(v_gtin, 8)
  ) <> 1 THEN
    RAISE EXCEPTION 'NutriSource Senior dry barcode lookup regressed';
  END IF;
END;
$repair$;
