UPDATE public.catalog_coverage_snapshots
SET details = details || jsonb_build_object(
  'verified_serving_gtin_version_conflict_count', 110,
  'verified_serving_gtin_version_conflicts_still_resolving', 0,
  'barcode_version_conflict_policy',
    'abstain when one GTIN has more than one verified ingredient statement'
)
WHERE snapshot_key = 'public-reviewed-major95-exact-gtin-v172:20260727';

DO $$
DECLARE
  v_updated INTEGER;
BEGIN
  SELECT count(*)
  INTO v_updated
  FROM public.catalog_coverage_snapshots
  WHERE snapshot_key = 'public-reviewed-major95-exact-gtin-v172:20260727'
    AND details ->> 'verified_serving_gtin_version_conflict_count' = '110'
    AND details ->> 'verified_serving_gtin_version_conflicts_still_resolving' = '0';
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Expected to update one v172 coverage snapshot, updated %',
      v_updated;
  END IF;
END
$$;
