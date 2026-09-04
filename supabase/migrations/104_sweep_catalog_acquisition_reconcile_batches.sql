-- Make repeated acquisition reconciliation batches sweep through the queue
-- instead of repeatedly checking the same highest-priority unresolved rows.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_reconcile_checked_at(p_metadata JSONB)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(p_metadata->>'last_reconcile_checked_at', '')::TIMESTAMPTZ,
    '-infinity'::TIMESTAMPTZ
  );
$$;

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

  function_sql := replace(
    function_sql,
    'ORDER BY q.priority_score DESC, q.updated_at DESC
    LIMIT v_limit',
    'ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC
    LIMIT v_limit'
  );

  function_sql := replace(
    function_sql,
    'ORDER BY q.priority_score DESC, q.updated_at DESC
    LIMIT v_brand_limit',
    'ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC
    LIMIT v_brand_limit'
  );

  function_sql := replace(
    function_sql,
    '  SELECT count(*) INTO v_product_identity_rows
  FROM resolved_product_identity;

  WITH brand_scope AS (',
    '  SELECT count(*) INTO v_product_identity_rows
  FROM resolved_product_identity;

  WITH queue_scope AS (
    SELECT q.id
    FROM public.catalog_acquisition_queue q
    WHERE q.gap_type = ''product''
      AND q.status IN (''open'', ''in_progress'', ''imported'')
      AND q.product_name IS NOT NULL
    ORDER BY
      public.catalog_acquisition_reconcile_checked_at(q.sample_metadata) ASC,
      q.priority_score DESC,
      q.updated_at DESC
    LIMIT v_limit
  )
  UPDATE public.catalog_acquisition_queue q
  SET
    updated_at = v_now,
    sample_metadata = COALESCE(q.sample_metadata, ''{}''::jsonb) || jsonb_build_object(
      ''last_reconcile_checked_at'', v_now,
      ''last_reconcile_checked_by'', ''reconcile_catalog_acquisition_queue_batch''
    )
  FROM queue_scope qs
  WHERE q.id = qs.id
    AND q.status IN (''open'', ''in_progress'', ''imported'');

  WITH brand_scope AS ('
  );

  IF function_sql NOT LIKE '%catalog_acquisition_reconcile_checked_at(q.sample_metadata)%' THEN
    RAISE EXCEPTION 'batch reconcile sweep ordering patch failed';
  END IF;

  IF function_sql NOT LIKE '%last_reconcile_checked_at%' THEN
    RAISE EXCEPTION 'batch reconcile checked-at marker patch failed';
  END IF;

  EXECUTE function_sql;
END $$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_reconcile_checked_at(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_reconcile_checked_at(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_reconcile_checked_at(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_reconcile_checked_at(JSONB) TO service_role;
