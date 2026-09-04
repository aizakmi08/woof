DO $$
BEGIN
  UPDATE public.product_data
  SET product_name = CASE cache_key
    WHEN 'petsmart-retail-catalog:886817005267'
      THEN 'Applaws Adult Dry Cat Food - Whitefish Recipe'
    WHEN 'petsmart-retail-catalog:886817014375'
      THEN 'Applaws Vitality Indoor Complete & Balanced Adult Dry Cat Food - Turkey and Cod Recipe'
  END,
  updated_at = now()
  WHERE cache_key IN (
    'petsmart-retail-catalog:886817005267',
    'petsmart-retail-catalog:886817014375'
  );

  UPDATE public.catalog_formulas
  SET product_name = CASE promoted_cache_key
    WHEN 'petsmart-retail-catalog:886817005267'
      THEN 'Applaws Adult Dry Cat Food - Whitefish Recipe'
    WHEN 'petsmart-retail-catalog:886817014375'
      THEN 'Applaws Vitality Indoor Complete & Balanced Adult Dry Cat Food - Turkey and Cod Recipe'
  END,
  updated_at = now()
  WHERE promoted_cache_key IN (
    'petsmart-retail-catalog:886817005267',
    'petsmart-retail-catalog:886817014375'
  );

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      'petsmart-retail-catalog:886817005267',
      'petsmart-retail-catalog:886817014375'
    )
      AND product_name ILIKE 'Applaws%Cat Food%'
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws serving search-title normalization failed';
  END IF;
END
$$;
