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
  v_run_id BIGINT;
  v_run_status TEXT;
  v_pagination_complete BOOLEAN;
  v_observed_count INTEGER;
  v_formula_count INTEGER;
  v_observation_count INTEGER;
  v_sku_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_observations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_observations must be a JSON array';
  END IF;

  v_pagination_complete := COALESCE((p_run->>'pagination_complete')::BOOLEAN, FALSE);
  v_run_status := CASE
    WHEN COALESCE(p_run->>'status', '') = 'failed' THEN 'failed'
    WHEN v_pagination_complete
      AND COALESCE((p_run->>'truncated')::BOOLEAN, FALSE) = FALSE
      AND COALESCE((p_run->>'cap_reached')::BOOLEAN, FALSE) = FALSE
      THEN 'completed'
    ELSE 'quarantined'
  END;
  v_observed_count := jsonb_array_length(COALESCE(p_observations, '[]'::JSONB));

  INSERT INTO public.catalog_source_runs (
    run_key,
    source_slug,
    source_type,
    coverage_role,
    status,
    started_at,
    finished_at,
    expected_count,
    observed_count,
    accepted_count,
    rejected_count,
    pagination_complete,
    source_content_hash,
    checkpoint,
    error_summary,
    metadata,
    updated_at
  )
  VALUES (
    p_run->>'run_key',
    p_run->>'source_slug',
    COALESCE(NULLIF(p_run->>'source_type', ''), 'manufacturer'),
    COALESCE(NULLIF(p_run->>'coverage_role', ''), 'denominator'),
    v_run_status,
    COALESCE((p_run->>'started_at')::TIMESTAMPTZ, NOW()),
    NOW(),
    NULLIF(p_run->>'expected_count', '')::INTEGER,
    v_observed_count,
    (
      SELECT count(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
      WHERE item->>'validation_status' = 'accepted'
    ),
    (
      SELECT count(*)::INTEGER
      FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB)) item
      WHERE COALESCE(item->>'validation_status', 'pending') <> 'accepted'
    ),
    v_pagination_complete,
    NULLIF(p_run->>'source_content_hash', ''),
    COALESCE(p_run->'checkpoint', '{}'::JSONB),
    CASE WHEN v_run_status = 'completed' THEN NULL
         ELSE COALESCE(NULLIF(p_run->>'error_summary', ''), 'run_not_proven_complete')
    END,
    COALESCE(p_run->'metadata', '{}'::JSONB),
    NOW()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    status = EXCLUDED.status,
    finished_at = EXCLUDED.finished_at,
    expected_count = EXCLUDED.expected_count,
    observed_count = EXCLUDED.observed_count,
    accepted_count = EXCLUDED.accepted_count,
    rejected_count = EXCLUDED.rejected_count,
    pagination_complete = EXCLUDED.pagination_complete,
    source_content_hash = EXCLUDED.source_content_hash,
    checkpoint = EXCLUDED.checkpoint,
    error_summary = EXCLUDED.error_summary,
    metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_run_id;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      identity_hash TEXT,
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
      ingredients JSONB,
      front_image_url TEXT,
      is_complete_food BOOLEAN,
      available_in_us BOOLEAN,
      protected_terms JSONB,
      observed_at TIMESTAMPTZ,
      content_hash TEXT,
      validation_status TEXT,
      validation_reasons JSONB,
      ingredient_verification_status TEXT,
      image_verification_status TEXT,
      coverage_tier TEXT,
      raw_payload JSONB
    )
  ),
  valid_identity AS (
    SELECT *
    FROM incoming
    WHERE NULLIF(btrim(formula_key), '') IS NOT NULL
      AND NULLIF(btrim(brand), '') IS NOT NULL
      AND NULLIF(btrim(product_line), '') IS NOT NULL
      AND pet_type IN ('dog', 'cat')
      AND COALESCE(available_in_us, TRUE)
  ),
  upserted AS (
    INSERT INTO public.catalog_formulas (
      formula_key,
      manufacturer,
      brand,
      product_name,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      is_complete_food,
      ingredient_text,
      ingredients,
      front_image_url,
      source_url,
      source_authority,
      ingredient_verification_status,
      image_verification_status,
      protected_terms,
      verification_status,
      active,
      is_popular_brand,
      first_observed_at,
      last_observed_at,
      identity_hash,
      updated_at
    )
    SELECT DISTINCT ON (formula_key)
      formula_key,
      COALESCE(NULLIF(btrim(manufacturer), ''), brand),
      brand,
      COALESCE(NULLIF(btrim(product_name), ''), product_line),
      product_line,
      pet_type,
      COALESCE(NULLIF(btrim(life_stage), ''), 'unknown'),
      COALESCE(NULLIF(btrim(food_form), ''), 'unknown'),
      COALESCE(flavor, ''),
      COALESCE(diet_condition, ''),
      COALESCE(is_complete_food, TRUE),
      COALESCE(ingredient_text, ''),
      COALESCE((
        SELECT array_agg(value ORDER BY ordinal)
        FROM jsonb_array_elements_text(COALESCE(ingredients, '[]'::JSONB))
          WITH ORDINALITY ingredient(value, ordinal)
      ), ARRAY[]::TEXT[]),
      COALESCE(front_image_url, ''),
      source_url,
      CASE
        WHEN source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
          THEN source_authority
        ELSE 'unverified'
      END,
      COALESCE(NULLIF(ingredient_verification_status, ''), 'unverified'),
      COALESCE(NULLIF(image_verification_status, ''), 'unverified'),
      COALESCE((
        SELECT array_agg(value ORDER BY ordinal)
        FROM jsonb_array_elements_text(COALESCE(protected_terms, '[]'::JSONB))
          WITH ORDINALITY term(value, ordinal)
      ), ARRAY[]::TEXT[]),
      CASE
        WHEN validation_status = 'accepted'
          AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
          AND ingredient_verification_status IN (
            'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
          )
          AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
          AND cardinality(COALESCE((
            SELECT array_agg(value)
            FROM jsonb_array_elements_text(COALESCE(ingredients, '[]'::JSONB)) ingredient(value)
          ), ARRAY[]::TEXT[])) >= 5
          AND NULLIF(btrim(ingredient_text), '') IS NOT NULL
          AND NULLIF(btrim(front_image_url), '') IS NOT NULL
          THEN 'verified'
        WHEN validation_status = 'quarantined' THEN 'quarantined'
        ELSE 'discovered'
      END,
      TRUE,
      coverage_tier = 'tier_1_us_retail',
      COALESCE(observed_at, NOW()),
      COALESCE(observed_at, NOW()),
      identity_hash,
      NOW()
    FROM valid_identity
    ORDER BY
      formula_key,
      CASE source_authority
        WHEN 'gdsn' THEN 4
        WHEN 'official' THEN 3
        WHEN 'manufacturer' THEN 2
        WHEN 'retailer_verified' THEN 1
        ELSE 0
      END DESC,
      observed_at DESC NULLS LAST
    ON CONFLICT (formula_key) DO UPDATE SET
      last_observed_at = GREATEST(
        catalog_formulas.last_observed_at,
        EXCLUDED.last_observed_at
      ),
      active = TRUE,
      absent_since = NULL,
      is_popular_brand = catalog_formulas.is_popular_brand OR EXCLUDED.is_popular_brand,
      product_name = CASE
        WHEN catalog_formulas.product_name = '' THEN EXCLUDED.product_name
        ELSE catalog_formulas.product_name
      END,
      ingredient_text = CASE
        WHEN catalog_formulas.ingredient_text = '' THEN EXCLUDED.ingredient_text
        ELSE catalog_formulas.ingredient_text
      END,
      ingredients = CASE
        WHEN cardinality(catalog_formulas.ingredients) = 0 THEN EXCLUDED.ingredients
        ELSE catalog_formulas.ingredients
      END,
      front_image_url = CASE
        WHEN catalog_formulas.front_image_url = '' THEN EXCLUDED.front_image_url
        ELSE catalog_formulas.front_image_url
      END,
      source_url = CASE
        WHEN catalog_formulas.source_url = '' THEN EXCLUDED.source_url
        ELSE catalog_formulas.source_url
      END,
      verification_status = CASE
        WHEN catalog_formulas.verification_status = 'verified' THEN 'verified'
        ELSE EXCLUDED.verification_status
      END,
      source_authority = CASE
        WHEN catalog_formulas.source_authority = 'unverified' THEN EXCLUDED.source_authority
        ELSE catalog_formulas.source_authority
      END,
      ingredient_verification_status = CASE
        WHEN catalog_formulas.ingredient_verification_status = 'unverified'
          THEN EXCLUDED.ingredient_verification_status
        ELSE catalog_formulas.ingredient_verification_status
      END,
      image_verification_status = CASE
        WHEN catalog_formulas.image_verification_status = 'unverified'
          THEN EXCLUDED.image_verification_status
        ELSE catalog_formulas.image_verification_status
      END,
      updated_at = NOW()
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_formula_count FROM upserted;

  WITH incoming AS (
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
      formula.id,
      incoming.source_slug,
      incoming.source_external_id,
      incoming.source_url,
      CASE
        WHEN incoming.source_authority IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified',
          'retailer_listing', 'gap_discovery'
        ) THEN incoming.source_authority
        ELSE 'gap_discovery'
      END,
      NULLIF(incoming.gtin, ''),
      COALESCE(incoming.manufacturer, ''),
      incoming.brand,
      incoming.product_name,
      COALESCE(incoming.product_line, ''),
      COALESCE(incoming.pet_type, 'unknown'),
      COALESCE(incoming.life_stage, 'unknown'),
      COALESCE(incoming.food_form, ''),
      COALESCE(incoming.flavor, ''),
      COALESCE(incoming.diet_condition, ''),
      COALESCE(incoming.package_size, ''),
      COALESCE(incoming.ingredient_text, ''),
      COALESCE(incoming.front_image_url, ''),
      incoming.is_complete_food,
      COALESCE(incoming.available_in_us, TRUE),
      COALESCE(incoming.observed_at, NOW()),
      incoming.content_hash,
      CASE
        WHEN incoming.validation_status IN ('pending', 'accepted', 'rejected', 'quarantined')
          THEN incoming.validation_status
        ELSE 'pending'
      END,
      COALESCE((
        SELECT array_agg(value)
        FROM jsonb_array_elements_text(COALESCE(incoming.validation_reasons, '[]'::JSONB)) reason(value)
      ), ARRAY[]::TEXT[]),
      COALESCE(incoming.raw_payload, '{}'::JSONB)
    FROM incoming
    LEFT JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
    WHERE NULLIF(btrim(incoming.source_external_id), '') IS NOT NULL
      AND NULLIF(btrim(incoming.source_url), '') IS NOT NULL
      AND NULLIF(btrim(incoming.content_hash), '') IS NOT NULL
    ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO NOTHING
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_observation_count FROM inserted;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      source_slug TEXT,
      source_external_id TEXT,
      source_url TEXT,
      gtin TEXT,
      package_size TEXT,
      observed_at TIMESTAMPTZ
    )
  ),
  inserted AS (
    INSERT INTO public.catalog_skus (
      formula_id,
      gtin,
      package_size,
      source_slug,
      source_external_id,
      source_url,
      active,
      first_observed_at,
      last_observed_at,
      updated_at
    )
    SELECT
      formula.id,
      NULLIF(incoming.gtin, ''),
      COALESCE(incoming.package_size, ''),
      incoming.source_slug,
      incoming.source_external_id,
      incoming.source_url,
      TRUE,
      COALESCE(incoming.observed_at, NOW()),
      COALESCE(incoming.observed_at, NOW()),
      NOW()
    FROM incoming
    JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
    WHERE NULLIF(btrim(incoming.source_external_id), '') IS NOT NULL
    ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
      source_url = EXCLUDED.source_url,
      active = TRUE,
      last_observed_at = GREATEST(
        catalog_skus.last_observed_at,
        EXCLUDED.last_observed_at
      ),
      updated_at = NOW()
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_sku_count FROM inserted;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      source_url TEXT,
      source_authority TEXT,
      ingredient_text TEXT,
      front_image_url TEXT,
      ingredient_verification_status TEXT,
      image_verification_status TEXT,
      observed_at TIMESTAMPTZ,
      content_hash TEXT
    )
  ),
  evidence_rows AS (
    SELECT
      formula.id AS formula_id,
      incoming.source_url,
      incoming.source_authority,
      incoming.observed_at,
      incoming.content_hash,
      field.field_name,
      field.field_value,
      field.accepted
    FROM incoming
    JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
    CROSS JOIN LATERAL (
      VALUES
        (
          'ingredient_text'::TEXT,
          to_jsonb(incoming.ingredient_text),
          incoming.ingredient_verification_status IN (
            'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
          ) AND NULLIF(btrim(incoming.ingredient_text), '') IS NOT NULL
        ),
        (
          'front_image_url'::TEXT,
          to_jsonb(incoming.front_image_url),
          incoming.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
            AND NULLIF(btrim(incoming.front_image_url), '') IS NOT NULL
        )
    ) AS field(field_name, field_value, accepted)
    WHERE incoming.source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
      AND NULLIF(btrim(incoming.source_url), '') IS NOT NULL
      AND NULLIF(btrim(incoming.content_hash), '') IS NOT NULL
  )
  INSERT INTO public.catalog_field_evidence (
    formula_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    observed_at,
    content_hash
  )
  SELECT
    formula_id,
    field_name,
    field_value,
    source_url,
    source_authority,
    accepted,
    COALESCE(observed_at, NOW()),
    content_hash
  FROM evidence_rows
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE SET
    accepted = catalog_field_evidence.accepted OR EXCLUDED.accepted;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'run_status', v_run_status,
    'observed_rows', v_observed_count,
    'upserted_formulas', v_formula_count,
    'inserted_observations', v_observation_count,
    'upserted_skus', v_sku_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;
