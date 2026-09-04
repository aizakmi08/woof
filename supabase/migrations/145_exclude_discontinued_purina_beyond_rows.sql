-- Purina's current official Beyond page states that Beyond pet food is no
-- longer available. Keep stale legacy rows for audit/history, but remove them
-- from current ready-catalog coverage and stop treating Beyond as an active
-- US shelf acquisition gap.

UPDATE public.product_data
SET
  is_complete_food = FALSE,
  catalog_exclusion_reason = 'discontinued_product_line',
  verified_at = NULL,
  updated_at = NOW()
WHERE catalog_exclusion_reason IS NULL
  AND (
    source = 'nestle-purina-beyond'
    OR lower(coalesce(brand, '')) IN ('purina beyond', 'beyond', 'beyond, purina')
    OR (
      lower(coalesce(brand, '')) = 'purina'
      AND product_name ILIKE '%beyond%'
    )
  );

UPDATE public.catalog_acquisition_queue
SET
  status = 'deferred',
  resolved_at = NOW(),
  resolution_reason = 'discontinued_product_line',
  acquisition_notes = 'Purina official Beyond page says Beyond pet food is no longer available: https://www.purina.com/beyond',
  updated_at = NOW()
WHERE status IN ('open', 'in_progress')
  AND (
    brand ILIKE '%beyond%'
    OR product_name ILIKE '%beyond%'
    OR normalized_query ILIKE '%beyond%'
  );
