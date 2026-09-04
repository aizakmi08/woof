-- Purina's current Beneful Healthy Puppy PDP and the official March 2025
-- ingredient PDF linked from that PDP describe materially different formulas.
-- Preserve both sources, but do not score GTIN 017800101639 until the
-- manufacturer binds the current package/GTIN to one exact formula version.
DO $$
DECLARE
  v_formula_id BIGINT;
  v_cache_key TEXT := 'nestle-purina-beneful:017800101639';
  v_gtin TEXT := '017800101639';
  v_page_url TEXT := 'https://www.purina.com/dogs/shop/beneful-healthy-puppy-chicken-dry-dog-food';
  v_pdf_url TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2025-03/4093_p409324_beneful_healthy_puppy_w_farm-raised_chicken_dry_dog_food_su1.pdf';
  v_resolution_count INTEGER;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'beneful|beneful|healthy dry with real farm raised|dog|puppy|dry|chicken|'
    AND verification_status = 'verified'
    AND active
    AND cardinality(ingredients) = 40
    AND ingredients[1:5] = ARRAY[
      'Chicken',
      'Chicken By-Product Meal',
      'Whole Grain Corn',
      'Soybean Meal',
      'Corn Gluten Meal'
    ]::TEXT[];

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_cache_key
      AND gtin = v_gtin
      AND ingredient_count = 40
      AND ingredients[1:5] = ARRAY[
        'Chicken',
        'Chicken By-Product Meal',
        'Whole Grain Corn',
        'Soybean Meal',
        'Corn Gluten Meal'
      ]::TEXT[]
      AND source_url = v_page_url
  ) THEN
    RAISE EXCEPTION 'Beneful Healthy Puppy current PDP serving evidence changed';
  END IF;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason =
      'official_manufacturer_formula_version_conflict_page_vs_linked_pdf',
    ingredient_verification_status = 'unverified',
    updated_at = now()
  WHERE cache_key = v_cache_key;

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Current official Purina PDP and its linked March 2025 label PDF materially disagree on the Beneful Healthy Puppy ingredient formula. Preserve both versions, but do not score or resolve GTIN 017800101639 until Purina supplies exact current package/GTIN formula evidence.',
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id = v_formula_id OR gtin = v_gtin;

  UPDATE public.catalog_observations
  SET
    validation_status = 'rejected',
    validation_reasons = ARRAY[
      'official_manufacturer_formula_version_conflict',
      'current_page_and_linked_label_pdf_disagree',
      'exact_current_gtin_formula_evidence_required'
    ]::TEXT[],
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
      'formula_version_conflict', jsonb_build_object(
        'detected_at', now(),
        'current_page_ingredient_count', 40,
        'linked_pdf_parsed_ingredient_count', 42,
        'current_page_first_five',
          jsonb_build_array(
            'Chicken', 'Chicken By-Product Meal', 'Whole Grain Corn',
            'Soybean Meal', 'Corn Gluten Meal'
          ),
        'linked_pdf_first_five',
          jsonb_build_array(
            'Chicken', 'whole grain corn', 'chicken by-product meal',
            'soybean meal', 'corn protein meal'
          ),
        'resolution_policy',
          'abstain_until_exact_current_package_gtin_proof'
      )
    )
  WHERE formula_id = v_formula_id OR gtin = v_gtin;

  UPDATE public.catalog_field_evidence
  SET accepted = false, observed_at = now()
  WHERE formula_id = v_formula_id
    AND field_name IN (
      'ingredient_text',
      'ingredient_pdf_url',
      'official_gtin',
      'exact_retailer_gtin'
    );

  INSERT INTO public.catalog_field_evidence(
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  ) VALUES (
    v_formula_id,
    NULL,
    'ingredient_formula_conflict',
    jsonb_build_object(
      'current_page_url', v_page_url,
      'linked_label_pdf_url', v_pdf_url,
      'current_page_ingredient_count', 40,
      'linked_pdf_parsed_ingredient_count', 42,
      'current_page_second_ingredient', 'Chicken By-Product Meal',
      'linked_pdf_second_ingredient', 'whole grain corn',
      'current_page_fifth_ingredient', 'Corn Gluten Meal',
      'linked_pdf_fifth_ingredient', 'corn protein meal',
      'requires_exact_current_gtin_mapping', true
    ),
    v_page_url,
    'manufacturer',
    false,
    now(),
    encode(
      digest(
        v_formula_id::TEXT || '|beneful-healthy-puppy-page-pdf-conflict|' ||
        v_page_url || '|' || v_pdf_url,
        'sha256'
      ),
      'hex'
    )
  )
  ON CONFLICT(formula_id, field_name, source_url, content_hash)
  DO UPDATE SET accepted = false, observed_at = excluded.observed_at;

  UPDATE public.catalog_verified_product_search_aliases
  SET
    active = false,
    provenance = provenance || jsonb_build_object(
      'deactivated_at', now(),
      'reason', 'official_manufacturer_formula_version_conflict'
    ),
    updated_at = now()
  WHERE cache_key = v_cache_key AND active;

  INSERT INTO public.catalog_acquisition_queue(
    gap_key,
    gap_type,
    status,
    priority_score,
    brand,
    product_name,
    cache_key,
    normalized_query,
    pet_type,
    product_source,
    source_quality,
    source_url,
    needs_product_record,
    needs_verified_ingredients,
    needs_verified_image,
    needs_pet_type,
    ready_rows,
    affected_product_count,
    demand_events,
    sample_metadata,
    acquisition_notes,
    resolved_at,
    resolution_reason,
    last_refreshed_at,
    updated_at
  ) VALUES (
    'product:beneful:healthy-puppy-chicken:official-page-pdf-formula-conflict',
    'product',
    'deferred',
    100,
    'beneful',
    'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
    v_cache_key,
    'beneful healthy puppy dry dog food real farm raised chicken',
    'dog',
    'nestle-purina-beneful',
    'manufacturer',
    v_page_url,
    true,
    true,
    false,
    false,
    0,
    1,
    0,
    jsonb_build_object(
      'official_source_conflict', true,
      'gtin', v_gtin,
      'current_page_url', v_page_url,
      'linked_label_pdf_url', v_pdf_url,
      'current_page_ingredient_count', 40,
      'linked_pdf_parsed_ingredient_count', 42,
      'fallback_required', true
    ),
    'Official source conflict: the live Purina PDP and its linked March 2025 label PDF disagree on ingredient order, ingredient terminology, and formula composition. GTIN 017800101639 safely abstains until Purina supplies exact current package/GTIN evidence.',
    NULL,
    NULL,
    now(),
    now()
  )
  ON CONFLICT(gap_key) DO UPDATE SET
    status = 'deferred',
    priority_score = excluded.priority_score,
    needs_product_record = true,
    needs_verified_ingredients = true,
    needs_verified_image = false,
    ready_rows = 0,
    affected_product_count = 1,
    sample_metadata = excluded.sample_metadata,
    acquisition_notes = excluded.acquisition_notes,
    resolved_at = NULL,
    resolution_reason = NULL,
    last_refreshed_at = now(),
    updated_at = now();

  SELECT
    (SELECT count(*)
     FROM public.search_verified_products(
       'Beneful Healthy Puppy Dry Dog Food with Real Farm-Raised Chicken',
       8
     )
     WHERE cache_key = v_cache_key)
    +
    (SELECT count(*)
     FROM public.resolve_verified_product_by_gtin(v_gtin, 8))
  INTO v_resolution_count;

  IF v_resolution_count <> 0
     OR EXISTS (
       SELECT 1
       FROM public.catalog_skus
       WHERE gtin = v_gtin AND active
     )
     OR EXISTS (
       SELECT 1
       FROM public.catalog_formulas
       WHERE id = v_formula_id
         AND (
           active
           OR verification_status <> 'quarantined'
           OR promoted_cache_key IS NOT NULL
         )
     )
     OR EXISTS (
       SELECT 1
       FROM public.product_data
       WHERE cache_key = v_cache_key
         AND (
           catalog_exclusion_reason IS NULL
           OR ingredient_verification_status <> 'unverified'
         )
     )
  THEN
    RAISE EXCEPTION
      'Beneful Healthy Puppy formula conflict still resolves as verified';
  END IF;
END
$$;
