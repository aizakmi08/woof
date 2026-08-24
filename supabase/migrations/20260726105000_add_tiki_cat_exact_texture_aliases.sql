WITH inventory AS (
  SELECT DISTINCT
    formula.id AS formula_id,
    formula.formula_key,
    formula.promoted_cache_key,
    split_part(formula.formula_key, '|', 3) AS identity_line,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    serving.product_name,
    serving.source_url,
    COALESCE(serving.verified_at, observation.observed_at) AS observed_at,
    count(*) OVER (
      PARTITION BY public.normalize_verified_product_search_query(
        serving.product_name
      )
    ) AS title_count
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
      'tiki-pets:official-formula-inventory:628273d59d712968f8bc386f'
    AND serving.source_url LIKE 'https://tikipets.com/product/tiki-cat/%'
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
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
  CASE WHEN title_count = 1 THEN product_name ELSE identity_line END,
  public.normalize_verified_product_search_query(
    CASE WHEN title_count = 1 THEN product_name ELSE identity_line END
  ),
  source_url,
  'manufacturer',
  observed_at,
  jsonb_build_object(
    'exact_current_manufacturer_title', title_count = 1,
    'disambiguated_by_official_product_path', title_count > 1,
    'source_run_key',
      'tiki-pets:official-formula-inventory:628273d59d712968f8bc386f',
    'formula_key', formula_key,
    'species_boundary', pet_type,
    'life_stage_boundary', life_stage,
    'food_form_boundary', food_form,
    'recipe_texture_boundary', identity_line
  ),
  TRUE,
  now()
FROM inventory
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_safe_alias_count INTEGER;
BEGIN
  WITH inventory AS (
    SELECT DISTINCT
      formula.id,
      formula.promoted_cache_key,
      split_part(formula.formula_key, '|', 3) AS identity_line,
      serving.product_name,
      count(*) OVER (
        PARTITION BY public.normalize_verified_product_search_query(
          serving.product_name
        )
      ) AS title_count
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
        'tiki-pets:official-formula-inventory:628273d59d712968f8bc386f'
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
                CASE
                  WHEN inventory.title_count = 1
                    THEN inventory.product_name
                  ELSE inventory.identity_line
                END
              )
      )
    )
  INTO v_formula_count, v_safe_alias_count
  FROM inventory;

  IF v_formula_count <> 112 OR v_safe_alias_count <> v_formula_count THEN
    RAISE EXCEPTION
      'Tiki Cat texture-safe aliases incomplete: % aliases for % formulas',
      v_safe_alias_count,
      v_formula_count;
  END IF;
END
$$;
