-- Official sites occasionally correct or expose inconsistent product titles while
-- keeping the same product page and image evidence. Exact source-URL imports must
-- replace the older cache key instead of creating a duplicate verified row.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%source URL title correction guard%' THEN
    function_sql := replace(
      function_sql,
      $$    AND lower(existing.product_name) = lower(incoming.product_name)
    AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))$$,
      $$    AND (
      lower(existing.product_name) = lower(incoming.product_name)
      OR (
        NULLIF(btrim(existing.pet_type), '') IS NOT NULL
        AND NULLIF(btrim(incoming.pet_type), '') IS NOT NULL
        AND lower(existing.pet_type) = lower(incoming.pet_type)
        AND NULLIF(btrim(existing.image_url), '') IS NOT NULL
        AND NULLIF(btrim(incoming.image_url), '') IS NOT NULL
        AND existing.image_url = incoming.image_url
      )
    )
    AND lower(COALESCE(existing.brand, '')) = lower(COALESCE(incoming.brand, ''))
    -- source URL title correction guard$$
    );
  END IF;

  IF function_sql NOT LIKE '%source URL title correction guard%'
     OR function_sql NOT LIKE '%existing.image_url = incoming.image_url%' THEN
    RAISE EXCEPTION 'source URL title correction guard patch failed';
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

  IF function_sql NOT LIKE '%source URL title correction guard%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed must keep source URL title correction guard';
  END IF;

  IF function_sql NOT LIKE '%existing.image_url = incoming.image_url%' THEN
    RAISE EXCEPTION 'source URL title correction guard must require matching image evidence';
  END IF;
END $$;
