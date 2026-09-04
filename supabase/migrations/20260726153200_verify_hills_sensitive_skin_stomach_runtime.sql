-- Post-commit runtime regression gate for the Hill's v100 reconciliation.

DO $$
DECLARE
  v_cat_cache TEXT := 'hill-s-pet-nutrition:052742059150';
  v_dog_cache TEXT := 'hill-s-pet-nutrition:052742086453';
  v_expected_cache TEXT;
  v_top_cache TEXT;
  v_gtin TEXT;
BEGIN
  FOR v_gtin IN
    SELECT unnest(
      ARRAY[
        '052742059150',
        '052742059167',
        '052742086453',
        '052742088532'
      ]::TEXT[]
    )
  LOOP
    v_expected_cache := CASE
      WHEN v_gtin IN ('052742059150', '052742059167')
        THEN v_cat_cache
      ELSE v_dog_cache
    END;

    SELECT result.cache_key
    INTO v_top_cache
    FROM public.resolve_verified_product_by_gtin(v_gtin, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_expected_cache THEN
      RAISE EXCEPTION
        'Hill''s runtime GTIN regression for %: expected %, found %',
        v_gtin,
        v_expected_cache,
        v_top_cache;
    END IF;
  END LOOP;

  SELECT result.cache_key
  INTO v_top_cache
  FROM public.search_verified_products(
    'Hill''s Science Diet Sensitive Stomach & Sensitive Skin Pollock Meal & Barley Recipe Adult Dry Cat Food',
    8
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_top_cache IS DISTINCT FROM v_cat_cache THEN
    RAISE EXCEPTION
      'Hill''s Pollock & Barley runtime search regression: found %',
      v_top_cache;
  END IF;

  SELECT result.cache_key
  INTO v_top_cache
  FROM public.search_verified_products(
    'Hill''s Science Diet Adult Sensitive Stomach & Skin Salmon & Brown Rice Recipe Dry Dog Food',
    8
  ) result
  ORDER BY result.rank DESC
  LIMIT 1;

  IF v_top_cache IS DISTINCT FROM v_dog_cache THEN
    RAISE EXCEPTION
      'Hill''s Salmon & Brown Rice runtime search regression: found %',
      v_top_cache;
  END IF;
END;
$$;
