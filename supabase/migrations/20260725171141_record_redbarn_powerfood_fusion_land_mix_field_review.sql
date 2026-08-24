DO $$
DECLARE
  v_formula_id BIGINT;
  v_corrected TEXT;
  v_original TEXT;
  v_source_url TEXT := 'https://www.redbarn.com/products/powerfood-fusion-whole-grain-land-mix-recipe';
  v_side_label TEXT := 'https://www.redbarn.com/cdn/shop/files/120082_KibbleFusion_WGLandBeef_3.5lb_Side_CMYK300dpi.jpg?v=1755629058';
  v_front_image TEXT := 'https://cdn.shopify.com/s/files/1/0508/4767/8644/files/RBPP-1127-0a_-_120082_KibbleFusion_WGLandBeef_3.5lb_-_Bowl_Front.jpg?v=1779111533';
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_corrected
  FROM public.catalog_formulas
  WHERE formula_key = 'redbarn|redbarn|powerfood fusion|dog|adult|dry|whole grain land mix|';

  v_original := replace(
    replace(
      v_corrected,
      'Vitamin B7 (Biotin), Vitamin D3 Supplement',
      'Vitamin B7 (Biotin) Vitamin D3 Supplement'
    ),
    'Vitamin B9 (Folic Acid)), Lactic Acid',
    'Vitamin B9 (Folic Acid), Lactic Acid'
  );

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula_id, NULL, x.field_name, to_jsonb(x.field_value), x.source_url,
    'manufacturer', true, now(),
    encode(digest(x.field_name || '|' || x.field_value || '|' || x.source_url, 'sha256'), 'hex')
  FROM (
    VALUES
      ('ingredient_text', v_corrected, v_side_label),
      ('ingredient_original_label_text', v_original, v_side_label),
      ('front_image_url', v_front_image, v_source_url),
      (
        'complete_food_evidence',
        'Formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
        v_side_label
      ),
      ('package_gtin', '785184120828', v_source_url),
      ('package_gtin', '785184120729', v_source_url),
      ('package_gtin', '785184920824', v_source_url)
  ) AS x(field_name, field_value, source_url)
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = true, observed_at = excluded.observed_at;

  INSERT INTO public.catalog_manual_evidence_reviews (
    review_key, target_formula_key, corrected_formula_key, brand, product_name,
    search_query, discovery_urls, authoritative_source_url,
    authoritative_source_type, expected_identity, resolved_identity,
    evidence_status, quarantine_reason, authoritative_content_hash,
    ingredient_text_hash, front_image_url_hash, observed_at, formula_id,
    promoted_cache_key, attempt_count, review_notes, ingredient_evidence_url,
    ingredient_evidence_mode, ingredient_original_text_hash,
    ingredient_corrections, updated_at
  )
  SELECT
    'manual-search:redbarn:powerfood-fusion-whole-grain-land-mix-dog:20260725',
    f.formula_key,
    f.formula_key,
    'Redbarn',
    f.product_name,
    'Redbarn Powerfood Fusion Whole Grain Land Mix ingredients',
    jsonb_build_array(v_source_url, v_side_label),
    v_source_url,
    'manufacturer_label',
    jsonb_build_object(
      'brand', 'Redbarn',
      'product_line', 'Powerfood Fusion',
      'pet_type', 'dog',
      'life_stage', 'adult',
      'food_form', 'dry',
      'flavor', 'Whole Grain Land Mix'
    ),
    jsonb_build_object(
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'package_gtins', jsonb_build_array('785184120828', '785184120729', '785184920824')
    ),
    'promoted',
    NULL,
    encode(digest(v_source_url || '|' || v_side_label || '|' || v_front_image, 'sha256'), 'hex'),
    encode(digest(v_corrected, 'sha256'), 'hex'),
    encode(digest(v_front_image, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Official PDP and exact package side label reviewed. One missing comma and one missing vitamin-group closing parenthesis were restored; no ingredient words or order changed. AAFCO label proves adult maintenance, replacing incorrect senior-only metadata.',
    v_side_label,
    'bounded_source_text_correction',
    encode(digest(v_original, 'sha256'), 'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'from', 'Vitamin B7 (Biotin) Vitamin D3 Supplement',
        'to', 'Vitamin B7 (Biotin), Vitamin D3 Supplement',
        'reason', 'restore omitted delimiter between two label-declared vitamins'
      ),
      jsonb_build_object(
        'from', 'Vitamin B9 (Folic Acid), Lactic Acid',
        'to', 'Vitamin B9 (Folic Acid)), Lactic Acid',
        'reason', 'restore omitted vitamin-group closing parenthesis'
      )
    ),
    now()
  FROM public.catalog_formulas f
  WHERE f.id = v_formula_id
  ON CONFLICT (review_key) DO UPDATE
  SET
    target_formula_key = excluded.target_formula_key,
    corrected_formula_key = excluded.corrected_formula_key,
    product_name = excluded.product_name,
    authoritative_source_url = excluded.authoritative_source_url,
    authoritative_source_type = excluded.authoritative_source_type,
    expected_identity = excluded.expected_identity,
    resolved_identity = excluded.resolved_identity,
    evidence_status = 'promoted',
    quarantine_reason = NULL,
    authoritative_content_hash = excluded.authoritative_content_hash,
    ingredient_text_hash = excluded.ingredient_text_hash,
    front_image_url_hash = excluded.front_image_url_hash,
    observed_at = excluded.observed_at,
    formula_id = excluded.formula_id,
    promoted_cache_key = excluded.promoted_cache_key,
    attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
    review_notes = excluded.review_notes,
    ingredient_evidence_url = excluded.ingredient_evidence_url,
    ingredient_evidence_mode = excluded.ingredient_evidence_mode,
    ingredient_original_text_hash = excluded.ingredient_original_text_hash,
    ingredient_corrections = excluded.ingredient_corrections,
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.catalog_field_evidence
    WHERE formula_id = v_formula_id
      AND accepted
      AND source_authority = 'manufacturer'
  ) < 7 THEN
    RAISE EXCEPTION 'Redbarn field evidence recording failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_manual_evidence_reviews
    WHERE review_key = 'manual-search:redbarn:powerfood-fusion-whole-grain-land-mix-dog:20260725'
      AND evidence_status = 'promoted'
      AND ingredient_evidence_mode = 'bounded_source_text_correction'
      AND jsonb_array_length(ingredient_corrections) = 2
  ) <> 1 THEN
    RAISE EXCEPTION 'Redbarn manual evidence review recording failed';
  END IF;
END
$$;
