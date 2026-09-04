-- Eric nutritionist follow-up regression: the exact Distinction Canine Pork
-- Recipe was still using the limited guaranteed analysis even though the
-- manufacturer publishes an Actual Analysis on a dry-matter basis. Preserve
-- the source-backed values on this exact formula so the existing calcium
-- profile screen can prevent an ingredient-led high score.
--
-- Source: https://natureslogic.com/dog-products/distinction-canine-pork-recipe/

DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.product_data
  SET
    nutritional_info = COALESCE(nutritional_info, '{}'::JSONB) || jsonb_build_object(
      'typical_analysis', jsonb_build_object(
        'protein', 32.0,
        'fat', 17.8,
        'fiber', 3.51,
        'calcium', 3.52,
        'phosphorus', 1.96,
        'ash', 13.7,
        'analysis_type', 'actual analysis',
        'basis', 'dry matter',
        'source_url', 'https://natureslogic.com/dog-products/distinction-canine-pork-recipe/'
      ),
      'nutrient_source_url', 'https://natureslogic.com/dog-products/distinction-canine-pork-recipe/'
    ),
    has_published_nutrients = TRUE,
    life_stage = 'all_life_stages',
    updated_at = now()
  WHERE lower(regexp_replace(COALESCE(source_url, ''), '/+$', '')) =
        'https://natureslogic.com/dog-products/distinction-canine-pork-recipe'
    AND lower(COALESCE(brand, '')) IN ('nature''s logic', 'natures logic')
    AND lower(COALESCE(pet_type, '')) = 'dog'
    AND COALESCE(ingredient_verification_status, '') IN (
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    )
    AND COALESCE(image_verification_status, '') IN (
      'official',
      'manufacturer',
      'retailer_verified'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one verified Nature''s Logic Distinction Pork row, updated %',
      v_updated;
  END IF;
END;
$$;
