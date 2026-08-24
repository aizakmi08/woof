-- Keep conflicting/quarantined source observations for audit, but never create
-- canonical formulas, active SKUs, or accepted evidence from them.

ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_unfiltered;

CREATE OR REPLACE FUNCTION public.stage_catalog_census_batch(
  p_run JSONB,
  p_observations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_safe_observations JSONB;
  v_run_id BIGINT;
  v_result JSONB;
  v_quarantined_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_observations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_observations must be a JSON array';
  END IF;

  SELECT COALESCE(jsonb_agg(item), '[]'::JSONB)
  INTO v_safe_observations
  FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
  WHERE COALESCE(item->>'validation_status', 'pending') <> 'quarantined';

  v_result := public.stage_catalog_census_batch_unfiltered(
    p_run,
    v_safe_observations
  );

  SELECT id
  INTO v_run_id
  FROM public.catalog_source_runs
  WHERE run_key = p_run->>'run_key';

  WITH quarantined AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      manufacturer TEXT,
      brand TEXT,
      product_name TEXT,
      product_line TEXT,
      pet_type TEXT,
      life_stage TEXT,
      food_form TEXT,
      flavor TEXT,
      diet_condition TEXT,
      source_slug TEXT,
      source_external_id TEXT,
      source_url TEXT,
      source_authority TEXT,
      gtin TEXT,
      package_size TEXT,
      ingredient_text TEXT,
      front_image_url TEXT,
      is_complete_food BOOLEAN,
      available_in_us BOOLEAN,
      observed_at TIMESTAMPTZ,
      content_hash TEXT,
      validation_status TEXT,
      validation_reasons JSONB,
      raw_payload JSONB
    )
    WHERE validation_status = 'quarantined'
  ),
  inserted AS (
    INSERT INTO public.catalog_observations (
      run_id,
      formula_id,
      source_slug,
      source_external_id,
      source_url,
      source_authority,
      gtin,
      manufacturer,
      brand,
      product_name,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      package_size,
      ingredient_text,
      front_image_url,
      is_complete_food,
      available_in_us,
      observed_at,
      content_hash,
      validation_status,
      validation_reasons,
      raw_payload
    )
    SELECT
      v_run_id,
      NULL,
      source_slug,
      source_external_id,
      source_url,
      CASE
        WHEN source_authority IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified',
          'retailer_listing', 'gap_discovery'
        ) THEN source_authority
        ELSE 'gap_discovery'
      END,
      NULLIF(gtin, ''),
      COALESCE(manufacturer, ''),
      brand,
      product_name,
      COALESCE(product_line, ''),
      COALESCE(pet_type, 'unknown'),
      COALESCE(life_stage, 'unknown'),
      COALESCE(food_form, ''),
      COALESCE(flavor, ''),
      COALESCE(diet_condition, ''),
      COALESCE(package_size, ''),
      COALESCE(ingredient_text, ''),
      COALESCE(front_image_url, ''),
      is_complete_food,
      COALESCE(available_in_us, TRUE),
      COALESCE(observed_at, NOW()),
      content_hash,
      'quarantined',
      COALESCE((
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(
          COALESCE(validation_reasons, '[]'::JSONB)
        ) reason(value)
      ), ARRAY[]::TEXT[]),
      COALESCE(raw_payload, '{}'::JSONB)
    FROM quarantined
    WHERE NULLIF(btrim(source_external_id), '') IS NOT NULL
      AND NULLIF(btrim(source_url), '') IS NOT NULL
      AND NULLIF(btrim(content_hash), '') IS NOT NULL
    ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_quarantined_count FROM inserted;

  UPDATE public.catalog_source_runs
  SET
    observed_count = jsonb_array_length(COALESCE(p_observations, '[]'::JSONB)),
    accepted_count = (
      SELECT count(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
      WHERE item->>'validation_status' = 'accepted'
    ),
    rejected_count = (
      SELECT count(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
      WHERE COALESCE(item->>'validation_status', 'pending') <> 'accepted'
    ),
    updated_at = NOW()
  WHERE id = v_run_id;

  RETURN v_result || jsonb_build_object(
    'quarantined_observations', COALESCE(v_quarantined_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_unfiltered(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_unfiltered(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_unfiltered(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch_unfiltered(JSONB, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;
