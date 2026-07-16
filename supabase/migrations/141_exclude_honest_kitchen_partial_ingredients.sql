-- The Honest Kitchen "Main Ingredients" rows are partial marketing/listing
-- statements, not complete label ingredient panels. Keep the product evidence
-- in the catalog for future reconciliation, but remove these rows from ready
-- search/scan scoring until full exact ingredients are verified.
UPDATE public.product_data
SET
  ingredient_verification_status = 'unverified',
  catalog_exclusion_reason = 'incomplete_ingredient_statement',
  updated_at = NOW()
WHERE source = 'the-honest-kitchen'
  AND coalesce(ingredient_verification_status, 'unverified') IN (
    'gdsn',
    'official',
    'manufacturer',
    'retailer_verified',
    'label_ocr_verified'
  )
  AND coalesce(ingredient_text, array_to_string(ingredients, ', ')) ILIKE 'Main Ingredients:%'
  AND catalog_exclusion_reason IS NULL;
