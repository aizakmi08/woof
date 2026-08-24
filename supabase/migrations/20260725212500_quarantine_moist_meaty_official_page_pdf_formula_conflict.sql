-- Purina's current Moist & Meaty Burger With Cheddar Cheese PDP and the
-- official ingredient PDF linked from that same PDP disagree materially.
-- The PDP has 39 ingredients and uses animal fat preserved with TBHQ; linked
-- label E410422 has 40 ingredients, mixed tocopherols, and vegetable oil.
-- No GTIN may resolve to either formula until Purina binds a current package
-- and GTIN to one exact ingredient version.
DO $$
DECLARE
  v_formula BIGINT;
  v_cache TEXT := 'nestle-purina-moist-meaty:038100330772';
  v_page TEXT := 'https://www.purina.com/dogs/shop/moist-meaty-burger-with-cheddar-cheese-dog-food';
  v_pdf TEXT := 'https://www.purina.com/sites/default/files/product-label-deck-file/2023-06/4104-e410422-moist-meaty-burger-w-cheddar-cheese-flavor-dog-food-d45.pdf';
  v_page_ingredient_text TEXT := 'Meat By-Products, Soy Flour, Soy Grits, High Fructose Corn Syrup, Wheat Flour, Water Sufficient for Processing, Corn Syrup, Beef, Phosphoric Acid, Calcium Carbonate, Animal Fat preserved with TBHQ, Salt, Sorbic Acid, Cheese Powder (source of cheddar cheese flavor), Calcium Propionate, Zinc Sulfate, Ferrous Sulfate, Manganese Sulfate, Copper Sulfate, Calcium Iodate, Sodium Selenite, DL-Methionine, Vitamin E Supplement, Niacin (Vitamin B-3), Vitamin A Supplement, Calcium Pantothenate (Vitamin B-5), Thiamine Mononitrate (Vitamin B-1), Vitamin B-12 Supplement, Riboflavin Supplement (Vitamin B-2), Pyridoxine Hydrochloride (Vitamin B-6), Folic Acid (Vitamin B-9), Menadione Sodium Bisulfite Complex (Vitamin K), Vitamin D-3 Supplement, Biotin (Vitamin B-7), Choline Chloride, Ethoxyquin (a preservative), Yellow 6, Red 40, Yellow 5';
  v_page_ingredients TEXT[] := ARRAY[
    'Meat By-Products','Soy Flour','Soy Grits','High Fructose Corn Syrup',
    'Wheat Flour','Water Sufficient for Processing','Corn Syrup','Beef',
    'Phosphoric Acid','Calcium Carbonate','Animal Fat preserved with TBHQ',
    'Salt','Sorbic Acid','Cheese Powder (source of cheddar cheese flavor)',
    'Calcium Propionate','Zinc Sulfate','Ferrous Sulfate',
    'Manganese Sulfate','Copper Sulfate','Calcium Iodate','Sodium Selenite',
    'DL-Methionine','Vitamin E Supplement','Niacin (Vitamin B-3)',
    'Vitamin A Supplement','Calcium Pantothenate (Vitamin B-5)',
    'Thiamine Mononitrate (Vitamin B-1)','Vitamin B-12 Supplement',
    'Riboflavin Supplement (Vitamin B-2)',
    'Pyridoxine Hydrochloride (Vitamin B-6)','Folic Acid (Vitamin B-9)',
    'Menadione Sodium Bisulfite Complex (Vitamin K)',
    'Vitamin D-3 Supplement','Biotin (Vitamin B-7)','Choline Chloride',
    'Ethoxyquin (a preservative)','Yellow 6','Red 40','Yellow 5'
  ]::TEXT[];
  v_old_ingredient_text TEXT;
  v_run BIGINT;
  v_resolution_count INTEGER;
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula, v_old_ingredient_text
  FROM public.catalog_formulas
  WHERE formula_key =
    'moist and meaty|moist and meaty|burger with cheddar cheese|dog|adult|semi-moist|burger with cheddar cheese flavor|'
    AND promoted_cache_key = v_cache
    AND verification_status = 'verified'
    AND active
    AND cardinality(ingredients) = 40
    AND ingredients[11] = 'animal fat preserved with mixed-tocopherols';

  SELECT id INTO STRICT v_run
  FROM public.catalog_source_runs
  WHERE run_key =
    'manual-exact-evidence:moist-and-meaty:burger-cheddar-eric:20260725';

  IF cardinality(v_page_ingredients) <> 39
     OR v_page_ingredients[11] <> 'Animal Fat preserved with TBHQ'
     OR v_page_ingredients[39] <> 'Yellow 5'
     OR v_old_ingredient_text IS NULL
     OR v_old_ingredient_text = v_page_ingredient_text
  THEN
    RAISE EXCEPTION 'Moist & Meaty official source-conflict evidence changed';
  END IF;

  UPDATE public.product_data
  SET catalog_exclusion_reason =
        'official_manufacturer_formula_version_conflict_page_vs_linked_pdf',
      ingredient_verification_status = 'unverified',
      updated_at = now()
  WHERE cache_key IN (
    v_cache,
    'petsmart-retail-catalog:038100330482'
  );

  UPDATE public.product_data
  SET catalog_exclusion_reason =
        'conflicting_retailer_formula_version_requires_official_gtin_evidence',
      ingredient_verification_status = 'unverified',
      updated_at = now()
  WHERE cache_key = 'petsmart-retail-catalog:038100330222';

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined',
      active = false,
      absent_since = COALESCE(absent_since, now()),
      promoted_cache_key = NULL,
      promoted_at = NULL,
      complete_food_evidence =
        'Current official Purina PDP and its linked official label PDF materially disagree on the Burger With Cheddar Cheese ingredient formula. Preserve both versions, but do not score or resolve any package until Purina supplies an exact current package/GTIN mapping.',
      updated_at = now()
  WHERE id = v_formula;

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id = v_formula
     OR gtin IN ('038100330772','038100330482','038100330222');

  UPDATE public.catalog_observations
  SET validation_status = 'rejected',
      validation_reasons = ARRAY[
        'official_manufacturer_formula_version_conflict',
        'current_page_and_linked_label_pdf_disagree',
        'exact_current_gtin_formula_evidence_required'
      ]::TEXT[],
      raw_payload = COALESCE(raw_payload, '{}'::JSONB) || jsonb_build_object(
        'formula_version_conflict', jsonb_build_object(
          'detected_at', now(),
          'current_page_ingredient_count', 39,
          'linked_pdf_ingredient_count', 40,
          'current_page_distinguishing_term', 'Animal Fat preserved with TBHQ',
          'linked_pdf_distinguishing_term',
            'animal fat preserved with mixed-tocopherols; vegetable oil',
          'resolution_policy', 'abstain_until_exact_current_package_gtin_proof'
        )
      )
  WHERE formula_id = v_formula
     OR gtin IN ('038100330772','038100330482','038100330222');

  INSERT INTO public.catalog_observations(
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons, raw_payload
  ) VALUES (
    v_run, v_formula, 'purina-manufacturer-manual',
    'purina-manufacturer-manual:moist-meaty-burger-cheddar:current-page:20260725',
    v_page, 'manufacturer', NULL, 'Nestlé Purina PetCare Company',
    'Moist & Meaty',
    'Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food',
    'Burger With Cheddar Cheese', 'dog', 'adult', 'semi-moist',
    'Burger With Cheddar Cheese Flavor', '', '',
    v_page_ingredient_text,
    'https://www.purina.com/sites/default/files/products/2023-06/dc_moistmeaty_burger-cheese_pack_1000x1000.png',
    true, true, now(),
    encode(digest(v_page || '|' || v_page_ingredient_text, 'sha256'), 'hex'),
    'rejected',
    ARRAY[
      'official_manufacturer_formula_version_conflict',
      'linked_official_label_pdf_has_different_formula',
      'gtin_not_bound_to_current_page_formula'
    ]::TEXT[],
    jsonb_build_object(
      'manual_exact_evidence', true,
      'captured_at', '2026-07-25T21:25:00Z',
      'ingredient_count', 39,
      'linked_label_pdf_url', v_pdf,
      'linked_label_pdf_ingredient_count', 40,
      'not_promotable', true
    )
  )
  ON CONFLICT(run_id, source_slug, source_external_id, content_hash)
  DO NOTHING;

  UPDATE public.catalog_field_evidence
  SET accepted = false, observed_at = now()
  WHERE formula_id = v_formula
    AND field_name IN ('ingredient_text','ingredient_pdf_url','official_gtin',
                       'exact_retailer_gtin');

  INSERT INTO public.catalog_field_evidence(
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  ) VALUES
    (
      v_formula, NULL, 'ingredient_text_current_pdp',
      to_jsonb(v_page_ingredient_text), v_page, 'manufacturer', false, now(),
      encode(digest(v_formula::TEXT || '|current-pdp|' ||
        v_page_ingredient_text, 'sha256'), 'hex')
    ),
    (
      v_formula, NULL, 'ingredient_formula_conflict',
      jsonb_build_object(
        'current_page_ingredient_count', 39,
        'linked_pdf_ingredient_count', 40,
        'current_page_preservative', 'TBHQ',
        'linked_pdf_preservative', 'mixed-tocopherols',
        'linked_pdf_additional_ingredient', 'vegetable oil',
        'requires_exact_current_gtin_mapping', true
      ),
      v_page, 'manufacturer', false, now(),
      encode(digest(v_formula::TEXT || '|official-source-conflict|' ||
        v_page || '|' || v_pdf, 'sha256'), 'hex')
    )
  ON CONFLICT(formula_id, field_name, source_url, content_hash)
  DO UPDATE SET accepted = false, observed_at = excluded.observed_at;

  UPDATE public.catalog_verified_product_search_aliases
  SET active = false,
      provenance = provenance || jsonb_build_object(
        'deactivated_at', now(),
        'reason', 'official_manufacturer_formula_version_conflict'
      ),
      updated_at = now()
  WHERE cache_key = v_cache AND active;

  UPDATE public.catalog_manual_evidence_reviews
  SET evidence_status = 'quarantined',
      quarantine_reason =
        'Official current PDP ingredient list and linked label E410422 materially disagree; exact current package/GTIN formula version is unresolved.',
      review_notes =
        'Do not resolve or score this product from the PDP, linked PDF, GTIN 038100330772, PetSmart GTIN 038100330482, or conflicting GTIN 038100330222 until Purina publishes exact current package/GTIN evidence.',
      resolved_identity = resolved_identity || jsonb_build_object(
        'official_source_conflict', true,
        'current_page_ingredient_count', 39,
        'linked_pdf_ingredient_count', 40,
        'safe_resolution', 'abstain'
      ),
      updated_at = now()
  WHERE review_key =
    'manual-search:moist-and-meaty:burger-cheddar-eric:20260725';

  UPDATE public.catalog_source_runs
  SET accepted_count = 0,
      rejected_count = 2,
      metadata = metadata || jsonb_build_object(
        'official_source_conflict_detected_at', now(),
        'current_page_ingredient_count', 39,
        'linked_pdf_ingredient_count', 40,
        'safe_resolution', 'abstain'
      ),
      updated_at = now()
  WHERE run_key =
    'manual-exact-evidence:moist-and-meaty:burger-cheddar-eric:20260725'
  RETURNING id INTO v_run;

  IF v_run IS NULL THEN
    RAISE EXCEPTION 'Moist & Meaty source-run audit row missing';
  END IF;

  UPDATE public.catalog_acquisition_queue
  SET status = 'deferred',
      resolved_at = NULL,
      resolution_reason = NULL,
      needs_product_record = true,
      needs_verified_ingredients = true,
      needs_verified_image = false,
      ready_rows = 0,
      acquisition_notes =
        'Official source conflict: the current Purina PDP lists 39 ingredients including animal fat preserved with TBHQ and no vegetable oil, while its linked official label E410422 lists 40 ingredients including mixed tocopherols and vegetable oil. All related GTINs safely abstain until Purina provides exact current package/GTIN evidence.',
      sample_metadata = COALESCE(sample_metadata, '{}'::JSONB) ||
        jsonb_build_object(
          'official_source_conflict', true,
          'current_page_url', v_page,
          'linked_label_pdf_url', v_pdf,
          'current_page_ingredient_count', 39,
          'linked_pdf_ingredient_count', 40,
          'fallback_required', true
        ),
      last_refreshed_at = now(),
      updated_at = now()
  WHERE brand = 'moist and meaty'
    AND (
      cache_key IN (
        v_cache,
        'petsmart-retail-catalog:038100330482',
        'petsmart-retail-catalog:038100330222'
      )
      OR product_name ILIKE '%burger%cheddar%'
    );

  SELECT
    (SELECT count(*) FROM public.search_verified_products(
      'Purina Moist & Meaty Burger With Cheddar Cheese Soft Dog Food', 8
    ) WHERE cache_key IN (
      v_cache,
      'petsmart-retail-catalog:038100330482',
      'petsmart-retail-catalog:038100330222'
    ))
    + (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
      '038100330772', 8
    ))
    + (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
      '038100330482', 8
    ))
    + (SELECT count(*) FROM public.resolve_verified_product_by_gtin(
      '038100330222', 8
    ))
  INTO v_resolution_count;

  IF v_resolution_count <> 0
     OR EXISTS (
       SELECT 1 FROM public.catalog_skus
       WHERE gtin IN ('038100330772','038100330482','038100330222')
         AND active
     )
     OR EXISTS (
       SELECT 1 FROM public.catalog_formulas
       WHERE id = v_formula
         AND (active OR verification_status <> 'quarantined'
              OR promoted_cache_key IS NOT NULL)
     )
     OR EXISTS (
       SELECT 1 FROM public.product_data
       WHERE cache_key IN (
         v_cache,
         'petsmart-retail-catalog:038100330482',
         'petsmart-retail-catalog:038100330222'
       )
       AND (
         catalog_exclusion_reason IS NULL
         OR ingredient_verification_status <> 'unverified'
       )
     )
  THEN
    RAISE EXCEPTION
      'Moist & Meaty official source-conflict abstention regression: %',
      v_resolution_count;
  END IF;
END
$$;
