DO $$
DECLARE
  v_run_id BIGINT;
BEGIN
  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:blue-buffalo:wolf-creek-stew-current-recipes:20260725',
    'blue-buffalo-manufacturer-manual',
    'manufacturer',
    'verification',
    'completed',
    now(), now(), 4, 4, 4, 0, true,
    encode(digest('111210292|111210293|111210294|111210295', 'sha256'), 'hex'),
    '{}'::JSONB,
    NULL,
    jsonb_build_object(
      'manual_exact_evidence', true,
      'search_results_are_discovery_only', true,
      'official_product_ids', jsonb_build_array('111210292','111210293','111210294','111210295'),
      'ingredient_counts', jsonb_build_object('beef',38,'chicken',36,'duck',37,'salmon',35),
      'formula_identity_policy', 'Recipe terms are hard boundaries. Mixed retailer node was split by exact source listing identity.',
      'beef_gtin_exact_ingredient_equality', '840243101283'
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    status='completed', finished_at=now(), expected_count=4, observed_count=4,
    accepted_count=4, rejected_count=0, pagination_complete=true,
    source_content_hash=excluded.source_content_hash, error_summary=NULL,
    metadata=excluded.metadata, updated_at=now()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons, raw_payload
  )
  SELECT
    v_run_id, formula.id, 'blue-buffalo-manufacturer-manual',
    exact.product_id, exact.source_url, 'manufacturer', NULL,
    formula.manufacturer, formula.brand, formula.product_name,
    formula.product_line, formula.pet_type, formula.life_stage,
    formula.food_form, formula.flavor, formula.diet_condition,
    '12.5 oz can', formula.ingredient_text, exact.front_image,
    true, true, now(),
    encode(digest(formula.formula_key || '|' || formula.ingredient_text || '|' || exact.front_image, 'sha256'),'hex'),
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_product_id', exact.product_id,
      'official_front_image_url', exact.front_image,
      'official_package_size', '12.5 oz can',
      'official_aafco_statement', 'Formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.',
      'published_gtin', CASE WHEN exact.product_id='111210292' THEN '840243101283' ELSE NULL END,
      'gtin_evidence_note', CASE
        WHEN exact.product_id='111210292' THEN 'Historical retailer ingredient list is exact-normalized equal to current official list.'
        ELSE 'No official current GTIN was published; none was inferred.'
      END
    )
  FROM (
    VALUES
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty beef stew|','111210292','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-beef/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-beef-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|chunky chicken stew|','111210293','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-chicken/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-chicken-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty duck stew|','111210294','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-duck/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-duck-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|savory salmon stew|','111210295','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-salmon-share.png')
  ) exact(formula_key,product_id,source_url,front_image)
  JOIN public.catalog_formulas formula ON formula.formula_key=exact.formula_key
  ON CONFLICT (run_id,source_slug,source_external_id,content_hash) DO UPDATE
  SET formula_id=excluded.formula_id, validation_status='accepted',
      validation_reasons=ARRAY[]::TEXT[], raw_payload=excluded.raw_payload,
      observed_at=now();

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT formula.id, NULL, field.field_name, to_jsonb(field.field_value),
    exact.source_url, 'manufacturer', true, now(),
    encode(digest(formula.id::TEXT || '|' || field.field_name || '|' || field.field_value || '|' || exact.source_url,'sha256'),'hex')
  FROM (
    VALUES
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty beef stew|','111210292','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-beef/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-beef-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|chunky chicken stew|','111210293','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-chicken/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-chicken-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty duck stew|','111210294','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-duck/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-duck-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|savory salmon stew|','111210295','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-salmon-share.png')
  ) exact(formula_key,product_id,source_url,front_image)
  JOIN public.catalog_formulas formula ON formula.formula_key=exact.formula_key
  CROSS JOIN LATERAL (
    VALUES
      ('ingredient_text',formula.ingredient_text),
      ('front_image_url',exact.front_image),
      ('official_product_id',exact.product_id),
      ('package_size','12.5 oz can'),
      ('complete_food_evidence','Formulated to meet the nutritional levels established by the AAFCO Dog Food Nutrient Profiles for maintenance.'),
      ('food_form','wet'),
      ('life_stage','adult')
  ) field(field_name,field_value)
  ON CONFLICT (formula_id,field_name,source_url,content_hash) DO UPDATE
  SET accepted=true, observed_at=excluded.observed_at;

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
    'manual-search:blue-buffalo:wolf-creek:' || exact.product_id || ':20260725',
    formula.formula_key, formula.formula_key, 'Blue Buffalo',
    formula.product_name,
    'Blue Buffalo Wilderness Wolf Creek Stew ' || formula.flavor || ' ingredients',
    jsonb_build_array(exact.source_url, exact.front_image),
    exact.source_url, 'manufacturer_page',
    jsonb_build_object('brand','Blue Buffalo','line','BLUE Wilderness Wolf Creek Stew','pet_type','dog','life_stage','adult','food_form','wet','flavor',formula.flavor),
    jsonb_build_object('manufacturer',formula.manufacturer,'brand',formula.brand,'product_line',formula.product_line,'pet_type',formula.pet_type,'life_stage',formula.life_stage,'food_form',formula.food_form,'flavor',formula.flavor,'official_product_id',exact.product_id,'package_size','12.5 oz can'),
    'promoted', NULL,
    encode(digest(exact.source_url || '|' || exact.front_image || '|' || exact.product_id,'sha256'),'hex'),
    encode(digest(formula.ingredient_text,'sha256'),'hex'),
    encode(digest(exact.front_image,'sha256'),'hex'),
    now(), formula.id, formula.promoted_cache_key, 1,
    'Official current PDP verifies exact recipe, adult wet dog identity, complete ingredient statement, 12.5 oz can, matching official front image, and AAFCO maintenance. Recipe siblings remain hard-separated.',
    exact.source_url, 'source_text_exact',
    encode(digest(formula.ingredient_text,'sha256'),'hex'),
    '[]'::JSONB, now()
  FROM (
    VALUES
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty beef stew|','111210292','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-beef/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-beef-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|chunky chicken stew|','111210293','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-chicken/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-chicken-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty duck stew|','111210294','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-duck/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-duck-share.png'),
      ('blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|savory salmon stew|','111210295','https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/','https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/wilderness/share-product-image/wild-dog-wcs-salmon-share.png')
  ) exact(formula_key,product_id,source_url,front_image)
  JOIN public.catalog_formulas formula ON formula.formula_key=exact.formula_key
  ON CONFLICT (review_key) DO UPDATE SET
    target_formula_key=excluded.target_formula_key,
    corrected_formula_key=excluded.corrected_formula_key,
    product_name=excluded.product_name,
    authoritative_source_url=excluded.authoritative_source_url,
    authoritative_source_type=excluded.authoritative_source_type,
    expected_identity=excluded.expected_identity,
    resolved_identity=excluded.resolved_identity,
    evidence_status='promoted', quarantine_reason=NULL,
    authoritative_content_hash=excluded.authoritative_content_hash,
    ingredient_text_hash=excluded.ingredient_text_hash,
    front_image_url_hash=excluded.front_image_url_hash,
    observed_at=excluded.observed_at, formula_id=excluded.formula_id,
    promoted_cache_key=excluded.promoted_cache_key,
    attempt_count=public.catalog_manual_evidence_reviews.attempt_count+1,
    review_notes=excluded.review_notes,
    ingredient_evidence_url=excluded.ingredient_evidence_url,
    ingredient_evidence_mode='source_text_exact',
    ingredient_original_text_hash=excluded.ingredient_original_text_hash,
    ingredient_corrections='[]'::JSONB, updated_at=now();

  UPDATE public.catalog_product_evidence evidence
  SET product_name=product.product_name, source=product.source,
      source_quality='manufacturer', source_url=product.source_url,
      ingredient_source_url=product.source_url, image_source_url=product.source_url,
      ingredient_verification_status='manufacturer',
      image_verification_status='manufacturer', review_state='promoted',
      rejection_reason=NULL,
      evidence=COALESCE(evidence.evidence,'{}'::JSONB) || jsonb_build_object(
        'official_product_id', CASE product.cache_key
          WHEN 'blue-buffalo-general-mills:blue buffalo blue wilderness sup sup wet dog food grain-free - beef wolf creek stew wilderness wolf-creek-stew-beef' THEN '111210292'
          WHEN 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - chicken wolf creek stew wilderness wolf-creek-stew-chicken' THEN '111210293'
          WHEN 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - duck wolf creek stew wilderness wolf-creek-stew-duck' THEN '111210294'
          ELSE '111210295' END,
        'exact_recipe_boundary', product.flavor,
        'verified_at', now()
      ),
      updated_at=now()
  FROM public.product_data product
  WHERE evidence.cache_key=product.cache_key
    AND product.cache_key IN (
      'blue-buffalo-general-mills:blue buffalo blue wilderness sup sup wet dog food grain-free - beef wolf creek stew wilderness wolf-creek-stew-beef',
      'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - chicken wolf creek stew wilderness wolf-creek-stew-chicken',
      'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - duck wolf creek stew wilderness wolf-creek-stew-duck',
      'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - salmon wolf creek stew wilderness wolf-creek-stew-salmon'
    );

  IF (SELECT count(*) FROM public.catalog_observations WHERE run_id=v_run_id AND validation_status='accepted') <> 4 THEN
    RAISE EXCEPTION 'Wolf Creek current official observations missing';
  END IF;
  IF (SELECT count(*) FROM public.catalog_field_evidence WHERE source_authority='manufacturer' AND accepted AND source_url IN (
    'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-beef/',
    'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-chicken/',
    'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-duck/',
    'https://www.bluebuffalo.com/wet-dog-food/wilderness/wolf-creek-stew-salmon/'
  ) AND field_name IN ('ingredient_text','front_image_url','official_product_id','package_size','complete_food_evidence','food_form','life_stage')) < 28 THEN
    RAISE EXCEPTION 'Wolf Creek current official field evidence missing';
  END IF;
  IF (SELECT count(*) FROM public.catalog_manual_evidence_reviews WHERE review_key LIKE 'manual-search:blue-buffalo:wolf-creek:%:20260725' AND evidence_status='promoted' AND ingredient_evidence_mode='source_text_exact') <> 4 THEN
    RAISE EXCEPTION 'Wolf Creek current manual evidence reviews missing';
  END IF;
END
$$;
