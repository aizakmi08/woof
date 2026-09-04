DO $$
DECLARE
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_source_url TEXT := 'https://www.redbarn.com/products/powerfood-fusion-whole-grain-land-mix-recipe';
  v_side_label TEXT := 'https://www.redbarn.com/cdn/shop/files/120082_KibbleFusion_WGLandBeef_3.5lb_Side_CMYK300dpi.jpg?v=1755629058';
  v_front_image TEXT := 'https://cdn.shopify.com/s/files/1/0508/4767/8644/files/RBPP-1127-0a_-_120082_KibbleFusion_WGLandBeef_3.5lb_-_Bowl_Front.jpg?v=1779111533';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'redbarn|redbarn|powerfood fusion|dog|adult|dry|whole grain land mix|';

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  )
  VALUES (
    'manual-exact-evidence:manual-search:redbarn:powerfood-fusion-whole-grain-land-mix-dog:20260725',
    'redbarn-manufacturer-manual', 'manufacturer', 'verification',
    'completed', now(), now(), 3, 3, 3, 0, true,
    encode(digest(v_source_url || '|785184120828|785184120729|785184920824', 'sha256'), 'hex'),
    '{}'::JSONB, NULL,
    jsonb_build_object(
      'review_key', 'manual-search:redbarn:powerfood-fusion-whole-grain-land-mix-dog:20260725',
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'ingredient_evidence', 'exact official package side label',
      'formula_version_note', 'Official label has one missing comma and one missing vitamin-group closing parenthesis; punctuation restored without changing ingredient tokens.'
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = now(),
    expected_count = 3,
    observed_count = 3,
    accepted_count = 3,
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
    v_run_id, v_formula_id, 'redbarn-manufacturer-manual',
    x.source_external_id, v_source_url, 'manufacturer',
    x.gtin, 'redbarn', 'redbarn', f.product_name, f.product_line,
    f.pet_type, f.life_stage, f.food_form, f.flavor, f.diet_condition,
    x.package_size, f.ingredient_text, x.front_image_url, true, true, now(),
    encode(digest(f.formula_key || '|' || x.gtin || '|' || f.ingredient_text || '|' || x.front_image_url, 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'shopify_variant_id', replace(x.source_external_id, 'shopify-variant:', ''),
      'gtin', x.gtin,
      'package_size', x.package_size,
      'official_front_image_url', x.front_image_url,
      'ingredient_label_url', v_side_label,
      'bounded_corrections', jsonb_build_array(
        jsonb_build_object(
          'from', 'Vitamin B7 (Biotin) Vitamin D3 Supplement',
          'to', 'Vitamin B7 (Biotin), Vitamin D3 Supplement',
          'reason', 'restore omitted delimiter between distinct vitamins'
        ),
        jsonb_build_object(
          'from', 'Vitamin B9 (Folic Acid), Lactic Acid',
          'to', 'Vitamin B9 (Folic Acid)), Lactic Acid',
          'reason', 'restore omitted vitamin-group closing parenthesis'
        )
      )
    )
  FROM public.catalog_formulas f
  CROSS JOIN (
    VALUES
      (
        'shopify-variant:44007771898036',
        '785184120828',
        '3.5 lb bag',
        'https://cdn.shopify.com/s/files/1/0508/4767/8644/files/RBPP-1127-0a_-_120082_KibbleFusion_WGLandBeef_3.5lb_-_Bowl_Front.jpg?v=1779111533'
      ),
      (
        'shopify-variant:44007771930804',
        '785184120729',
        '20 lb bag',
        'https://www.redbarn.com/cdn/shop/files/RBPP-1127-0a_-_120072_KibbleFusion_WGLandBeef_20lb_-_Bowl_Front.jpg?v=1779111542'
      ),
      (
        'shopify-variant:44008493416628',
        '785184920824',
        '3.5 lb bag case of 4',
        'https://www.redbarn.com/cdn/shop/files/RBPP-1127-0a_-_120082_KibbleFusion_WGLandBeef_3.5lb_-_Overhead.jpg?v=1779111539'
      )
  ) AS x(source_external_id, gtin, package_size, front_image_url)
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
    product_name = 'Redbarn Powerfood Fusion Whole Grain Land Mix Recipe Dry Dog Food',
    source = 'redbarn-manufacturer-manual',
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
      'package_gtins', jsonb_build_array('785184120828', '785184120729', '785184920824'),
      'ingredient_text_corrections', jsonb_build_array(
        'one comma restored between Vitamin B7 (Biotin) and Vitamin D3 Supplement',
        'one vitamin-group closing parenthesis restored after Vitamin B9 (Folic Acid)'
      )
    ),
    updated_at = now()
  WHERE cache_key = 'redbarn-pet-products:785184120828';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND validation_status = 'accepted'
  ) <> 3 THEN
    RAISE EXCEPTION 'Redbarn official observations recording failed';
  END IF;
END
$$;
