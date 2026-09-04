DO $$
DECLARE
  v_run_id BIGINT;
  v_formula_id BIGINT;
  v_source_url TEXT := 'https://natureslogic.com/dog-products/pure-naturals-grain-free-chicken-recipe/';
  v_front_image TEXT := 'https://natureslogic.com/wp-content/uploads/2025/09/1_FRONT_24lb-3.png';
  v_back_label TEXT := 'https://natureslogic.com/wp-content/uploads/2025/09/5_BACK_12-24lb-3.png';
  v_cache_key TEXT := 'natures-logic:nature s logic distinction canine fowl recipe grain free chicken dog foodpure naturals grain-free chicken recipe';
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'mid america pet food|nature''s logic|pure naturals|dog|all life stages|dry|grain free chicken recipe|';

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  )
  VALUES (
    'manual-exact-evidence:manual-search:natures-logic:pure-naturals-grain-free-chicken-dog:20260725',
    'natures-logic-manufacturer-manual', 'manufacturer', 'verification',
    'completed', now(), now(), 1, 1, 1, 0, true,
    encode(digest(v_source_url || '|850013992768', 'sha256'), 'hex'),
    '{}'::JSONB, NULL,
    jsonb_build_object(
      'review_key', 'manual-search:natures-logic:pure-naturals-grain-free-chicken-dog:20260725',
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'ingredient_evidence', 'human-reviewed exact official package back label',
      'formula_version_note', 'The current PDP ingredient text contained a CMS typo and an omitted closing parenthesis; the exact current package label was transcribed without borrowing from any sibling formula.'
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
    v_run_id, v_formula_id, 'natures-logic-manufacturer-manual',
    'official-package:24lb:850013992768', v_source_url, 'manufacturer',
    '850013992768', f.manufacturer, f.brand, f.product_name, f.product_line,
    f.pet_type, f.life_stage, f.food_form, f.flavor, f.diet_condition,
    '24 lb bag', f.ingredient_text, v_front_image, true, true, now(),
    encode(digest(f.formula_key || '|850013992768|' || f.ingredient_text || '|' || v_front_image, 'sha256'), 'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'gtin', '850013992768',
      'package_size', '24 lb bag',
      'official_front_image_url', v_front_image,
      'official_back_label_url', v_back_label,
      'ingredient_evidence_mode', 'authoritative_label_transcription',
      'pdp_cms_correction', jsonb_build_object(
        'from', 'Chicken (Source of Methionine-cycstine, Chicken Meal',
        'to', 'Chicken (Source of Methionine-cystine), Chicken Meal',
        'reason', 'exact current package label corrects the PDP typo and restores the omitted closing parenthesis'
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
    product_name = 'Nature''s Logic PURE NATURALS Grain-Free Chicken Recipe Dry Dog Food',
    source = 'natures-logic-manufacturer-manual',
    source_quality = 'manufacturer',
    source_url = v_source_url,
    ingredient_source_url = v_back_label,
    image_source_url = v_source_url,
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    content_hash = encode(digest(v_source_url || '|' || v_back_label || '|' || v_front_image, 'sha256'), 'hex'),
    extractor_version = '2026-07-25-manual-exact-evidence-v1',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = jsonb_build_object(
      'verified_at', now(),
      'official_product_url', v_source_url,
      'official_back_label_url', v_back_label,
      'official_front_image_url', v_front_image,
      'package_gtin', '850013992768',
      'ingredient_evidence_mode', 'human-reviewed exact package-label transcription',
      'pdp_cms_issue', 'cycstine typo and omitted close were not copied into serving ingredients'
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
    RAISE EXCEPTION 'Nature''s Logic official observation recording failed';
  END IF;
END
$$;
