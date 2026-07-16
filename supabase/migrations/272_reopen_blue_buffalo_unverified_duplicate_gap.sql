-- Reopen a stale Blue Buffalo acquisition gap that was closed before the
-- matched official row was demoted to needs_ingredients.

UPDATE public.product_data
SET
  catalog_exclusion_reason = 'unverified_retailer_duplicate_needs_verified_source',
  updated_at = now()
WHERE cache_key = 'blue buffalo life protection natural grain free adult dry with chicken and potatoes'
  AND catalog_exclusion_reason = 'duplicate_verified_official_catalog_row'
  AND public.catalog_quality_state(
    pet_type,
    is_complete_food,
    catalog_exclusion_reason,
    ingredient_text,
    ingredient_count,
    ingredient_verification_status,
    image_url,
    image_verification_status,
    source_url,
    expires_at
  ) = 'excluded';

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  ready_rows = 0,
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  acquisition_notes = concat_ws(
    ' | ',
    NULLIF(acquisition_notes, ''),
    'Reopened 2026-07-02: prior duplicate closure matched an official row that is now needs_ingredients, not verified_ready.'
  ),
  sample_metadata = (
    COALESCE(sample_metadata, '{}'::jsonb)
      - 'matched_brand'
      - 'matched_source'
      - 'matched_pet_type'
      - 'matched_cache_key'
      - 'matched_source_url'
      - 'duplicate_closed_at'
      - 'duplicate_closed_by'
      - 'matched_product_name'
      - 'direct_identity_score'
      - 'matched_source_quality'
  ) || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', '272_reopen_blue_buffalo_unverified_duplicate_gap',
    'reopened_reason', 'matched official row is needs_ingredients, not verified_ready'
  )
WHERE id = '16947d62-34f0-4784-9922-303289ac3867'
  AND status = 'resolved'
  AND resolution_reason = 'legacy no-source row excluded because direct verified catalog identity matched an official source-backed product';

DO $$
DECLARE
  audit_result JSONB;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE id = '16947d62-34f0-4784-9922-303289ac3867'
      AND status <> 'open'
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo stale duplicate gap was not reopened';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'blue buffalo life protection natural grain free adult dry with chicken and potatoes'
      AND catalog_exclusion_reason = 'duplicate_verified_official_catalog_row'
  ) THEN
    RAISE EXCEPTION 'Blue Buffalo stale duplicate product row still claims verified duplicate coverage';
  END IF;

  SELECT public.catalog_duplicate_closure_audit(
    ARRAY['Blue Buffalo']::TEXT[],
    ARRAY['exclude_direct_verified_identity_duplicate_legacy_catalog_rows_for_brand']::TEXT[],
    100
  )
    INTO audit_result;

  IF COALESCE((audit_result->'summary'->>'failure_rows')::INTEGER, 0) <> 0 THEN
    RAISE EXCEPTION 'Blue Buffalo direct duplicate closure audit still has failures: %', audit_result;
  END IF;
END $$;
