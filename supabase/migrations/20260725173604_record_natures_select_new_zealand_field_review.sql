DO $$
DECLARE
  v_formula_id BIGINT;
  v_corrected TEXT;
  v_original TEXT;
  v_source_url TEXT := 'https://www.naturesselectpetfood.com/dryfood/selectnewzealandrecipe';
  v_front_image TEXT := 'https://images.squarespace-cdn.com/content/v1/60f7077195879f2b347f26a0/9b4d8257-a548-46c6-9380-e6f4385f2e26/NZ+2026+3D+Bag+PNG.png';
  v_overview_image TEXT := 'https://images.squarespace-cdn.com/content/v1/60f7077195879f2b347f26a0/5d7f4b9f-fca8-4ca6-9d9e-c05e3264705a/NZ+New+Bag+2026.png';
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_corrected
  FROM public.catalog_formulas
  WHERE formula_key = 'nature''s select premium pet products|nature''s select|select|dog|adult|dry|new zealand lamb and rice recipe|';

  v_original := replace(
    v_corrected,
    'Selenium Yeast), Vitamins',
    'Selenium Yeast, Vitamins'
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
      ('ingredient_text', v_corrected, v_source_url),
      ('ingredient_original_pdp_text', v_original, v_source_url),
      ('front_image_url', v_front_image, v_source_url),
      ('new_package_overview_url', v_overview_image, v_source_url),
      (
        'complete_food_evidence',
        'Formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance of adult dogs.',
        v_source_url
      ),
      ('package_size', '28 lb bag', v_overview_image),
      ('published_gtin_status', 'not published by reviewed official source', v_source_url)
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
    'manual-search:natures-select:new-zealand-lamb-rice-dog:20260725',
    f.formula_key,
    f.formula_key,
    'Nature''s Select',
    f.product_name,
    'Nature''s Select New Zealand Lamb Rice Recipe ingredients',
    jsonb_build_array(v_source_url, v_front_image, v_overview_image),
    v_source_url,
    'manufacturer_page',
    jsonb_build_object(
      'brand', 'Nature''s Select',
      'product_line', 'Select',
      'pet_type', 'dog',
      'life_stage', 'adult',
      'food_form', 'dry',
      'flavor', 'New Zealand Lamb & Rice Recipe'
    ),
    jsonb_build_object(
      'manufacturer', f.manufacturer,
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'package_size', '28 lb bag',
      'published_gtin', NULL
    ),
    'promoted',
    NULL,
    encode(digest(v_source_url || '|' || v_front_image || '|' || v_overview_image, 'sha256'), 'hex'),
    encode(digest(v_corrected, 'sha256'), 'hex'),
    encode(digest(v_front_image, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Official current PDP and 2026 package assets reviewed. Identity is Select New Zealand Lamb & Rice Recipe, dry dog food for adult maintenance, current 28 lb package. The PDP omitted one Minerals-group close; exactly one parenthesis was restored and every source ingredient token and spelling was preserved. No GTIN was published, so none was inferred.',
    v_source_url,
    'bounded_source_text_correction',
    encode(digest(v_original, 'sha256'), 'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'from', 'Selenium Yeast, Vitamins',
        'to', 'Selenium Yeast), Vitamins',
        'reason', 'restore one omitted Minerals-group closing parenthesis; no ingredient token changed'
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
    RAISE EXCEPTION 'Nature''s Select field evidence recording failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_manual_evidence_reviews
    WHERE review_key = 'manual-search:natures-select:new-zealand-lamb-rice-dog:20260725'
      AND evidence_status = 'promoted'
      AND ingredient_evidence_mode = 'bounded_source_text_correction'
      AND jsonb_array_length(ingredient_corrections) = 1
  ) <> 1 THEN
    RAISE EXCEPTION 'Nature''s Select manual evidence review recording failed';
  END IF;
END
$$;
