DO $$
DECLARE
  v_formula_id BIGINT;
  v_run_id BIGINT;
  v_source35 TEXT := 'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-35-lb-bag-2457731';
  v_source5 TEXT := 'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-5-lb-bag-2457734';
  v_front TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457731?fmt=png&wid=1500&hei=1500';
  v_back TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457731_A1?fmt=png&wid=1500&hei=1500';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'tractor supply company|4health|shreds|dog|adult|dry|lamb and rice|';

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:tractor-supply:4health-shreds-lamb-rice:20260725',
    'tractor-supply-private-label-manual', 'retailer', 'verification',
    'completed', now(), now(), 2, 2, 2, 0, true,
    encode(
      digest(
        v_source35 || '|' || v_source5 ||
        '|749394379469|749394379483',
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB, NULL,
    jsonb_build_object(
      'manual_exact_evidence', true,
      'private_label_owner', 'Tractor Supply Company',
      'verified_gtins', jsonb_build_array('749394379469', '749394379483'),
      'pending_package_variant',
        jsonb_build_object(
          'package_size', '18 lb',
          'reason',
          'exact retailer page confirms size but official GTIN is not published or legible in reviewed official evidence'
        ),
      'search_results_are_discovery_only', true
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = now(),
    expected_count = 2,
    observed_count = 2,
    accepted_count = 2,
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
    v_run_id,
    v_formula_id,
    'tractor-supply-private-label-manual',
    x.external_id,
    x.source_url,
    'retailer_verified',
    x.gtin,
    'tractor supply company',
    '4health',
    f.product_name,
    f.product_line,
    f.pet_type,
    f.life_stage,
    f.food_form,
    f.flavor,
    f.diet_condition,
    x.package_size,
    f.ingredient_text,
    v_front,
    true,
    true,
    now(),
    encode(
      digest(
        f.formula_key || '|' || x.gtin || '|' || x.package_size || '|' ||
        f.ingredient_text || '|' || v_front,
        'sha256'
      ),
      'hex'
    ),
    'accepted',
    ARRAY[]::TEXT[],
    jsonb_build_object(
      'retailer_item_number', x.item_number,
      'back_label_url', v_back,
      'formula_version', 'current 2024 package artwork'
    )
  FROM public.catalog_formulas f
  CROSS JOIN (
    VALUES
      ('item:2457731', '2457731', '749394379469', '35 lb', v_source35),
      ('item:2457734', '2457734', '749394379483', '5 lb', v_source5)
  ) AS x(external_id, item_number, gtin, package_size, source_url)
  WHERE f.id = v_formula_id
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = excluded.raw_payload,
    observed_at = now();

  INSERT INTO public.catalog_product_evidence (
    cache_key, gtin, product_name, brand, pet_type, source, source_quality,
    source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status,
    raw_source_hash, content_hash, extractor_version, review_state,
    rejection_reason, evidence, updated_at
  )
  SELECT
    p.cache_key,
    '749394379469',
    p.product_name,
    p.brand,
    p.pet_type,
    'tractor-supply-private-label-manual',
    'retailer_verified',
    v_source35,
    v_source35,
    v_front,
    'retailer_verified',
    'retailer_verified',
    encode(digest(v_source35 || '|' || v_back, 'sha256'), 'hex'),
    encode(digest(p.ingredient_text || '|' || v_front, 'sha256'), 'hex'),
    '2026-07-25-manual-exact-evidence-v1',
    'promoted',
    NULL,
    jsonb_build_object(
      'verified_at', now(),
      'official_private_label_pdp', v_source35,
      'official_front_image_url', v_front,
      'official_back_label_url', v_back,
      'verified_gtins', jsonb_build_array('749394379469', '749394379483'),
      'unverified_published_size', '18 lb'
    ),
    now()
  FROM public.product_data p
  WHERE p.cache_key = '4health 4health shreds lamb rice'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_product_evidence e
      WHERE e.cache_key = p.cache_key
        AND e.source_url = v_source35
        AND e.content_hash =
          encode(digest(p.ingredient_text || '|' || v_front, 'sha256'), 'hex')
    );

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND validation_status = 'accepted'
  ) <> 2 THEN
    RAISE EXCEPTION '4health official retailer observations failed';
  END IF;
END
$$;
