DO $$
BEGIN
  UPDATE public.catalog_formulas f
  SET
    product_name = p.product_name,
    ingredient_text = p.ingredient_text,
    ingredients = p.ingredients,
    front_image_url = p.image_url,
    source_url = p.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = CASE f.formula_key
      WHEN 'applaws|applaws|applaws adult dry cat food natural limited ingredient grain free whitefish|cat|adult|dry|whitefish|'
        THEN ARRAY['applaws', 'adult', 'dry', 'cat', 'whitefish', 'grain free']::TEXT[]
      ELSE ARRAY['applaws', 'vitality', 'indoor', 'complete and balanced', 'adult', 'dry', 'cat', 'turkey', 'cod']::TEXT[]
    END,
    verification_status = 'verified',
    active = true,
    promoted_cache_key = p.cache_key,
    promoted_at = now(),
    updated_at = now()
  FROM public.product_data p
  WHERE (
    f.formula_key = 'applaws|applaws|applaws adult dry cat food natural limited ingredient grain free whitefish|cat|adult|dry|whitefish|'
    AND p.cache_key = 'petsmart-retail-catalog:886817005267'
  ) OR (
    f.formula_key = 'applaws|applaws|applaws vitality indoor adult cat dry food high protein turkey and cod|cat|adult|dry|turkey and cod|'
    AND p.cache_key = 'petsmart-retail-catalog:886817014375'
  );

  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'unverified_ocr_formula_version_conflict',
    updated_at = now()
  WHERE cache_key IN (
    'applaws applaws whitefish adult cat',
    'applaws applaws vitality indoor turkey cod adult cat'
  );

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE formula_key IN (
      'applaws|applaws|applaws adult dry cat food natural limited ingredient grain free whitefish|cat|adult|dry|whitefish|',
      'applaws|applaws|applaws vitality indoor adult cat dry food high protein turkey and cod|cat|adult|dry|turkey and cod|'
    )
      AND active
      AND verification_status = 'verified'
      AND source_authority = 'manufacturer'
      AND promoted_cache_key IS NOT NULL
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws formula linkage failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key IN (
      'applaws applaws whitefish adult cat',
      'applaws applaws vitality indoor turkey cod adult cat'
    )
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Unverified Applaws OCR aliases remain active';
  END IF;
END
$$;
