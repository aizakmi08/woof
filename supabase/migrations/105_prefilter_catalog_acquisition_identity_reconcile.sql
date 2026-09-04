-- Avoid running the expensive PL/pgSQL identity guard on every same-brand
-- queue/catalog pair. This keeps reconciliation conservative while making
-- dense brands cheaper to scan in batches.

DO $$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'reconcile_catalog_acquisition_queue_batch'
    AND pg_get_function_identity_arguments(p.oid) = 'p_max_rows integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_batch(p_max_rows integer) not found';
  END IF;

  IF function_sql LIKE '%catalog acquisition identity prefilter%' THEN
    RETURN;
  END IF;

  function_sql := replace(
    function_sql,
    'WHERE public.catalog_acquisition_identity_match(
        q.product_name,',
    'WHERE (
        -- catalog acquisition identity prefilter
        word_similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) > 0.48
        OR similarity(public.catalog_acquisition_identity_normalize(q.product_name), vp.identity_norm) > 0.30
        OR public.catalog_acquisition_identity_normalize(q.product_name) LIKE ''%'' || vp.identity_norm || ''%''
        OR vp.identity_norm LIKE ''%'' || public.catalog_acquisition_identity_normalize(q.product_name) || ''%''
      )
      AND public.catalog_acquisition_identity_match(
        q.product_name,'
  );

  IF function_sql NOT LIKE '%catalog acquisition identity prefilter%' THEN
    RAISE EXCEPTION 'batch reconcile identity prefilter patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
