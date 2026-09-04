-- Ingredient statements with unbalanced parentheses are usually truncated OCR
-- or parser output. Keep them out of verified-ready serving rows until a full
-- source-backed ingredient list is reimported.

CREATE OR REPLACE FUNCTION public.catalog_has_unbalanced_parentheses(value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  depth INTEGER := 0;
  index INTEGER;
  char TEXT;
  text_value TEXT := COALESCE(value, '');
BEGIN
  FOR index IN 1..length(text_value) LOOP
    char := substr(text_value, index, 1);
    IF char = '(' THEN
      depth := depth + 1;
    ELSIF char = ')' THEN
      depth := depth - 1;
      IF depth < 0 THEN
        RETURN TRUE;
      END IF;
    END IF;
  END LOOP;

  RETURN depth <> 0;
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_has_unbalanced_parentheses(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalog_has_unbalanced_parentheses(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_has_unbalanced_parentheses(TEXT) TO service_role;

DO $$
BEGIN
  IF public.catalog_has_unbalanced_parentheses('Chicken, Chicken Fat (Preserved With Mixed Tocopherols), Salt') THEN
    RAISE EXCEPTION 'balanced ingredient parentheses must pass';
  END IF;

  IF NOT public.catalog_has_unbalanced_parentheses('Chicken, Vitamins (Choline Chloride, Vitamin E Supplement') THEN
    RAISE EXCEPTION 'unclosed ingredient parenthesis must fail';
  END IF;

  IF NOT public.catalog_has_unbalanced_parentheses('Chicken), Minerals (Zinc Sulfate') THEN
    RAISE EXCEPTION 'negative-depth ingredient parenthesis must fail';
  END IF;
END;
$$;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%ingredient parenthesis balance import guard%' THEN
    function_sql := replace(
      function_sql,
      $$  FROM deduped_feed
),$$,
      $$  FROM deduped_feed
  WHERE NOT public.catalog_has_unbalanced_parentheses(ingredient_text)
  -- ingredient parenthesis balance import guard
),$$
    );
  END IF;

  IF function_sql NOT LIKE '%ingredient parenthesis balance import guard%'
     OR function_sql NOT LIKE '%public.catalog_has_unbalanced_parentheses(ingredient_text)%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed parenthesis guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role;

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%ingredient parenthesis balance import guard%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed must keep ingredient parenthesis balance import guard';
  END IF;
END;
$$;
