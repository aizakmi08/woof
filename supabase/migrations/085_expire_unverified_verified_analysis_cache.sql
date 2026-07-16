-- Prevent old OPFF/AI barcode fallbacks from being served as "verified" data.
-- Verified cache rows must carry explicit ingredient provenance from the catalog.
UPDATE public.analysis_cache
SET
  expires_at = LEAST(expires_at, now() - interval '1 second'),
  updated_at = now()
WHERE data_source = 'verified'
  AND COALESCE(
    opff_data->>'ingredientVerificationStatus',
    opff_data->>'ingredient_verification_status',
    ''
  ) NOT IN (
    'gdsn',
    'official',
    'manufacturer',
    'retailer_verified',
    'label_ocr_verified'
  );
