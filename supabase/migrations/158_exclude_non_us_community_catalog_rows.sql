-- The app targets dog/cat food sold in the U.S. Community and scraped rows
-- with obvious non-U.S. locale product names should not count as ready catalog
-- coverage or acquisition backlog.
UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = 'non_us_locale_product',
  updated_at = now()
WHERE is_complete_food = TRUE
  AND catalog_exclusion_reason IS NULL
  AND source IN ('opff', 'web', 'web_verified')
  AND source_quality IN ('community', 'unknown', 'scraped')
  AND lower(product_name) ~ '\m(pour|croquettes?|sachets?|gel[eé]e|st[eé]rilis[eé]|sterilis[eé]|strilis|adulte|chat|chien|chaton|chiot|p[aâ]t[eé]e|croquette|eminc[eé]s?|bouch[eé]es?|terrines?)\M';

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
