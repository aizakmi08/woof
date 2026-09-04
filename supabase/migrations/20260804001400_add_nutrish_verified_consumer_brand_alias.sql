-- Nutrish's current official catalog uses the shortened consumer brand while
-- active US retailer listings still use Rachael Ray Nutrish. Treat only these
-- explicit names as one shelf brand; manufacturer-family aliases remain banned.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_verified_brand_alias_match(
  p_queue_brand TEXT,
  p_matched_brand TEXT,
  p_matched_source TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH normalized AS (
    SELECT
      public.catalog_acquisition_identity_normalize(p_queue_brand) AS queue_brand,
      public.catalog_acquisition_identity_normalize(p_matched_brand) AS matched_brand,
      public.catalog_acquisition_identity_normalize(p_matched_source) AS matched_source
  )
  SELECT
    queue_brand IS NOT NULL
    AND matched_brand IS NOT NULL
    AND (
      queue_brand = matched_brand
      OR (
        matched_source = 'daves pet food'
        AND matched_brand = 'dave s pet food'
        AND queue_brand IN ('dave s', 'dave s 95', 'dave s 95 premium meats')
      )
      OR (
        matched_source = 'diamond pet foods'
        AND matched_brand IN ('diamond naturals', 'diamond naturals grain free')
        AND queue_brand IN ('diamond', 'diamond naturals', 'diamond naturals grain free')
      )
      OR (
        matched_source = 'tiki pets'
        AND matched_brand IN ('tiki pets', 'tiki cat', 'tiki dog')
        AND queue_brand IN ('tiki pets', 'tiki cat', 'tiki dog')
      )
      OR (
        matched_source = 'nutrish'
        AND matched_brand = 'nutrish'
        AND queue_brand IN ('nutrish', 'rachael ray', 'rachael ray nutrish')
      )
    )
  FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_verified_brand_alias_match(TEXT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_verified_brand_alias_match(
    'Rachael Ray Nutrish', 'Nutrish', 'nutrish'
  ) THEN
    RAISE EXCEPTION 'Rachael Ray Nutrish must match the verified Nutrish source';
  END IF;

  IF public.catalog_acquisition_verified_brand_alias_match(
    'Purina', 'Beneful', 'nestle-purina-beneful'
  ) THEN
    RAISE EXCEPTION 'Parent manufacturers must not cross consumer-brand boundaries';
  END IF;
END;
$$;
