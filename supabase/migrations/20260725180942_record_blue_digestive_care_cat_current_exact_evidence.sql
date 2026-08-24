DO $$
DECLARE
  v_run_id BIGINT;
  v_dry_formula BIGINT;
  v_wet_formula BIGINT;
  v_dry_source TEXT := 'https://www.bluebuffalo.com/dry-cat-food/true-solutions/digestive-care/';
  v_wet_source TEXT := 'https://www.bluebuffalo.com/wet-cat-food/true-solutions/digestive-care/';
  v_dry_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_blissfulbelly.png';
  v_wet_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/true-solutions/share-product-image/share_truesolutions_wet_cat_blissfulbelly.png';
  v_dry_large TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/large-product-image/pdp_desktop_truesolutions_dry_cat_blissfulbelly.png';
  v_wet_large TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/true-solutions/large-product-image/pdp_desktop_truesolutions_wet_cat_blissfulbelly.png';
BEGIN
  SELECT id INTO STRICT v_dry_formula
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|dry|chicken and barley recipe|'
    AND active
    AND promoted_cache_key IS NOT NULL;

  SELECT id INTO STRICT v_wet_formula
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|wet|chicken recipe|'
    AND active
    AND promoted_cache_key IS NOT NULL;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:blue-buffalo:true-solutions-digestive-care-cat-current:20260725',
    'blue-buffalo-manufacturer-manual',
    'manufacturer',
    'verification',
    'completed',
    now(),
    now(),
    2,
    2,
    2,
    0,
    true,
    encode(
      digest(v_dry_source || '|111210801|' || v_wet_source || '|111210804', 'sha256'),
      'hex'
    ),
    '{}'::JSONB,
    NULL,
    jsonb_build_object(
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'official_product_ids', jsonb_build_array('111210801', '111210804'),
      'current_formula_counts', jsonb_build_object('dry', 70, 'wet', 42),
      'formula_version_policy',
        'Historical retailer ingredient text differs from current official text. Historical GTINs are preserved but not linked to current formulas.',
      'historical_gtins_quarantined',
        jsonb_build_array('840243135219', '840243135615')
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
    formula.id,
    'blue-buffalo-manufacturer-manual',
    reviewed.product_id,
    reviewed.source_url,
    'manufacturer',
    NULL,
    formula.manufacturer,
    formula.brand,
    formula.product_name,
    formula.product_line,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.flavor,
    formula.diet_condition,
    reviewed.package_sizes,
    formula.ingredient_text,
    reviewed.front_image,
    true,
    true,
    now(),
    encode(
      digest(
        formula.formula_key || '|' || formula.ingredient_text || '|' ||
        reviewed.front_image || '|' || reviewed.package_sizes,
        'sha256'
      ),
      'hex'
    ),
    'accepted',
    ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_id', reviewed.product_id,
      'official_share_image_url', reviewed.front_image,
      'official_large_front_image_url', reviewed.large_front,
      'official_package_sizes', reviewed.package_sizes,
      'official_aafco_statement',
        'Formulated to meet the nutritional levels established by the AAFCO Cat Food Nutrient Profiles for maintenance.',
      'published_gtin', NULL,
      'historical_gtin_not_inherited', true
    )
  FROM (
    VALUES
      (
        v_dry_formula, '111210801', v_dry_source, v_dry_front,
        v_dry_large, '3.5 & 11 lb bags'
      ),
      (
        v_wet_formula, '111210804', v_wet_source, v_wet_front,
        v_wet_large, '3 oz can'
      )
  ) AS reviewed(
    formula_id, product_id, source_url, front_image, large_front, package_sizes
  )
  JOIN public.catalog_formulas formula ON formula.id = reviewed.formula_id
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = excluded.raw_payload,
    observed_at = now();

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    formula.id,
    NULL,
    field.field_name,
    to_jsonb(field.field_value),
    reviewed.source_url,
    'manufacturer',
    true,
    now(),
    encode(
      digest(
        formula.id::TEXT || '|' || field.field_name || '|' ||
        field.field_value || '|' || reviewed.source_url,
        'sha256'
      ),
      'hex'
    )
  FROM (
    VALUES
      (
        v_dry_formula, '111210801', v_dry_source, v_dry_front,
        v_dry_large, '3.5 & 11 lb bags'
      ),
      (
        v_wet_formula, '111210804', v_wet_source, v_wet_front,
        v_wet_large, '3 oz can'
      )
  ) AS reviewed(
    formula_id, product_id, source_url, front_image, large_front, package_sizes
  )
  JOIN public.catalog_formulas formula ON formula.id = reviewed.formula_id
  CROSS JOIN LATERAL (
    VALUES
      ('ingredient_text', formula.ingredient_text),
      ('front_image_url', reviewed.front_image),
      ('large_front_image_url', reviewed.large_front),
      ('official_product_id', reviewed.product_id),
      ('package_sizes', reviewed.package_sizes),
      (
        'complete_food_evidence',
        'Formulated to meet the nutritional levels established by the AAFCO Cat Food Nutrient Profiles for maintenance.'
      ),
      ('food_form', formula.food_form)
  ) AS field(field_name, field_value)
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = true, observed_at = excluded.observed_at;

  UPDATE public.catalog_product_evidence evidence
  SET
    product_name = product.product_name,
    source = product.source,
    source_quality = 'manufacturer',
    source_url = product.source_url,
    ingredient_source_url = product.source_url,
    image_source_url = product.source_url,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = COALESCE(evidence.evidence, '{}'::JSONB) ||
      jsonb_build_object(
        'current_formula_verified_at', now(),
        'exact_food_form', product.food_form,
        'current_package_sizes', product.package_size,
        'historical_gtin_not_inherited', true
      ),
    updated_at = now()
  FROM public.product_data product
  WHERE evidence.cache_key = product.cache_key
    AND evidence.cache_key IN (
      'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken barley recipe for adult cats true-solutions digestive-care',
      'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult cats true-solutions digestive-care'
    );

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run_id
      AND validation_status = 'accepted'
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue Digestive Care cat official observations missing';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_field_evidence
    WHERE formula_id IN (v_dry_formula, v_wet_formula)
      AND source_url IN (v_dry_source, v_wet_source)
      AND source_authority = 'manufacturer'
      AND accepted
      AND field_name IN (
        'ingredient_text', 'front_image_url', 'large_front_image_url',
        'official_product_id', 'package_sizes',
        'complete_food_evidence', 'food_form'
      )
  ) < 14 THEN
    RAISE EXCEPTION 'Blue Digestive Care cat field evidence missing';
  END IF;
END
$$;

DO $$
DECLARE
  v_dry_formula BIGINT;
  v_wet_formula BIGINT;
  v_dry_source TEXT := 'https://www.bluebuffalo.com/dry-cat-food/true-solutions/digestive-care/';
  v_wet_source TEXT := 'https://www.bluebuffalo.com/wet-cat-food/true-solutions/digestive-care/';
  v_dry_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_blissfulbelly.png';
  v_wet_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/true-solutions/share-product-image/share_truesolutions_wet_cat_blissfulbelly.png';
BEGIN
  SELECT id INTO STRICT v_dry_formula
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|dry|chicken and barley recipe|';
  SELECT id INTO STRICT v_wet_formula
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|wet|chicken recipe|';

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
    reviewed.review_key,
    formula.formula_key,
    formula.formula_key,
    'Blue Buffalo',
    formula.product_name,
    reviewed.search_query,
    jsonb_build_array(reviewed.source_url, reviewed.front_image),
    reviewed.source_url,
    'manufacturer_page',
    reviewed.expected_identity,
    jsonb_build_object(
      'manufacturer', formula.manufacturer,
      'brand', formula.brand,
      'product_line', formula.product_line,
      'pet_type', formula.pet_type,
      'life_stage', formula.life_stage,
      'food_form', formula.food_form,
      'flavor', formula.flavor,
      'package_sizes', reviewed.package_sizes,
      'official_product_id', reviewed.product_id,
      'published_gtin', NULL
    ),
    'promoted',
    NULL,
    encode(
      digest(
        reviewed.source_url || '|' || reviewed.front_image || '|' ||
        reviewed.product_id,
        'sha256'
      ),
      'hex'
    ),
    encode(digest(formula.ingredient_text, 'sha256'), 'hex'),
    encode(digest(reviewed.front_image, 'sha256'), 'hex'),
    now(),
    formula.id,
    formula.promoted_cache_key,
    1,
    reviewed.review_notes,
    reviewed.source_url,
    'source_text_exact',
    encode(digest(formula.ingredient_text, 'sha256'), 'hex'),
    '[]'::JSONB,
    now()
  FROM (
    VALUES
      (
        v_dry_formula,
        'manual-search:blue-buffalo:true-solutions-digestive-care-dry-cat:20260725',
        'Blue Buffalo True Solutions Digestive Care Chicken Barley adult dry cat ingredients',
        v_dry_source,
        v_dry_front,
        '111210801',
        '3.5 & 11 lb bags',
        jsonb_build_object(
          'brand', 'Blue Buffalo',
          'product_line', 'BLUE True Solutions Digestive Care',
          'pet_type', 'cat',
          'life_stage', 'adult',
          'food_form', 'dry',
          'flavor', 'Chicken & Barley Recipe'
        ),
        'Official current PDP verifies product 111210801, adult dry cat form, Chicken & Barley identity, 70 exact ingredient entries, AAFCO maintenance, current official package image, and two bag sizes. Historical retailer formula has 71 materially different entries; UPC 840243135219 is quarantined rather than inherited.'
      ),
      (
        v_wet_formula,
        'manual-search:blue-buffalo:true-solutions-digestive-care-wet-cat:20260725',
        'Blue Buffalo True Solutions Digestive Care Chicken adult wet cat ingredients',
        v_wet_source,
        v_wet_front,
        '111210804',
        '3 oz can',
        jsonb_build_object(
          'brand', 'Blue Buffalo',
          'product_line', 'BLUE True Solutions Digestive Care',
          'pet_type', 'cat',
          'life_stage', 'adult',
          'food_form', 'wet',
          'flavor', 'Chicken Recipe'
        ),
        'Official current PDP verifies product 111210804, adult wet cat form, Chicken identity, 42 exact ingredient entries, AAFCO maintenance, current official package image, and 3 oz can. Historical retailer formula has 41 materially different entries; UPC 840243135615 is quarantined rather than inherited.'
      )
  ) AS reviewed(
    formula_id, review_key, search_query, source_url, front_image,
    product_id, package_sizes, expected_identity, review_notes
  )
  JOIN public.catalog_formulas formula ON formula.id = reviewed.formula_id
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
    FROM public.catalog_manual_evidence_reviews
    WHERE review_key IN (
      'manual-search:blue-buffalo:true-solutions-digestive-care-dry-cat:20260725',
      'manual-search:blue-buffalo:true-solutions-digestive-care-wet-cat:20260725'
    )
      AND evidence_status = 'promoted'
      AND ingredient_evidence_mode = 'source_text_exact'
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue Digestive Care cat manual reviews missing';
  END IF;
END
$$;
