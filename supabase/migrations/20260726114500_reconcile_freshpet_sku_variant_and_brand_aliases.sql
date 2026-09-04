-- The 1 lb and 2 lb rolls carry the exact same current formula. Keep both
-- GTINs on the canonical formula, but expose only one serving/scoring row.
UPDATE public.product_data
SET
  catalog_exclusion_reason = 'sku_variant_of_canonical_formula',
  updated_at = NOW()
WHERE cache_key = 'freshpet:851893001731'
  AND source = 'freshpet'
  AND gtin = '851893001731'
  AND product_name =
      'grain free turkey recipe with spinach, cranberries & blueberries'
  AND source_url =
      'https://www.freshpet.com/products/vital-grain-free-turkey-recipe-with-spinach-cranberries-blueberries'
  AND is_complete_food
  AND ingredient_verification_status = 'manufacturer'
  AND image_verification_status = 'manufacturer';

-- Freshpet's current official titles omit the shelf brand. Only the
-- brand-prefixed aliases are globally safe: a generic "complete nutrition
-- chicken recipe" title already exists in another brand's alias space.
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
      'freshpet:official-formula-inventory:ad1d667d565e3fcc162d1685'
    AND serving.source_url LIKE 'https://www.freshpet.com/%'
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
  concat('Freshpet ', product_name),
  public.normalize_verified_product_search_query(
    concat('Freshpet ', product_name)
  ),
  source_url,
  'manufacturer',
  observed_at,
  jsonb_build_object(
    'brand_prefixed_current_manufacturer_title', TRUE,
    'source_run_key',
      'freshpet:official-formula-inventory:ad1d667d565e3fcc162d1685',
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
  v_brand_alias_count INTEGER;
  v_variant_formula_id BIGINT;
  v_canonical_cache_key TEXT;
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
        'freshpet:official-formula-inventory:ad1d667d565e3fcc162d1685'
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
                concat('Freshpet ', inventory.product_name)
              )
      )
    )
  INTO v_formula_count, v_brand_alias_count
  FROM inventory;

  SELECT sku.formula_id, formula.promoted_cache_key
  INTO v_variant_formula_id, v_canonical_cache_key
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula ON formula.id = sku.formula_id
  WHERE sku.gtin = '851893001731'
    AND sku.active
    AND formula.active;

  IF v_formula_count <> 50
     OR v_brand_alias_count <> v_formula_count
     OR v_variant_formula_id IS NULL
     OR v_canonical_cache_key <> 'freshpet:627975010348'
     OR NOT EXISTS (
       SELECT 1
       FROM public.product_data
       WHERE cache_key = 'freshpet:851893001731'
         AND catalog_exclusion_reason = 'sku_variant_of_canonical_formula'
     ) THEN
    RAISE EXCEPTION
      'Freshpet reconciliation incomplete: % aliases for % formulas, variant formula %, serving %',
      v_brand_alias_count,
      v_formula_count,
      v_variant_formula_id,
      v_canonical_cache_key;
  END IF;
END
$$;
