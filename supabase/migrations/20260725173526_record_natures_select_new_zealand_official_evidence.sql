DO $$
DECLARE
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_source_url TEXT := 'https://www.naturesselectpetfood.com/dryfood/selectnewzealandrecipe';
  v_front_image TEXT := 'https://images.squarespace-cdn.com/content/v1/60f7077195879f2b347f26a0/9b4d8257-a548-46c6-9380-e6f4385f2e26/NZ+2026+3D+Bag+PNG.png';
  v_overview_image TEXT := 'https://images.squarespace-cdn.com/content/v1/60f7077195879f2b347f26a0/5d7f4b9f-fca8-4ca6-9d9e-c05e3264705a/NZ+New+Bag+2026.png';
  v_cache_key TEXT := 'nature-s-select:nature s select nature s select premium pet products select new zealand lamb rice recipe mdash nature s select premium pet products dryfood selectnewzealandrecipe';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'nature''s select premium pet products|nature''s select|select|dog|adult|dry|new zealand lamb and rice recipe|';

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  )
  VALUES (
    'manual-exact-evidence:manual-search:natures-select:new-zealand-lamb-rice-dog:20260725',
    'natures-select-manufacturer-manual', 'manufacturer', 'verification',
    'completed', now(), now(), 1, 1, 1, 0, true,
    encode(digest(v_source_url || '|squarespace-item:60f87e04d8601742b3cfceb9|28lb', 'sha256'), 'hex'),
    '{}'::JSONB, NULL,
    jsonb_build_object(
      'review_key', 'manual-search:natures-select:new-zealand-lamb-rice-dog:20260725',
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'ingredient_evidence', 'exact official current PDP text with one logged structural close',
      'formula_version_note', 'Current official page and 2026 new-package assets reviewed; product is adult-maintenance dry dog food and the current bag is 28 lb.',
      'gtin_note', 'Manufacturer page and reviewed assets do not publish a GTIN; none inferred.'
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = now(),
    expected_count = 1,
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
    v_run_id, v_formula_id, 'natures-select-manufacturer-manual',
    'squarespace-item:60f87e04d8601742b3cfceb9:28lb',
    v_source_url, 'manufacturer', NULL, f.manufacturer, f.brand,
    f.product_name, f.product_line, f.pet_type, f.life_stage, f.food_form,
    f.flavor, f.diet_condition, '28 lb bag', f.ingredient_text,
    v_front_image, true, true, now(),
    encode(digest(f.formula_key || '|28lb|' || f.ingredient_text || '|' || v_front_image, 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'squarespace_item_id', '60f87e04d8601742b3cfceb9',
      'package_size', '28 lb bag',
      'official_front_image_url', v_front_image,
      'official_new_package_overview_url', v_overview_image,
      'published_gtin', NULL,
      'bounded_correction', jsonb_build_object(
        'from', 'Selenium Yeast, Vitamins',
        'to', 'Selenium Yeast), Vitamins',
        'reason', 'restore the omitted Minerals-group closing parenthesis without changing ingredient tokens'
      ),
      'source_typos_preserved', jsonb_build_array('Cooper Proteinate', 'Calcium lodate')
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
    product_name = 'Nature''s Select Select New Zealand Lamb & Rice Recipe Dry Dog Food',
    source = 'natures-select-manufacturer-manual',
    source_quality = 'manufacturer',
    source_url = v_source_url,
    ingredient_source_url = v_source_url,
    image_source_url = v_source_url,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    content_hash = encode(digest(v_source_url || '|' || v_front_image, 'sha256'), 'hex'),
    extractor_version = '2026-07-25-manual-exact-evidence-v1',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = jsonb_build_object(
      'verified_at', now(),
      'official_product_url', v_source_url,
      'official_front_image_url', v_front_image,
      'official_new_package_overview_url', v_overview_image,
      'package_size', '28 lb bag',
      'published_gtin', NULL,
      'ingredient_text_correction', 'one omitted Minerals-group closing parenthesis restored; all source ingredient tokens and spellings preserved'
    ),
    updated_at = now()
  WHERE cache_key = v_cache_key;

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND formula_id = v_formula_id
      AND validation_status = 'accepted'
  ) <> 1 THEN
    RAISE EXCEPTION 'Nature''s Select official observation recording failed';
  END IF;
END
$$;
