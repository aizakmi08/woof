DO $$
DECLARE
  v_dry_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken oatmeal recipe for adult dogs true-solutions digestive-care';
  v_wet_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue true solutions digestive care chicken recipe for adult dogs true-solutions digestive-care';
  v_dry_top TEXT;
  v_wet_top TEXT;
  v_dry_alias_top TEXT;
  v_wet_alias_top TEXT;
  v_dry_barcode_count INTEGER;
  v_wet_barcode_count INTEGER;
  v_wrong_form_count INTEGER;
  v_old_active_count INTEGER;
  v_mixed_alias_count INTEGER;
  v_open_gap_count INTEGER;
BEGIN
  SELECT cache_key INTO v_dry_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs dry',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT cache_key INTO v_wet_top
  FROM public.search_verified_products(
    'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs wet',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT cache_key INTO v_dry_alias_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Dry Dog Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT cache_key INTO v_wet_alias_top
  FROM public.search_verified_products(
    'Blue Buffalo True Solutions Blissful Belly Digestive Care Chicken Wet Dog Food',
    8
  )
  ORDER BY rank DESC
  LIMIT 1;

  SELECT count(DISTINCT cache_key)
  INTO v_dry_barcode_count
  FROM public.resolve_verified_product_by_gtin('840243135424', 8)
  WHERE cache_key = v_dry_cache
    AND food_form = 'dry'
    AND life_stage = 'adult'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND package_size = '24 Lb';

  SELECT count(DISTINCT cache_key)
  INTO v_wet_barcode_count
  FROM public.resolve_verified_product_by_gtin('840243135516', 8)
  WHERE cache_key = v_wet_cache
    AND food_form = 'wet'
    AND life_stage = 'adult'
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND package_size = '12.5 Oz';

  SELECT count(*)
  INTO v_wrong_form_count
  FROM (
    SELECT *
    FROM public.resolve_verified_product_by_gtin('840243135424', 8)
    WHERE food_form <> 'dry' OR cache_key <> v_dry_cache
    UNION ALL
    SELECT *
    FROM public.resolve_verified_product_by_gtin('840243135516', 8)
    WHERE food_form <> 'wet' OR cache_key <> v_wet_cache
  ) wrong;

  SELECT count(*)
  INTO v_old_active_count
  FROM public.catalog_formulas
  WHERE formula_key IN (
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care all life stages dry dog food|dog|all life stages|dry|chicken|',
    'blue buffalo|blue buffalo|blue buffalo true solutions blissful belly digestive care adult wet dog food|dog|adult|wet|chicken|',
    'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|unknown|chicken recipe|'
  )
    AND (
      active
      OR verification_status <> 'quarantined'
      OR promoted_cache_key IS NOT NULL
    );

  SELECT count(*)
  INTO v_mixed_alias_count
  FROM public.catalog_formula_aliases
  WHERE alias_formula_key =
    'blue buffalo|blue buffalo|blue true solutions digestive care|dog|adult|unknown|chicken recipe|';

  IF v_dry_top IS DISTINCT FROM v_dry_cache
     OR v_wet_top IS DISTINCT FROM v_wet_cache
     OR v_dry_alias_top IS DISTINCT FROM v_dry_cache
     OR v_wet_alias_top IS DISTINCT FROM v_wet_cache
     OR v_dry_barcode_count <> 1
     OR v_wet_barcode_count <> 1
     OR v_wrong_form_count <> 0
     OR v_old_active_count <> 0
     OR v_mixed_alias_count <> 0 THEN
    RAISE EXCEPTION
      'Blue Digestive Care regression failed: dry %, wet %, dry alias %, wet alias %, dry barcode %, wet barcode %, wrong form %, old active %, mixed alias %',
      v_dry_top,
      v_wet_top,
      v_dry_alias_top,
      v_wet_alias_top,
      v_dry_barcode_count,
      v_wet_barcode_count,
      v_wrong_form_count,
      v_old_active_count,
      v_mixed_alias_count;
  END IF;

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason =
      'Exact current Blue Buffalo Digestive Care dog formula resolves to a verified manufacturer record with a protected dry/wet boundary.',
    acquisition_notes =
      CASE
        WHEN lower(COALESCE(product_name, '')) LIKE '%wet%'
          THEN 'Official product 111210811 verifies adult wet Chicken Recipe, 41 exact ingredients, 12.5 oz can, and the exact 840243135516 package GTIN.'
        ELSE 'Official product 111210807 verifies adult dry Chicken & Oatmeal Recipe, 66 exact ingredients, four bag sizes, and the exact 840243135424 24 lb package GTIN.'
      END,
    needs_product_record = false,
    needs_verified_ingredients = false,
    needs_verified_image = false,
    needs_pet_type = false,
    ready_rows = 1,
    last_refreshed_at = now(),
    updated_at = now()
  WHERE gap_key IN (
    'census:e6f787f541a647ad7366d6ddad0cb80b',
    'product:blue buffalo blue buffalo true solutions digestive care wet for adult dogsmade with natural ingredientschicken125oz canspack of 24',
    'product:blue buffalo true solutions digestive care wet for adult dogs made with natural ingredients chicken 125oz cans'
  );

  SELECT count(*)
  INTO v_open_gap_count
  FROM public.catalog_acquisition_queue
  WHERE gap_key IN (
    'census:e6f787f541a647ad7366d6ddad0cb80b',
    'product:blue buffalo blue buffalo true solutions digestive care wet for adult dogsmade with natural ingredientschicken125oz canspack of 24',
    'product:blue buffalo true solutions digestive care wet for adult dogs made with natural ingredients chicken 125oz cans'
  )
    AND status IN ('open', 'in_progress', 'blocked', 'imported', 'deferred');

  IF v_open_gap_count <> 0 THEN
    RAISE EXCEPTION 'Blue Digestive Care exact dog queue aliases remain unresolved';
  END IF;
END
$$;
