-- Recounting the entire evidence run after every bounded promotion batch makes
-- the last UPDATE dominate runtime and can roll back otherwise valid work.
-- Keep per-batch progress cheap and refresh exact counters once at the end.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_old TEXT := $old$
  UPDATE public.catalog_import_runs
  SET
    updated_at = now(),
    imported_rows = (
      SELECT count(*)
      FROM public.catalog_retailer_ingredient_evidence
      WHERE import_run_id = p_import_run_id
        AND evidence_status = 'promoted'
    ),
    verified_ready_rows = (
      SELECT count(DISTINCT promoted_cache_key)
      FROM public.catalog_retailer_ingredient_evidence
      WHERE import_run_id = p_import_run_id
        AND evidence_status = 'promoted'
    ),
    report = COALESCE(report, '{}'::JSONB) || jsonb_build_object(
      'remaining_promotion', v_remaining
    )
  WHERE id = p_import_run_id;
$old$;
  v_new TEXT := $new$
  UPDATE public.catalog_import_runs
  SET
    updated_at = now(),
    report = COALESCE(report, '{}'::JSONB) || jsonb_build_object(
      'remaining_promotion', v_remaining
    )
  WHERE id = p_import_run_id;
$new$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;
  v_fixed_definition := replace(v_definition, v_old, v_new);
  IF v_fixed_definition = v_definition THEN
    RAISE EXCEPTION 'retailer import metric refresh marker not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.refresh_retailer_import_run_metrics(
  p_import_run_id UUID
)
RETURNS TABLE(imported_rows INTEGER, verified_ready_rows INTEGER, remaining_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_imported INTEGER := 0;
  v_verified INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  SELECT
    count(*) FILTER (WHERE evidence_status = 'promoted')::INTEGER,
    count(DISTINCT promoted_cache_key)
      FILTER (WHERE evidence_status = 'promoted')::INTEGER,
    count(*) FILTER (WHERE evidence_status = 'promotable_exact_package')::INTEGER
  INTO v_imported, v_verified, v_remaining
  FROM public.catalog_retailer_ingredient_evidence
  WHERE import_run_id = p_import_run_id
    AND is_current;

  UPDATE public.catalog_import_runs
  SET
    imported_rows = v_imported,
    verified_ready_rows = v_verified,
    updated_at = now(),
    report = COALESCE(report, '{}'::JSONB) || jsonb_build_object(
      'remaining_promotion', v_remaining,
      'metrics_refreshed_at', now()
    )
  WHERE id = p_import_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;
  RETURN QUERY SELECT v_imported, v_verified, v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_retailer_import_run_metrics(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_retailer_import_run_metrics(UUID)
  TO service_role;
