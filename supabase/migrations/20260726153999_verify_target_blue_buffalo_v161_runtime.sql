-- Seven unique UPCs resolve exactly once. Two UPCs already observed on
-- incompatible formula versions must safely abstain.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
  v_distinct_versions INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('859610000302'),
      ('840243144174'),
      ('840243105816'),
      ('840243102709'),
      ('840243142194'),
      ('840243148608'),
      ('840243148264')
  )
  SELECT count(*)
  INTO v_resolved
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  ) = 1;

  SELECT count(*)
  INTO v_abstained
  FROM (
    VALUES
      ('859610000517'),
      ('840243105700')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 7 OR v_abstained <> 2 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v161 barcode regression: resolved %/7, abstained %/2',
      v_resolved,
      v_abstained;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243148264', 8)
    WHERE product_name =
      'Blue Buffalo Wilderness Rocky Mountain Recipe with Red Meat Adult '
      || 'Dry Dog Food'
      AND flavor = 'Red Meat'
      AND pet_type = 'dog'
      AND food_form = 'dry'
  ) THEN
    RAISE EXCEPTION 'Rocky Mountain Red Meat package identity failed';
  END IF;

  SELECT count(DISTINCT formula.id)
  INTO v_distinct_versions
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  WHERE source_run.run_key =
    'target-blue-buffalo-reviewed-v162:20260727'
    AND observation.source_external_id IN ('75575888', '76400726')
    AND observation.validation_status = 'accepted';

  IF v_distinct_versions <> 2 THEN
    RAISE EXCEPTION
      'Small Breed Healthy Weight ingredient versions were merged: %',
      v_distinct_versions;
  END IF;
END
$$;
