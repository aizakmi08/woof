-- Assert that the exact label-reviewed formula exists before reconciliation.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_count
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    AND active
    AND verification_status = 'verified'
    AND promoted_cache_key = 'petsmart-authority:196481089488'
    AND ingredient_text ~* '^Lamb, Fish Meal, Brown Rice'
    AND ingredient_text !~* '^Deboned Lamb';

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Authority exact-evidence canonical formula count was %',
      v_count;
  END IF;
END $$;
