-- Persist exact import utilization and blocker counts without presenting SKU
-- row ratios as U.S. formula-market coverage.

CREATE OR REPLACE FUNCTION public.refresh_retailer_import_run_metrics(
  p_import_run_id UUID
)
RETURNS TABLE(
  imported_rows INTEGER,
  verified_ready_rows INTEGER,
  remaining_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_imported INTEGER := 0;
  v_verified INTEGER := 0;
  v_remaining INTEGER := 0;
  v_current INTEGER := 0;
  v_status_breakdown JSONB := '{}'::JSONB;
  v_source_breakdown JSONB := '{}'::JSONB;
  v_open_queue_items INTEGER := 0;
BEGIN
  SELECT
    count(*) FILTER (WHERE evidence_status = 'promoted')::INTEGER,
    count(DISTINCT promoted_cache_key)
      FILTER (WHERE evidence_status = 'promoted')::INTEGER,
    count(*) FILTER (WHERE evidence_status = 'promotable_exact_package')::INTEGER,
    count(*)::INTEGER
  INTO v_imported, v_verified, v_remaining, v_current
  FROM public.catalog_retailer_ingredient_evidence
  WHERE import_run_id = p_import_run_id
    AND is_current;

  SELECT COALESCE(jsonb_object_agg(evidence_status, row_count), '{}'::JSONB)
  INTO v_status_breakdown
  FROM (
    SELECT evidence_status, count(*)::INTEGER AS row_count
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id AND is_current
    GROUP BY evidence_status
  ) statuses;

  SELECT COALESCE(jsonb_object_agg(source_slug, source_metrics), '{}'::JSONB)
  INTO v_source_breakdown
  FROM (
    SELECT source_slug, jsonb_build_object(
      'current_sku_rows', count(*),
      'customer_serving_sku_rows',
        count(*) FILTER (WHERE evidence_status = 'promoted'),
      'customer_serving_formula_versions',
        count(DISTINCT promoted_cache_key)
          FILTER (WHERE evidence_status = 'promoted'),
      'nonserving_sku_rows',
        count(*) FILTER (WHERE evidence_status <> 'promoted'),
      'status_breakdown', (
        SELECT jsonb_object_agg(per_status.evidence_status, per_status.row_count)
        FROM (
          SELECT nested.evidence_status, count(*)::INTEGER AS row_count
          FROM public.catalog_retailer_ingredient_evidence nested
          WHERE nested.import_run_id = p_import_run_id
            AND nested.is_current
            AND nested.source_slug = source_rows.source_slug
          GROUP BY nested.evidence_status
        ) per_status
      )
    ) AS source_metrics
    FROM public.catalog_retailer_ingredient_evidence source_rows
    WHERE import_run_id = p_import_run_id AND is_current
    GROUP BY source_slug
  ) sources;

  SELECT count(*)::INTEGER INTO v_open_queue_items
  FROM public.catalog_acquisition_queue
  WHERE sample_metadata->>'import_run_id' = p_import_run_id::TEXT
    AND status = 'open'
    AND gap_key LIKE 'retailer-evidence-%';

  UPDATE public.catalog_import_runs
  SET
    imported_rows = v_imported,
    verified_ready_rows = v_verified,
    updated_at = now(),
    report = COALESCE(report, '{}'::JSONB) || jsonb_build_object(
      'remaining_promotion', v_remaining,
      'current_sku_rows', v_current,
      'customer_serving_sku_rows', v_imported,
      'customer_serving_formula_versions', v_verified,
      'nonserving_sku_rows', v_current - v_imported,
      'sku_row_utilization_percent', CASE
        WHEN v_current = 0 THEN 0
        ELSE round((100.0 * v_imported / v_current)::NUMERIC, 2)
      END,
      'sku_row_utilization_is_not_market_coverage', true,
      'status_breakdown', v_status_breakdown,
      'source_breakdown', v_source_breakdown,
      'open_actionable_queue_items', v_open_queue_items,
      'metrics_refreshed_at', now()
    )
  WHERE id = p_import_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;

  RETURN QUERY SELECT v_imported, v_verified, v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_retailer_import_run_metrics(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_retailer_import_run_metrics(UUID)
  TO service_role;
