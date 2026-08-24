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
      'merrick-pet-care:official-formula-inventory:330b12eb7b16776c9764fb81'
    AND serving.source_url LIKE 'https://www.merrickpetcare.com/%'
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status = 'manufacturer'
    AND serving.image_verification_status = 'manufacturer'
),
aliases AS (
  SELECT
    inventory.*,
    product_name AS alias_text,
    'exact_current_manufacturer_title'::TEXT AS alias_kind
  FROM inventory

  UNION ALL

  SELECT
    inventory.*,
    concat('Merrick ', product_name),
    'brand_prefixed_current_manufacturer_title'::TEXT
  FROM inventory
  WHERE public.normalize_verified_product_search_query(product_name)
        !~ '^merrick(?: |$)'
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
  alias_text,
  public.normalize_verified_product_search_query(alias_text),
  source_url,
  'manufacturer',
  observed_at,
  jsonb_build_object(
    alias_kind, TRUE,
    'source_run_key',
      'merrick-pet-care:official-formula-inventory:330b12eb7b16776c9764fb81',
    'formula_key', formula_key,
    'species_boundary', pet_type,
    'life_stage_boundary', life_stage,
    'food_form_boundary', food_form
  ),
  TRUE,
  NOW()
FROM aliases
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_exact_alias_count INTEGER;
  v_brand_prefix_needed INTEGER;
  v_brand_prefix_count INTEGER;
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
        'merrick-pet-care:official-formula-inventory:330b12eb7b16776c9764fb81'
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
                inventory.product_name
              )
      )
    ),
    count(*) FILTER (
      WHERE public.normalize_verified_product_search_query(
              inventory.product_name
            ) !~ '^merrick(?: |$)'
    ),
    count(*) FILTER (
      WHERE public.normalize_verified_product_search_query(
              inventory.product_name
            ) !~ '^merrick(?: |$)'
        AND EXISTS (
          SELECT 1
          FROM public.catalog_verified_product_search_aliases alias
          WHERE alias.active
            AND alias.cache_key = inventory.promoted_cache_key
            AND alias.normalized_alias =
                public.normalize_verified_product_search_query(
                  concat('Merrick ', inventory.product_name)
                )
        )
    )
  INTO
    v_formula_count,
    v_exact_alias_count,
    v_brand_prefix_needed,
    v_brand_prefix_count
  FROM inventory;

  IF v_formula_count <> 95
     OR v_exact_alias_count <> v_formula_count
     OR v_brand_prefix_needed <> 72
     OR v_brand_prefix_count <> v_brand_prefix_needed THEN
    RAISE EXCEPTION
      'Merrick aliases incomplete: % exact for % formulas, % brand aliases for % needed',
      v_exact_alias_count,
      v_formula_count,
      v_brand_prefix_count,
      v_brand_prefix_needed;
  END IF;
END
$$;
