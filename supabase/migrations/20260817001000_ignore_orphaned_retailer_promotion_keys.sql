-- Historical retailer evidence can outlive a quarantined product_data row.
-- Never repoint a canonical formula to a promoted cache key unless that
-- serving row still exists.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.sync_retailer_formula_promotions(uuid)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.linked_formula_id IS NOT NULL
      AND evidence.promoted_cache_key IS NOT NULL
    ORDER BY evidence.linked_formula_id,$old$,
    $new$    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.product_data serving
      ON serving.cache_key = evidence.promoted_cache_key
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.linked_formula_id IS NOT NULL
      AND evidence.promoted_cache_key IS NOT NULL
    ORDER BY evidence.linked_formula_id,$new$
  );

  IF v_fixed_definition = v_definition
    OR position(
      'JOIN public.product_data serving' IN v_fixed_definition
    ) = 0
  THEN
    RAISE EXCEPTION 'retailer promotion orphan guard marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  TO service_role;
