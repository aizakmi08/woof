DO $$
DECLARE
  v_formula_id BIGINT;
  v_ingredients TEXT;
  v_source35 TEXT := 'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-35-lb-bag-2457731';
  v_source5 TEXT := 'https://www.tractorsupply.com/tsc/product/4health-shreds-adult-lamb-and-rice-formula-dry-dog-food-5-lb-bag-2457734';
  v_front TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457731?fmt=png&wid=1500&hei=1500';
  v_back35 TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457731_A1?fmt=png&wid=1500&hei=1500';
  v_back5 TEXT := 'https://media.tractorsupply.com/is/image/TractorSupplyCompany/2457734_A1?fmt=png&wid=1500&hei=1500';
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_ingredients
  FROM public.catalog_formulas
  WHERE formula_key =
    'tractor supply company|4health|shreds|dog|adult|dry|lamb and rice|';

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula_id,
    NULL,
    x.field_name,
    to_jsonb(x.field_value),
    x.source_url,
    'retailer_verified',
    true,
    now(),
    encode(
      digest(
        x.field_name || '|' || x.field_value || '|' || x.source_url,
        'sha256'
      ),
      'hex'
    )
  FROM (
    VALUES
      ('ingredient_text', v_ingredients, v_source35),
      ('front_image_url', v_front, v_source35),
      (
        'complete_food_evidence',
        'AAFCO Dog Food Nutrient Profiles for maintenance; ideal for adult dogs.',
        v_back35
      ),
      (
        'formula_identity',
        '4health Shreds Adult Lamb and Rice Formula Dry Dog Food',
        v_front
      ),
      ('package_gtin', '749394379469', v_back35),
      ('package_gtin', '749394379483', v_back5),
      ('published_package_size_pending_gtin', '18 lb', v_source35)
  ) AS x(field_name, field_value, source_url)
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET
    accepted = true,
    observed_at = excluded.observed_at;

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
    'manual-search:4health:shreds-adult-lamb-rice-dog:20260725',
    f.formula_key,
    f.formula_key,
    '4health',
    f.product_name,
    '4health Shreds Adult Lamb and Rice Formula ingredients',
    jsonb_build_array(v_source35, v_source5, v_back35, v_back5),
    v_source35,
    'retailer_label',
    jsonb_build_object(
      'brand', '4health',
      'product_line', 'Shreds',
      'pet_type', 'dog',
      'life_stage', 'adult',
      'food_form', 'dry',
      'flavor', 'Lamb and Rice'
    ),
    jsonb_build_object(
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'verified_gtins', jsonb_build_array('749394379469', '749394379483')
    ),
    'promoted',
    NULL,
    encode(
      digest(
        v_source35 || '|' || v_source5 || '|' || v_back35 || '|' ||
        v_back5 || '|' || v_front,
        'sha256'
      ),
      'hex'
    ),
    encode(digest(v_ingredients, 'sha256'), 'hex'),
    encode(digest(v_front, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Exact current Tractor Supply private-label PDP plus reviewed front/back package images. The 35 lb and 5 lb UPCs are verified. The PDP also advertises an 18 lb size, but its exact GTIN remains a separate unresolved lookup and was not inferred.',
    v_source35,
    'source_text_exact',
    encode(digest(v_ingredients, 'sha256'), 'hex'),
    '[]'::JSONB,
    now()
  FROM public.catalog_formulas f
  WHERE f.id = v_formula_id
  ON CONFLICT (review_key) DO UPDATE
  SET
    corrected_formula_key = excluded.corrected_formula_key,
    product_name = excluded.product_name,
    discovery_urls = excluded.discovery_urls,
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
      AND source_authority = 'retailer_verified'
  ) < 7 THEN
    RAISE EXCEPTION '4health field evidence recording failed';
  END IF;
END
$$;
