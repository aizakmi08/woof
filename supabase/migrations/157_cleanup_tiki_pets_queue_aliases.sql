-- Remove legacy TIKI PETS multipack rows from the ready catalog and align
-- acquisition product rows to the current product_data brand after alias
-- canonicalization.
UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = 'not_single_formula_or_non_food',
  updated_at = now()
WHERE cache_key IN (
  'tiki pets tiki cat solutions mousse multipack wet digestion chicken amp egg',
  'tiki pets tiki dog taste of the world wet france beef potatoes amp carrots multipack'
)
  AND brand = 'TIKI PETS'
  AND source = 'amazon'
  AND ingredient_verification_status = 'unverified';

UPDATE public.catalog_acquisition_queue q
SET
  brand = p.brand,
  product_name = p.product_name,
  updated_at = now(),
  sample_metadata = q.sample_metadata
    || jsonb_build_object(
      'brand_synced_from_product_data_at',
      now(),
      'previous_brand',
      q.brand
    )
FROM public.product_data p
WHERE q.gap_type = 'product'
  AND q.status IN ('open', 'in_progress')
  AND q.gap_key = 'product:' || p.cache_key
  AND q.brand IS DISTINCT FROM p.brand;

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
