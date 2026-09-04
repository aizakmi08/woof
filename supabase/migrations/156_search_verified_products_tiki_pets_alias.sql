-- Retail listings often use the parent brand "TIKI PETS" while official
-- source rows are split into shelf brands "Tiki Cat" and "Tiki Dog". Normalize
-- the strict verified-search query only when species terms disambiguate it.
DO $$
DECLARE
  function_sql TEXT;
  original_sql TEXT;
  input_block TEXT;
  alias_input_block TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_verified_products'
    AND pg_get_function_identity_arguments(p.oid) = 'q text, max_results integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_verified_products(q text, max_results integer) not found';
  END IF;

  IF function_sql LIKE '%TIKI PETS verified-search alias normalization%' THEN
    RETURN;
  END IF;

  original_sql := function_sql;
  input_block := $old$  WITH input AS (
    SELECT
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(trim(q))), '[^a-z0-9]+', ' ', 'g')), '') AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  query AS ($old$;

  alias_input_block := $new$  WITH raw_input AS (
    SELECT
      NULLIF(trim(regexp_replace(extensions.unaccent(lower(trim(q))), '[^a-z0-9]+', ' ', 'g')), '') AS normalized,
      LEAST(GREATEST(COALESCE(max_results, 10), 1), 25) AS safe_limit
  ),
  input AS (
    SELECT
      CASE
        -- TIKI PETS verified-search alias normalization
        WHEN normalized ~ '\mtiki pets\M'
          AND normalized ~ '\m(cats?|kitten|kittens|feline|felines)\M'
          THEN regexp_replace(normalized, '\mtiki pets\M', 'tiki cat', 'g')
        WHEN normalized ~ '\mtiki pets\M'
          AND normalized ~ '\m(dogs?|pupp(y|ies)|canine|canines)\M'
          THEN regexp_replace(normalized, '\mtiki pets\M', 'tiki dog', 'g')
        ELSE normalized
      END AS normalized,
      safe_limit
    FROM raw_input
  ),
  query AS ($new$;

  function_sql := replace(function_sql, input_block, alias_input_block);

  IF function_sql = original_sql THEN
    RAISE EXCEPTION 'search_verified_products TIKI PETS alias patch target not found';
  END IF;

  IF regexp_count(function_sql, 'TIKI PETS verified-search alias normalization') <> 1 THEN
    RAISE EXCEPTION 'search_verified_products TIKI PETS alias patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_verified_products(TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO service_role;

UPDATE public.product_data
SET
  brand = CASE
    WHEN brand = 'TIKI PETS' AND pet_type = 'cat' THEN 'Tiki Cat'
    WHEN brand = 'TIKI PETS' AND pet_type = 'dog' THEN 'Tiki Dog'
    WHEN brand = 'ROYAL CANIN' THEN 'Royal Canin'
    WHEN brand IN ('Farmina Pet Foods', 'N&D') THEN 'Farmina'
    ELSE brand
  END,
  updated_at = now()
WHERE brand IN ('TIKI PETS', 'ROYAL CANIN', 'Farmina Pet Foods', 'N&D')
  AND (
    brand <> 'TIKI PETS'
    OR pet_type IN ('cat', 'dog')
  )
  AND is_complete_food = TRUE
  AND catalog_exclusion_reason IS NULL
  AND NOT public.is_likely_non_product_catalog_row(
    product_name,
    CASE
      WHEN brand = 'TIKI PETS' AND pet_type = 'cat' THEN 'Tiki Cat'
      WHEN brand = 'TIKI PETS' AND pet_type = 'dog' THEN 'Tiki Dog'
      WHEN brand = 'ROYAL CANIN' THEN 'Royal Canin'
      WHEN brand IN ('Farmina Pet Foods', 'N&D') THEN 'Farmina'
      ELSE brand
    END
  );

SELECT public.refresh_catalog_acquisition_queue(30, 5000) AS refresh_result;
SELECT public.reconcile_catalog_acquisition_queue_batch(100) AS reconcile_result;
