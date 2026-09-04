CREATE OR REPLACE FUNCTION public.catalog_quality_state(
  p_pet_type TEXT,
  p_is_complete_food BOOLEAN,
  p_catalog_exclusion_reason TEXT,
  p_ingredient_text TEXT,
  p_ingredient_count INTEGER,
  p_ingredient_verification_status TEXT,
  p_image_url TEXT,
  p_image_verification_status TEXT,
  p_source_url TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_is_complete_food, TRUE) IS NOT TRUE
      OR COALESCE(NULLIF(trim(p_catalog_exclusion_reason), ''), '') <> ''
      OR (p_expires_at IS NOT NULL AND p_expires_at <= NOW())
      THEN 'excluded'
    WHEN lower(COALESCE(p_pet_type, 'unknown')) NOT IN ('dog', 'cat')
      THEN 'identity_only'
    WHEN (
      COALESCE(NULLIF(trim(p_source_url), ''), '') = ''
      OR COALESCE(p_ingredient_count, 0) < 5
      OR COALESCE(NULLIF(trim(p_ingredient_text), ''), '') = ''
      OR lower(COALESCE(p_ingredient_verification_status, '')) NOT IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
    )
      THEN 'needs_ingredients'
    WHEN (
      COALESCE(NULLIF(trim(p_source_url), ''), '') = ''
      OR COALESCE(NULLIF(trim(p_image_url), ''), '') = ''
      OR p_image_url ~* '^data:'
      OR lower(COALESCE(p_image_verification_status, '')) NOT IN (
        'official',
        'manufacturer',
        'retailer_verified'
      )
    )
      THEN 'needs_image'
    ELSE 'verified_ready'
  END;
$$;

REVOKE ALL ON FUNCTION public.catalog_quality_state(
  TEXT,
  BOOLEAN,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_quality_state(
  TEXT,
  BOOLEAN,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_quality_state(
  TEXT,
  BOOLEAN,
  TEXT,
  TEXT,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TIMESTAMPTZ
) TO service_role;
