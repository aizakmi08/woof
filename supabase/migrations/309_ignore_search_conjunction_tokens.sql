-- Treat the written conjunction "and" the same as an ampersand. Requiring an
-- "and" token caused verified products such as Moist & Meaty to return zero
-- results when OCR or speech produced "Moist and Meaty".

ALTER FUNCTION public.normalize_verified_product_search_query(TEXT)
  RENAME TO normalize_verified_product_search_query_v1;

CREATE FUNCTION public.normalize_verified_product_search_query(q TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT public.normalize_verified_product_search_query_v1(
    regexp_replace(COALESCE(q, ''), '\mand\M', ' ', 'gi')
  );
$$;

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query_v1(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query_v1(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query_v1(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query_v1(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_verified_product_search_query(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_verified_product_search_query(TEXT) TO service_role;

DO $$
BEGIN
  IF public.normalize_verified_product_search_query('Moist and Meaty Burger with Cheddar')
    IS DISTINCT FROM public.normalize_verified_product_search_query('Moist & Meaty Burger with Cheddar') THEN
    RAISE EXCEPTION 'written and ampersand product queries must normalize identically';
  END IF;

  IF public.normalize_verified_product_search_query('Open fram GoodGut salmon')
    <> 'open farm goodgut salmon' THEN
    RAISE EXCEPTION 'existing Open Farm typo normalization must be preserved';
  END IF;

  IF public.normalize_verified_product_search_query('Purina pro plna salmon')
    <> 'purina pro plan salmon' THEN
    RAISE EXCEPTION 'existing Pro Plan typo normalization must be preserved';
  END IF;
END;
$$;
