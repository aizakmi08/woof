-- Pass the queued brand into identity matching. Some acquisition queue product
-- names omit brand text even though the queue row has a trusted brand column;
-- brand-aware matching lets the species ambiguity guard allow known
-- single-species brands without weakening cross-species brands.

DO $$
DECLARE
  v_match_sql TEXT;
  v_reconcile_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_identity_match(text,text,text,text)'::regprocedure)
  INTO v_match_sql;

  IF v_match_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_identity_match(text,text,text,text) not found';
  END IF;

  v_match_sql := replace(v_match_sql, '    ''mousse'',
    ''pate'',', '');
  v_match_sql := replace(v_match_sql, '    ''shreds'',', '');
  v_match_sql := replace(v_match_sql, '    ''tender'',', '');

  EXECUTE v_match_sql;

  SELECT pg_get_functiondef('public.reconcile_catalog_acquisition_queue_batch(integer)'::regprocedure)
  INTO v_reconcile_sql;

  IF v_reconcile_sql IS NULL THEN
    RAISE EXCEPTION 'reconcile_catalog_acquisition_queue_batch(integer) not found';
  END IF;

  v_reconcile_sql := replace(
    v_reconcile_sql,
    'public.catalog_acquisition_identity_match(
        q.product_name,
        q.pet_type,',
    'public.catalog_acquisition_identity_match(
        concat_ws('' '', q.brand, q.product_name),
        q.pet_type,'
  );

  IF position('concat_ws('' '', q.brand, q.product_name)' IN v_reconcile_sql) = 0 THEN
    RAISE EXCEPTION 'brand-aware acquisition identity reconcile patch failed';
  END IF;

  EXECUTE v_reconcile_sql;
END $$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_acquisition_queue_batch(INTEGER) TO service_role;
