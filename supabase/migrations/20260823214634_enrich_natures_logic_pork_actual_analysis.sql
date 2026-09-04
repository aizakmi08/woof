-- Eric nutritionist regression: ingredient appearance must not outrank a
-- manufacturer-published nutrient conflict. Nature's Logic publishes a fuller
-- Actual Analysis for this exact formula on a dry-matter basis, including
-- calcium 5.34% and phosphorus 2.84%.
--
-- Source: https://natureslogic.com/dog-products/canine-dry-kibble-pork/

DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.product_data
  SET
    nutritional_info = COALESCE(nutritional_info, '{}'::JSONB) || jsonb_build_object(
      'typical_analysis', jsonb_build_object(
        'protein', 41.5,
        'fat', 15.0,
        'fiber', 2.96,
        'calcium', 5.34,
        'phosphorus', 2.84,
        'ash', 17.4,
        'analysis_type', 'actual analysis',
        'basis', 'dry matter',
        'source_url', 'https://natureslogic.com/dog-products/canine-dry-kibble-pork/'
      ),
      'nutrient_source_url', 'https://natureslogic.com/dog-products/canine-dry-kibble-pork/'
    ),
    has_published_nutrients = TRUE,
    -- The exact official product is explicitly labeled for all life stages.
    -- Preserve that source-backed stage so the 1.8% growth/reproduction
    -- calcium maximum applies instead of the 2.5% adult-maintenance maximum.
    life_stage = 'all life stages',
    updated_at = now()
  WHERE lower(regexp_replace(COALESCE(source_url, ''), '/+$', '')) =
        'https://natureslogic.com/dog-products/canine-dry-kibble-pork'
    AND lower(COALESCE(brand, '')) IN ('nature''s logic', 'natures logic')
    AND COALESCE(ingredient_verification_status, '') IN (
      'official',
      'manufacturer',
      'retailer_verified',
      'label_ocr_verified'
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION
      'Nature''s Logic Pork actual-analysis enrichment found no exact verified source row';
  END IF;
END;
$$;
