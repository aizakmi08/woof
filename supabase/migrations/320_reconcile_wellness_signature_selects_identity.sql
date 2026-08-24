DO $$
DECLARE
  v_old_formula_key CONSTANT TEXT :=
    'wellness|wellness|wellness signature selects adult cat wet food grain free flaked|cat|adult|wet|tuna and salmon|';
  v_new_formula_key CONSTANT TEXT :=
    'wellness|wellness|signature selects flaked|cat|adult|wet|tuna and salmon|';
  v_new_identity_hash CONSTANT TEXT :=
    '29173314912652b09b6783d530dbdfcbf40bae25947e946a8f52237e1b0139cd';
  v_formula_count INTEGER;
  v_gtin_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_formula_count
  FROM public.catalog_formulas
  WHERE formula_key = v_old_formula_key
    AND brand = 'wellness'
    AND pet_type = 'cat'
    AND life_stage = 'adult'
    AND food_form = 'wet'
    AND flavor = 'tuna and salmon';

  IF v_formula_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one exact Wellness Signature Selects formula but found %',
      v_formula_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_new_formula_key
  ) THEN
    RAISE EXCEPTION 'Canonical Wellness Signature Selects formula already exists';
  END IF;

  SELECT count(DISTINCT sku.gtin)
  INTO v_gtin_count
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
  WHERE formula.formula_key = v_old_formula_key
    AND sku.active
    AND sku.gtin IN ('076344060048', '076344060543');

  IF v_gtin_count <> 2 THEN
    RAISE EXCEPTION
      'Expected both exact Wellness package GTINs but found %',
      v_gtin_count;
  END IF;

  UPDATE public.catalog_observations observation
  SET
    product_line = 'signature selects flaked',
    flavor = 'tuna and salmon'
  FROM public.catalog_formulas formula
  WHERE formula.formula_key = v_old_formula_key
    AND observation.formula_id = formula.id;

  UPDATE public.catalog_formulas
  SET
    formula_key = v_new_formula_key,
    identity_hash = v_new_identity_hash,
    product_line = 'signature selects flaked',
    flavor = 'tuna and salmon',
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(
        protected_terms
        || ARRAY['Signature Selects', 'Flaked', 'Tuna', 'Salmon']
      ) AS term
      WHERE NULLIF(btrim(term), '') IS NOT NULL
    ),
    updated_at = NOW()
  WHERE formula_key = v_old_formula_key;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one Wellness identity update but updated %',
      v_updated_count;
  END IF;
END;
$$;
