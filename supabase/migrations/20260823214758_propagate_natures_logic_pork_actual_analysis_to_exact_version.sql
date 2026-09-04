-- The app's exact-title search serves a verified retailer version of this
-- formula ahead of the manufacturer row. Propagate the official Actual
-- Analysis only when formula equivalence is exact: same brand, species,
-- complete ingredient text, and a verified pork-meal product identity.

DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH official AS (
    SELECT
      brand,
      ingredient_text,
      nutritional_info -> 'typical_analysis' AS typical_analysis,
      nutritional_info ->> 'nutrient_source_url' AS nutrient_source_url
    FROM public.product_data
    WHERE lower(regexp_replace(COALESCE(source_url, ''), '/+$', '')) =
          'https://natureslogic.com/dog-products/canine-dry-kibble-pork'
      AND lower(COALESCE(brand, '')) IN ('nature''s logic', 'natures logic')
      AND lower(COALESCE(pet_type, '')) = 'dog'
      AND COALESCE(ingredient_text, '') <> ''
      AND nutritional_info -> 'typical_analysis' IS NOT NULL
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  )
  UPDATE public.product_data AS target
  SET
    nutritional_info = COALESCE(target.nutritional_info, '{}'::JSONB)
      || jsonb_build_object(
        'typical_analysis', official.typical_analysis,
        'nutrient_source_url', official.nutrient_source_url
      ),
    has_published_nutrients = TRUE,
    life_stage = 'all_life_stages',
    updated_at = now()
  FROM official
  WHERE target.brand = official.brand
    AND lower(COALESCE(target.pet_type, '')) = 'dog'
    AND target.ingredient_text = official.ingredient_text
    AND lower(COALESCE(target.product_name, '')) LIKE '%pork%'
    AND lower(COALESCE(target.product_name, '')) LIKE '%meal%'
    AND COALESCE(target.ingredient_verification_status, '') IN (
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND COALESCE(target.image_verification_status, '') IN (
      'official',
      'manufacturer',
      'retailer_verified'
    )
    AND lower(regexp_replace(COALESCE(target.source_url, ''), '/+$', '')) <>
        'https://natureslogic.com/dog-products/canine-dry-kibble-pork';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one verified Nature''s Logic Pork serving row, updated %',
      v_updated;
  END IF;
END;
$$;
