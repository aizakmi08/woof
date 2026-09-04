-- Post-commit runtime and formula-version regression gate for current Wellness
-- Complete Health+ / CORE+ package versions.

DO $$
DECLARE
  v_top_cache TEXT;
  v_expected_cache TEXT;
  v_gtin TEXT;
  v_current_hash TEXT;
  v_older_hash TEXT;
  v_active_official_count INTEGER;
  v_active_duplicate_count INTEGER;
  v_alias_count INTEGER;
BEGIN
  FOR v_gtin, v_expected_cache IN
    SELECT *
    FROM (
      VALUES
        (
          '076344210000',
          'wellness-pet-company:wellness wellness complete health chicken oatmeal'
        ),
        (
          '076344210017',
          'wellness-pet-company:wellness wellness complete health whitefish sweet potato'
        ),
        (
          '076344182177',
          'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe'
        )
    ) expected(gtin, cache_key)
  LOOP
    SELECT result.cache_key
    INTO v_top_cache
    FROM public.resolve_verified_product_by_gtin(v_gtin, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_expected_cache THEN
      RAISE EXCEPTION
        'Wellness current package GTIN regression for %: expected %, found %',
        v_gtin,
        v_expected_cache,
        v_top_cache;
    END IF;
  END LOOP;

  FOR v_expected_cache, v_gtin IN
    SELECT *
    FROM (
      VALUES
        (
          'wellness-pet-company:wellness wellness complete health chicken oatmeal',
          'Wellness Complete Health+ Adult Chicken & Oatmeal Dry Dog Food'
        ),
        (
          'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
          'Wellness Complete Health+ Adult Whitefish & Sweet Potato Dry Dog Food'
        ),
        (
          'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe',
          'Wellness CORE+ Sensitive Skin & Stomach Adult Dry Dog Food Salmon & Rice'
        )
    ) expected(cache_key, search_query)
  LOOP
    SELECT result.cache_key
    INTO v_top_cache
    FROM public.search_verified_products(v_gtin, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_expected_cache THEN
      RAISE EXCEPTION
        'Wellness current package search regression for %: expected %, found %',
        v_gtin,
        v_expected_cache,
        v_top_cache;
    END IF;
  END LOOP;

  -- Older package UPCs remain tied to their own exact ingredient versions.
  FOR v_gtin, v_expected_cache IN
    SELECT *
    FROM (
      VALUES
        ('076344088936', 'petsmart-retail-catalog:076344088936'),
        ('076344088912', 'petsmart-retail-catalog:076344088912'),
        ('076344182184', 'petsmart-retail-catalog:076344182184')
    ) expected(gtin, cache_key)
  LOOP
    SELECT result.cache_key
    INTO v_top_cache
    FROM public.resolve_verified_product_by_gtin(v_gtin, 8) result
    ORDER BY result.rank DESC
    LIMIT 1;

    IF v_top_cache IS DISTINCT FROM v_expected_cache THEN
      RAISE EXCEPTION
        'Wellness older package GTIN boundary regression for %: expected %, found %',
        v_gtin,
        v_expected_cache,
        v_top_cache;
    END IF;
  END LOOP;

  SELECT count(*)
  INTO v_active_official_count
  FROM public.catalog_formulas formula
  JOIN public.product_data product
    ON product.cache_key = formula.promoted_cache_key
  WHERE formula.formula_key IN (
      'wellness pet company|wellness|complete health plus|dog|adult|dry|chicken and oatmeal|',
      'wellness pet company|wellness|complete health plus|dog|adult|dry|whitefish and sweet potato|',
      'wellness pet company|wellness|core plus sensitive skin and stomach|dog|adult|dry|salmon and rice recipe|'
    )
    AND formula.active
    AND formula.verification_status = 'verified'
    AND formula.pet_type = 'dog'
    AND formula.life_stage = 'adult'
    AND formula.food_form = 'dry'
    AND product.source_quality = 'manufacturer'
    AND product.ingredient_verification_status = 'manufacturer'
    AND product.image_verification_status = 'manufacturer'
    AND product.gtin IN (
      '076344210000',
      '076344210017',
      '076344182177'
    )
    AND product.package_size = '4 lb'
    AND product.is_complete_food
    AND product.catalog_exclusion_reason IS NULL;

  SELECT count(*)
  INTO v_active_duplicate_count
  FROM public.catalog_formulas formula
  WHERE formula.source_url IN (
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-plus-chicken-oatmeal/',
      'https://www.wellnesspetfood.com/product-catalog/wellness-complete-health-plus-whitefish-sweet-potato/',
      'https://www.wellnesspetfood.com/product-catalog/wellness-core-plus-dog-wholesome-grains-sensitive-skin-stomach-salmon-rice/'
    )
    AND formula.active
    AND formula.verification_status = 'verified';

  SELECT count(*)
  INTO v_alias_count
  FROM public.catalog_formula_aliases alias
  WHERE alias.alias_formula_key IN (
      'wellness pet company|wellness|wellness complete health adult chicken and oatmeal dry dog food|dog|adult|dry||',
      'wellness pet company|wellness|wellness complete health adult whitefish and sweet potato dry dog food|dog|adult|dry||',
      'wellness pet company|wellness|wellness core sensitive skin stomach salmon rice dry dog food|dog|unknown|dry||'
    );

  IF v_active_official_count <> 3
      OR v_active_duplicate_count <> 3
      OR v_alias_count <> 3 THEN
    RAISE EXCEPTION
      'Wellness current package canonical gate failed: official %, active source rows %, aliases %',
      v_active_official_count,
      v_active_duplicate_count,
      v_alias_count;
  END IF;

  SELECT
    encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          current_formula.ingredient_text
        ),
        'sha256'
      ),
      'hex'
    ),
    encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          older_product.ingredient_text
        ),
        'sha256'
      ),
      'hex'
    )
  INTO v_current_hash, v_older_hash
  FROM public.catalog_formulas current_formula
  JOIN public.product_data older_product
    ON older_product.cache_key = 'petsmart-retail-catalog:076344182184'
  WHERE current_formula.promoted_cache_key =
    'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe';

  IF v_current_hash IS NULL
      OR v_older_hash IS NULL
      OR v_current_hash = v_older_hash THEN
    RAISE EXCEPTION
      'Wellness CORE+ current/older formula-version boundary was lost';
  END IF;
END;
$$;
