-- Reconcile prior Farmina formula-owner aliases and retailer observations into
-- the reviewed current official inventory. The source run is a complete,
-- uncapped 217-PDP / 323-SKU manufacturer census; 41 dental treats and other
-- non-complete products are explicitly outside the scorable formula scope.
--
-- Package size remains a SKU child. Species, food form, life stage, protected
-- line terms, and the complete ingredient statement must agree before an old
-- formula can be attached to the current canonical formula.

CREATE TEMP TABLE farmina_current_formula_map ON COMMIT DROP AS
WITH source_run AS (
  SELECT id
  FROM public.catalog_source_runs
  WHERE run_key =
    'farmina-pet-foods:official-formula-inventory:fe5c9c59cef4ee1f12d616b7'
    AND status = 'completed'
    AND pagination_complete = TRUE
    AND expected_count = 364
    AND observed_count = 323
    AND accepted_count = 323
    AND rejected_count = 0
    AND COALESCE(
      (metadata->>'official_inventory_full')::BOOLEAN,
      FALSE
    )
    AND COALESCE(
      (metadata->>'scope_excluded_non_complete_count')::INTEGER,
      -1
    ) = 41
),
current_observations AS (
  SELECT DISTINCT observation.source_url, observation.formula_id
  FROM public.catalog_observations observation
  JOIN source_run ON source_run.id = observation.run_id
  WHERE observation.validation_status = 'accepted'
    AND observation.formula_id IS NOT NULL
),
current_formula_ids AS (
  SELECT DISTINCT formula_id
  FROM current_observations
)
SELECT
  old_formula.id AS old_formula_id,
  current_formula.id AS current_formula_id,
  old_formula.formula_key AS old_formula_key,
  current_formula.formula_key AS current_formula_key,
  old_formula.identity_hash AS old_identity_hash,
  old_formula.product_name AS old_product_name,
  old_formula.source_url AS exact_official_source_url,
  current_formula.promoted_cache_key AS current_cache_key
FROM public.catalog_formulas old_formula
JOIN current_observations current_observation
  ON current_observation.source_url = old_formula.source_url
JOIN public.catalog_formulas current_formula
  ON current_formula.id = current_observation.formula_id
WHERE old_formula.id NOT IN (SELECT formula_id FROM current_formula_ids)
  AND old_formula.active = TRUE
  AND old_formula.verification_status = 'verified'
  AND current_formula.active = TRUE
  AND current_formula.verification_status = 'verified'
  AND old_formula.source_authority IN ('official', 'manufacturer')
  AND current_formula.source_authority IN ('official', 'manufacturer')
  AND public.catalog_acquisition_identity_normalize(old_formula.brand)
      = public.catalog_acquisition_identity_normalize('Farmina')
  AND public.catalog_acquisition_identity_normalize(current_formula.brand)
      = public.catalog_acquisition_identity_normalize('Farmina')
  AND lower(btrim(old_formula.pet_type))
      = lower(btrim(current_formula.pet_type))
  AND public.catalog_acquisition_food_form_terms_match(
    COALESCE(NULLIF(btrim(old_formula.food_form), ''), 'unknown'),
    COALESCE(NULLIF(btrim(current_formula.food_form), ''), 'unknown')
  )
  AND public.catalog_acquisition_life_stage_terms_match(
    concat_ws(
      ' ',
      old_formula.product_name,
      old_formula.product_line,
      old_formula.flavor,
      old_formula.life_stage
    ),
    concat_ws(
      ' ',
      current_formula.product_name,
      current_formula.product_line,
      current_formula.flavor,
      current_formula.life_stage
    )
  )
  AND public.catalog_acquisition_protected_line_terms_match(
    concat_ws(
      ' ',
      old_formula.product_name,
      old_formula.product_line,
      old_formula.flavor,
      old_formula.life_stage,
      old_formula.food_form
    ),
    concat_ws(
      ' ',
      current_formula.product_name,
      current_formula.product_line,
      current_formula.flavor,
      current_formula.life_stage,
      current_formula.food_form
    )
  )
  AND lower(regexp_replace(
    btrim(old_formula.ingredient_text),
    '\s+',
    ' ',
    'g'
  )) = lower(regexp_replace(
    btrim(current_formula.ingredient_text),
    '\s+',
    ' ',
    'g'
  ))
  AND NULLIF(btrim(current_formula.promoted_cache_key), '') IS NOT NULL;

CREATE UNIQUE INDEX farmina_current_formula_map_old_idx
  ON farmina_current_formula_map (old_formula_id);

CREATE UNIQUE INDEX farmina_current_formula_map_key_idx
  ON farmina_current_formula_map (old_formula_key);

DO $$
DECLARE
  v_pairs INTEGER;
  v_old_skus INTEGER;
  v_sku_collisions INTEGER;
BEGIN
  SELECT count(*) INTO v_pairs
  FROM farmina_current_formula_map;

  SELECT count(*) INTO v_old_skus
  FROM public.catalog_skus sku
  JOIN farmina_current_formula_map mapping
    ON mapping.old_formula_id = sku.formula_id
  WHERE sku.active;

  SELECT count(*) INTO v_sku_collisions
  FROM public.catalog_skus old_sku
  JOIN farmina_current_formula_map mapping
    ON mapping.old_formula_id = old_sku.formula_id
  JOIN public.catalog_skus current_sku
    ON current_sku.formula_id = mapping.current_formula_id
   AND current_sku.source_slug = old_sku.source_slug
   AND current_sku.source_external_id = old_sku.source_external_id
   AND current_sku.gtin IS NOT DISTINCT FROM old_sku.gtin
   AND current_sku.package_size = old_sku.package_size
  WHERE old_sku.active;

  IF v_pairs <> 36
     OR v_old_skus <> 43
     OR v_sku_collisions <> 0 THEN
    RAISE EXCEPTION
      'Farmina reconciliation preflight failed: pairs %, active old SKUs %, SKU collisions %',
      v_pairs,
      v_old_skus,
      v_sku_collisions;
  END IF;
END $$;

UPDATE public.catalog_observations observation
SET formula_id = mapping.current_formula_id
FROM farmina_current_formula_map mapping
WHERE observation.formula_id = mapping.old_formula_id;

UPDATE public.catalog_skus sku
SET
  formula_id = mapping.current_formula_id,
  updated_at = NOW()
FROM farmina_current_formula_map mapping
WHERE sku.formula_id = mapping.old_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = mapping.current_formula_id,
  updated_at = NOW()
FROM farmina_current_formula_map mapping
WHERE review.formula_id = mapping.old_formula_id;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  mapping.old_formula_key,
  mapping.current_formula_id,
  mapping.old_identity_hash,
  'same_source_identity',
  mapping.exact_official_source_url,
  jsonb_build_object(
    'reconciled_by',
    '20260726133000_reconcile_farmina_current_official_formula_inventory',
    'canonical_formula_key',
    mapping.current_formula_key,
    'identity_evidence',
    'same current official PDP, exact full ingredients, species, food form, life-stage, and protected line terms',
    'package_size_is_sku_only',
    TRUE,
    'reconciled_at',
    NOW()
  )
FROM farmina_current_formula_map mapping
ON CONFLICT (alias_formula_key) DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = NOW();

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
SELECT DISTINCT ON (
  public.normalize_verified_product_search_query(mapping.old_product_name)
)
  mapping.current_cache_key,
  mapping.old_product_name,
  public.normalize_verified_product_search_query(mapping.old_product_name),
  mapping.exact_official_source_url,
  'manufacturer',
  NOW(),
  jsonb_build_object(
    'reconciled_by',
    '20260726133000_reconcile_farmina_current_official_formula_inventory',
    'canonical_formula_key',
    mapping.current_formula_key,
    'same_official_pdp',
    TRUE
  ),
  TRUE
FROM farmina_current_formula_map mapping
WHERE NOT EXISTS (
  SELECT 1
  FROM public.catalog_verified_product_search_aliases alias
  WHERE alias.active
    AND alias.normalized_alias =
      public.normalize_verified_product_search_query(mapping.old_product_name)
)
ORDER BY
  public.normalize_verified_product_search_query(mapping.old_product_name),
  mapping.current_formula_key;

UPDATE public.catalog_formulas old_formula
SET
  active = FALSE,
  verification_status = 'quarantined',
  absent_since = COALESCE(old_formula.absent_since, NOW()),
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = NOW()
FROM farmina_current_formula_map mapping
WHERE old_formula.id = mapping.old_formula_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    WHERE sku.formula_id = old_formula.id
      AND sku.active
  );

DO $$
DECLARE
  v_active_old INTEGER;
  v_active_current INTEGER;
  v_moved_skus INTEGER;
  v_aliases INTEGER;
BEGIN
  SELECT count(*) INTO v_active_old
  FROM public.catalog_formulas old_formula
  JOIN farmina_current_formula_map mapping
    ON mapping.old_formula_id = old_formula.id
  WHERE old_formula.active;

  SELECT count(*) INTO v_active_current
  FROM public.catalog_formulas current_formula
  JOIN farmina_current_formula_map mapping
    ON mapping.current_formula_id = current_formula.id
  WHERE current_formula.active
    AND current_formula.verification_status = 'verified'
    AND NULLIF(btrim(current_formula.promoted_cache_key), '') IS NOT NULL;

  SELECT count(*) INTO v_moved_skus
  FROM public.catalog_skus sku
  JOIN farmina_current_formula_map mapping
    ON mapping.current_formula_id = sku.formula_id
  WHERE sku.source_slug IN ('farmina-pet-foods', 'chewy-public-sitemap')
    AND sku.active;

  SELECT count(*) INTO v_aliases
  FROM public.catalog_formula_aliases alias
  JOIN farmina_current_formula_map mapping
    ON mapping.old_formula_key = alias.alias_formula_key
   AND mapping.current_formula_id = alias.formula_id;

  IF v_active_old <> 0
     OR v_active_current <> 36
     OR v_moved_skus < 43
     OR v_aliases <> 36 THEN
    RAISE EXCEPTION
      'Farmina reconciliation postcondition failed: active old %, active current %, current source SKUs %, aliases %',
      v_active_old,
      v_active_current,
      v_moved_skus,
      v_aliases;
  END IF;
END $$;
