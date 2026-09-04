-- Users and acquisition sources often paste retailer titles with store/source
-- suffixes. These terms should not be required to match official verified rows.

CREATE OR REPLACE FUNCTION public.normalize_verified_product_search_query(q TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
  SELECT NULLIF(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              extensions.unaccent(lower(trim(COALESCE(q, '')))),
              '[^a-z0-9]+',
              ' ',
              'g'
            ),
            '\m[0-9]+( [0-9]+)? (lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|bag|bags)\M',
            ' ',
            'g'
          ),
          '\m(natural|ingredients?|artificial|flavors?|preservatives?|healthy|growth|formula|dha|savory|recipe|bag|bags|lb|lbs|oz|ounce|ounces|pound|pounds|kg|g|gram|grams|with|for|food|foods|chewy|amazon|walmart|target|petco|petsmart|petsense|tractors?|supply|company)\M',
          ' ',
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

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

DO $$
BEGIN
  IF public.normalize_verified_product_search_query(
    'Purina Pro Plan Complete Essentials Shredded Blend Chicken and Rice Do - Petsense'
  ) LIKE '%petsense%' THEN
    RAISE EXCEPTION 'verified product search normalizer must remove retailer suffixes';
  END IF;

  IF public.normalize_verified_product_search_query(
    'Purina Pro Plan Complete Essentials Shredded Blend Chicken and Rice Do - Petsense'
  ) NOT LIKE '%purina pro plan complete essentials shredded blend chicken and rice do%' THEN
    RAISE EXCEPTION 'verified product search normalizer must preserve product identity terms';
  END IF;
END $$;
