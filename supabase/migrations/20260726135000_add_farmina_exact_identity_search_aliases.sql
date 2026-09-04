-- Preserve exact Farmina formula lookup when callers include the known brand
-- and/or species around the exact official title. These aliases are backed by
-- the same promoted manufacturer row as the canonical title alias.

WITH source_run AS (
  SELECT id
  FROM public.catalog_source_runs
  WHERE run_key =
    'farmina-pet-foods:official-formula-inventory:12f8b4c817fbc0c32c839434'
    AND status = 'completed'
    AND pagination_complete = TRUE
    AND observed_count = 323
    AND accepted_count = 323
    AND rejected_count = 0
),
current_formulas AS (
  SELECT DISTINCT
    formula.id,
    formula.product_name,
    formula.pet_type,
    formula.promoted_cache_key,
    formula.source_url,
    formula.last_observed_at
  FROM public.catalog_observations observation
  JOIN source_run ON source_run.id = observation.run_id
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
   AND serving.product_name = formula.product_name
   AND serving.source_url = formula.source_url
   AND serving.ingredient_text = formula.ingredient_text
   AND serving.image_url = formula.front_image_url
   AND serving.is_complete_food = TRUE
   AND COALESCE(serving.catalog_exclusion_reason, '') = ''
  WHERE observation.validation_status = 'accepted'
    AND formula.active
    AND formula.verification_status = 'verified'
),
aliases AS (
  SELECT
    id AS formula_id,
    promoted_cache_key AS cache_key,
    concat_ws(' ', 'Farmina', product_name, pet_type) AS alias_text,
    source_url,
    last_observed_at
  FROM current_formulas
  UNION ALL
  SELECT
    id,
    promoted_cache_key,
    concat_ws(' ', product_name, pet_type),
    source_url,
    last_observed_at
  FROM current_formulas
),
validated AS (
  SELECT
    aliases.*,
    public.normalize_verified_product_search_query(alias_text)
      AS normalized_alias
  FROM aliases
)
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active
)
SELECT
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  'manufacturer',
  last_observed_at,
  jsonb_build_object(
    'source_run',
    'farmina-pet-foods:official-formula-inventory:12f8b4c817fbc0c32c839434',
    'exact_formula_identity_alias',
    TRUE,
    'formula_id',
    formula_id
  ),
  TRUE
FROM validated
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_verified_product_search_aliases existing
  WHERE existing.active
    AND existing.normalized_alias = validated.normalized_alias
);

DO $$
DECLARE
  v_aliases INTEGER;
BEGIN
  WITH source_run AS (
    SELECT id
    FROM public.catalog_source_runs
    WHERE run_key =
      'farmina-pet-foods:official-formula-inventory:12f8b4c817fbc0c32c839434'
  ),
  current_formulas AS (
    SELECT DISTINCT
      formula.product_name,
      formula.pet_type,
      formula.promoted_cache_key
    FROM public.catalog_observations observation
    JOIN source_run ON source_run.id = observation.run_id
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    WHERE observation.validation_status = 'accepted'
  ),
  expected AS (
    SELECT
      promoted_cache_key,
      public.normalize_verified_product_search_query(
        concat_ws(' ', 'Farmina', product_name, pet_type)
      ) AS normalized_alias
    FROM current_formulas
    UNION ALL
    SELECT
      promoted_cache_key,
      public.normalize_verified_product_search_query(
        concat_ws(' ', product_name, pet_type)
      )
    FROM current_formulas
  )
  SELECT count(*) INTO v_aliases
  FROM expected
  JOIN public.catalog_verified_product_search_aliases alias
    ON alias.active
   AND alias.cache_key = expected.promoted_cache_key
   AND alias.normalized_alias = expected.normalized_alias;

  IF v_aliases <> 434 THEN
    RAISE EXCEPTION
      'Farmina exact identity alias postcondition failed: %/434',
      v_aliases;
  END IF;
END $$;
