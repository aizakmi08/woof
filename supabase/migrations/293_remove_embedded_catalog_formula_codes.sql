-- Some official retailer statements place an internal formulation ID after a
-- vitamin/mineral group. Remove those non-ingredient IDs at delimiters as well
-- as at the end of the statement, then re-derive affected ingredient arrays.

CREATE OR REPLACE FUNCTION public.catalog_strip_trailing_formula_code(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
STRICT
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT btrim(replace(replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(value, '[[:space:]]+', ' ', 'g'),
        '(\.)[[:space:]]+[A-Z][0-9]{6}([,;.]|$)',
        '\1\2',
        'g'
      ),
      '[[:space:]]+[A-Z][0-9]{6}([,;.]|$)',
      '\1',
      'g'
    ),
    '.;',
    ';'
  ), '.,', ','));
$$;

REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_strip_trailing_formula_code(TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_strip_trailing_formula_code(
    'Chicken, Vitamins [Vitamin E Supplement, Vitamin D-3 Supplement]. A372025; Taurine'
  ) <> 'Chicken, Vitamins [Vitamin E Supplement, Vitamin D-3 Supplement]; Taurine' THEN
    RAISE EXCEPTION 'embedded catalog formula-code fixture failed';
  END IF;

  IF public.catalog_split_ingredient_statement(
    'Chicken, Vitamins [Vitamin E Supplement, Vitamin D-3 Supplement]. A372025; Taurine'
  ) <> ARRAY['Chicken', 'Vitamin E Supplement', 'Vitamin D-3 Supplement', 'Taurine']::TEXT[] THEN
    RAISE EXCEPTION 'embedded catalog formula-code parser fixture failed';
  END IF;
END;
$$;

WITH affected AS (
  SELECT
    id,
    public.catalog_strip_trailing_formula_code(ingredient_text) AS exact_ingredient_text
  FROM public.product_data
  WHERE ingredient_text IS NOT NULL
    AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
    AND ingredient_text ~ '(^|[[:space:]])[A-Z][0-9]{6}([,;.]|$)'
)
UPDATE public.product_data product
SET
  ingredient_text = affected.exact_ingredient_text,
  updated_at = NOW()
FROM affected
WHERE product.id = affected.id;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE ingredient_text ~ '(^|[[:space:]])[A-Z][0-9]{6}([,;.]|$)'
      AND NOT public.is_likely_non_product_catalog_row(product_name, brand)
  ) THEN
    RAISE EXCEPTION 'embedded catalog formula codes remain on product rows';
  END IF;
END;
$$;
