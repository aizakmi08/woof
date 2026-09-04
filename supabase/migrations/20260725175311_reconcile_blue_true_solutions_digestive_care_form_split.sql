DO $$
DECLARE
  v_dry_formula BIGINT;
  v_wet_formula BIGINT;
  v_old_dry_formula BIGINT;
  v_old_wet_formula BIGINT;
  v_mixed_formula BIGINT;
  v_dry_key TEXT := 'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|dry|chicken and oatmeal recipe|';
  v_wet_key TEXT := 'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|wet|chicken recipe|';
  v_old_dry_key TEXT := 'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|';
  v_old_wet_key TEXT := 'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|';
  v_mixed_key TEXT := 'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|unknown|chicken recipe|';
  v_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken oatmeal recipe for adult dogs true-solutions digestive-care';
  v_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult dogs true-solutions digestive-care';
  v_dry_source TEXT := 'https://www.bluebuffalo.com/dry-dog-food/true-solutions/digestive-care/';
  v_wet_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/true-solutions/digestive-care/';
  v_dry_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/true-solutions/share-product-image/share__truesolutions_dry_dog_blissfulbelly.png';
  v_wet_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-wet-food/true-solutions/share-product-image/share_truesolutions_wet_dog_blissfulbelly.png';
BEGIN
  SELECT id INTO STRICT v_dry_formula
  FROM public.catalog_formulas WHERE formula_key = v_dry_key;
  SELECT id INTO STRICT v_wet_formula
  FROM public.catalog_formulas WHERE formula_key = v_wet_key;
  SELECT id INTO STRICT v_old_dry_formula
  FROM public.catalog_formulas WHERE formula_key = v_old_dry_key;
  SELECT id INTO STRICT v_old_wet_formula
  FROM public.catalog_formulas WHERE formula_key = v_old_wet_key;
  SELECT id INTO STRICT v_mixed_formula
  FROM public.catalog_formulas WHERE formula_key = v_mixed_key;

  IF v_dry_formula = v_wet_formula
     OR (
       SELECT cardinality(ingredients)
       FROM public.catalog_formulas
       WHERE id = v_dry_formula
     ) <> 66
     OR (
       SELECT cardinality(ingredients)
       FROM public.catalog_formulas
       WHERE id = v_wet_formula
     ) <> 41 THEN
    RAISE EXCEPTION 'Blue Digestive Care canonical evidence precondition failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (v_dry_cache, v_wet_cache)
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND catalog_exclusion_reason IS NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue Digestive Care serving evidence precondition failed';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs',
    brand = 'Blue Buffalo',
    product_line = 'BLUE True Solutions Digestive Care',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'Chicken & Oatmeal Recipe',
    package_size = '4, 11, 20 & 24 lb bags',
    source = 'blue-buffalo-general-mills',
    source_quality = 'manufacturer',
    source_url = v_dry_source,
    image_url = v_dry_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key = v_dry_cache;

  UPDATE public.product_data
  SET
    product_name = 'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs',
    brand = 'Blue Buffalo',
    product_line = 'BLUE True Solutions Digestive Care',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'Chicken Recipe',
    package_size = '12.5 oz can',
    source = 'blue-buffalo-general-mills',
    source_quality = 'manufacturer',
    source_url = v_wet_source,
    image_url = v_wet_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key = v_wet_cache;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'historical_renamed_formula_alias',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    expires_at = now(),
    updated_at = now()
  WHERE cache_key IN (
    'petsmart-retail-catalog:840243135424',
    'petsmart-retail-catalog:840243135516'
  );

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name = 'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs',
    product_line = 'blue true solutions digestive care',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and oatmeal recipe',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Official Blue Buffalo: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance.',
    front_image_url = v_dry_front,
    source_url = v_dry_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue', 'true solutions', 'digestive care',
      'blissful belly', 'chicken', 'oatmeal', 'adult', 'dog', 'dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_dry_cache,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_dry_formula;

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name = 'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs',
    product_line = 'blue true solutions digestive care',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'chicken recipe',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Official Blue Buffalo: formulated to meet AAFCO Dog Food Nutrient Profiles for maintenance.',
    front_image_url = v_wet_front,
    source_url = v_wet_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue', 'true solutions', 'digestive care',
      'blissful belly', 'chicken', 'adult', 'dog', 'wet', 'can'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_wet_cache,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_wet_formula;

  UPDATE public.catalog_observations
  SET formula_id = v_dry_formula
  WHERE formula_id IN (
      v_dry_formula, v_wet_formula, v_old_dry_formula,
      v_old_wet_formula, v_mixed_formula
    )
    AND (
      food_form = 'dry'
      OR source_url = v_dry_source
      OR source_external_id IN (
        '244834', 'A-81078053', '342041655', '557459164',
        'petsmart-retail-catalog:840243135424'
      )
    );

  UPDATE public.catalog_observations
  SET formula_id = v_wet_formula
  WHERE formula_id IN (
      v_dry_formula, v_wet_formula, v_old_dry_formula,
      v_old_wet_formula, v_mixed_formula
    )
    AND (
      food_form = 'wet'
      OR source_url = v_wet_source
      OR source_external_id IN (
        '3254734', '20425122090', '5968862233', '884412142',
        'petsmart-retail-catalog:840243135516'
      )
    );

  UPDATE public.catalog_skus
  SET formula_id = v_dry_formula, updated_at = now()
  WHERE formula_id IN (
      v_dry_formula, v_wet_formula, v_old_dry_formula,
      v_old_wet_formula, v_mixed_formula
    )
    AND (
      source_url = v_dry_source
      OR regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135424'
      OR source_external_id IN (
        '244834', 'A-81078053', '342041655', '557459164',
        'petsmart-retail-catalog:840243135424'
      )
    );

  UPDATE public.catalog_skus
  SET formula_id = v_wet_formula, updated_at = now()
  WHERE formula_id IN (
      v_dry_formula, v_wet_formula, v_old_dry_formula,
      v_old_wet_formula, v_mixed_formula
    )
    AND (
      source_url = v_wet_source
      OR regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135516'
      OR source_external_id IN (
        '3254734', '20425122090', '5968862233', '884412142',
        'petsmart-retail-catalog:840243135516'
      )
    );

  UPDATE public.catalog_field_evidence
  SET formula_id = v_dry_formula
  WHERE formula_id = v_old_dry_formula;

  UPDATE public.catalog_field_evidence
  SET formula_id = v_wet_formula
  WHERE formula_id = v_old_wet_formula;

  UPDATE public.catalog_manual_evidence_reviews
  SET
    formula_id = v_dry_formula,
    corrected_formula_key = v_dry_key,
    promoted_cache_key = v_dry_cache,
    updated_at = now()
  WHERE formula_id = v_old_dry_formula;

  UPDATE public.catalog_manual_evidence_reviews
  SET
    formula_id = v_wet_formula,
    corrected_formula_key = v_wet_key,
    promoted_cache_key = v_wet_cache,
    updated_at = now()
  WHERE formula_id = v_old_wet_formula;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  )
  SELECT
    old.formula_key,
    exact.formula_id,
    old.identity_hash,
    'manual_review',
    old.source_url,
    jsonb_build_object(
      'reason', exact.reason,
      'current_formula_key', exact.current_key,
      'reconciled_at', now(),
      'size_or_retailer_title_does_not_define_formula', true
    ),
    now()
  FROM (
    VALUES
      (
        v_old_dry_formula, v_dry_formula, v_dry_key,
        'Historical Blissful Belly dry retailer title is the exact current BLUE True Solutions Digestive Care Chicken & Oatmeal adult dry formula.'
      ),
      (
        v_old_wet_formula, v_wet_formula, v_wet_key,
        'Historical Blissful Belly wet retailer title is the exact current BLUE True Solutions Digestive Care Chicken adult wet formula.'
      )
  ) AS exact(old_formula_id, formula_id, current_key, reason)
  JOIN public.catalog_formulas old ON old.id = exact.old_formula_id
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence = CASE
      WHEN id = v_mixed_formula THEN
        'Quarantined mixed-form retailer identity. Its dry and wet observations were split into exact current manufacturer formulas; unknown-form identity must never resolve to a sibling.'
      ELSE
        'Superseded historical retailer identity. Exact current formula is linked through a reviewed canonical alias.'
    END,
    updated_at = now()
  WHERE id IN (v_old_dry_formula, v_old_wet_formula, v_mixed_formula);

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id IN (v_dry_formula, v_wet_formula)
    AND source_slug = 'blue-buffalo-general-mills'
    AND package_size = ''
    AND gtin IS NULL;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_dry_formula, NULL, '4 lb bag', 1, 'blue-buffalo-general-mills',
      '111210807:4lb', v_dry_source, true, now(), now(), now()
    ),
    (
      v_dry_formula, NULL, '11 lb bag', 1, 'blue-buffalo-general-mills',
      '111210807:11lb', v_dry_source, true, now(), now(), now()
    ),
    (
      v_dry_formula, NULL, '20 lb bag', 1, 'blue-buffalo-general-mills',
      '111210807:20lb', v_dry_source, true, now(), now(), now()
    ),
    (
      v_dry_formula, NULL, '24 lb bag', 1, 'blue-buffalo-general-mills',
      '111210807:24lb', v_dry_source, true, now(), now(), now()
    ),
    (
      v_wet_formula, NULL, '12.5 oz can', 1, 'blue-buffalo-general-mills',
      '111210811:12.5oz', v_wet_source, true, now(), now(), now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    package_count = excluded.package_count,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance
  ) VALUES
    (
      v_dry_cache,
      'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Dog Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Dog Food'
      ),
      v_dry_source,
      'manufacturer',
      now(),
      jsonb_build_object(
        'source', 'reviewed_historical_retailer_title',
        'current_identity_source', v_dry_source,
        'food_form_boundary', 'dry',
        'migration', 'reconcile_blue_true_solutions_digestive_care_form_split'
      )
    ),
    (
      v_wet_cache,
      'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Dog Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Dog Food'
      ),
      v_wet_source,
      'manufacturer',
      now(),
      jsonb_build_object(
        'source', 'reviewed_historical_retailer_title',
        'current_identity_source', v_wet_source,
        'food_form_boundary', 'wet',
        'migration', 'reconcile_blue_true_solutions_digestive_care_form_split'
      )
    )
  ON CONFLICT (normalized_alias) WHERE active
  DO UPDATE SET
    cache_key = excluded.cache_key,
    alias_text = excluded.alias_text,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    updated_at = now();

  UPDATE public.catalog_product_evidence evidence
  SET
    review_state = 'rejected',
    rejection_reason = 'historical_renamed_formula_alias',
    evidence = COALESCE(evidence.evidence, '{}'::JSONB) ||
      jsonb_build_object(
        'reconciled_at', now(),
        'exact_current_formula_cache_key',
          CASE
            WHEN evidence.cache_key = 'petsmart-retail-catalog:840243135424'
              THEN v_dry_cache
            ELSE v_wet_cache
          END,
        'retailer_gtin_retained_as_canonical_sku', true
      ),
    updated_at = now()
  WHERE evidence.cache_key IN (
    'petsmart-retail-catalog:840243135424',
    'petsmart-retail-catalog:840243135516'
  );

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
        'reconciled_at', now(),
        'exact_food_form', product.food_form,
        'current_package_sizes', product.package_size,
        'official_aafco_maintenance', true
      ),
    updated_at = now()
  FROM public.product_data product
  WHERE evidence.cache_key = product.cache_key
    AND evidence.cache_key IN (v_dry_cache, v_wet_cache);

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id IN (v_old_dry_formula, v_old_wet_formula, v_mixed_formula)
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id IN (v_old_dry_formula, v_old_wet_formula, v_mixed_formula)
      AND active
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care superseded formulas still own observations or active SKUs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_dry_formula
      AND (
        food_form = 'wet'
        OR source_external_id IN (
          '3254734', '20425122090', '5968862233', '884412142',
          'petsmart-retail-catalog:840243135516'
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE formula_id = v_wet_formula
      AND (
        food_form = 'dry'
        OR source_external_id IN (
          '244834', 'A-81078053', '342041655', '557459164',
          'petsmart-retail-catalog:840243135424'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care retailer form crossover remains';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_dry_formula
      AND active
      AND source_slug = 'blue-buffalo-general-mills'
      AND source_external_id LIKE '111210807:%'
  ) <> 4 OR (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_wet_formula
      AND active
      AND source_slug = 'blue-buffalo-general-mills'
      AND source_external_id = '111210811:12.5oz'
  ) <> 1 THEN
    RAISE EXCEPTION 'Blue Digestive Care official package variants were not preserved';
  END IF;
END
$$;
