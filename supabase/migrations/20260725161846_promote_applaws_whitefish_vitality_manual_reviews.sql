DO $$
BEGIN
  INSERT INTO public.catalog_manual_evidence_reviews (
    review_key, target_formula_key, corrected_formula_key, brand, product_name,
    search_query, discovery_urls, authoritative_source_url, authoritative_source_type,
    expected_identity, resolved_identity, evidence_status, quarantine_reason,
    authoritative_content_hash, ingredient_text_hash, front_image_url_hash,
    observed_at, formula_id, promoted_cache_key, attempt_count, review_notes,
    ingredient_evidence_url, ingredient_evidence_mode, ingredient_original_text_hash,
    ingredient_corrections, updated_at
  )
  SELECT
    x.review_key, f.formula_key, f.formula_key, 'Applaws', f.product_name,
    x.search_query, jsonb_build_array(f.source_url), f.source_url, 'manufacturer_page',
    jsonb_build_object(
      'brand', 'Applaws',
      'pet_type', 'cat',
      'life_stage', 'adult',
      'food_form', 'dry',
      'flavor', f.flavor
    ),
    jsonb_build_object(
      'brand', f.brand,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'gtin', p.gtin
    ),
    'promoted', NULL,
    encode(digest(f.source_url || '|' || f.ingredient_text || '|' || f.front_image_url, 'sha256'), 'hex'),
    encode(digest(f.ingredient_text, 'sha256'), 'hex'),
    encode(digest(f.front_image_url, 'sha256'), 'hex'),
    now(), f.id, f.promoted_cache_key, 1,
    x.notes, f.source_url, 'source_text_exact',
    encode(digest(f.ingredient_text, 'sha256'), 'hex'), '[]'::jsonb, now()
  FROM public.catalog_formulas f
  JOIN public.product_data p ON p.cache_key = f.promoted_cache_key
  JOIN (
    VALUES
      (
        'manual-search:applaws:whitefish-adult-dry-cat:20260725',
        'Applaws Whitefish Recipe Adult Cat',
        'Exact official Applaws US 4 lb PDP confirms current complete adult cat formula, full ingredients, front image, and Product Code 4703US-A.',
        'petsmart-retail-catalog:886817005267'
      ),
      (
        'manual-search:applaws:vitality-indoor-turkey-cod-adult-dry-cat:20260725',
        'Applaws Vitality Indoor Turkey Cod Adult Cat',
        'Exact official Applaws US 5 lb PDP confirms current complete adult cat formula, full ingredients, front image, and Product Code 4050US-A.',
        'petsmart-retail-catalog:886817014375'
      )
  ) AS x(review_key, search_query, notes, cache_key)
    ON x.cache_key = f.promoted_cache_key
  ON CONFLICT (review_key) DO UPDATE
  SET
    target_formula_key = excluded.target_formula_key,
    corrected_formula_key = excluded.corrected_formula_key,
    product_name = excluded.product_name,
    authoritative_source_url = excluded.authoritative_source_url,
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
    FROM public.catalog_manual_evidence_reviews
    WHERE review_key IN (
      'manual-search:applaws:whitefish-adult-dry-cat:20260725',
      'manual-search:applaws:vitality-indoor-turkey-cod-adult-dry-cat:20260725'
    )
      AND evidence_status = 'promoted'
      AND formula_id IS NOT NULL
      AND promoted_cache_key IS NOT NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws manual review promotion failed';
  END IF;
END
$$;
