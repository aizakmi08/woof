-- Remove transient diagnostic metadata and lock the reviewed barcode policy:
-- eleven exact/version-safe package UPCs resolve once; eight reused/conflicted
-- UPCs resolve to nothing.

UPDATE public.catalog_source_runs
SET metadata = metadata - 'v130_debug_sqlstate' - 'v130_debug_error'
WHERE run_key =
  'target-purina-one-review-v130:fe4464088c835d99286b7376';

DO $$
DECLARE
  v_passed INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('017800149372'), ('017800149402'), ('017800149327'),
      ('017800149297'), ('017800464178'), ('017800475686'),
      ('017800103091'), ('017800018890'), ('017800573122'),
      ('017800149396'), ('017800193368')
  )
  SELECT count(*) INTO v_passed
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
    WHERE nutritional_info->>'formula_evidence_tier' =
      'retailer_web_version'
  ) = 1;

  IF v_passed <> 11 THEN
    RAISE EXCEPTION
      'Purina ONE v130 exact/version-safe barcode regression: %/11',
      v_passed;
  END IF;

  WITH expected(gtin) AS (
    VALUES
      ('017800149419'), ('017800151238'), ('017800146029'),
      ('017800145978'), ('017800178686'), ('017800193382'),
      ('017800102322'), ('017800167468')
  )
  SELECT count(*) INTO v_passed
  FROM expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_passed <> 8 THEN
    RAISE EXCEPTION
      'Purina ONE v130 conflicting barcode abstention regression: %/8',
      v_passed;
  END IF;
END
$$;
