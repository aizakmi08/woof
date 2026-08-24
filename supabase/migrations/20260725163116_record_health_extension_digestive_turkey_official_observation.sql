DO $$
DECLARE
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_source_url TEXT := 'https://www.healthextension.com/products/digestive-support-turkey-sweet-potato-entree';
  v_front_image TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/1_fa4da632-73b3-493d-a207-8a06f20d9ca3.png?v=1702488434';
  v_side_label TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/DigestivesupportTurkey_SideofCan.png?v=1702488434';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'health extension|health extension|digestive support|dog|all life stages|wet|turkey and sweet potato entree|';

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  )
  VALUES (
    'manual-exact-evidence:manual-search:health-extension:digestive-support-turkey-sweet-potato-dog:20260725',
    'health-extension-manual-search', 'manufacturer', 'verification',
    'completed', now(), now(), 1, 1, 1, 0, true,
    encode(digest(v_source_url || '|810120990026|810120990057', 'sha256'), 'hex'),
    '{}'::JSONB, NULL,
    jsonb_build_object(
      'review_key', 'manual-search:health-extension:digestive-support-turkey-sweet-potato-dog:20260725',
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'ingredient_evidence', 'exact official side-of-can label',
      'formula_version_note', 'official PDP and label omit one closing vitamin-group parenthesis; one punctuation character restored without changing ingredients'
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = now(),
    observed_count = 1,
    accepted_count = 1,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    error_summary = NULL,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons, raw_payload
  )
  SELECT
    v_run_id, v_formula_id, 'health-extension-manual-search',
    'shopify-variant:43991322394862', v_source_url, 'manufacturer',
    '810120990057', 'health extension', 'health extension', f.product_name,
    f.product_line, f.pet_type, f.life_stage, f.food_form, f.flavor,
    f.diet_condition, '9 oz case of 12', f.ingredient_text, v_front_image,
    true, true, now(),
    encode(digest(f.formula_key || '|' || f.ingredient_text || '|' || v_front_image, 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'shopify_variant_id', '43991322394862',
      'case_gtin', '810120990057',
      'single_can_gtin', '810120990026',
      'front_image_url', v_front_image,
      'ingredient_label_url', v_side_label,
      'bounded_correction', jsonb_build_object(
        'from', 'Magnesium Sulfate, Choline Chloride',
        'to', 'Magnesium Sulfate), Choline Chloride',
        'reason', 'restore the official label vitamin-group closing parenthesis'
      )
    )
  FROM public.catalog_formulas f
  WHERE f.id = v_formula_id
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = excluded.raw_payload,
    observed_at = now();

  UPDATE public.catalog_product_evidence
  SET
    product_name = (
      SELECT product_name
      FROM public.product_data
      WHERE cache_key = 'health-extension:810120990057'
    ),
    source = 'health-extension-manufacturer-manual',
    source_quality = 'manufacturer',
    source_url = v_source_url,
    ingredient_source_url = v_side_label,
    image_source_url = v_source_url,
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    content_hash = encode(digest(v_source_url || '|' || v_side_label || '|' || v_front_image, 'sha256'), 'hex'),
    extractor_version = '2026-07-25-manual-exact-evidence-v1',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = jsonb_build_object(
      'verified_at', now(),
      'official_product_url', v_source_url,
      'ingredient_label_url', v_side_label,
      'official_front_image_url', v_front_image,
      'case_gtin', '810120990057',
      'single_can_gtin', '810120990026',
      'ingredient_text_correction', 'one missing closing parenthesis restored after Magnesium Sulfate'
    ),
    updated_at = now()
  WHERE cache_key = 'health-extension:810120990057';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND validation_status = 'accepted'
  ) <> 1 THEN
    RAISE EXCEPTION 'Health Extension official observation recording failed';
  END IF;
END
$$;
