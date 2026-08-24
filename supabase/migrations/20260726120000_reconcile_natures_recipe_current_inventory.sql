-- Reconcile Nature's Recipe's current official inventory after earlier
-- generations stored the shelf brand and owner under three manufacturer
-- spellings. The current manufacturer run is authoritative and includes the
-- exact recipe carried by each official PDP/package image.
DO $$
DECLARE
  v_current_count INTEGER;
  v_duplicate_count INTEGER;
  v_deactivated_sku_count INTEGER;
  v_deactivated_formula_count INTEGER;
  v_search_count INTEGER;
BEGIN
  CREATE TEMP TABLE current_natures_recipe_inventory
  ON COMMIT DROP
  AS
  SELECT DISTINCT
    formula.id AS formula_id,
    formula.formula_key,
    formula.source_url,
    formula.promoted_cache_key,
    formula.product_name,
    formula.flavor,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.ingredient_text,
    formula.front_image_url,
    formula.last_observed_at
  FROM public.catalog_source_runs AS run
  JOIN public.catalog_observations AS observation
    ON observation.run_id = run.id
   AND observation.validation_status = 'accepted'
  JOIN public.catalog_formulas AS formula
    ON formula.id = observation.formula_id
  WHERE run.run_key =
      'nature-s-recipe:official-formula-inventory:e553f1d6ad2b9b54a61c4205';

  SELECT count(*)
  INTO v_current_count
  FROM current_natures_recipe_inventory;

  IF v_current_count <> 25
     OR EXISTS (
       SELECT 1
       FROM current_natures_recipe_inventory
       WHERE source_url NOT LIKE
           'https://www.naturesrecipe.com/product/%'
         OR promoted_cache_key IS NULL
         OR flavor = ''
         OR pet_type <> 'dog'
         OR food_form NOT IN ('dry', 'wet', 'freeze-dried')
         OR ingredient_text IS NULL
         OR front_image_url IS NULL
     ) THEN
    RAISE EXCEPTION
      'Nature''s Recipe current official inventory drifted: % formulas',
      v_current_count;
  END IF;

  CREATE TEMP TABLE duplicate_natures_recipe_formulas
  ON COMMIT DROP
  AS
  SELECT DISTINCT old_formula.id AS formula_id
  FROM current_natures_recipe_inventory AS current_formula
  JOIN public.catalog_formulas AS old_formula
    ON old_formula.source_url = current_formula.source_url
   AND old_formula.id <> current_formula.formula_id
   AND old_formula.active
  WHERE old_formula.brand IN ('nature s recipe', 'Nature''s Recipe')
    AND old_formula.pet_type = current_formula.pet_type
    AND old_formula.front_image_url = current_formula.front_image_url
    AND old_formula.last_observed_at < current_formula.last_observed_at;

  SELECT count(*)
  INTO v_duplicate_count
  FROM duplicate_natures_recipe_formulas;

  IF v_duplicate_count <> 43 OR EXISTS (
    SELECT 1
    FROM current_natures_recipe_inventory AS current_formula
    JOIN public.catalog_formulas AS old_formula
      ON old_formula.source_url = current_formula.source_url
     AND old_formula.id <> current_formula.formula_id
     AND old_formula.active
    WHERE NOT EXISTS (
      SELECT 1
      FROM duplicate_natures_recipe_formulas AS duplicate_formula
      WHERE duplicate_formula.formula_id = old_formula.id
    )
  ) THEN
    RAISE EXCEPTION
      'Nature''s Recipe duplicate formula set drifted: % safe duplicates',
      v_duplicate_count;
  END IF;

  UPDATE public.catalog_skus AS sku
  SET
    active = FALSE,
    updated_at = now()
  FROM duplicate_natures_recipe_formulas AS duplicate_formula
  WHERE sku.formula_id = duplicate_formula.formula_id
    AND sku.active;

  GET DIAGNOSTICS v_deactivated_sku_count = ROW_COUNT;

  UPDATE public.catalog_formulas AS formula
  SET
    active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(formula.absent_since, now()),
    updated_at = now()
  FROM duplicate_natures_recipe_formulas AS duplicate_formula
  WHERE formula.id = duplicate_formula.formula_id
    AND formula.active;

  GET DIAGNOSTICS v_deactivated_formula_count = ROW_COUNT;

  IF v_deactivated_formula_count <> v_duplicate_count
     OR v_deactivated_sku_count <> 56 THEN
    RAISE EXCEPTION
      'Nature''s Recipe duplicate deactivation incomplete: % formulas, % SKUs',
      v_deactivated_formula_count,
      v_deactivated_sku_count;
  END IF;

  -- One exact Freeze Dried Blend serving row was imported twice from the same
  -- official PDP. Preserve it for audit, but only the current recipe-qualified
  -- cache key may participate in search or scoring.
  IF (
    SELECT count(*)
    FROM public.product_data AS duplicate_serving
    JOIN public.product_data AS current_serving
      ON current_serving.cache_key =
          'nature-s-recipe:nature s recipe nature s recipe freeze dried blend dry dog food product natures-recipe-freeze-dried-blend-chicken-barley-brown-rice-recipe-dry-dog-food'
     AND current_serving.source_url = duplicate_serving.source_url
     AND current_serving.ingredient_text = duplicate_serving.ingredient_text
     AND current_serving.image_url = duplicate_serving.image_url
     AND current_serving.pet_type = duplicate_serving.pet_type
     AND current_serving.food_form = duplicate_serving.food_form
    WHERE duplicate_serving.cache_key =
        'nature-s-recipe:nature s recipe nature s recipe freeze dried blend dry dog food'
      AND duplicate_serving.catalog_exclusion_reason IS NULL
  ) <> 1 THEN
    RAISE EXCEPTION
      'Nature''s Recipe Freeze Dried Blend serving duplicate evidence drifted';
  END IF;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'duplicate_official_source_alias',
    updated_at = now()
  WHERE cache_key =
      'nature-s-recipe:nature s recipe nature s recipe freeze dried blend dry dog food'
    AND catalog_exclusion_reason IS NULL;

  UPDATE public.catalog_verified_product_search_aliases
  SET
    active = FALSE,
    updated_at = now()
  WHERE cache_key =
      'nature-s-recipe:nature s recipe nature s recipe freeze dried blend dry dog food'
    AND active;

  WITH current_search AS (
    SELECT
      inventory.promoted_cache_key,
      concat(
        CASE
          WHEN public.normalize_verified_product_search_query(
            inventory.product_name
          ) LIKE 'nature s recipe%'
            THEN inventory.product_name
          ELSE concat('Nature''s Recipe ', inventory.product_name)
        END,
        CASE
          WHEN public.normalize_verified_product_search_query(
            inventory.product_name
          ) NOT LIKE concat(
            '%',
            public.normalize_verified_product_search_query(inventory.flavor),
            '%'
          )
            THEN concat(' ', inventory.flavor)
          ELSE ''
        END
      ) AS search_query
    FROM current_natures_recipe_inventory AS inventory
  ),
  resolved AS (
    SELECT
      current_search.promoted_cache_key,
      matched.cache_key
    FROM current_search
    LEFT JOIN LATERAL (
      SELECT result.cache_key
      FROM public.search_verified_products(
        current_search.search_query,
        1
      ) AS result
      LIMIT 1
    ) AS matched ON TRUE
  )
  SELECT count(*)
  INTO v_search_count
  FROM resolved
  WHERE cache_key = promoted_cache_key;

  IF v_search_count <> 25
     OR EXISTS (
       SELECT 1
       FROM public.catalog_formulas AS old_formula
       JOIN current_natures_recipe_inventory AS current_formula
         ON current_formula.source_url = old_formula.source_url
       WHERE old_formula.active
         AND old_formula.id <> current_formula.formula_id
     )
     OR EXISTS (
       SELECT 1
       FROM public.search_verified_products(
         'Nature''s Recipe Grain Free Large Breed Dry Dog Food',
         1
       )
     )
     OR EXISTS (
       SELECT 1
       FROM public.search_verified_products(
         'Nature''s Recipe Grain Free Puppy Dry Dog Food',
         1
       )
     )
     OR EXISTS (
       SELECT 1
       FROM public.search_verified_products(
         'Nature''s Recipe Grain Free Small Breed Dry Dog Food',
         1
       )
     ) THEN
    RAISE EXCEPTION
      'Nature''s Recipe current inventory/search reconciliation failed: % exact searches',
      v_search_count;
  END IF;
END
$$;
