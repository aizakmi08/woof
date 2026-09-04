-- Remove source metadata accidentally parsed as package size from a valid
-- manufacturer-backed Purina ONE product row.

UPDATE public.product_data
SET
  package_size = NULL,
  updated_at = NOW()
WHERE cache_key = 'nestle-purina-one:017800184250'
  AND source = 'nestle-purina-one'
  AND lower(COALESCE(package_size, '')) ~ '(unit upc|per ellen|unknown size|unknown package|n/a)';

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue() AS reconcile_result;
