-- A retry/delta import can move an existing evidence row to a new import run.
-- Currentness belongs to the retailer SKU across all runs, not within only the
-- latest run. Re-rank every version of each SKU touched by the requested run.

CREATE OR REPLACE FUNCTION public.refresh_current_retailer_ingredient_evidence(
  p_import_run_id UUID
)
RETURNS TABLE(current_rows INTEGER, superseded_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_current INTEGER := 0;
  v_superseded INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id
  ) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;

  WITH impacted AS (
    SELECT DISTINCT evidence.source_slug, evidence.source_external_id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
  ), ranked AS (
    SELECT
      evidence.id,
      row_number() OVER (
        PARTITION BY evidence.source_slug, evidence.source_external_id
        ORDER BY
          evidence.fetched_at DESC NULLS LAST,
          evidence.created_at DESC,
          evidence.id DESC
      ) AS evidence_rank
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN impacted
      ON impacted.source_slug = evidence.source_slug
     AND impacted.source_external_id = evidence.source_external_id
  )
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    is_current = ranked.evidence_rank = 1,
    superseded_at = CASE
      WHEN ranked.evidence_rank = 1 THEN NULL
      ELSE COALESCE(evidence.superseded_at, now())
    END,
    updated_at = now()
  FROM ranked
  WHERE ranked.id = evidence.id
    AND (
      evidence.is_current IS DISTINCT FROM (ranked.evidence_rank = 1)
      OR (
        ranked.evidence_rank = 1
        AND evidence.superseded_at IS NOT NULL
      )
      OR (
        ranked.evidence_rank > 1
        AND evidence.superseded_at IS NULL
      )
    );

  WITH impacted AS (
    SELECT DISTINCT evidence.source_slug, evidence.source_external_id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
  )
  SELECT
    count(*) FILTER (WHERE evidence.is_current),
    count(*) FILTER (WHERE NOT evidence.is_current)
  INTO v_current, v_superseded
  FROM public.catalog_retailer_ingredient_evidence evidence
  JOIN impacted
    ON impacted.source_slug = evidence.source_slug
   AND impacted.source_external_id = evidence.source_external_id;

  RETURN QUERY SELECT v_current, v_superseded;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_current_retailer_ingredient_evidence(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_current_retailer_ingredient_evidence(UUID)
  TO service_role;
