-- Multi-flavor package parents are not one ingredient formula. Keep their
-- published GTINs as discovery evidence, but never serve or score them as an
-- exact product.
WITH excluded AS (
  UPDATE public.product_data
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'multi_formula_or_variety_pack',
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  WHERE source = 'sheba-mars-petcare'
    AND cache_key IN (
      'sheba-mars-petcare:023100110271',
      'sheba-mars-petcare:023100110288',
      'sheba-mars-petcare:023100114163',
      'sheba-mars-petcare:023100115160',
      'sheba-mars-petcare:023100118345',
      'sheba-mars-petcare:023100118840',
      'sheba-mars-petcare:023100120348',
      'sheba-mars-petcare:023100122670',
      'sheba-mars-petcare:023100122687',
      'sheba-mars-petcare:023100123622',
      'sheba-mars-petcare:023100124001',
      'sheba-mars-petcare:023100124018',
      'sheba-mars-petcare:023100132242',
      'sheba-mars-petcare:023100132259',
      'sheba-mars-petcare:023100144276'
    )
  RETURNING cache_key
)
UPDATE public.catalog_product_evidence evidence
SET
  review_state = 'rejected',
  rejection_reason = 'multi_formula_or_variety_pack',
  updated_at = NOW()
FROM excluded
WHERE evidence.cache_key = excluded.cache_key;

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
      'sheba-mars-petcare:official-formula-inventory:dba87ae1abd4cacf12f9a96a'
    AND serving.source_url LIKE 'https://www.sheba.com/%'
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
  product_name,
  public.normalize_verified_product_search_query(product_name),
  source_url,
  'manufacturer',
  observed_at,
  jsonb_build_object(
    'exact_current_manufacturer_title', TRUE,
    'source_run_key',
      'sheba-mars-petcare:official-formula-inventory:dba87ae1abd4cacf12f9a96a',
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
  v_excluded_rows INTEGER;
  v_formula_count INTEGER;
  v_exact_alias_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_excluded_rows
  FROM public.product_data
  WHERE source = 'sheba-mars-petcare'
    AND cache_key IN (
      'sheba-mars-petcare:023100110271',
      'sheba-mars-petcare:023100110288',
      'sheba-mars-petcare:023100114163',
      'sheba-mars-petcare:023100115160',
      'sheba-mars-petcare:023100118345',
      'sheba-mars-petcare:023100118840',
      'sheba-mars-petcare:023100120348',
      'sheba-mars-petcare:023100122670',
      'sheba-mars-petcare:023100122687',
      'sheba-mars-petcare:023100123622',
      'sheba-mars-petcare:023100124001',
      'sheba-mars-petcare:023100124018',
      'sheba-mars-petcare:023100132242',
      'sheba-mars-petcare:023100132259',
      'sheba-mars-petcare:023100144276'
    )
    AND is_complete_food IS FALSE
    AND catalog_exclusion_reason = 'multi_formula_or_variety_pack'
    AND ingredient_verification_status = 'unverified';

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
        'sheba-mars-petcare:official-formula-inventory:dba87ae1abd4cacf12f9a96a'
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
    )
  INTO v_formula_count, v_exact_alias_count
  FROM inventory;

  IF v_excluded_rows <> 14
     OR v_formula_count <> 26
     OR v_exact_alias_count <> v_formula_count THEN
    RAISE EXCEPTION
      'Sheba evidence incomplete: % multipacks excluded, % exact aliases for % formulas',
      v_excluded_rows,
      v_exact_alias_count,
      v_formula_count;
  END IF;
END
$$;
