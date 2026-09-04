-- Normalize case before removing non-identity characters. The original helper
-- applied the lowercase conversion after a lowercase-only regexp, which made
-- leading capitals disappear ("Wellness" became "ellness") and could turn a
-- valid exact retailer relationship into a false brand mismatch.

CREATE OR REPLACE FUNCTION public.catalog_normalize_retailer_boundary(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT regexp_replace(
    lower(replace(replace(COALESCE(p_value, ''), '-', ' '), '_', ' ')),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$;

DO $migration$
BEGIN
  IF public.catalog_normalize_retailer_boundary('Wellness') <> 'wellness'
    OR public.catalog_normalize_retailer_boundary('Hill''s Science Diet')
      <> 'hillssciencediet'
  THEN
    RAISE EXCEPTION 'retailer boundary case normalization repair failed';
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.catalog_normalize_retailer_boundary(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_normalize_retailer_boundary(TEXT)
  TO service_role;
