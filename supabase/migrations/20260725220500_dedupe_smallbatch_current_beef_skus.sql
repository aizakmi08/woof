DO $$
DECLARE
  v_formula_id BIGINT;
BEGIN
  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'smallbatch|smallbatch|frozen raw|dog|all life stages|frozen|beef|';

  UPDATE public.catalog_skus
  SET
    active = false,
    updated_at = now()
  WHERE formula_id = v_formula_id
    AND source_slug = 'smallbatch-pets'
    AND source_external_id NOT IN (
      'frozen-raw-beef-sliders:3lb',
      'frozen-raw-beef-patties-for-dogs:6lb',
      'frozen-raw-beef-patties-for-dogs:18lb'
    );

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
  ) <> 3 THEN
    RAISE EXCEPTION 'Smallbatch current frozen beef formula must have exactly three active SKU children';
  END IF;

  IF (
    SELECT count(DISTINCT package_size)
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
  ) <> 3 THEN
    RAISE EXCEPTION 'Smallbatch current frozen beef package sizes are not unique';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_formula_id
      AND active
      AND source_url LIKE '%-test%'
  ) THEN
    RAISE EXCEPTION 'Smallbatch obsolete test-path SKU remains active';
  END IF;
END
$$;
