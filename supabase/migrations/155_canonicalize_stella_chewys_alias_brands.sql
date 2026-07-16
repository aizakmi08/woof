-- Collapse Stella & Chewy's brand aliases so acquisition gaps and searches use
-- one shelf-facing brand identity across imported sources.
UPDATE public.product_data
SET
  brand = 'Stella & Chewy''s',
  cache_key = regexp_replace(
    regexp_replace(cache_key, '(^[^:]+:)stella and chewys? ', '\1stella chewy s ', 'i'),
    '(^[^:]+:)stella chewy s dtc ',
    '\1stella chewy s ',
    'i'
  ),
  updated_at = now()
WHERE brand IN ('Stella and Chewy', 'Stella and Chewys', 'Stella & Chewy''s DTC');

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
