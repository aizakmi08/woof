DO $$
DECLARE
  v_formula_id BIGINT;
  v_corrected TEXT;
  v_original TEXT;
  v_source_url TEXT := 'https://www.healthextension.com/products/digestive-support-turkey-sweet-potato-entree';
  v_side_label TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/DigestivesupportTurkey_SideofCan.png?v=1702488434';
  v_back_label TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/DigestivesupportTurkey_BackofCan.png?v=1702488434';
  v_front_image TEXT := 'https://cdn.shopify.com/s/files/1/0085/8898/4416/files/1_fa4da632-73b3-493d-a207-8a06f20d9ca3.png?v=1702488434';
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_corrected
  FROM public.catalog_formulas
  WHERE formula_key = 'health extension|health extension|digestive support|dog|all life stages|wet|turkey and sweet potato entree|';

  v_original := replace(
    v_corrected,
    'Magnesium Sulfate), Choline Chloride',
    'Magnesium Sulfate, Choline Chloride'
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
        'Complete & balanced; AAFCO all life stages including growth of large size dogs.',
        v_back_label
      ),
      ('package_gtin', '810120990026', v_side_label),
      ('package_gtin', '810120990057', v_source_url)
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
    'manual-search:health-extension:digestive-support-turkey-sweet-potato-dog:20260725',
    f.formula_key,
    f.formula_key,
    'Health Extension',
    f.product_name,
    'Health Extension Digestive Support Turkey Sweet Potato Dog ingredients',
    jsonb_build_array(v_source_url, v_side_label, v_back_label),
    v_source_url,
    'manufacturer_label',
    jsonb_build_object(
      'brand', 'Health Extension',
      'product_line', 'Digestive Support',
      'pet_type', 'dog',
      'life_stage', 'all life stages',
      'food_form', 'wet',
      'flavor', 'Turkey & Sweet Potato Entrée'
    ),
    jsonb_build_object(
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'single_can_gtin', '810120990026',
      'case_gtin', '810120990057'
    ),
    'promoted',
    NULL,
    encode(digest(v_source_url || '|' || v_side_label || '|' || v_back_label || '|' || v_front_image, 'sha256'), 'hex'),
    encode(digest(v_corrected, 'sha256'), 'hex'),
    encode(digest(v_front_image, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Official PDP, front, side, and back package images reviewed. One missing vitamin-group closing parenthesis restored after Magnesium Sulfate; no ingredient words changed.',
    v_side_label,
    'bounded_source_text_correction',
    encode(digest(v_original, 'sha256'), 'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'from', 'Magnesium Sulfate, Choline Chloride',
        'to', 'Magnesium Sulfate), Choline Chloride',
        'reason', 'restore one omitted structural closing parenthesis from official package label'
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
  ) < 6 THEN
    RAISE EXCEPTION 'Health Extension field evidence recording failed';
  END IF;
END
$$;
