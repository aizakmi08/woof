-- Preserve every visible recipe term for two Pedigree siblings that were
-- previously reduced to their first protein, which could collapse variants.

CREATE TEMP TABLE pedigree_recipe_refinements (
  source_url TEXT PRIMARY KEY,
  old_formula_key TEXT NOT NULL UNIQUE,
  new_formula_key TEXT NOT NULL UNIQUE,
  new_identity_hash TEXT NOT NULL,
  new_flavor TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO pedigree_recipe_refinements (
  source_url,
  old_formula_key,
  new_formula_key,
  new_identity_hash,
  new_flavor
)
VALUES
  (
    'https://www.pedigree.com/products/wet/high-protein-chopped-ground-dinner-wet-dog-food-can-beef-bison',
    'pedigree|pedigree|high protein|dog|unknown|wet|beef|',
    'pedigree|pedigree|high protein|dog|unknown|wet|beef and bison|',
    '6b457d5880b3eaec9eced1a56b48bf4322cc4e46163e1774a04d1fd159b746bc',
    'beef and bison'
  ),
  (
    'https://www.pedigree.com/products/wet/high-protein-chopped-ground-dinner-wet-dog-food-can-chicken-duck',
    'pedigree|pedigree|high protein|dog|unknown|wet|chicken|',
    'pedigree|pedigree|high protein|dog|unknown|wet|chicken and duck|',
    'eae5a956a991141633b2ba6c90350a3e66d306a5135141664407f9e99e2e6b99',
    'chicken and duck'
  );

DO $$
DECLARE
  v_expected_count INTEGER;
  v_matched_count INTEGER;
  v_updated_count INTEGER;
BEGIN
  SELECT count(*) INTO v_expected_count FROM pedigree_recipe_refinements;

  IF EXISTS (
    SELECT 1
    FROM pedigree_recipe_refinements correction
    JOIN public.catalog_formulas target
      ON target.formula_key = correction.new_formula_key
  ) THEN
    RAISE EXCEPTION 'A refined Pedigree formula identity already exists';
  END IF;

  SELECT count(*)
  INTO v_matched_count
  FROM pedigree_recipe_refinements correction
  JOIN public.catalog_formulas formula
    ON formula.formula_key = correction.old_formula_key
   AND formula.source_url = correction.source_url
   AND formula.active
   AND formula.verification_status = 'verified'
  JOIN public.product_data serving
    ON serving.cache_key = formula.promoted_cache_key;

  IF v_matched_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Expected % exact Pedigree refinements but matched %',
      v_expected_count,
      v_matched_count;
  END IF;

  UPDATE public.product_data serving
  SET
    flavor = correction.new_flavor,
    updated_at = NOW()
  FROM public.catalog_formulas formula
  JOIN pedigree_recipe_refinements correction
    ON correction.old_formula_key = formula.formula_key
  WHERE serving.cache_key = formula.promoted_cache_key;

  UPDATE public.catalog_observations observation
  SET flavor = correction.new_flavor
  FROM public.catalog_formulas formula
  JOIN pedigree_recipe_refinements correction
    ON correction.old_formula_key = formula.formula_key
  WHERE observation.formula_id = formula.id;

  UPDATE public.catalog_formulas formula
  SET
    formula_key = correction.new_formula_key,
    identity_hash = correction.new_identity_hash,
    flavor = correction.new_flavor,
    protected_terms = ARRAY(
      SELECT DISTINCT term
      FROM unnest(formula.protected_terms || ARRAY[correction.new_flavor]) term
      WHERE NULLIF(btrim(term), '') IS NOT NULL
    ),
    updated_at = NOW()
  FROM pedigree_recipe_refinements correction
  WHERE formula.formula_key = correction.old_formula_key
    AND formula.source_url = correction.source_url;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  IF v_updated_count <> v_expected_count THEN
    RAISE EXCEPTION
      'Expected to refine % Pedigree formulas but updated %',
      v_expected_count,
      v_updated_count;
  END IF;
END;
$$;
