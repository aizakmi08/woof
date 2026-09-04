DO $$
DECLARE
  v_beef_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness sup sup wet dog food grain-free - beef wolf creek stew wilderness wolf-creek-stew-beef';
  v_chicken_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - chicken wolf creek stew wilderness wolf-creek-stew-chicken';
  v_duck_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - duck wolf creek stew wilderness wolf-creek-stew-duck';
  v_salmon_cache TEXT := 'blue-buffalo-general-mills:blue buffalo blue wilderness wet dog food grain-free - salmon wolf creek stew wilderness wolf-creek-stew-salmon';
  v_beef BIGINT;
  v_chicken BIGINT;
  v_duck BIGINT;
  v_salmon BIGINT;
  v_mixed BIGINT;
  v_top TEXT;
  v_count INTEGER;
BEGIN
  SELECT id INTO STRICT v_beef FROM public.catalog_formulas
  WHERE formula_key='blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty beef stew|';
  SELECT id INTO STRICT v_chicken FROM public.catalog_formulas
  WHERE formula_key='blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|chunky chicken stew|';
  SELECT id INTO STRICT v_duck FROM public.catalog_formulas
  WHERE formula_key='blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|hearty duck stew|';
  SELECT id INTO STRICT v_salmon FROM public.catalog_formulas
  WHERE formula_key='blue buffalo|blue buffalo|blue wilderness wolf creek stew|dog|adult|wet|savory salmon stew|';
  SELECT id INTO STRICT v_mixed FROM public.catalog_formulas
  WHERE formula_key='blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein adult wet dog food grain free|dog|all life stages|wet|beef|';

  UPDATE public.catalog_acquisition_queue
  SET status='resolved', resolved_at=now(),
    resolution_reason='Exact current BLUE Wilderness Wolf Creek Stew recipe is promoted with manufacturer ingredients, image, adult wet dog identity, and recipe-protected search.',
    acquisition_notes=CASE
      WHEN lower(product_name) LIKE '%duck%' THEN 'Official product 111210294 verifies Hearty Duck Stew, 37 exact ingredients, 12.5 oz can, matching front image, and AAFCO maintenance.'
      WHEN lower(product_name) LIKE '%salmon%' THEN 'Official product 111210295 verifies Savory Salmon Stew, 35 exact ingredients, 12.5 oz can, matching front image, and AAFCO maintenance.'
      ELSE 'Official product 111210292 verifies Hearty Beef Stew, 38 exact ingredients, 12.5 oz can, matching front image, and AAFCO maintenance. UPC 840243101283 is linked only because the historical retailer ingredient list exactly equals the current official list.'
    END,
    needs_product_record=false, needs_verified_ingredients=false,
    needs_verified_image=false, needs_pet_type=false, ready_rows=1,
    last_refreshed_at=now(), updated_at=now()
  WHERE gap_key IN (
    'census:f0cc2fb52c58d10100eab933951dbc95',
    'census:e75c187995ed639fe5232dbfcd666764',
    'census:eff6b9a31eaa8cb227575948e1d135f5',
    'product:blue buffalo wilderness wolf creek stew high protein natural wet food for dogs hearty salmon stew in gravy 125oz cans',
    'product:blue buffalo wilderness wolf creek stew wet highprotein amp grainfree made with natural ingredients hearty beef in gravy 125oz cans',
    'product:blue buffalo blue buffalo wilderness wolf creek stew wet highprotein amp grainfreemade with natural ingredientshearty beef in gravy125oz canspack of 24',
    'product:blue wilderness blue wilderness wolf creek hearty duck stew'
  );

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Blue Buffalo Wilderness Wolf Creek Stew Hearty Beef Wet Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  IF v_top IS DISTINCT FROM v_beef_cache THEN
    RAISE EXCEPTION 'Wolf Creek Beef search regression: %',v_top;
  END IF;

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Blue Buffalo Wilderness Wolf Creek Stew Chunky Chicken Wet Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  IF v_top IS DISTINCT FROM v_chicken_cache THEN
    RAISE EXCEPTION 'Wolf Creek Chicken search regression: %',v_top;
  END IF;

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Blue Buffalo Wilderness Wolf Creek Stew Hearty Duck Wet Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  IF v_top IS DISTINCT FROM v_duck_cache THEN
    RAISE EXCEPTION 'Wolf Creek Duck search regression: %',v_top;
  END IF;

  SELECT cache_key INTO v_top FROM public.search_verified_products(
    'Blue Buffalo Wilderness Wolf Creek Stew Savory Salmon Wet Dog Food',8
  ) ORDER BY rank DESC LIMIT 1;
  IF v_top IS DISTINCT FROM v_salmon_cache THEN
    RAISE EXCEPTION 'Wolf Creek Salmon search regression: %',v_top;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.resolve_verified_product_by_gtin('840243101283',8)
  WHERE cache_key=v_beef_cache AND flavor='Hearty Beef Stew'
    AND food_form='wet' AND life_stage='adult' AND package_size='12.5 Oz'
    AND ingredient_verification_status='manufacturer'
    AND image_verification_status='manufacturer';
  IF v_count <> 1 OR (
    SELECT count(*) FROM public.resolve_verified_product_by_gtin('840243101283',8)
  ) <> 1 THEN
    RAISE EXCEPTION 'Wolf Creek exact Beef barcode regression failed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_beef AND lower(product_name) ~ '(duck|salmon)'
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_duck AND lower(product_name) ~ '(beef|salmon)'
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_observations
    WHERE formula_id=v_salmon AND lower(product_name) ~ '(beef|duck)'
  ) THEN
    RAISE EXCEPTION 'Wolf Creek retailer recipe crossover remains';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.catalog_observations WHERE formula_id=v_mixed
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id=v_mixed AND active
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_formula_aliases
    WHERE alias_formula_key='blue buffalo|blue buffalo|blue buffalo wilderness wolf creek stew high protein adult wet dog food grain free|dog|all life stages|wet|beef|'
  ) THEN
    RAISE EXCEPTION 'Wolf Creek mixed recipe identity remains reachable';
  END IF;

  IF (
    SELECT count(*) FROM public.catalog_acquisition_queue
    WHERE gap_key IN (
      'census:f0cc2fb52c58d10100eab933951dbc95',
      'census:e75c187995ed639fe5232dbfcd666764',
      'census:eff6b9a31eaa8cb227575948e1d135f5',
      'product:blue buffalo wilderness wolf creek stew high protein natural wet food for dogs hearty salmon stew in gravy 125oz cans',
      'product:blue buffalo wilderness wolf creek stew wet highprotein amp grainfree made with natural ingredients hearty beef in gravy 125oz cans',
      'product:blue buffalo blue buffalo wilderness wolf creek stew wet highprotein amp grainfreemade with natural ingredientshearty beef in gravy125oz canspack of 24',
      'product:blue wilderness blue wilderness wolf creek hearty duck stew'
    ) AND status='resolved'
  ) <> 7 THEN
    RAISE EXCEPTION 'Wolf Creek exact single-recipe queue gaps did not close';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_acquisition_queue
    WHERE gap_key='product:blue buffalo wilderness beef and chicken grill and wolf creek stew hearty beef in gravy adult dog wet food'
      AND status IN ('open','deferred','in_progress','blocked')
  ) THEN
    RAISE EXCEPTION 'Wolf Creek variety-pack parent was incorrectly treated as one formula';
  END IF;

  IF (
    SELECT count(*) FROM public.catalog_skus
    WHERE formula_id IN (v_beef,v_chicken,v_duck,v_salmon)
      AND source_slug='blue-buffalo-general-mills'
      AND source_external_id IN (
        '111210292:12.5oz','111210293:12.5oz',
        '111210294:12.5oz','111210295:12.5oz'
      ) AND active AND gtin IS NULL
  ) <> 4 THEN
    RAISE EXCEPTION 'Wolf Creek official package-size children missing';
  END IF;
END
$$;
