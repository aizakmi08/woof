DO $$
DECLARE
  v_legacy_formula_id BIGINT;
  v_current_formula_id BIGINT;
  v_cache_key TEXT := 'nestle-purina-one:017800570534';
BEGIN
  SELECT id
  INTO STRICT v_legacy_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'purina one|purina one|plus healthy weight high protein formula|dog|adult|dry|turkey|';

  SELECT id
  INTO STRICT v_current_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'nestle purina|purina one|purina one plus healthy weight high protein formula dry dog food|dog|unknown|dry|plus healthy weight high protein formula|';

  IF v_legacy_formula_id = v_current_formula_id THEN
    RAISE EXCEPTION 'Purina ONE legacy and current formula ids unexpectedly match';
  END IF;

  IF (
    SELECT ingredient_text
    FROM public.catalog_formulas
    WHERE id = v_legacy_formula_id
  ) IS DISTINCT FROM (
    SELECT ingredient_text
    FROM public.catalog_formulas
    WHERE id = v_current_formula_id
  ) THEN
    RAISE EXCEPTION 'Purina ONE Healthy Weight identities have different ingredient formulas';
  END IF;

  IF (
    SELECT promoted_cache_key
    FROM public.catalog_formulas
    WHERE id = v_legacy_formula_id
  ) IS DISTINCT FROM v_cache_key
  OR (
    SELECT promoted_cache_key
    FROM public.catalog_formulas
    WHERE id = v_current_formula_id
  ) IS DISTINCT FROM v_cache_key THEN
    RAISE EXCEPTION 'Purina ONE Healthy Weight identities do not share the exact serving row';
  END IF;

  UPDATE public.catalog_skus
  SET
    formula_id = v_current_formula_id,
    updated_at = now()
  WHERE formula_id = v_legacy_formula_id;

  UPDATE public.catalog_formulas
  SET
    active = false,
    absent_since = now(),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    updated_at = now()
  WHERE id = v_legacy_formula_id;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE promoted_cache_key = v_cache_key
      AND active
      AND verification_status = 'verified'
  ) <> 1 THEN
    RAISE EXCEPTION 'Purina ONE Healthy Weight must have one active canonical formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = v_legacy_formula_id
  ) THEN
    RAISE EXCEPTION 'Purina ONE legacy Healthy Weight SKUs were not moved';
  END IF;
END
$$;
