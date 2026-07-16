-- Collapse Nutro source rows to the shelf-facing brand so strict-ready
-- coverage and acquisition gaps reconcile under one brand key.
UPDATE public.product_data
SET
  brand = 'Nutro',
  updated_at = now()
WHERE brand = 'NUTRO';

UPDATE public.catalog_acquisition_queue
SET
  brand = 'Nutro',
  updated_at = now(),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb) || jsonb_build_object(
    'brand_synced_to', 'Nutro',
    'brand_synced_reason', 'canonicalized_nutro_source_brand',
    'brand_synced_at', now()
  )
WHERE brand = 'NUTRO';

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
