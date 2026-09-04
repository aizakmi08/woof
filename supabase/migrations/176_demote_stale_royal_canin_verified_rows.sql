UPDATE public.product_data
SET
  catalog_exclusion_reason = 'stale_official_evidence',
  ingredient_verification_status = 'unverified',
  image_verification_status = 'unverified',
  expires_at = LEAST(COALESCE(expires_at, now()), now()),
  updated_at = now()
WHERE cache_key IN (
  'royal-canin-mars-petcare:1151555:030111866868',
  'royal-canin-mars-petcare:1151555:030111868176',
  'royal-canin-mars-petcare:311173:030111562258'
);
