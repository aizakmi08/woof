-- Replace three obsolete Instinct Freshly Crafted serving aliases and three
-- contaminated RawBoost census aliases only after their exact current official
-- counterparts are present. This is intentionally reversible: source evidence
-- and canonical rows are retained, but the stale rows cannot participate in
-- search, resolution, scoring, or coverage.

DO $$
DECLARE
  v_ready INTEGER;
  v_stale_formula_ids BIGINT[];
BEGIN
  SELECT count(*)
  INTO v_ready
  FROM public.product_data
  WHERE cache_key = ANY(ARRAY[
    'instinct-pet-food:instinct freshly crafted meals pork wild-caught salmon recipe 11 oz products freshly-crafted-meals-pork-and-salmon',
    'instinct-pet-food:instinct freshly crafted meals grass-fed beef recipe 11 oz products freshly-crafted-meals-beef',
    'instinct-pet-food:instinct freshly crafted meals cage-free chicken recipe 11 oz products freshly-crafted-meals-chicken'
  ]::TEXT[])
    AND source = 'instinct-pet-food'
    AND is_complete_food = TRUE
    AND COALESCE(catalog_exclusion_reason, '') = ''
    AND (expires_at IS NULL OR expires_at > NOW())
    AND ingredient_verification_status = 'manufacturer'
    AND image_verification_status = 'manufacturer'
    AND NULLIF(btrim(ingredient_text), '') IS NOT NULL
    AND NULLIF(btrim(image_url), '') IS NOT NULL;

  IF v_ready <> 3 THEN
    RAISE EXCEPTION
      'Current Instinct Freshly Crafted inventory incomplete: % exact rows, expected 3',
      v_ready;
  END IF;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason =
      'superseded_by_current_official_inventory:instinct-pet-food:official-formula-inventory:43d40bc03c1a0bef8f829d2d',
    expires_at = LEAST(COALESCE(expires_at, NOW()), NOW()),
    updated_at = NOW()
  WHERE cache_key = ANY(ARRAY[
    'census:947e7baecd495ae82c4c2ad76d72e615',
    'census:4908836c8c4c6deb9195c4cdadb8265b',
    'census:03640e8a4de54b0e5b7057820ec29119'
  ]::TEXT[]);

  SELECT array_agg(id)
  INTO v_stale_formula_ids
  FROM public.catalog_formulas
  WHERE promoted_cache_key = ANY(ARRAY[
    'census:947e7baecd495ae82c4c2ad76d72e615',
    'census:4908836c8c4c6deb9195c4cdadb8265b',
    'census:03640e8a4de54b0e5b7057820ec29119'
  ]::TEXT[]);

  UPDATE public.catalog_skus
  SET active = FALSE, updated_at = NOW()
  WHERE formula_id = ANY(COALESCE(v_stale_formula_ids, ARRAY[]::BIGINT[]));

  UPDATE public.catalog_formulas
  SET
    active = FALSE,
    verification_status = 'quarantined',
    absent_since = COALESCE(absent_since, NOW()),
    promoted_cache_key = NULL,
    updated_at = NOW()
  WHERE id = ANY(COALESCE(v_stale_formula_ids, ARRAY[]::BIGINT[]));
END $$;

