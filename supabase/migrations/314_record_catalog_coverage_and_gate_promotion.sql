-- Persist independently computed coverage snapshots and require a proven,
-- completed source run before any staged formula can reach product_data.

CREATE OR REPLACE FUNCTION public.record_catalog_coverage_snapshot(p_report JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_generated_at TIMESTAMPTZ;
BEGIN
  IF COALESCE((p_report->>'independent_denominator')::BOOLEAN, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Coverage snapshot denominator is not independent';
  END IF;

  v_generated_at := COALESCE((p_report->>'generated_at')::TIMESTAMPTZ, NOW());

  INSERT INTO public.catalog_coverage_snapshots (
    snapshot_key,
    census_started_at,
    census_completed_at,
    source_panel,
    required_source_panel,
    completed_source_panel,
    denominator_formula_count,
    verified_formula_count,
    verified_formula_percent,
    popular_brand_count,
    complete_popular_brand_count,
    popular_formula_gap_count,
    ingredient_verified_percent,
    image_verified_percent,
    independent_denominator,
    passes_source_panel,
    passes_total_coverage,
    passes_popular_brands,
    passes_release_gate,
    details
  )
  VALUES (
    COALESCE(NULLIF(p_report->>'snapshot_key', ''), p_report->>'generated_at'),
    v_generated_at,
    v_generated_at,
    ARRAY(
      SELECT DISTINCT value
      FROM (
        SELECT jsonb_array_elements_text(
          COALESCE(p_report->'required_source_panel', '[]'::JSONB)
        ) AS value
        UNION ALL
        SELECT jsonb_array_elements_text(
          COALESCE(p_report->'completed_source_panel', '[]'::JSONB)
        ) AS value
      ) panel
      ORDER BY value
    ),
    ARRAY(
      SELECT value
      FROM jsonb_array_elements_text(
        COALESCE(p_report->'required_source_panel', '[]'::JSONB)
      ) item(value)
    ),
    ARRAY(
      SELECT value
      FROM jsonb_array_elements_text(
        COALESCE(p_report->'completed_source_panel', '[]'::JSONB)
      ) item(value)
    ),
    COALESCE((p_report->>'denominator_formula_count')::INTEGER, 0),
    COALESCE((p_report->>'verified_formula_count')::INTEGER, 0),
    COALESCE((p_report->>'verified_formula_percent')::NUMERIC, 0),
    COALESCE((p_report->>'popular_brand_count')::INTEGER, 0),
    COALESCE((p_report->>'complete_popular_brand_count')::INTEGER, 0),
    COALESCE((p_report->>'popular_formula_gap_count')::INTEGER, 0),
    COALESCE((p_report->>'ingredient_verified_percent')::NUMERIC, 0),
    COALESCE((p_report->>'image_verified_percent')::NUMERIC, 0),
    TRUE,
    COALESCE((p_report->>'passes_source_panel')::BOOLEAN, FALSE),
    COALESCE((p_report->>'passes_total_coverage')::BOOLEAN, FALSE),
    COALESCE((p_report->>'passes_popular_brands')::BOOLEAN, FALSE),
    COALESCE((p_report->>'passes_release_gate')::BOOLEAN, FALSE),
    p_report
  )
  ON CONFLICT (snapshot_key) DO UPDATE SET
    completed_source_panel = EXCLUDED.completed_source_panel,
    denominator_formula_count = EXCLUDED.denominator_formula_count,
    verified_formula_count = EXCLUDED.verified_formula_count,
    verified_formula_percent = EXCLUDED.verified_formula_percent,
    popular_brand_count = EXCLUDED.popular_brand_count,
    complete_popular_brand_count = EXCLUDED.complete_popular_brand_count,
    popular_formula_gap_count = EXCLUDED.popular_formula_gap_count,
    ingredient_verified_percent = EXCLUDED.ingredient_verified_percent,
    image_verified_percent = EXCLUDED.image_verified_percent,
    passes_source_panel = EXCLUDED.passes_source_panel,
    passes_total_coverage = EXCLUDED.passes_total_coverage,
    passes_popular_brands = EXCLUDED.passes_popular_brands,
    passes_release_gate = EXCLUDED.passes_release_gate,
    details = EXCLUDED.details
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_coverage_snapshot(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_catalog_coverage_snapshot(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.record_catalog_coverage_snapshot(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_coverage_snapshot(JSONB) TO service_role;

ALTER FUNCTION public.promote_catalog_formula(BIGINT)
  RENAME TO promote_catalog_formula_without_completed_run_gate;

CREATE OR REPLACE FUNCTION public.promote_catalog_formula(p_formula_id BIGINT)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE observation.formula_id = p_formula_id
      AND observation.validation_status = 'accepted'
      AND source_run.status = 'completed'
      AND source_run.pagination_complete
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % lacks an accepted observation from a completed source run',
      p_formula_id;
  END IF;

  RETURN QUERY
  SELECT promoted.cache_key, promoted.product_name, promoted.brand, promoted.source_url
  FROM public.promote_catalog_formula_without_completed_run_gate(p_formula_id) promoted;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM authenticated;
REVOKE ALL ON FUNCTION public.promote_catalog_formula_without_completed_run_gate(BIGINT)
  FROM service_role;

REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_catalog_formula(BIGINT) TO service_role;
