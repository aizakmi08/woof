-- A source refresh can legitimately replace an old cache key with a new
-- canonical key for the same exact official product URL. The feed RPC already
-- deletes that stale source-URL row, but its sibling identity-deduplication CTE
-- used the statement's original snapshot and skipped the replacement too.
-- Exclude rows eligible for exact source-URL replacement from the duplicate
-- skip set so the delete-and-insert refresh remains lossless.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed not found';
  END IF;

  IF function_sql NOT LIKE '%source URL replacement rows must not be identity-skipped%' THEN
    function_sql := replace(
      function_sql,
      $$    AND COALESCE(existing.ingredient_count, 0) >= 5
  -- identity duplicate skip guard$$,
      $$    AND COALESCE(existing.ingredient_count, 0) >= 5
    AND NOT (
      NULLIF(btrim(incoming.source_url), '') IS NOT NULL
      AND existing.source_url = incoming.source_url
      AND (
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
      AND (
        NULLIF(btrim(existing.gtin), '') IS NULL
        OR NULLIF(btrim(incoming.gtin), '') IS NULL
        OR existing.gtin = incoming.gtin
      )
      AND (
        NULLIF(btrim(existing.package_size), '') IS NULL
        OR NULLIF(btrim(incoming.package_size), '') IS NULL
        OR lower(existing.package_size) = lower(incoming.package_size)
      )
    )
  -- source URL replacement rows must not be identity-skipped
  -- identity duplicate skip guard$$
    );
  END IF;

  IF function_sql NOT LIKE '%source URL replacement rows must not be identity-skipped%'
     OR function_sql NOT LIKE '%existing.source_url = incoming.source_url%'
     OR function_sql NOT LIKE '%FROM identity_duplicate_skips skipped%' THEN
    RAISE EXCEPTION 'source URL replacement guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.upsert_catalog_product_feed(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_catalog_product_feed(JSONB) TO service_role;

DO $$
DECLARE
  fn TEXT;
BEGIN
  SELECT pg_get_functiondef('public.upsert_catalog_product_feed(jsonb)'::regprocedure)
    INTO fn;

  IF fn NOT LIKE '%source URL replacement rows must not be identity-skipped%'
     OR fn NOT LIKE '%existing.source_url = incoming.source_url%' THEN
    RAISE EXCEPTION 'upsert_catalog_product_feed source replacement regression';
  END IF;
END $$;
