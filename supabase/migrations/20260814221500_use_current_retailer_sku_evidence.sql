-- Reconciliation and queue refresh operate only on the newest evidence record
-- per retailer SKU. Stale queue items are resolved before current gaps reopen.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.link_retailer_ingredient_evidence(uuid)'::regprocedure
  )
  INTO v_definition;
  v_fixed_definition := replace(
    v_definition,
    '      AND evidence.evidence_status = ''usable_exact_page''',
    '      AND evidence.evidence_status = ''usable_exact_page''' || chr(10) ||
    '      AND evidence.is_current'
  );
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'current retailer link filter marker not found';
  END IF;
  EXECUTE v_fixed_definition;

  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  )
  INTO v_definition;
  v_fixed_definition := replace(
    v_definition,
    '      AND evidence.evidence_status = ''promotable_exact_package''' || chr(10) ||
    '    ORDER BY evidence.id',
    '      AND evidence.evidence_status = ''promotable_exact_package''' || chr(10) ||
    '      AND evidence.is_current' || chr(10) ||
    '    ORDER BY evidence.id'
  );
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'current retailer promotion filter marker not found';
  END IF;
  EXECUTE v_fixed_definition;

  SELECT pg_get_functiondef(
    'public.queue_retailer_ingredient_gaps(uuid)'::regprocedure
  )
  INTO v_definition;
  v_fixed_definition := replace(
    v_definition,
    '  WITH grouped AS (',
    $replacement$  WITH stale_closed AS (
    UPDATE public.catalog_acquisition_queue queue
    SET
      status = 'resolved',
      resolved_at = now(),
      resolution_reason = 'superseded_retailer_snapshot',
      last_refreshed_at = now(),
      updated_at = now()
    WHERE queue.sample_metadata->>'import_run_id' = p_import_run_id::TEXT
      AND (
        queue.gap_key LIKE 'retailer-evidence-unmatched:%'
        OR queue.gap_key LIKE 'retailer-evidence-image:%'
      )
    RETURNING queue.gap_key
  ), grouped AS ($replacement$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    '      AND evidence_status = ''unmatched_catalog_sku''',
    '      AND evidence_status = ''unmatched_catalog_sku''' || chr(10) ||
    '      AND is_current'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    '      AND evidence_status = ''linked_missing_exact_image''',
    '      AND evidence_status = ''linked_missing_exact_image''' || chr(10) ||
    '      AND is_current'
  );
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'current retailer queue filter marker not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.link_retailer_ingredient_evidence(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_retailer_ingredient_gaps(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_retailer_ingredient_evidence(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.queue_retailer_ingredient_gaps(UUID)
  TO service_role;
