-- PetSmart classified the exact Hill's Perfect Digestion Small & Mini dry
-- package as "fresh". The retailer title and URL both say dry, and the exact
-- GTIN, ingredient token stream, and image-backed official Hill's row confirm
-- the current dry formula. Repair the serving/observation metadata without
-- weakening the food-form boundary.

DO $$
DECLARE
  v_evidence_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_evidence_count
  FROM public.product_data retailer
  JOIN public.product_data official
    ON official.cache_key = 'hill-s-pet-nutrition:052742068879'
   AND official.gtin = retailer.gtin
  WHERE retailer.cache_key = 'petsmart-retail-catalog:052742068879'
    AND retailer.gtin = '052742068879'
    AND lower(btrim(retailer.pet_type)) = 'dog'
    AND lower(btrim(retailer.food_form)) = 'fresh'
    AND retailer.product_name ~* '\mdry\s+food\M'
    AND retailer.source_url ~* '/dry-food/'
    AND retailer.source_quality = 'retailer_verified'
    AND retailer.ingredient_verification_status = 'retailer_verified'
    AND retailer.image_verification_status = 'retailer_verified'
    AND official.source_quality = 'manufacturer'
    AND official.ingredient_verification_status = 'manufacturer'
    AND official.image_verification_status = 'manufacturer'
    AND lower(btrim(official.pet_type)) = 'dog'
    AND lower(btrim(official.food_form)) = 'dry'
    AND regexp_replace(
      lower(regexp_replace(btrim(retailer.ingredient_text), '^ingredients\s*:\s*', '', 'i')),
      '[^a-z0-9]+',
      '',
      'g'
    ) = regexp_replace(
      lower(regexp_replace(btrim(official.ingredient_text), '^ingredients\s*:\s*', '', 'i')),
      '[^a-z0-9]+',
      '',
      'g'
    )
    AND NULLIF(btrim(retailer.image_url), '') IS NOT NULL
    AND NULLIF(btrim(official.image_url), '') IS NOT NULL
    AND retailer.is_complete_food IS TRUE
    AND official.is_complete_food IS TRUE
    AND COALESCE(retailer.catalog_exclusion_reason, '') = ''
    AND COALESCE(official.catalog_exclusion_reason, '') = '';

  IF v_evidence_count <> 1 THEN
    RAISE EXCEPTION
      'Expected one exact Hill''s Perfect Digestion dry repair pair, found %',
      v_evidence_count;
  END IF;

  UPDATE public.product_data
  SET
    food_form = 'dry',
    updated_at = NOW()
  WHERE cache_key = 'petsmart-retail-catalog:052742068879'
    AND gtin = '052742068879'
    AND lower(btrim(food_form)) = 'fresh';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      'Expected to repair one Hill''s retailer serving row, updated %',
      v_updated_count;
  END IF;

  UPDATE public.catalog_observations
  SET food_form = 'dry'
  WHERE gtin = '052742068879'
    AND source_slug = 'petsmart-retail-catalog'
    AND lower(btrim(food_form)) = 'fresh';

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:052742068879'
      AND gtin = '052742068879'
      AND lower(btrim(food_form)) = 'dry'
  ) THEN
    RAISE EXCEPTION
      'Hill''s Perfect Digestion dry serving repair failed its postcondition';
  END IF;
END
$$;
