DO $$
DECLARE
  v_dog_dry BIGINT;
  v_dog_wet BIGINT;
  v_cat_dry BIGINT;
  v_cat_wet BIGINT;
  v_dog_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken oatmeal recipe for adult dogs true-solutions digestive-care';
  v_dog_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult dogs true-solutions digestive-care';
  v_cat_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken barley recipe for adult cats true-solutions digestive-care';
  v_cat_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult cats true-solutions digestive-care';
  v_dog_dry_source TEXT := 'https://www.bluebuffalo.com/dry-dog-food/true-solutions/digestive-care/';
  v_dog_wet_source TEXT := 'https://www.bluebuffalo.com/wet-dog-food/true-solutions/digestive-care/';
  v_cat_dry_source TEXT := 'https://www.bluebuffalo.com/dry-cat-food/true-solutions/digestive-care/';
  v_cat_wet_source TEXT := 'https://www.bluebuffalo.com/wet-cat-food/true-solutions/digestive-care/';
  v_note TEXT := 'Historical retailer ingredient formula differs materially from current official formula. Preserve historical GTIN but do not resolve current ingredients until exact current package/back-label or official feed evidence proves current formula version.';
  v_top TEXT;
  v_count INTEGER;
BEGIN
  SELECT id INTO STRICT v_dog_dry
  FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|dry|chicken and oatmeal recipe|';

  SELECT id INTO STRICT v_dog_wet
  FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|wet|chicken recipe|';

  SELECT id INTO STRICT v_cat_dry
  FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|dry|chicken and barley recipe|';

  SELECT id INTO STRICT v_cat_wet
  FROM public.catalog_formulas
  WHERE formula_key = 'blue buffalo|blue buffalo|blue true solutions digestive care|cat|adult|wet|chicken recipe|';

  INSERT INTO public.catalog_acquisition_queue (
    gap_key, gap_type, status, priority_score, brand, product_name, cache_key,
    normalized_query, pet_type, product_source, source_quality, source_url,
    needs_product_record, needs_verified_ingredients, needs_verified_image,
    needs_pet_type, ready_rows, affected_product_count, demand_events,
    sample_metadata, acquisition_notes, last_refreshed_at, last_event_at,
    updated_at
  )
  SELECT
    gap.gap_key,
    'lookup',
    'open',
    5,
    'Blue Buffalo',
    gap.product_name,
    gap.cache_key,
    gap.normalized_query,
    gap.pet_type,
    'blue-buffalo-manufacturer-manual',
    'manufacturer',
    gap.source_url,
    false,
    false,
    false,
    false,
    1,
    1,
    0,
    jsonb_build_object(
      'historical_gtin', gap.gtin,
      'current_formula_key', formula.formula_key,
      'current_formula_id', formula.id,
      'historical_gtin_not_inherited', true,
      'do_not_resolve_until_current_formula_version_proven', true,
      'required_evidence', 'exact current package back label or official GTIN/formula feed'
    ),
    v_note,
    now(),
    now(),
    now()
  FROM (
    VALUES
      (
        'lookup:gtin:blue-digestive-care:dog-dry:840243135424',
        '840243135424',
        v_dog_dry,
        'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs',
        v_dog_dry_cache,
        'blue true solutions digestive care chicken oatmeal adult dog dry gtin 840243135424',
        'dog',
        v_dog_dry_source
      ),
      (
        'lookup:gtin:blue-digestive-care:dog-wet:840243135516',
        '840243135516',
        v_dog_wet,
        'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs',
        v_dog_wet_cache,
        'blue true solutions digestive care chicken adult dog wet gtin 840243135516',
        'dog',
        v_dog_wet_source
      ),
      (
        'lookup:gtin:blue-digestive-care:cat-dry:840243135219',
        '840243135219',
        v_cat_dry,
        'BLUE True Solutions Digestive Care Chicken & Barley Recipe for Adult Cats',
        v_cat_dry_cache,
        'blue true solutions digestive care chicken barley adult cat dry gtin 840243135219',
        'cat',
        v_cat_dry_source
      ),
      (
        'lookup:gtin:blue-digestive-care:cat-wet:840243135615',
        '840243135615',
        v_cat_wet,
        'BLUE True Solutions Digestive Care Chicken Recipe for Adult Cats',
        v_cat_wet_cache,
        'blue true solutions digestive care chicken adult cat wet gtin 840243135615',
        'cat',
        v_cat_wet_source
      )
  ) AS gap(
    gap_key, gtin, formula_id, product_name, cache_key, normalized_query,
    pet_type, source_url
  )
  JOIN public.catalog_formulas formula ON formula.id = gap.formula_id
  ON CONFLICT (gap_key) DO UPDATE
  SET
    gap_type = 'lookup',
    status = 'open',
    priority_score = excluded.priority_score,
    brand = excluded.brand,
    product_name = excluded.product_name,
    cache_key = excluded.cache_key,
    normalized_query = excluded.normalized_query,
    pet_type = excluded.pet_type,
    product_source = excluded.product_source,
    source_quality = excluded.source_quality,
    source_url = excluded.source_url,
    needs_product_record = false,
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1,
    affected_product_count = 1,
    sample_metadata = excluded.sample_metadata,
    acquisition_notes = excluded.acquisition_notes,
    resolved_at = NULL,
    resolution_reason = NULL,
    last_refreshed_at = now(),
    updated_at = now();

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs dry',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_dog_dry_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care current dog dry typed search regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs wet',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_dog_wet_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care current dog wet typed search regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken & Barley Recipe for Adult Cats dry',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_cat_dry_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care current cat dry typed search regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken Recipe for Adult Cats wet',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_cat_wet_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care current cat wet typed search regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Dog Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_dog_dry_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care dog dry protected alias regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Dog Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_dog_wet_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care dog wet protected alias regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Cat Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_cat_dry_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care cat dry protected alias regression: %', v_top;
  END IF;

  SELECT cache_key INTO v_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Cat Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;
  IF v_top IS DISTINCT FROM v_cat_wet_cache THEN
    RAISE EXCEPTION 'Blue Digestive Care cat wet protected alias regression: %', v_top;
  END IF;

  SELECT count(*) INTO v_count
  FROM (
    SELECT * FROM public.resolve_verified_product_by_gtin('840243135424', 8)
    UNION ALL
    SELECT * FROM public.resolve_verified_product_by_gtin('840243135516', 8)
    UNION ALL
    SELECT * FROM public.resolve_verified_product_by_gtin('840243135219', 8)
    UNION ALL
    SELECT * FROM public.resolve_verified_product_by_gtin('840243135615', 8)
  ) resolved;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Blue Digestive Care historical formula-version GTIN unexpectedly resolves: % rows', v_count;
  END IF;

  SELECT count(DISTINCT regexp_replace(gtin, '[^0-9]', '', 'g')) INTO v_count
  FROM public.catalog_skus
  WHERE regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') IN (
    '840243135424', '840243135516', '840243135219', '840243135615'
  )
    AND active = false;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Blue Digestive Care historical GTIN evidence is not durably preserved: %', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE active
      AND regexp_replace(COALESCE(gtin, ''), '[^0-9]', '', 'g') IN (
        '840243135424', '840243135516', '840243135219', '840243135615'
      )
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care historical GTIN remains active';
  END IF;

  SELECT count(DISTINCT formula_id) INTO v_count
  FROM public.catalog_skus
  WHERE formula_id IN (v_dog_dry, v_dog_wet, v_cat_dry, v_cat_wet)
    AND active
    AND source_slug = 'blue-buffalo-general-mills'
    AND gtin IS NULL
    AND source_external_id IN (
      '111210807:4lb', '111210807:11lb', '111210807:20lb', '111210807:24lb',
      '111210811:12.5oz',
      '111210801:3.5lb', '111210801:11lb', '111210804:3oz'
    );
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Blue Digestive Care current official size SKUs missing: % formulas', v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id IN (v_dog_dry, v_dog_wet, v_cat_dry, v_cat_wet)
      AND active
      AND gtin IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care current formula inherited an unproven GTIN';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formula_aliases
    WHERE alias_formula_key IN (
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|',
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|',
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care dry cat food natural chicken|cat|adult|dry||',
      'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care wet cat food natural|cat|adult|wet|chicken|'
    )
  ) THEN
    RAISE EXCEPTION 'Blue Digestive Care historical formula version remains canonically aliased';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.catalog_formulas
  WHERE formula_key IN (
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|',
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|',
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care dry cat food natural chicken|cat|adult|dry||',
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care wet cat food natural|cat|adult|wet|chicken|'
  )
    AND (
      active
      OR verification_status <> 'quarantined'
      OR promoted_cache_key IS NOT NULL
    );
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Blue Digestive Care historical formula remains active/promoted: %', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.catalog_acquisition_queue
  WHERE gap_key IN (
    'lookup:gtin:blue-digestive-care:dog-dry:840243135424',
    'lookup:gtin:blue-digestive-care:dog-wet:840243135516',
    'lookup:gtin:blue-digestive-care:cat-dry:840243135219',
    'lookup:gtin:blue-digestive-care:cat-wet:840243135615'
  )
    AND gap_type = 'lookup'
    AND status = 'open'
    AND sample_metadata->>'historical_gtin_not_inherited' = 'true'
    AND acquisition_notes = v_note;
  IF v_count <> 4 THEN
    RAISE EXCEPTION 'Blue Digestive Care durable GTIN lookup gaps missing: %', v_count;
  END IF;
END
$$;
