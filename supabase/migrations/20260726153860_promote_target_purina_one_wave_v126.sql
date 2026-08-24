-- Promote the third visually reviewed Target Purina ONE package batch.
-- Four package UPCs are version-safe. Ten UPCs are reused across differing
-- ingredient versions and therefore remain non-resolving. One additional
-- page remains quarantined because its ingredient statement has an unclosed
-- vitamin bracket.

DO $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT public.promote_reviewed_retailer_package_batch(
    'target-purina-one-review-v126:4eac6b5db9a91e37ec3ee19e',
    'target-purina-one-reviewed-source-versions-v127:20260726',
    'target-purina-one-reviewed-v127',
    14,
    13,
    'Exact Target PDP full ingredient statement and matching package image '
      || 'visually reviewed on 2026-07-26.'
  )
  INTO v_result;

  IF (v_result->>'manufacturer_current_equal_package_count')::INTEGER <> 0
    OR (v_result->>'source_version_safe_package_count')::INTEGER <> 4
    OR (
      v_result->>'source_version_gtin_conflict_package_count'
    )::INTEGER <> 10
    OR (v_result->>'source_version_formula_count')::INTEGER <> 13
    OR (
      v_result->>'promoted_source_version_formula_count'
    )::INTEGER <> 13
  THEN
    RAISE EXCEPTION
      'Unexpected Target Purina ONE v127 promotion result: %',
      v_result;
  END IF;

  UPDATE public.catalog_observations observation
  SET
    validation_reasons =
      ARRAY['ingredient_structural_artifact']::TEXT[],
    raw_payload = COALESCE(observation.raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'review_note',
          'Unclosed VITAMINS bracket in Target ingredient statement; '
          || 'not promoted.'
      )
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key =
      'target-purina-one-review-v126:4eac6b5db9a91e37ec3ee19e'
    AND observation.source_external_id = '80847603';
END
$$;
