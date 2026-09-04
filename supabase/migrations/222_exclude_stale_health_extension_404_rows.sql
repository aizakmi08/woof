UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = COALESCE(catalog_exclusion_reason, 'stale_official_source_404'),
  updated_at = NOW()
WHERE source = 'health-extension'
  AND source_url IN (
    'https://www.healthextension.com/products/cat-grain-free-chicken-duck-recipe?variant=18754522579040',
    'https://www.healthextension.com/products/cat-grain-free-chicken-pate-recipe?variant=18754525003872'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE source = 'health-extension'
      AND source_url IN (
        'https://www.healthextension.com/products/cat-grain-free-chicken-duck-recipe?variant=18754522579040',
        'https://www.healthextension.com/products/cat-grain-free-chicken-pate-recipe?variant=18754525003872'
      )
      AND public.catalog_quality_state(
        pet_type,
        is_complete_food,
        catalog_exclusion_reason,
        ingredient_text,
        COALESCE(ingredient_count, 0),
        ingredient_verification_status,
        image_url,
        image_verification_status,
        source_url,
        expires_at
      ) = 'verified_ready'
  ) THEN
    RAISE EXCEPTION 'Health Extension stale 404 rows must not remain verified_ready';
  END IF;
END $$;
