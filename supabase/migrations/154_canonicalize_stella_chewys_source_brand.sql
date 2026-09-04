-- Canonicalize official Stella & Chewy's storefront rows to the shelf-facing brand.
UPDATE public.product_data
SET
  brand = 'Stella & Chewy''s',
  cache_key = regexp_replace(cache_key, '(^stella-and-chewys:)stella chewy s dtc ', '\1stella chewy s '),
  updated_at = now()
WHERE source = 'stella-and-chewys'
  AND brand = 'Stella & Chewy''s DTC';

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
