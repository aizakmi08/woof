-- Follow-up for localized stale Beyond rows whose product names do not carry
-- the English "Beyond" token but whose brand is a known Purina Beyond variant.

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
  );
