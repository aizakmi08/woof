-- Staging may create a formula after the identity-rekey preflight. Link every
-- newly staged verified formula to an already-serving verified row by exact
-- GTIN after the batch completes.

ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_without_exact_gtin_link;

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
  v_result JSONB;
  v_linked_formulas INTEGER := 0;
BEGIN
  v_result := public.stage_catalog_census_batch_without_exact_gtin_link(
    p_run,
    p_observations
  );

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
  ),
  links AS (
    SELECT DISTINCT ON (target.id)
      target.id AS formula_id,
      serving.cache_key
    FROM incoming
    JOIN public.catalog_formulas target
      ON target.formula_key = incoming.formula_key
     AND target.active
     AND target.verification_status = 'verified'
    JOIN public.product_data serving
      ON serving.gtin = incoming.gtin
     AND lower(btrim(serving.brand)) = lower(btrim(target.brand))
     AND lower(btrim(serving.pet_type)) = lower(btrim(target.pet_type))
     AND serving.is_complete_food IS TRUE
     AND COALESCE(serving.catalog_exclusion_reason, '') = ''
     AND serving.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
     AND serving.ingredient_verification_status IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
     )
     AND serving.image_verification_status IN (
       'official', 'manufacturer', 'retailer_verified'
     )
    ORDER BY
      target.id,
      CASE serving.source_quality
        WHEN 'gdsn' THEN 4
        WHEN 'official' THEN 3
        WHEN 'manufacturer' THEN 2
        WHEN 'retailer_verified' THEN 1
        ELSE 0
      END DESC,
      serving.updated_at DESC,
      serving.cache_key
  ),
  updated AS (
    UPDATE public.catalog_formulas target
    SET
      promoted_cache_key = links.cache_key,
      promoted_at = COALESCE(target.promoted_at, NOW()),
      updated_at = NOW()
    FROM links
    WHERE target.id = links.formula_id
      AND target.promoted_cache_key IS DISTINCT FROM links.cache_key
    RETURNING target.id
  )
  SELECT count(*)::INTEGER
  INTO v_linked_formulas
  FROM updated;

  RETURN v_result || jsonb_build_object(
    'exact_gtin_serving_links',
    v_linked_formulas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_exact_gtin_link(
  JSONB,
  JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_exact_gtin_link(
  JSONB,
  JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch_without_exact_gtin_link(
  JSONB,
  JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch_without_exact_gtin_link(
  JSONB,
  JSONB
) TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB) TO service_role;
