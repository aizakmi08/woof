WITH inventory AS (
  SELECT DISTINCT
    formula.formula_key,
    formula.promoted_cache_key,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    serving.product_name,
    serving.source_url,
    COALESCE(serving.verified_at, observation.observed_at) AS observed_at
  FROM public.catalog_source_runs run
  JOIN public.catalog_observations observation
    ON observation.run_id = run.id
   AND observation.validation_status = 'accepted'
  JOIN public.catalog_formulas formula
    ON formula.id = observation.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key
   AND serving.is_complete_food
   AND serving.catalog_exclusion_reason IS NULL
  WHERE run.run_key =
      'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd'
)
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  updated_at
)
SELECT
  promoted_cache_key,
  concat('Nutro ', product_name),
  public.normalize_verified_product_search_query(
    concat('Nutro ', product_name)
  ),
  source_url,
  'manufacturer',
  observed_at,
  jsonb_build_object(
    'brand_prefixed_current_manufacturer_title', TRUE,
    'source_run_key',
      'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd',
    'formula_key', formula_key,
    'species_boundary', pet_type,
    'life_stage_boundary', life_stage,
    'food_form_boundary', food_form
  ),
  TRUE,
  NOW()
FROM inventory
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_alias_count INTEGER;
BEGIN
  WITH inventory AS (
    SELECT DISTINCT
      formula.id,
      formula.promoted_cache_key,
      serving.product_name
    FROM public.catalog_source_runs run
    JOIN public.catalog_observations observation
      ON observation.run_id = run.id
     AND observation.validation_status = 'accepted'
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
     AND formula.active
     AND formula.verification_status = 'verified'
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE run.run_key =
        'nutro:official-formula-inventory:720a8df5650f7a7284f59cfd'
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.catalog_verified_product_search_aliases alias
        WHERE alias.active
          AND alias.cache_key = inventory.promoted_cache_key
          AND alias.normalized_alias =
              public.normalize_verified_product_search_query(
                concat('Nutro ', inventory.product_name)
              )
      )
    )
  INTO v_formula_count, v_alias_count
  FROM inventory;

  IF v_formula_count <> 90 OR v_alias_count <> v_formula_count THEN
    RAISE EXCEPTION
      'Nutro brand-title aliases incomplete: % aliases for % formulas',
      v_alias_count,
      v_formula_count;
  END IF;
END
$$;
