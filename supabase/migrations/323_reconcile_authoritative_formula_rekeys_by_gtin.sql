-- Official catalogs sometimes improve a formula identity after an earlier
-- census stored a coarse recipe such as "beef" or "chicken". Reconcile that
-- identity drift by exact GTIN before staging, while retaining the hard
-- cross-brand/species/form conflict boundary.

ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_without_formula_rekey;

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
  v_old_formula_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_rekeyed_gtins INTEGER := 0;
  v_result JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_observations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_observations must be a JSON array';
  END IF;

  IF EXISTS (
    WITH incoming AS (
      SELECT *
      FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
        formula_key TEXT,
        brand TEXT,
        pet_type TEXT,
        food_form TEXT,
        gtin TEXT,
        source_authority TEXT,
        validation_status TEXT
      )
      WHERE NULLIF(btrim(gtin), '') IS NOT NULL
        AND NULLIF(btrim(formula_key), '') IS NOT NULL
        AND validation_status = 'accepted'
        AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
    )
    SELECT 1
    FROM incoming
    JOIN public.catalog_skus sku
      ON sku.gtin = incoming.gtin
     AND sku.active
    JOIN public.catalog_formulas existing
      ON existing.id = sku.formula_id
    WHERE existing.formula_key <> incoming.formula_key
      AND (
        lower(btrim(existing.brand)) <> lower(btrim(incoming.brand))
        OR lower(btrim(existing.pet_type)) <> lower(btrim(incoming.pet_type))
        OR (
          lower(btrim(existing.food_form)) NOT IN ('', 'unknown')
          AND lower(btrim(incoming.food_form)) NOT IN ('', 'unknown')
          AND lower(btrim(existing.food_form)) <> lower(btrim(incoming.food_form))
        )
      )
  ) THEN
    RAISE EXCEPTION
      'Authoritative GTIN formula rekey crossed a brand, species, or food-form boundary'
      USING ERRCODE = '23514';
  END IF;

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
      source_url TEXT,
      source_authority TEXT,
      gtin TEXT,
      ingredient_text TEXT,
      ingredients JSONB,
      front_image_url TEXT,
      is_complete_food BOOLEAN,
      available_in_us BOOLEAN,
      protected_terms JSONB,
      observed_at TIMESTAMPTZ,
      validation_status TEXT,
      ingredient_verification_status TEXT,
      image_verification_status TEXT,
      coverage_tier TEXT
    )
    WHERE NULLIF(btrim(gtin), '') IS NOT NULL
      AND NULLIF(btrim(formula_key), '') IS NOT NULL
      AND validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  ),
  conflicts AS (
    SELECT DISTINCT existing.id
    FROM incoming
    JOIN public.catalog_skus sku
      ON sku.gtin = incoming.gtin
     AND sku.active
    JOIN public.catalog_formulas existing
      ON existing.id = sku.formula_id
    WHERE existing.formula_key <> incoming.formula_key
  )
  SELECT COALESCE(array_agg(id), ARRAY[]::BIGINT[])
  INTO v_old_formula_ids
  FROM conflicts;

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
      source_url TEXT,
      source_authority TEXT,
      gtin TEXT,
      ingredient_text TEXT,
      ingredients JSONB,
      front_image_url TEXT,
      is_complete_food BOOLEAN,
      available_in_us BOOLEAN,
      protected_terms JSONB,
      observed_at TIMESTAMPTZ,
      validation_status TEXT,
      ingredient_verification_status TEXT,
      image_verification_status TEXT,
      coverage_tier TEXT
    )
    WHERE NULLIF(btrim(gtin), '') IS NOT NULL
      AND NULLIF(btrim(formula_key), '') IS NOT NULL
      AND validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  ),
  rekeys AS (
    SELECT DISTINCT ON (incoming.formula_key)
      incoming.*
    FROM incoming
    JOIN public.catalog_skus sku
      ON sku.gtin = incoming.gtin
     AND sku.active
    JOIN public.catalog_formulas existing
      ON existing.id = sku.formula_id
    WHERE existing.formula_key <> incoming.formula_key
    ORDER BY incoming.formula_key, incoming.observed_at DESC NULLS LAST
  )
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
  SELECT
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
    source_authority,
    COALESCE(NULLIF(ingredient_verification_status, ''), 'unverified'),
    COALESCE(NULLIF(image_verification_status, ''), 'unverified'),
    COALESCE((
      SELECT array_agg(value ORDER BY ordinal)
      FROM jsonb_array_elements_text(COALESCE(protected_terms, '[]'::JSONB))
        WITH ORDINALITY term(value, ordinal)
    ), ARRAY[]::TEXT[]),
    CASE
      WHEN ingredient_verification_status IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
      )
        AND image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
        AND NULLIF(btrim(ingredient_text), '') IS NOT NULL
        AND NULLIF(btrim(front_image_url), '') IS NOT NULL
        AND NOT public.catalog_has_unbalanced_parentheses(ingredient_text)
        AND NOT public.catalog_has_ingredient_ocr_artifacts(ingredient_text)
        THEN 'verified'
      ELSE 'discovered'
    END,
    TRUE,
    coverage_tier = 'tier_1_us_retail',
    COALESCE(observed_at, NOW()),
    COALESCE(observed_at, NOW()),
    identity_hash,
    NOW()
  FROM rekeys
  ON CONFLICT (formula_key) DO UPDATE SET
    manufacturer = EXCLUDED.manufacturer,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    product_line = EXCLUDED.product_line,
    pet_type = EXCLUDED.pet_type,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    flavor = EXCLUDED.flavor,
    diet_condition = EXCLUDED.diet_condition,
    is_complete_food = EXCLUDED.is_complete_food,
    ingredient_text = CASE
      WHEN EXCLUDED.verification_status = 'verified' THEN EXCLUDED.ingredient_text
      ELSE catalog_formulas.ingredient_text
    END,
    ingredients = CASE
      WHEN EXCLUDED.verification_status = 'verified' THEN EXCLUDED.ingredients
      ELSE catalog_formulas.ingredients
    END,
    front_image_url = CASE
      WHEN EXCLUDED.verification_status = 'verified' THEN EXCLUDED.front_image_url
      ELSE catalog_formulas.front_image_url
    END,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    ingredient_verification_status = CASE
      WHEN EXCLUDED.verification_status = 'verified'
        THEN EXCLUDED.ingredient_verification_status
      ELSE catalog_formulas.ingredient_verification_status
    END,
    image_verification_status = CASE
      WHEN EXCLUDED.verification_status = 'verified'
        THEN EXCLUDED.image_verification_status
      ELSE catalog_formulas.image_verification_status
    END,
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(catalog_formulas.protected_terms || EXCLUDED.protected_terms) term
      WHERE NULLIF(btrim(term), '') IS NOT NULL
    ),
    verification_status = CASE
      WHEN EXCLUDED.verification_status = 'verified' THEN 'verified'
      ELSE catalog_formulas.verification_status
    END,
    active = TRUE,
    absent_since = NULL,
    is_popular_brand = catalog_formulas.is_popular_brand OR EXCLUDED.is_popular_brand,
    last_observed_at = GREATEST(catalog_formulas.last_observed_at, EXCLUDED.last_observed_at),
    identity_hash = EXCLUDED.identity_hash,
    updated_at = NOW();

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      gtin TEXT,
      source_authority TEXT,
      validation_status TEXT
    )
    WHERE NULLIF(btrim(gtin), '') IS NOT NULL
      AND NULLIF(btrim(formula_key), '') IS NOT NULL
      AND validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  ),
  moved AS (
    UPDATE public.catalog_skus sku
    SET
      formula_id = target.id,
      updated_at = NOW()
    FROM incoming
    JOIN public.catalog_formulas target
      ON target.formula_key = incoming.formula_key
    WHERE sku.gtin = incoming.gtin
      AND sku.active
      AND sku.formula_id <> target.id
    RETURNING sku.gtin
  )
  SELECT count(DISTINCT gtin)
  INTO v_rekeyed_gtins
  FROM moved;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      brand TEXT,
      pet_type TEXT,
      gtin TEXT,
      source_authority TEXT,
      validation_status TEXT
    )
    WHERE NULLIF(btrim(gtin), '') IS NOT NULL
      AND NULLIF(btrim(formula_key), '') IS NOT NULL
      AND validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  )
  UPDATE public.catalog_observations observation
  SET formula_id = target.id
  FROM incoming
  JOIN public.catalog_formulas target
    ON target.formula_key = incoming.formula_key
  WHERE observation.gtin = incoming.gtin
    AND lower(btrim(observation.brand)) = lower(btrim(incoming.brand))
    AND lower(btrim(observation.pet_type)) = lower(btrim(incoming.pet_type))
    AND observation.formula_id IS DISTINCT FROM target.id;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_observations, '[]'::JSONB)) AS row(
      formula_key TEXT,
      gtin TEXT,
      source_authority TEXT,
      validation_status TEXT
    )
    WHERE NULLIF(btrim(gtin), '') IS NOT NULL
      AND NULLIF(btrim(formula_key), '') IS NOT NULL
      AND validation_status = 'accepted'
      AND source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  )
  UPDATE public.catalog_formulas target
  SET
    promoted_cache_key = COALESCE((
      SELECT serving.cache_key
      FROM public.product_data serving
      WHERE serving.gtin = incoming.gtin
        AND lower(btrim(serving.brand)) = lower(btrim(target.brand))
        AND lower(btrim(serving.pet_type)) = lower(btrim(target.pet_type))
      ORDER BY
        CASE serving.source_quality
          WHEN 'gdsn' THEN 4
          WHEN 'official' THEN 3
          WHEN 'manufacturer' THEN 2
          WHEN 'retailer_verified' THEN 1
          ELSE 0
        END DESC,
        serving.updated_at DESC
      LIMIT 1
    ), target.promoted_cache_key),
    promoted_at = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.product_data serving
        WHERE serving.gtin = incoming.gtin
          AND lower(btrim(serving.brand)) = lower(btrim(target.brand))
          AND lower(btrim(serving.pet_type)) = lower(btrim(target.pet_type))
      ) THEN NOW()
      ELSE target.promoted_at
    END,
    updated_at = NOW()
  FROM incoming
  WHERE target.formula_key = incoming.formula_key;

  UPDATE public.catalog_formulas old_formula
  SET
    active = FALSE,
    absent_since = COALESCE(old_formula.absent_since, NOW()),
    verification_status = 'quarantined',
    promoted_cache_key = NULL,
    promoted_at = NULL,
    updated_at = NOW()
  WHERE old_formula.id = ANY(v_old_formula_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_skus sku
      WHERE sku.formula_id = old_formula.id
        AND sku.active
    );

  v_result := public.stage_catalog_census_batch_without_formula_rekey(
    p_run,
    p_observations
  );

  RETURN v_result || jsonb_build_object(
    'authoritative_formula_rekeyed_gtins',
    v_rekeyed_gtins
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_formula_rekey(
  JSONB,
  JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_formula_rekey(
  JSONB,
  JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_formula_rekey(
  JSONB,
  JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch_without_formula_rekey(
  JSONB,
  JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;
