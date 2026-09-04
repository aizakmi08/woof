-- Product-data version provenance must expose deterministic serving-text
-- corrections as well as the raw source hash. The raw statement itself stays
-- in retailer evidence and catalog_field_evidence.

CREATE OR REPLACE FUNCTION public.sync_retailer_serving_normalization_provenance(
  p_import_run_id UUID
)
RETURNS TABLE(updated_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  WITH normalized AS (
    SELECT
      evidence.promoted_cache_key,
      array_agg(DISTINCT code ORDER BY code) AS normalization_codes,
      jsonb_agg(DISTINCT evidence.ingredient_hash)
        AS raw_ingredient_text_hashes
    FROM public.catalog_retailer_ingredient_evidence evidence
    CROSS JOIN LATERAL unnest(
      evidence.serving_ingredient_normalization_codes
    ) AS code
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.serving_ingredient_text IS NOT NULL
      AND NULLIF(evidence.promoted_cache_key, '') IS NOT NULL
    GROUP BY evidence.promoted_cache_key
  ), changed AS (
    UPDATE public.product_data serving
    SET formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'serving_text_normalization_policy',
          'deterministic_transcription_corrections_v1',
        'serving_ingredient_normalization_codes',
          to_jsonb(normalized.normalization_codes),
        'raw_ingredient_text_hashes',
          normalized.raw_ingredient_text_hashes,
        'raw_ingredient_text_preserved', true
      ),
      updated_at = now()
    FROM normalized
    WHERE serving.cache_key = normalized.promoted_cache_key
    RETURNING serving.cache_key
  )
  SELECT count(*)::INTEGER INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated;
END;
$function$;

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$  GET DIAGNOSTICS v_promoted_serving = ROW_COUNT;

  UPDATE public.catalog_retailer_ingredient_evidence evidence$old$,
    $new$  GET DIAGNOSTICS v_promoted_serving = ROW_COUNT;

  PERFORM public.sync_retailer_serving_normalization_provenance(
    p_import_run_id
  );

  UPDATE public.catalog_retailer_ingredient_evidence evidence$new$
  );

  IF v_fixed_definition = v_definition
    OR position('sync_retailer_serving_normalization_provenance' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'Retailer serving normalization provenance marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.sync_retailer_serving_normalization_provenance(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_serving_normalization_provenance(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
