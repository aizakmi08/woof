-- Refine the reviewed Dr. Harvey's row so strict verified search matches the
-- product-page/shelf-label wording, not only the generic variant title.

UPDATE public.product_data
SET
  product_name = 'Garden Veggies Grain-Free Beef Recipe Dog Food',
  product_line = 'A Just Add Water Complete Diet',
  flavor = 'Beef Recipe',
  package_size = '5 lb',
  updated_at = NOW()
WHERE cache_key = 'dr-harvey-s:810320020820'
  AND source = 'dr-harvey-s';

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue() AS reconcile_result;
