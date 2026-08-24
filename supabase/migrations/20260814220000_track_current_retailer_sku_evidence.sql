-- Keep source-version history while identifying exactly one newest record per
-- retailer SKU. This allows retry snapshots to load only changed rows without
-- erasing older dated ingredient versions.

ALTER TABLE public.catalog_retailer_ingredient_evidence
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS catalog_retailer_ingredient_current_sku_idx
  ON public.catalog_retailer_ingredient_evidence (
    import_run_id,
    source_slug,
    source_external_id,
    fetched_at DESC,
    id DESC
  )
  WHERE is_current;

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
  WITH ranked AS (
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
    WHERE evidence.import_run_id = p_import_run_id
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
  WHERE ranked.id = evidence.id;

  SELECT
    count(*) FILTER (WHERE is_current),
    count(*) FILTER (WHERE NOT is_current)
  INTO v_current, v_superseded
  FROM public.catalog_retailer_ingredient_evidence
  WHERE import_run_id = p_import_run_id;

  RETURN QUERY SELECT v_current, v_superseded;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_current_retailer_ingredient_evidence(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_current_retailer_ingredient_evidence(UUID)
  TO service_role;
