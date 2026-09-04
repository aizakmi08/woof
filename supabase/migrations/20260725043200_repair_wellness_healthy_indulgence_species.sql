-- These exact manufacturer-backed Healthy Indulgence formulas are cat foods.
-- Earlier serving imports inherited "dog" despite exact cat product identity.

UPDATE public.product_data
SET pet_type = 'cat',
    updated_at = NOW()
WHERE cache_key IN (
  'wellness-pet-company:wellness wellness complete health healthy indulgence gravies with bits of chicken turkey smothered in gravy',
  'wellness-pet-company:wellness wellness complete health healthy indulgence gravies with bits of tuna mackerel smothered in gravy',
  'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with salmon tuna in savory sauce',
  'wellness-pet-company:wellness wellness complete health healthy indulgence morsels with tuna in savory sauce',
  'wellness-pet-company:wellness wellness complete health healthy indulgence shreds with chicken turkey in light sauce'
)
  AND lower(product_name) LIKE '%wellness complete health healthy indulgence%';
