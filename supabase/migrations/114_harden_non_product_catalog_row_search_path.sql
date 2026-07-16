-- Close the remaining catalog helper search-path advisor warning on live.

ALTER FUNCTION public.is_likely_non_product_catalog_row(TEXT, TEXT)
SET search_path = public;
