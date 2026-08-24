-- Move the two exact Meow Mix Gravy Bursts GTINs from the contaminated wet
-- formula identities to their evidence-proven dry formula identities.
DO $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE formula_key IN (
      'meow mix|meow mix|gravy bursts|cat|adult|dry|chicken flavor|',
      'meow mix|meow mix|gravy bursts|cat|adult|dry|salmon flavor|'
    )
  ) THEN
    RAISE EXCEPTION
      'Meow Mix Gravy Bursts target dry formula identities already exist';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE (
      formula_key =
          'meow mix|meow mix|gravy bursts|cat|adult|wet|chicken flavor|'
      AND source_url =
          'https://www.meowmix.com/cat-food/gravy-bursts/gravy-bursts-chicken'
      AND pet_type = 'cat'
      AND life_stage = 'adult'
      AND food_form = 'wet'
      AND flavor = 'chicken flavor'
      AND verification_status = 'verified'
      AND active
    )
    OR (
      formula_key =
          'meow mix|meow mix|gravy bursts|cat|adult|wet|salmon flavor|'
      AND source_url =
          'https://www.meowmix.com/cat-food/gravy-bursts/gravy-bursts-salmon'
      AND pet_type = 'cat'
      AND life_stage = 'adult'
      AND food_form = 'wet'
      AND flavor = 'salmon flavor'
      AND verification_status = 'verified'
      AND active
    )
  ) <> 2 THEN
    RAISE EXCEPTION
      'Meow Mix Gravy Bursts canonical prior identities drifted';
  END IF;

  WITH mappings(old_formula_key, new_formula_key, cache_key) AS (
    VALUES
      (
        'meow mix|meow mix|gravy bursts|cat|adult|wet|chicken flavor|',
        'meow mix|meow mix|gravy bursts|cat|adult|dry|chicken flavor|',
        'meow-mix:00829274827386'
      ),
      (
        'meow mix|meow mix|gravy bursts|cat|adult|wet|salmon flavor|',
        'meow mix|meow mix|gravy bursts|cat|adult|dry|salmon flavor|',
        'meow-mix:00829274414951'
      )
  )
  UPDATE public.catalog_formulas AS formula
  SET
    formula_key = mapping.new_formula_key,
    food_form = 'dry',
    promoted_cache_key = mapping.cache_key,
    promoted_at = now(),
    protected_terms = CASE
      WHEN 'dry' = ANY(COALESCE(protected_terms, '{}'::TEXT[]))
        THEN array_remove(COALESCE(protected_terms, '{}'::TEXT[]), 'wet')
      ELSE array_append(
        array_remove(COALESCE(protected_terms, '{}'::TEXT[]), 'wet'),
        'dry'
      )
    END,
    updated_at = now()
  FROM mappings AS mapping
  WHERE formula.formula_key = mapping.old_formula_key;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 2 OR EXISTS (
    SELECT 1
    FROM public.catalog_skus AS sku
    JOIN public.catalog_formulas AS formula ON formula.id = sku.formula_id
    WHERE sku.gtin IN ('00829274414951', '00829274827386')
      AND (
        formula.food_form IS DISTINCT FROM 'dry'
        OR formula.promoted_cache_key IS NULL
        OR formula.formula_key !~
            '^meow mix\\|meow mix\\|gravy bursts\\|cat\\|adult\\|dry\\|'
      )
  ) THEN
    RAISE EXCEPTION
      'Meow Mix Gravy Bursts canonical rekey incomplete: % formulas updated',
      v_updated_count;
  END IF;
END
$$;
