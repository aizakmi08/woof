-- The official Nutro catalog publishes the 12-count Ultra Chicken/Lamb/
-- Whitefish pâté as a package variant of the exact single-can formula. The
-- ingredient statement is identical and the official 11-digit UPC value
-- normalizes to GTIN-12 079105128254. Move the prior broad retailer formula
-- onto the exact manufacturer formula without changing either serving row.
DO $$
DECLARE
  v_target_formula_id BIGINT;
  v_legacy_formula_id BIGINT;
  v_conflicting_sku_count INTEGER;
  v_matching_ingredients BOOLEAN;
BEGIN
  SELECT id
  INTO STRICT v_target_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'mars petcare|nutro|trio of proteins chicken lamb and whitefish with superfoods pate|dog|adult|wet|chicken|'
    AND verification_status = 'verified'
    AND active = TRUE
    AND promoted_cache_key = 'nutro:079105101936';

  SELECT id
  INTO STRICT v_legacy_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'nutro|nutro|nutro ultra adult wet dog food pate|dog|adult|wet||'
    AND verification_status = 'verified'
    AND active = TRUE;

  SELECT count(*)
  INTO v_conflicting_sku_count
  FROM public.catalog_skus
  WHERE formula_id = v_legacy_formula_id
    AND gtin = '079105128254'
    AND source_slug = 'petsmart-retail-catalog'
    AND source_external_id = 'petsmart-retail-catalog:079105128254';

  IF v_conflicting_sku_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one exact Nutro multipack SKU on the legacy formula, found %',
      v_conflicting_sku_count;
  END IF;

  SELECT
    lower(regexp_replace(
      regexp_replace(btrim(legacy.ingredient_text), '^ingredients:\s*', '', 'i'),
      '\s+', ' ', 'g'
    ))
    =
    lower(regexp_replace(btrim(current_formula.ingredient_text), '\s+', ' ', 'g'))
  INTO v_matching_ingredients
  FROM public.catalog_formulas legacy
  CROSS JOIN public.catalog_formulas current_formula
  WHERE legacy.id = v_legacy_formula_id
    AND current_formula.id = v_target_formula_id
    AND legacy.pet_type = current_formula.pet_type
    AND legacy.life_stage = current_formula.life_stage
    AND legacy.food_form = current_formula.food_form;

  IF v_matching_ingredients IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION
      'Nutro multipack ingredients or formula boundaries do not match the exact official formula';
  END IF;

  UPDATE public.catalog_skus
  SET
    formula_id = v_target_formula_id,
    package_count = COALESCE(package_count, 12),
    updated_at = NOW()
  WHERE formula_id = v_legacy_formula_id
    AND gtin = '079105128254'
    AND source_slug = 'petsmart-retail-catalog'
    AND source_external_id = 'petsmart-retail-catalog:079105128254';

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    package_count,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at,
    created_at,
    updated_at
  )
  VALUES (
    v_target_formula_id,
    '079105128254',
    '3.5 OZ',
    12,
    'nutro',
    'nutro:79105128254',
    'https://www.nutro.com/products/wet-grain-free/multipack-trio-proteins-chicken-lamb-whitefish-pate',
    TRUE,
    NOW(),
    NOW(),
    NOW(),
    NOW()
  )
  ON CONFLICT (
    source_slug,
    source_external_id,
    gtin,
    package_size
  )
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    package_count = EXCLUDED.package_count,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = NOW(),
    updated_at = NOW();

  UPDATE public.catalog_observations
  SET formula_id = v_target_formula_id
  WHERE formula_id = v_legacy_formula_id
    AND gtin = '079105128254';

  UPDATE public.catalog_observations
  SET
    formula_id = v_target_formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[]
  WHERE run_id = (
      SELECT id
      FROM public.catalog_source_runs
      WHERE run_key =
        'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd'
    )
    AND source_external_id = 'nutro:79105128254'
    AND gtin = '079105128254'
    AND validation_status = 'quarantined'
    AND validation_reasons = ARRAY['gtin_formula_identity_conflict']::TEXT[];

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Expected the exact official Nutro multipack quarantine observation';
  END IF;

  UPDATE public.catalog_formulas
  SET
    active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(absent_since, NOW()),
    updated_at = NOW()
  WHERE id = v_legacy_formula_id;

  UPDATE public.catalog_source_runs
  SET
    accepted_count = 91,
    rejected_count = 0,
    metadata = metadata || jsonb_build_object(
      'resolved_gtin_identity_conflict', TRUE,
      'resolved_sku_only_formula_key',
        'mars petcare|nutro|trio of proteins chicken lamb and whitefish with superfoods pate|dog|adult|wet|chicken|'
    ),
    updated_at = NOW()
  WHERE run_key =
    'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd';
END $$;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_quarantine_count INTEGER;
BEGIN
  SELECT count(DISTINCT formula_id)
  INTO v_formula_count
  FROM public.catalog_skus
  WHERE gtin = '079105128254'
    AND active = TRUE;

  IF v_formula_count <> 1 THEN
    RAISE EXCEPTION
      'Nutro multipack GTIN still maps to % active formulas',
      v_formula_count;
  END IF;

  SELECT count(*)
  INTO v_quarantine_count
  FROM public.catalog_observations o
  JOIN public.catalog_source_runs r ON r.id = o.run_id
  WHERE r.run_key =
      'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd'
    AND o.source_external_id = 'nutro:79105128254'
    AND o.validation_status <> 'accepted';

  IF v_quarantine_count <> 0 THEN
    RAISE EXCEPTION
      'Nutro multipack official observation remains quarantined';
  END IF;
END $$;
