-- Tighten the product_data detector so treats, supplements, toppers, samples,
-- and accessories do not count as analysis-ready complete dog/cat food rows.

CREATE OR REPLACE FUNCTION public.is_likely_non_product_catalog_row(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  WITH normalized AS (
    SELECT
      public.normalize_product_catalog_name(p_product_name) AS product_name,
      public.normalize_product_catalog_name(p_brand) AS brand
  )
  SELECT COALESCE(
    product_name ~ '^ingredients? (amp |and )?nutritional value$'
      OR product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
      OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
      OR (
        product_name ~ '(^| )trends?( |$)'
        AND product_name ~ '(^| )the rise of( |$)'
      )
      OR (
        product_name ~ '(^| )(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)( |$)'
      )
      OR (
        product_name ~ '(^| )samples?( |$)'
        AND product_name ~ '(^| )(pack|variety|bundle)( |$)'
      )
      OR (
        brand IS NOT NULL
        AND brand <> ''
        AND product_name IN (brand, brand || ' ' || brand)
      )
      OR (
        brand IN ('ingredients guide', 'dog treat')
        AND (
          product_name ~ '^ingredients? guide( ingredients? guide)?( |$)'
          OR product_name ~ '(^| )(dog|cat|pet) (food|treat) trends?( |$)'
          OR product_name ~ '(^| )(treats?|jerky|biscuits?|cookies?|chews?|sticks?|snacks?|toppers?|mixers?|broths?|purees?|supplements?|catnip|litter|lickables?|delectables)( |$)'
        )
      ),
    FALSE
  )
  FROM normalized;
$$;

DELETE FROM public.product_data
WHERE public.is_likely_non_product_catalog_row(product_name, brand);

ANALYZE public.product_data;
