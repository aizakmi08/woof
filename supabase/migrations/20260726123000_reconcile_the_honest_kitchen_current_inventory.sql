-- Reconcile superseded The Honest Kitchen formula identities after the
-- reviewed 2026-07-26 full official manufacturer inventory.
--
-- The old rows below describe the same exact formulas as their current rows.
-- They differ only because earlier catalog generations used generic product
-- lines (for example "Dry Dog Food") as formula identity. Exact official PDP
-- continuity, exact product identity, exact species/form, and exact ingredient
-- text are required before any old formula or SKU is deactivated.
-- Historical rows and evidence remain preserved.

CREATE TEMP TABLE thk_reviewed_formula_map (
  old_formula_key TEXT PRIMARY KEY,
  current_formula_key TEXT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO thk_reviewed_formula_map (old_formula_key, current_formula_key)
VALUES
  (
    'the honest kitchen|the honest kitchen|wet dog food|dog|unknown|wet|beef and lamb|',
    'the honest kitchen|the honest kitchen|braised beef and lamb one pot stew|dog|unknown|wet|beef and lamb|'
  ),
  (
    'the honest kitchen|the honest kitchen|mousse wet cat food|cat|unknown|wet|three bird|',
    'the honest kitchen|the honest kitchen|cat grain free turkey chicken and duck mousse in goat s milk|cat|unknown|wet|three bird|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry cat food|cat|unknown|dry|chicken and fish|',
    'the honest kitchen|the honest kitchen|grain free chicken and whitefish whole food clusters|cat|unknown|dry|chicken and fish|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated cat food|cat|unknown|dehydrated|chicken|',
    'the honest kitchen|the honest kitchen|grain free chicken dehydrated cat food|cat|unknown|dehydrated|chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry dog food|dog|unknown|dry|chicken|',
    'the honest kitchen|the honest kitchen|grain free chicken whole food clusters|dog|unknown|dry|chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry cat food|cat|unknown|dry|chicken|',
    'the honest kitchen|the honest kitchen|grain free chicken whole food clusters|cat|unknown|dry|chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry cat food|cat|unknown|dry|turkey and chicken|',
    'the honest kitchen|the honest kitchen|grain free turkey and chicken whole food clusters|cat|unknown|dry|turkey and chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry dog food|dog|unknown|dry|turkey|',
    'the honest kitchen|the honest kitchen|grain free turkey whole food clusters|dog|unknown|dry|turkey|'
  ),
  (
    'the honest kitchen|the honest kitchen|wet dog food|dog|unknown|wet|beef|',
    'the honest kitchen|the honest kitchen|roasted beef one pot stew|dog|unknown|wet|beef|'
  ),
  (
    'the honest kitchen|the honest kitchen|wet dog food|dog|unknown|wet|salmon and chicken|',
    'the honest kitchen|the honest kitchen|simmered salmon and chicken one pot stew|dog|unknown|wet|salmon and chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|essential clusters dry dog food|dog|unknown|dry|beef and chicken|',
    'the honest kitchen|the honest kitchen|whole grain beef and chicken essential clusters|dog|unknown|dry|beef and chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dry dog food|dog|puppy|dry|wg chicken for puppies|',
    'the honest kitchen|the honest kitchen|whole grain chicken whole food clusters for puppies|dog|puppy|dry|wg chicken for puppies|'
  ),
  (
    'the honest kitchen|the honest kitchen|essential clusters dry dog food|dog|unknown|dry|turkey and chicken|',
    'the honest kitchen|the honest kitchen|whole grain turkey and chicken essential clusters|dog|unknown|dry|turkey and chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|puppy|dehydrated|beef and salmon|',
    'the honest kitchen|the honest kitchen|wholemade whole grain beef and salmon dehydrated puppy dog food|dog|puppy|dehydrated|beef and salmon|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|senior|dehydrated|beef and salmon|',
    'the honest kitchen|the honest kitchen|wholemade whole grain beef oat and salmon dehydrated senior dog food|dog|senior|dehydrated|beef and salmon|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|unknown|dehydrated|chicken|',
    'the honest kitchen|the honest kitchen|wholemade whole grain chicken|dog|unknown|dehydrated|chicken|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|puppy|dehydrated|chicken and salmon|',
    'the honest kitchen|the honest kitchen|wholemade whole grain chicken and salmon dehydrated puppy dog food|dog|puppy|dehydrated|chicken and salmon|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|senior|dehydrated|chicken and salmon|',
    'the honest kitchen|the honest kitchen|wholemade whole grain chicken oat and salmon dehydrated senior|dog|senior|dehydrated|chicken and salmon|'
  ),
  (
    'the honest kitchen|the honest kitchen|dehydrated dog food|dog|unknown|dehydrated|fish|',
    'the honest kitchen|the honest kitchen|wholemade whole grain fish and oat|dog|unknown|dehydrated|fish|'
  );

DO $$
DECLARE
  v_exact_pairs INTEGER;
  v_active_old_formulas INTEGER;
  v_active_old_skus INTEGER;
BEGIN
  SELECT count(*)
  INTO v_exact_pairs
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas old_formula
    ON old_formula.formula_key = reviewed.old_formula_key
  JOIN public.catalog_formulas current_formula
    ON current_formula.formula_key = reviewed.current_formula_key
  WHERE old_formula.active = TRUE
    AND current_formula.active = TRUE
    AND public.catalog_acquisition_identity_normalize(old_formula.brand)
        = public.catalog_acquisition_identity_normalize('The Honest Kitchen')
    AND public.catalog_acquisition_identity_normalize(current_formula.brand)
        = public.catalog_acquisition_identity_normalize('The Honest Kitchen')
    AND public.catalog_acquisition_identity_normalize(old_formula.product_name)
        = public.catalog_acquisition_identity_normalize(current_formula.product_name)
    AND lower(btrim(COALESCE(old_formula.pet_type, '')))
        = lower(btrim(COALESCE(current_formula.pet_type, '')))
    AND public.catalog_acquisition_food_form_terms_match(
      COALESCE(NULLIF(btrim(old_formula.food_form), ''), 'unknown'),
      COALESCE(NULLIF(btrim(current_formula.food_form), ''), 'unknown')
    )
    AND lower(regexp_replace(COALESCE(old_formula.ingredient_text, ''), '\s+', ' ', 'g'))
        = lower(regexp_replace(COALESCE(current_formula.ingredient_text, ''), '\s+', ' ', 'g'))
    AND (
      (
        NULLIF(old_formula.promoted_cache_key, '') IS NOT NULL
        AND old_formula.promoted_cache_key = current_formula.promoted_cache_key
      )
      OR old_formula.source_url = current_formula.source_url
      OR (
        old_formula.source_authority IN ('official', 'manufacturer')
        AND current_formula.source_authority IN ('official', 'manufacturer')
        AND split_part(old_formula.source_url, '?', 1)
            = split_part(current_formula.source_url, '?', 1)
      )
    );

  SELECT count(*)
  INTO v_active_old_formulas
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas old_formula
    ON old_formula.formula_key = reviewed.old_formula_key
  WHERE old_formula.active = TRUE;

  SELECT count(*)
  INTO v_active_old_skus
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas old_formula
    ON old_formula.formula_key = reviewed.old_formula_key
  JOIN public.catalog_skus old_sku
    ON old_sku.formula_id = old_formula.id
  WHERE old_sku.active = TRUE;

  IF v_exact_pairs <> 19
     OR v_active_old_formulas <> 19
     OR v_active_old_skus <> 27 THEN
    RAISE EXCEPTION
      'The Honest Kitchen reconciliation preflight failed: exact pairs %, active old formulas %, active old SKUs %',
      v_exact_pairs, v_active_old_formulas, v_active_old_skus;
  END IF;
END $$;

UPDATE public.catalog_skus old_sku
SET
  active = FALSE,
  updated_at = NOW()
FROM public.catalog_formulas old_formula
JOIN thk_reviewed_formula_map reviewed
  ON reviewed.old_formula_key = old_formula.formula_key
WHERE old_sku.formula_id = old_formula.id
  AND old_sku.active = TRUE;

UPDATE public.catalog_formulas old_formula
SET
  active = FALSE,
  verification_status = 'quarantined',
  absent_since = COALESCE(old_formula.absent_since, NOW()),
  updated_at = NOW()
FROM thk_reviewed_formula_map reviewed
WHERE old_formula.formula_key = reviewed.old_formula_key
  AND old_formula.active = TRUE;

DO $$
DECLARE
  v_remaining_old_formulas INTEGER;
  v_remaining_old_skus INTEGER;
  v_active_current_formulas INTEGER;
BEGIN
  SELECT count(*)
  INTO v_remaining_old_formulas
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas old_formula
    ON old_formula.formula_key = reviewed.old_formula_key
  WHERE old_formula.active = TRUE;

  SELECT count(*)
  INTO v_remaining_old_skus
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas old_formula
    ON old_formula.formula_key = reviewed.old_formula_key
  JOIN public.catalog_skus old_sku
    ON old_sku.formula_id = old_formula.id
  WHERE old_sku.active = TRUE;

  SELECT count(*)
  INTO v_active_current_formulas
  FROM thk_reviewed_formula_map reviewed
  JOIN public.catalog_formulas current_formula
    ON current_formula.formula_key = reviewed.current_formula_key
  WHERE current_formula.active = TRUE
    AND current_formula.verification_status = 'verified';

  IF v_remaining_old_formulas <> 0
     OR v_remaining_old_skus <> 0
     OR v_active_current_formulas <> 19 THEN
    RAISE EXCEPTION
      'The Honest Kitchen reconciliation postcondition failed: old formulas %, old SKUs %, current verified formulas %',
      v_remaining_old_formulas, v_remaining_old_skus, v_active_current_formulas;
  END IF;
END $$;
