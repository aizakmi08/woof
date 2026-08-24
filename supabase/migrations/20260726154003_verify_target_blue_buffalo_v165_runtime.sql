-- Nine exact/equivalent UPCs resolve once. Three UPCs already observed on
-- incompatible formula versions must safely abstain.
DO $$
DECLARE
  v_resolved INTEGER;
  v_abstained INTEGER;
BEGIN
  WITH expected(gtin) AS (
    VALUES
      ('840243144099'),
      ('859610000357'),
      ('840243141678'),
      ('840243140695'),
      ('840243148295'),
      ('840243135240'),
      ('840243122479'),
      ('840243140602'),
      ('840243148592')
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
      ('859610006854'),
      ('840243103799'),
      ('840243140534')
  ) expected(gtin)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin(expected.gtin, 8)
  );

  IF v_resolved <> 9 OR v_abstained <> 3 THEN
    RAISE EXCEPTION
      'Target Blue Buffalo v165 barcode regression: resolved %/9, abstained %/3',
      v_resolved,
      v_abstained;
  END IF;

  IF (
    SELECT count(DISTINCT resolved.cache_key)
    FROM (
      VALUES ('840243144099'), ('840243141678'), ('859610000357')
    ) package(gtin)
    CROSS JOIN LATERAL
      public.resolve_verified_product_by_gtin(package.gtin, 8) resolved
  ) <> 2 THEN
    RAISE EXCEPTION
      'Lamb & Brown Rice equal-size family and distinct ingredient version were merged incorrectly';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243148295', 8)
    WHERE product_name =
      'Blue Buffalo Wilderness with Chicken Puppy Dry Dog Food'
      AND flavor = 'Chicken'
      AND life_stage = 'puppy'
      AND pet_type = 'dog'
  ) THEN
    RAISE EXCEPTION 'Wilderness Puppy package identity failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_verified_product_by_gtin('840243148592', 8)
    WHERE product_name =
      'Blue Buffalo Wilderness with Chicken Senior Dry Dog Food'
      AND flavor = 'Chicken'
      AND life_stage = 'senior'
      AND pet_type = 'dog'
  ) THEN
    RAISE EXCEPTION 'Wilderness Senior package identity failed';
  END IF;
END
$$;
