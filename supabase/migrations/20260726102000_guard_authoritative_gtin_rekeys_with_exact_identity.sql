-- A GTIN is strong SKU evidence, but it is not sufficient by itself to move a
-- serving SKU to a different formula identity. Retailer errors, reused legacy
-- identifiers, or a stale formula version must never cross recipe, life-stage,
-- breed/condition, or food-form boundaries.
--
-- Guard each accepted observation before the existing authoritative rekey
-- path. Conflicting observations remain durable quarantined observations; the
-- rest of the batch can proceed.

ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_without_exact_gtin_identity_guard;

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
  v_guarded_observations JSONB := '[]'::JSONB;
  v_guarded_count INTEGER := 0;
  v_result JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_observations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_observations must be a JSON array';
  END IF;

  WITH source_rows AS (
    SELECT
      item,
      ordinal,
      NULLIF(btrim(item->>'gtin'), '') AS gtin,
      NULLIF(btrim(item->>'formula_key'), '') AS formula_key,
      concat_ws(
        ' ',
        item->>'brand',
        item->>'product_name',
        item->>'product_line',
        item->>'flavor',
        item->>'life_stage',
        item->>'food_form',
        item->>'diet_condition'
      ) AS incoming_identity
    FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB))
      WITH ORDINALITY AS source(item, ordinal)
  ),
  classified AS (
    SELECT
      source.*,
      (
        source.gtin IS NOT NULL
        AND source.formula_key IS NOT NULL
        AND source.item->>'validation_status' = 'accepted'
        AND source.item->>'source_authority' IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified'
        )
        AND EXISTS (
          SELECT 1
          FROM public.catalog_skus sku
          JOIN public.catalog_formulas existing
            ON existing.id = sku.formula_id
          WHERE sku.gtin = source.gtin
            AND sku.active
            AND existing.formula_key <> source.formula_key
            AND NOT (
              lower(btrim(existing.brand)) =
                lower(btrim(source.item->>'brand'))
              AND lower(btrim(existing.pet_type)) =
                lower(btrim(source.item->>'pet_type'))
              AND (
                lower(btrim(existing.food_form)) IN ('', 'unknown')
                OR lower(btrim(source.item->>'food_form')) IN ('', 'unknown')
                OR lower(btrim(existing.food_form)) =
                  lower(btrim(source.item->>'food_form'))
              )
              AND (
                (
                  (
                    public.catalog_acquisition_identity_match(
                      source.incoming_identity,
                      source.item->>'pet_type',
                      concat_ws(
                        ' ',
                        existing.brand,
                        existing.product_name,
                        existing.product_line,
                        existing.flavor,
                        existing.life_stage,
                        existing.food_form,
                        existing.diet_condition
                      ),
                      existing.pet_type
                    )
                    OR (
                      -- Some exact formulas (for example "Seafood Stew" or
                      -- SPORT 26/16) have no protein token for the generic
                      -- matcher. Allow only byte-identical official artifacts.
                      public.catalog_acquisition_identity_normalize(
                        existing.product_name
                      ) = public.catalog_acquisition_identity_normalize(
                        source.item->>'product_name'
                      )
                      AND NULLIF(btrim(existing.source_url), '') =
                        NULLIF(btrim(source.item->>'source_url'), '')
                      AND lower(regexp_replace(
                        btrim(existing.ingredient_text),
                        '\s+',
                        ' ',
                        'g'
                      )) = lower(regexp_replace(
                        btrim(source.item->>'ingredient_text'),
                        '\s+',
                        ' ',
                        'g'
                      ))
                      AND NULLIF(btrim(existing.front_image_url), '') =
                        NULLIF(btrim(source.item->>'front_image_url'), '')
                    )
                  )
                  AND public.catalog_acquisition_life_stage_terms_match(
                    source.incoming_identity,
                    concat_ws(
                      ' ',
                      existing.product_name,
                      existing.product_line,
                      existing.flavor,
                      existing.life_stage,
                      existing.food_form,
                      existing.diet_condition
                    )
                  )
                  AND public.catalog_acquisition_protected_line_terms_match(
                    source.incoming_identity,
                    concat_ws(
                      ' ',
                      existing.product_name,
                      existing.product_line,
                      existing.flavor,
                      existing.life_stage,
                      existing.food_form,
                      existing.diet_condition
                    )
                  )
                  AND public.catalog_acquisition_food_form_terms_match(
                    source.incoming_identity,
                    concat_ws(
                      ' ',
                      existing.product_name,
                      existing.product_line,
                      existing.flavor,
                      existing.life_stage,
                      existing.food_form,
                      existing.diet_condition
                    )
                  )
                )
                OR EXISTS (
                  -- A formula-version transition or prior ledger collision may
                  -- legitimately change line/life-stage/recipe terms. Permit
                  -- the rekey only when an exact current verified serving row
                  -- already ties this observation's cache key, GTIN, title,
                  -- official URL, full ingredients, and front image together.
                  SELECT 1
                  FROM public.product_data current_serving
                  WHERE current_serving.cache_key =
                    source.item->'raw_payload'->>'cache_key'
                    AND current_serving.gtin = source.gtin
                    AND current_serving.source =
                      source.item->>'source_slug'
                    AND current_serving.source_url =
                      source.item->>'source_url'
                    AND public.catalog_acquisition_identity_normalize(
                      current_serving.product_name
                    ) = public.catalog_acquisition_identity_normalize(
                      source.item->>'product_name'
                    )
                    AND lower(regexp_replace(
                      btrim(current_serving.ingredient_text),
                      '\s+',
                      ' ',
                      'g'
                    )) = lower(regexp_replace(
                      btrim(source.item->>'ingredient_text'),
                      '\s+',
                      ' ',
                      'g'
                    ))
                    AND current_serving.image_url =
                      source.item->>'front_image_url'
                    AND lower(btrim(current_serving.pet_type)) =
                      lower(btrim(source.item->>'pet_type'))
                    AND (
                      lower(COALESCE(
                        NULLIF(btrim(current_serving.food_form), ''),
                        'unknown'
                      )) IN ('unknown', 'other')
                      OR lower(COALESCE(
                        NULLIF(btrim(source.item->>'food_form'), ''),
                        'unknown'
                      )) IN ('unknown', 'other')
                      OR lower(btrim(current_serving.food_form)) =
                        lower(btrim(source.item->>'food_form'))
                    )
                    AND current_serving.is_complete_food = TRUE
                    AND COALESCE(
                      current_serving.catalog_exclusion_reason,
                      ''
                    ) = ''
                    AND current_serving.source_quality IN (
                      'gdsn', 'official', 'manufacturer', 'retailer_verified'
                    )
                    AND current_serving.ingredient_verification_status IN (
                      'gdsn', 'official', 'manufacturer',
                      'retailer_verified', 'label_ocr_verified'
                    )
                    AND current_serving.image_verification_status IN (
                      'official', 'manufacturer', 'retailer_verified'
                    )
                )
              )
            )
        )
      ) AS identity_conflict
    FROM source_rows source
  ),
  guarded AS (
    SELECT
      ordinal,
      identity_conflict,
      CASE
        WHEN NOT identity_conflict THEN item
        ELSE jsonb_set(
          jsonb_set(
            item,
            '{validation_status}',
            to_jsonb('quarantined'::TEXT),
            TRUE
          ),
          '{validation_reasons}',
          COALESCE(item->'validation_reasons', '[]'::JSONB)
            || jsonb_build_array('gtin_formula_identity_conflict'),
          TRUE
        )
      END AS item
    FROM classified
  )
  SELECT
    COALESCE(jsonb_agg(item ORDER BY ordinal), '[]'::JSONB),
    count(*) FILTER (WHERE identity_conflict)
  INTO v_guarded_observations, v_guarded_count
  FROM guarded;

  v_result :=
    public.stage_catalog_census_batch_without_exact_gtin_identity_guard(
      p_run,
      v_guarded_observations
    );

  RETURN v_result || jsonb_build_object(
    'gtin_identity_guard_quarantines',
    v_guarded_count
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.stage_catalog_census_batch_without_exact_gtin_identity_guard(
    JSONB,
    JSONB
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.stage_catalog_census_batch_without_exact_gtin_identity_guard(
    JSONB,
    JSONB
  )
  TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  TO service_role;

DO $$
DECLARE
  result JSONB;
BEGIN
  result := public.stage_catalog_census_batch(
    jsonb_build_object(
      'run_key', 'migration-test:exact-gtin-identity-guard',
      'source_slug', 'migration-test',
      'source_type', 'manufacturer',
      'coverage_role', 'verification',
      'status', 'completed',
      'started_at', now(),
      'expected_count', 0,
      'pagination_complete', true,
      'truncated', false,
      'cap_reached', false,
      'source_content_hash',
        'migration-test-exact-gtin-identity-guard',
      'checkpoint', '{}'::JSONB,
      'metadata', '{}'::JSONB
    ),
    '[]'::JSONB
  );

  IF COALESCE((result->>'gtin_identity_guard_quarantines')::INTEGER, -1) <> 0
      OR COALESCE((result->>'observed_rows')::INTEGER, -1) <> 0 THEN
    RAISE EXCEPTION
      'Exact GTIN identity guard empty-batch regression: %',
      result;
  END IF;
END $$;
