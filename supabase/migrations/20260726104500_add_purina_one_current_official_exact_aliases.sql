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
SELECT DISTINCT
  formula.promoted_cache_key,
  serving.product_name,
  public.normalize_verified_product_search_query(serving.product_name),
  serving.source_url,
  'manufacturer',
  COALESCE(serving.verified_at, observation.observed_at),
  jsonb_build_object(
    'exact_current_manufacturer_title', TRUE,
    'source_run_key', run.run_key,
    'formula_key', formula.formula_key,
    'species_boundary', formula.pet_type,
    'life_stage_boundary', formula.life_stage,
    'food_form_boundary', formula.food_form,
    'recipe_boundary', formula.product_line
  ),
  TRUE,
  now()
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
    'nestle-purina-one:official-formula-inventory:2908e1f4ed3cce6acf366b56'
  AND serving.source_url LIKE 'https://www.purina.com/%'
  AND serving.source_quality = 'manufacturer'
  AND serving.ingredient_verification_status = 'manufacturer'
  AND serving.image_verification_status = 'manufacturer'
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_exact_alias_count INTEGER;
BEGIN
  SELECT
    count(DISTINCT formula.id),
    count(DISTINCT formula.id) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.catalog_verified_product_search_aliases alias
        WHERE alias.active
          AND alias.cache_key = formula.promoted_cache_key
          AND alias.normalized_alias =
              public.normalize_verified_product_search_query(serving.product_name)
      )
    )
  INTO v_formula_count, v_exact_alias_count
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
      'nestle-purina-one:official-formula-inventory:2908e1f4ed3cce6acf366b56';

  IF v_formula_count <> 69 OR v_exact_alias_count <> v_formula_count THEN
    RAISE EXCEPTION
      'Purina ONE exact aliases incomplete: % aliases for % formulas',
      v_exact_alias_count,
      v_formula_count;
  END IF;
END
$$;
