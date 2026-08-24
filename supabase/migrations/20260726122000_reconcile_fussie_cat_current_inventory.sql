-- Keep one active exact formula per current Fussie Cat manufacturer PDP and
-- add brand-qualified exact-title aliases so ingredient siblings never win
-- merely because their protein words overlap.
DO $$
DECLARE
  v_current_count INTEGER;
  v_duplicate_count INTEGER;
  v_deactivated_skus INTEGER;
  v_deactivated_formulas INTEGER;
  v_exact_searches INTEGER;
BEGIN
  CREATE TEMP TABLE current_fussie_cat_inventory
  ON COMMIT DROP
  AS
  SELECT DISTINCT
    formula.id AS formula_id,
    formula.source_url,
    formula.promoted_cache_key,
    formula.product_name,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.last_observed_at
  FROM public.catalog_source_runs AS run
  JOIN public.catalog_observations AS observation
    ON observation.run_id = run.id
   AND observation.validation_status = 'accepted'
  JOIN public.catalog_formulas AS formula
    ON formula.id = observation.formula_id
  WHERE run.run_key =
      'fussie-cat:official-formula-inventory:cf01622bce213a4a04ab7fbc';

  SELECT count(*) INTO v_current_count
  FROM current_fussie_cat_inventory;

  IF v_current_count <> 55 OR EXISTS (
    SELECT 1
    FROM current_fussie_cat_inventory
    WHERE source_url NOT LIKE 'https://fussiecat.com/product/%'
      OR promoted_cache_key IS NULL
      OR pet_type <> 'cat'
  ) THEN
    RAISE EXCEPTION
      'Fussie Cat current official inventory drifted: % formulas',
      v_current_count;
  END IF;

  CREATE TEMP TABLE duplicate_fussie_cat_formulas
  ON COMMIT DROP
  AS
  SELECT DISTINCT old_formula.id AS formula_id
  FROM current_fussie_cat_inventory AS current_formula
  JOIN public.catalog_formulas AS old_formula
    ON old_formula.source_url = current_formula.source_url
   AND old_formula.id <> current_formula.formula_id
   AND old_formula.active
   AND old_formula.last_observed_at < current_formula.last_observed_at
  JOIN public.catalog_formulas AS exact_formula
    ON exact_formula.id = current_formula.formula_id
   AND old_formula.pet_type = exact_formula.pet_type
   AND old_formula.front_image_url = exact_formula.front_image_url
  WHERE old_formula.brand IN ('fussie cat', 'Fussie Cat')
    AND old_formula.verification_status = 'verified';

  SELECT count(*) INTO v_duplicate_count
  FROM duplicate_fussie_cat_formulas;

  IF v_duplicate_count <> 30 OR EXISTS (
    SELECT 1
    FROM current_fussie_cat_inventory AS current_formula
    JOIN public.catalog_formulas AS old_formula
      ON old_formula.source_url = current_formula.source_url
     AND old_formula.id <> current_formula.formula_id
     AND old_formula.active
    WHERE NOT EXISTS (
      SELECT 1
      FROM duplicate_fussie_cat_formulas AS duplicate_formula
      WHERE duplicate_formula.formula_id = old_formula.id
    )
  ) THEN
    RAISE EXCEPTION
      'Fussie Cat duplicate formula set drifted: % safe duplicates',
      v_duplicate_count;
  END IF;

  UPDATE public.catalog_skus AS sku
  SET active = FALSE, updated_at = now()
  FROM duplicate_fussie_cat_formulas AS duplicate_formula
  WHERE sku.formula_id = duplicate_formula.formula_id
    AND sku.active;
  GET DIAGNOSTICS v_deactivated_skus = ROW_COUNT;

  UPDATE public.catalog_formulas AS formula
  SET
    active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(formula.absent_since, now()),
    updated_at = now()
  FROM duplicate_fussie_cat_formulas AS duplicate_formula
  WHERE formula.id = duplicate_formula.formula_id
    AND formula.active;
  GET DIAGNOSTICS v_deactivated_formulas = ROW_COUNT;

  IF v_deactivated_formulas <> 30 OR v_deactivated_skus <> 48 THEN
    RAISE EXCEPTION
      'Fussie Cat duplicate deactivation incomplete: % formulas, % SKUs',
      v_deactivated_formulas,
      v_deactivated_skus;
  END IF;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, updated_at
  )
  SELECT
    inventory.promoted_cache_key,
    concat('Fussie Cat ', inventory.product_name),
    public.normalize_verified_product_search_query(
      concat('Fussie Cat ', inventory.product_name)
    ),
    inventory.source_url,
    'manufacturer',
    inventory.last_observed_at,
    jsonb_build_object(
      'brand_prefixed_current_manufacturer_title', TRUE,
      'source_run_key',
        'fussie-cat:official-formula-inventory:cf01622bce213a4a04ab7fbc',
      'species_boundary', inventory.pet_type,
      'life_stage_boundary', inventory.life_stage,
      'food_form_boundary', inventory.food_form
    ),
    TRUE,
    now()
  FROM current_fussie_cat_inventory AS inventory
  ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

  WITH resolved AS (
    SELECT
      inventory.promoted_cache_key,
      matched.cache_key
    FROM current_fussie_cat_inventory AS inventory
    LEFT JOIN LATERAL (
      SELECT result.cache_key
      FROM public.search_verified_products(
        concat('Fussie Cat ', inventory.product_name),
        1
      ) AS result
      LIMIT 1
    ) AS matched ON TRUE
  )
  SELECT count(*)
  INTO v_exact_searches
  FROM resolved
  WHERE cache_key = promoted_cache_key;

  IF v_exact_searches <> 55 OR EXISTS (
    SELECT 1
    FROM public.catalog_formulas AS old_formula
    JOIN current_fussie_cat_inventory AS current_formula
      ON current_formula.source_url = old_formula.source_url
    WHERE old_formula.active
      AND old_formula.id <> current_formula.formula_id
  ) THEN
    RAISE EXCEPTION
      'Fussie Cat current inventory/search reconciliation failed: % searches',
      v_exact_searches;
  END IF;
END
$$;
