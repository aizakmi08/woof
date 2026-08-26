-- Correct the exact manufacturer-backed Distinction pork formula. The product
-- name and manufacturer page both identify dry kibble; migration 250 missed it
-- because that page URL does not contain the older "dry-kibble" slug.
DO $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  UPDATE public.product_data
  SET food_form = 'dry', updated_at = NOW()
  WHERE lower(regexp_replace(COALESCE(source_url, ''), '/+$', '')) =
        'https://natureslogic.com/dog-products/distinction-canine-pork-recipe'
    AND lower(COALESCE(brand, '')) IN ('nature''s logic', 'natures logic')
    AND lower(COALESCE(product_name, '')) LIKE '%distinction%canine%pork%'
    AND lower(COALESCE(pet_type, '')) = 'dog';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Expected one exact Distinction Canine Pork row, updated %', v_updated;
  END IF;
END;
$$;

-- Make the manufacturer-published Actual Analysis provenance explicit for the
-- two Eric regression formulas. This is idempotent and exact-source scoped.
UPDATE public.product_data AS product
SET nutritional_info = COALESCE(product.nutritional_info, '{}'::JSONB)
    || jsonb_build_object(
      'typical_analysis', COALESCE(product.nutritional_info->'typical_analysis', '{}'::JSONB)
        || jsonb_build_object('publisher_label', 'Actual Analysis'),
      'published_analysis_source', jsonb_build_object(
        'status', 'extracted',
        'analysis_type', 'typical',
        'basis', 'dry_matter',
        'publisher_label', 'Actual Analysis',
        'source_format', 'html_table',
        'source_url', product.source_url
      )
    ),
    has_published_nutrients = TRUE,
    updated_at = NOW()
WHERE lower(regexp_replace(COALESCE(product.source_url, ''), '/+$', '')) IN (
  'https://natureslogic.com/dog-products/canine-dry-kibble-pork',
  'https://natureslogic.com/dog-products/distinction-canine-pork-recipe'
)
  AND lower(COALESCE(product.brand, '')) IN ('nature''s logic', 'natures logic')
  AND product.nutritional_info->'typical_analysis' IS NOT NULL;

-- Old server scores can be materially wrong (75-81 before the calcium cap).
DELETE FROM public.analysis_cache AS cache
USING public.product_data AS product
WHERE cache.cache_key = product.cache_key
  AND lower(regexp_replace(COALESCE(product.source_url, ''), '/+$', '')) IN (
    'https://natureslogic.com/dog-products/canine-dry-kibble-pork',
    'https://natureslogic.com/dog-products/distinction-canine-pork-recipe'
  );
