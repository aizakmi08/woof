-- Repair three IAMS serving rows from the current official product pages and
-- label-image ingredient evidence captured on 2026-07-25. The authoritative
-- observations were staged first so this migration never embeds or rewrites
-- the evidence payload.
DO $$
DECLARE
  v_run_key CONSTANT TEXT :=
    'iams:official-formula-inventory:63808bf006f316fac0d6ccfd';
  v_expected CONSTANT INTEGER := 3;
  v_matched INTEGER;
  v_updated INTEGER;
  v_retired INTEGER;
BEGIN
  CREATE TEMP TABLE iams_current_formula_repairs ON COMMIT DROP AS
  SELECT
    observation.source_external_id AS cache_key,
    observation.gtin,
    observation.product_name,
    observation.product_line,
    observation.pet_type,
    observation.life_stage,
    observation.food_form,
    observation.flavor,
    observation.ingredient_text,
    observation.front_image_url,
    observation.source_url,
    observation.observed_at,
    expected.old_hash
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
   AND source_run.run_key = v_run_key
   AND source_run.status = 'completed'
   AND source_run.metadata @> '{"exact_formula_evidence": true}'::JSONB
  JOIN (
    VALUES
      (
        'iams:019014830176',
        '019014830176',
        'b6de8087a3d91e1813a2bef489b36ff8c63965e0c4065d74111503223bdf49d8'
      ),
      (
        'iams:019014830190',
        '019014830190',
        'c667435a4c2e879f80d60ee446146f73180d0ad3463305f8d7c3b6ea256449c7'
      ),
      (
        'iams:019014830237',
        '019014830237',
        '262f13d0fb732985ed683095ae2119f632796611ed21c65bb57be9a55fc344fb'
      )
  ) AS expected(cache_key, gtin, old_hash)
    ON expected.cache_key = observation.source_external_id
   AND expected.gtin = observation.gtin
  WHERE observation.validation_status = 'accepted'
    AND observation.source_slug = 'iams'
    AND observation.source_authority = 'manufacturer'
    AND observation.is_complete_food
    AND NULLIF(btrim(observation.ingredient_text), '') IS NOT NULL
    AND NULLIF(btrim(observation.front_image_url), '') IS NOT NULL;

  SELECT count(*) INTO v_matched
  FROM iams_current_formula_repairs incoming
  JOIN public.product_data current
    ON current.cache_key = incoming.cache_key
   AND current.gtin = incoming.gtin
   AND current.source = 'iams'
   AND current.source_quality = 'manufacturer'
   AND current.source_url = incoming.source_url
   AND current.image_url = incoming.front_image_url
   AND encode(
     digest(
       lower(regexp_replace(btrim(current.ingredient_text), '\s+', ' ', 'g')),
       'sha256'
     ),
     'hex'
   ) = incoming.old_hash;

  IF v_matched <> v_expected THEN
    RAISE EXCEPTION
      'IAMS current-formula precondition matched % rows, expected %',
      v_matched, v_expected;
  END IF;

  UPDATE public.product_data current
  SET
    product_name = incoming.product_name,
    product_line = incoming.product_line,
    pet_type = incoming.pet_type,
    life_stage = incoming.life_stage,
    food_form = incoming.food_form,
    flavor = incoming.flavor,
    ingredient_text = incoming.ingredient_text,
    ingredients = public.catalog_split_ingredient_statement(
      incoming.ingredient_text
    ),
    ingredient_count = cardinality(
      public.catalog_split_ingredient_statement(incoming.ingredient_text)
    ),
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    verified_at = incoming.observed_at,
    scraped_at = incoming.observed_at,
    expires_at = incoming.observed_at + INTERVAL '365 days',
    catalog_exclusion_reason = NULL,
    updated_at = NOW()
  FROM iams_current_formula_repairs incoming
  WHERE current.cache_key = incoming.cache_key;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  UPDATE public.product_data retailer
  SET
    catalog_exclusion_reason =
      'superseded_formula_version_by_current_official_iams_20260725',
    expires_at = LEAST(COALESCE(retailer.expires_at, NOW()), NOW()),
    updated_at = NOW()
  FROM iams_current_formula_repairs incoming
  WHERE retailer.cache_key = 'petsmart-retail-catalog:' || incoming.gtin
    AND retailer.gtin = incoming.gtin
    AND lower(regexp_replace(btrim(retailer.ingredient_text), '\s+', ' ', 'g'))
        <> lower(regexp_replace(btrim(incoming.ingredient_text), '\s+', ' ', 'g'));
  GET DIAGNOSTICS v_retired = ROW_COUNT;

  UPDATE public.catalog_verified_product_search_aliases alias_row
  SET active = FALSE, updated_at = NOW()
  WHERE alias_row.cache_key IN (
    SELECT 'petsmart-retail-catalog:' || incoming.gtin
    FROM iams_current_formula_repairs incoming
  );

  IF v_updated <> v_expected OR v_retired <> v_expected THEN
    RAISE EXCEPTION
      'IAMS repair updated % official rows and retired % stale retailer rows; expected % each',
      v_updated, v_retired, v_expected;
  END IF;
END
$$;
