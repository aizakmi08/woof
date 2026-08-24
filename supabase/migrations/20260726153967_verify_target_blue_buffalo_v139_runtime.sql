-- Nine version-safe UPCs plus four exact-equivalent existing formula UPCs
-- resolve once. Five reused/version-conflicting UPCs must abstain.
DO $$
DECLARE v_resolved INTEGER;
DECLARE v_abstained INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243144075'), ('859610000425'), ('840243120437'),
      ('840243104932'), ('840243104949'), ('840243104963'),
      ('840243100170'), ('840243130665'), ('859610000111'),
      ('840243135349'), ('840243144556'), ('840243158126'),
      ('840243156597')
  )
  SELECT count(*) INTO v_resolved
  FROM expected
  WHERE (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  ) = 1;

  WITH expected(gtin) AS (
    VALUES
      ('840243104956'), ('840243105731'), ('859610007479'),
      ('859610000449'), ('840243103713')
  )
  SELECT count(*) INTO v_abstained
  FROM expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 13 OR v_abstained <> 5 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v139 barcode regression: resolved %/13, abstained %/5',
      v_resolved,
      v_abstained;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243158126', 8)
    WHERE food_form = 'fresh'
      AND flavor = 'Chicken with Carrots & Peas'
  ) THEN
    RAISE EXCEPTION
      'Blue Love Made Fresh small-breed package lost fresh recipe identity';
  END IF;
END
$$;
