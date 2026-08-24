DO $$
DECLARE
  v_dog_dry BIGINT;
  v_dog_wet BIGINT;
  v_dog_old_dry BIGINT;
  v_dog_old_wet BIGINT;
  v_cat_dry BIGINT;
  v_cat_wet BIGINT;
  v_cat_old_dry BIGINT;
  v_cat_old_wet BIGINT;
  v_cat_discovery_dry BIGINT;
  v_cat_discovery_wet BIGINT;
  v_cat_mixed BIGINT;
  v_cat_target_wet BIGINT;
  v_dog_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken oatmeal recipe for adult dogs true-solutions digestive-care';
  v_dog_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult dogs true-solutions digestive-care';
  v_cat_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken barley recipe for adult cats true-solutions digestive-care';
  v_cat_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult cats true-solutions digestive-care';
  v_cat_dry_source TEXT := 'https://www.bluebuffalo.com/dry-cat-food/true-solutions/digestive-care/';
  v_cat_wet_source TEXT := 'https://www.bluebuffalo.com/wet-cat-food/true-solutions/digestive-care/';
  v_cat_dry_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/true-solutions/share-product-image/share_truesolutions_dry_cat_blissfulbelly.png';
  v_cat_wet_front TEXT := 'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-wet-food/true-solutions/share-product-image/share_truesolutions_wet_cat_blissfulbelly.png';
BEGIN
  SELECT id INTO STRICT v_dog_dry
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|dry|chicken and oatmeal recipe|';
  SELECT id INTO STRICT v_dog_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|wet|chicken recipe|';
  SELECT id INTO STRICT v_dog_old_dry
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|';
  SELECT id INTO STRICT v_dog_old_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|';

  SELECT id INTO STRICT v_cat_dry
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|dry|chicken and barley recipe|';
  SELECT id INTO STRICT v_cat_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|wet|chicken recipe|';
  SELECT id INTO STRICT v_cat_old_dry
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care dry cat food natural chicken|cat|adult|dry||';
  SELECT id INTO STRICT v_cat_old_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care wet cat food natural|cat|adult|wet|chicken|';
  SELECT id INTO STRICT v_cat_discovery_dry
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions dry cat food blissful belly formula chicken 3|cat|unknown|dry||';
  SELECT id INTO STRICT v_cat_discovery_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions digestive care wet cat food for adult cats made with natural ingredients chicken cans|cat|adult|wet||';
  SELECT id INTO STRICT v_cat_mixed
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|unknown|chicken recipe|';
  SELECT id INTO STRICT v_cat_target_wet
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care chicken flavor premium wet cat food|cat|unknown|wet||';

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      v_dog_dry_cache, v_dog_wet_cache, v_cat_dry_cache, v_cat_wet_cache
    )
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND catalog_exclusion_reason IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'Blue Digestive Care current manufacturer evidence precondition failed';
  END IF;

  IF (
    SELECT cardinality(ingredients)
    FROM public.product_data
    WHERE cache_key = v_cat_dry_cache
  ) <> 70 OR (
    SELECT cardinality(ingredients)
    FROM public.product_data
    WHERE cache_key = v_cat_wet_cache
  ) <> 42 THEN
    RAISE EXCEPTION 'Blue Digestive Care cat ingredient precondition failed';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'BLUE True Solutions Digestive Care Chicken & Barley Recipe for Adult Cats',
    brand = 'Blue Buffalo',
    product_line = 'BLUE True Solutions Digestive Care',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'Chicken & Barley Recipe',
    package_size = '3.5 & 11 lb bags',
    source = 'blue-buffalo-general-mills',
    source_quality = 'manufacturer',
    source_url = v_cat_dry_source,
    image_url = v_cat_dry_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key = v_cat_dry_cache;

  UPDATE public.product_data
  SET
    product_name = 'BLUE True Solutions Digestive Care Chicken Recipe for Adult Cats',
    brand = 'Blue Buffalo',
    product_line = 'BLUE True Solutions Digestive Care',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'Chicken Recipe',
    package_size = '3 oz can',
    source = 'blue-buffalo-general-mills',
    source_quality = 'manufacturer',
    source_url = v_cat_wet_source,
    image_url = v_cat_wet_front,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key = v_cat_wet_cache;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'historical_formula_version_conflict',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    expires_at = now(),
    updated_at = now()
  WHERE cache_key IN (
    'petsmart-retail-catalog:840243135424',
    'petsmart-retail-catalog:840243135516',
    'petsmart-retail-catalog:840243135219',
    'petsmart-retail-catalog:840243135615',
    'blue buffalo blue buffalo true solutions blissful belly natural digestive care adult wet chicken 3oz cans pack of 1',
    'blue buffalo blue buffalo true solutions digestive care wet for adult cats made with natural ingredients chicken 3oz cans',
    'blue buffalo true solutions digestive care natural dry for adult cats chicken 11lb bag'
  );

  UPDATE public.catalog_formulas
  SET
    complete_food_evidence =
      'Official current Blue Buffalo formula verified independently. Historical PetSmart ingredients differ, so the historical GTIN is not linked to this current formula version.',
    updated_at = now()
  WHERE id IN (v_dog_dry, v_dog_wet);

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name = 'BLUE True Solutions Digestive Care Chicken & Barley Recipe for Adult Cats',
    product_line = 'blue true solutions digestive care',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'chicken and barley recipe',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Official Blue Buffalo: formulated to meet AAFCO Cat Food Nutrient Profiles for maintenance.',
    front_image_url = v_cat_dry_front,
    source_url = v_cat_dry_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue', 'true solutions', 'digestive care',
      'blissful belly', 'chicken', 'barley', 'adult', 'cat', 'dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_cat_dry_cache,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_cat_dry;

  UPDATE public.catalog_formulas
  SET
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name = 'BLUE True Solutions Digestive Care Chicken Recipe for Adult Cats',
    product_line = 'blue true solutions digestive care',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'chicken recipe',
    diet_condition = '',
    is_complete_food = true,
    complete_food_evidence =
      'Official Blue Buffalo: formulated to meet AAFCO Cat Food Nutrient Profiles for maintenance.',
    front_image_url = v_cat_wet_front,
    source_url = v_cat_wet_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'blue buffalo', 'blue', 'true solutions', 'digestive care',
      'blissful belly', 'chicken', 'adult', 'cat', 'wet', 'can'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    promoted_cache_key = v_cat_wet_cache,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_cat_wet;

  DELETE FROM public.catalog_formula_aliases
  WHERE alias_formula_key IN (
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|',
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|'
  );

  UPDATE public.catalog_observations
  SET formula_id = v_dog_old_dry
  WHERE source_external_id = 'petsmart-retail-catalog:840243135424'
    AND gtin = '840243135424';

  UPDATE public.catalog_observations
  SET formula_id = v_dog_old_wet
  WHERE source_external_id = 'petsmart-retail-catalog:840243135516'
    AND gtin = '840243135516';

  UPDATE public.catalog_field_evidence
  SET formula_id = v_dog_old_dry
  WHERE source_url =
    'https://www.petsmart.com/dog/food/dry-food/blue-buffalo-true-solutions-and-trade-blissful-belly-digestive-care-all-life-stages-dry-dog-food-56813.html';

  UPDATE public.catalog_field_evidence
  SET formula_id = v_dog_old_wet
  WHERE source_url =
    'https://www.petsmart.com/dog/food/canned-food/blue-buffalo-true-solutions-and-trade-blissful-belly-digestive-care-adult-wet-dog-food-12-5-oz-56820.html';

  UPDATE public.catalog_skus
  SET formula_id = v_dog_old_dry, active = false, updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135424';

  UPDATE public.catalog_skus
  SET formula_id = v_dog_old_wet, active = false, updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135516';

  UPDATE public.catalog_observations
  SET formula_id = v_cat_discovery_dry
  WHERE formula_id IN (v_cat_dry, v_cat_wet, v_cat_mixed)
    AND source_external_id = '244840';

  UPDATE public.catalog_observations
  SET formula_id = v_cat_discovery_wet
  WHERE formula_id IN (
      v_cat_dry, v_cat_wet, v_cat_old_wet, v_cat_discovery_wet,
      v_cat_mixed, v_cat_target_wet
    )
    AND source_external_id IN ('3301206', '20654665309', 'A-80850645');

  UPDATE public.catalog_skus
  SET formula_id = v_cat_discovery_dry, active = false, updated_at = now()
  WHERE source_external_id IN ('244840', '673788167');

  UPDATE public.catalog_skus
  SET formula_id = v_cat_discovery_wet, active = false, updated_at = now()
  WHERE source_external_id IN ('3301206', '20654665309', 'A-80850645');

  UPDATE public.catalog_skus
  SET formula_id = v_cat_old_dry, active = false, updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135219';

  UPDATE public.catalog_skus
  SET formula_id = v_cat_old_wet, active = false, updated_at = now()
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') = '840243135615';

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = COALESCE(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence = CASE
      WHEN id IN (v_dog_old_dry, v_dog_old_wet, v_cat_old_dry, v_cat_old_wet)
        THEN 'Historical retailer ingredient formula differs from the current official manufacturer formula. GTIN is preserved on this inactive version and must not resolve to current ingredients without exact current package proof.'
      ELSE 'Retailer listing does not prove whether it represents the historical or current ingredient formula. Preserved as a quarantined form-specific discovery identity.'
    END,
    updated_at = now()
  WHERE id IN (
    v_dog_old_dry, v_dog_old_wet,
    v_cat_old_dry, v_cat_old_wet,
    v_cat_discovery_dry, v_cat_discovery_wet,
    v_cat_mixed, v_cat_target_wet
  );

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id IN (
    v_dog_old_dry, v_dog_old_wet,
    v_cat_old_dry, v_cat_old_wet,
    v_cat_discovery_dry, v_cat_discovery_wet,
    v_cat_mixed, v_cat_target_wet
  );

  UPDATE public.catalog_skus
  SET active = false, updated_at = now()
  WHERE formula_id IN (v_cat_dry, v_cat_wet)
    AND source_slug = 'blue-buffalo-general-mills'
    AND package_size = ''
    AND gtin IS NULL;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_cat_dry, NULL, '3.5 lb bag', 1, 'blue-buffalo-general-mills',
      '111210801:3.5lb', v_cat_dry_source, true, now(), now(), now()
    ),
    (
      v_cat_dry, NULL, '11 lb bag', 1, 'blue-buffalo-general-mills',
      '111210801:11lb', v_cat_dry_source, true, now(), now(), now()
    ),
    (
      v_cat_wet, NULL, '3 oz can', 1, 'blue-buffalo-general-mills',
      '111210804:3oz', v_cat_wet_source, true, now(), now(), now()
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
      v_cat_dry_cache,
      'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Cat Food'
      ),
      v_cat_dry_source,
      'manufacturer',
      now(),
      jsonb_build_object(
        'source', 'current_official_package_asset',
        'food_form_boundary', 'dry',
        'species_boundary', 'cat',
        'formula_version_note',
          'Alias selects the current official formula; historical GTIN is not mapped.'
      )
    ),
    (
      v_cat_wet_cache,
      'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Cat Food',
      public.normalize_verified_product_search_query(
        'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Cat Food'
      ),
      v_cat_wet_source,
      'manufacturer',
      now(),
      jsonb_build_object(
        'source', 'current_official_package_asset',
        'food_form_boundary', 'wet',
        'species_boundary', 'cat',
        'formula_version_note',
          'Alias selects the current official formula; historical GTIN is not mapped.'
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
    rejection_reason = 'historical_formula_version_conflict',
    evidence = COALESCE(evidence.evidence, '{}'::JSONB) ||
      jsonb_build_object(
        'formula_version_conflict_confirmed_at', now(),
        'historical_gtin_preserved_but_not_currently_resolvable', true,
        'current_formula_link_removed', true
      ),
    updated_at = now()
  WHERE evidence.cache_key IN (
    'petsmart-retail-catalog:840243135424',
    'petsmart-retail-catalog:840243135516',
    'petsmart-retail-catalog:840243135219',
    'petsmart-retail-catalog:840243135615'
  );

  UPDATE public.catalog_source_runs
  SET
    metadata = COALESCE(metadata, '{}'::JSONB) ||
      jsonb_build_object(
        'formula_version_correction_at', now(),
        'historical_gtins_not_linked_to_current_formulas',
          jsonb_build_array(
            '840243135424', '840243135516',
            '840243135219', '840243135615'
          ),
        'reason',
          'Retailer ingredient statements differ materially from current official manufacturer formula text.'
      ),
    updated_at = now()
  WHERE run_key =
    'manual-exact-evidence:blue-buffalo:true-solutions-digestive-care-dog-form-split:20260725';

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE active
      AND regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') IN (
        '840243135424', '840243135516',
        '840243135219', '840243135615'
      )
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care formula-version-conflicting GTIN remains active';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|',
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|'
    )
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care historical formula version remains canonically aliased';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE id IN (v_cat_dry, v_cat_wet)
      AND active
      AND verification_status = 'verified'
      AND promoted_cache_key IS NOT NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Blue Digestive Care current cat formulas were not promoted';
  END IF;
END
$$;
