-- The reviewed 5 lb and 15 lb package fronts prove the exact Small Breed
-- Adult Chicken & Brown Rice identity. Repair stale retailer-derived flavor
-- metadata without changing the source-version ingredient statement.
DO $$
DECLARE
  v_review_run_id BIGINT;
  v_new_identity_hash TEXT;
  v_new_formula_key TEXT;
BEGIN
  SELECT id
  INTO STRICT v_review_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-blue-buffalo-review-v143:20b4602fc185e8e7bc2ca66e';

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations observation
    JOIN public.catalog_formulas formula
      ON formula.id = 38745
    WHERE observation.run_id = v_review_run_id
      AND observation.source_external_id = '75575887'
      AND public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          )
          = public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          )
      AND observation.raw_payload->>'reviewed_identity_evidence' <> ''
  ) THEN
    RAISE EXCEPTION
      'Blue Small Breed v143 exact identity evidence changed';
  END IF;

  SELECT encode(
    digest(
      lower(concat_ws(
        '|',
        formula.manufacturer,
        formula.brand,
        'Blue Buffalo Life Protection Formula Small Breed Adult '
          || 'Chicken & Brown Rice Recipe Dry Dog Food',
        formula.pet_type,
        formula.life_stage,
        formula.food_form,
        'Chicken & Brown Rice',
        formula.diet_condition,
        public.catalog_normalize_ingredient_evidence(
          formula.ingredient_text
        )
      )),
      'sha256'
    ),
    'hex'
  )
  INTO STRICT v_new_identity_hash
  FROM public.catalog_formulas formula
  WHERE formula.id = 38745;

  v_new_formula_key :=
    'retailer-package-version:' || v_new_identity_hash;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key = v_new_formula_key
      AND id <> 38745
  ) THEN
    RAISE EXCEPTION
      'Blue Small Breed exact identity collides with another formula';
  END IF;

  UPDATE public.catalog_formulas formula
  SET
    formula_key = v_new_formula_key,
    identity_hash = v_new_identity_hash,
    product_name =
      'Blue Buffalo Life Protection Formula Small Breed Adult '
      || 'Chicken & Brown Rice Recipe Dry Dog Food',
    product_line =
      'Blue Buffalo Life Protection Formula Small Breed Adult '
      || 'Chicken & Brown Rice Recipe Dry Dog Food',
    flavor = 'Chicken & Brown Rice',
    protected_terms = ARRAY[
      'Blue Buffalo',
      'Life Protection Formula',
      'Small Breed',
      'Adult',
      'Chicken & Brown Rice',
      'dog',
      'dry'
    ],
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_repair',
        jsonb_build_object(
          'reason',
            'Exact reviewed Target package fronts replace stale '
            || 'retailer-derived flavor metadata',
          'target_tcins', jsonb_build_array('52616091', '75575887'),
          'ingredient_hash_equality_verified', true,
          'repaired_at', now()
        )
      ),
    updated_at = now()
  WHERE formula.id = 38745;

  UPDATE public.product_data serving
  SET
    product_name =
      'Blue Buffalo Life Protection Formula Small Breed Adult '
      || 'Chicken & Brown Rice Recipe Dry Dog Food',
    product_line =
      'Blue Buffalo Life Protection Formula Small Breed Adult '
      || 'Chicken & Brown Rice Recipe Dry Dog Food',
    flavor = 'Chicken & Brown Rice',
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_repair',
        jsonb_build_object(
          'reason',
            'Exact reviewed Target package fronts replace stale '
            || 'retailer-derived flavor metadata',
          'target_tcins', jsonb_build_array('52616091', '75575887'),
          'ingredient_hash_equality_verified', true,
          'repaired_at', now()
        )
      ),
    updated_at = now()
  WHERE serving.cache_key =
    'petsmart-retail-catalog:840243104888';

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = 38745
      AND formula.flavor = 'Chicken & Brown Rice'
      AND serving.flavor = 'Chicken & Brown Rice'
      AND formula.identity_hash = v_new_identity_hash
  ) THEN
    RAISE EXCEPTION
      'Blue Small Breed exact identity repair did not persist';
  END IF;
END
$$;
