-- The promotion function previously ran expensive ingredient-artifact checks
-- over every remaining promotable row before honoring p_limit. Bound those
-- checks to the next batch so the resumable limit is real and production
-- imports cannot monopolize the database.

CREATE INDEX IF NOT EXISTS catalog_retailer_evidence_promotion_idx
  ON public.catalog_retailer_ingredient_evidence (
    import_run_id,
    evidence_status,
    id
  )
  WHERE is_current;

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
  v_limit_guard TEXT := $marker$
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
$marker$;
  v_bounded_guard TEXT := $replacement$
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT evidence.id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.evidence_status = 'promotable_exact_package'
      AND evidence.is_current
    ORDER BY evidence.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) selected;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(v_definition, v_limit_guard, v_bounded_guard);
  v_fixed_definition := replace(
    v_fixed_definition,
    $marker$    AND NOT public.catalog_retailer_ingredient_is_serving_safe($marker$,
    $replacement$    AND evidence.id = ANY(v_ids)
    AND NOT public.catalog_retailer_ingredient_is_serving_safe($replacement$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $marker$    AND (
      length(evidence.ingredient_text) < 30$marker$,
    $replacement$    AND evidence.id = ANY(v_ids)
    AND (
      length(evidence.ingredient_text) < 30$replacement$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $marker$    AND public.is_likely_non_product_catalog_row($marker$,
    $replacement$    AND evidence.id = ANY(v_ids)
    AND public.is_likely_non_product_catalog_row($replacement$
  );

  IF v_fixed_definition = v_definition
    OR position('AND evidence.id = ANY(v_ids)' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'retailer promotion preflight markers not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
