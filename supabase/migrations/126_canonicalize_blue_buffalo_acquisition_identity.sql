-- Canonicalize Blue Buffalo's manufacturer naming before acquisition
-- identity matching. Manufacturer feeds often title products as "BLUE ..."
-- while legacy queue rows use "Blue Buffalo ..." or duplicate the brand as
-- "Blue Buffalo BLUE ..."; this keeps the strict protein/recipe guards while
-- avoiding avoidable false negatives.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_identity_normalize(p_value TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                extensions.unaccent(lower(COALESCE(p_value, ''))),
                '[^a-z0-9]+',
                ' ',
                'g'
              ),
              '\mblue buffalo\M',
              'blue',
              'g'
            ),
            '\mblue s\M',
            'blue',
            'g'
          ),
          '\mblue blue\M',
          'blue',
          'g'
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_normalize(TEXT) TO service_role;
