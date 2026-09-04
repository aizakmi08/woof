-- Reuse the reviewed unique full-ingredient reconciliation for both source
-- panels. The generic function keeps source-specific provenance and accepts
-- the narrowly demonstrated rabbit-token pet-type false positive only after
-- species, brand, form, title, full ingredients, and unique formula all agree.

DO $migration$
DECLARE
  v_definition TEXT;
  v_generic_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.reconcile_walmart_unique_ingredient_formulas(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_generic_definition := replace(
    v_definition,
    'FUNCTION public.reconcile_walmart_unique_ingredient_formulas' ||
      '(p_import_run_id uuid, p_limit integer DEFAULT 250)',
    'FUNCTION public.reconcile_retailer_unique_ingredient_formulas' ||
      '(p_import_run_id uuid, p_source_slug text DEFAULT ''walmart'', ' ||
      'p_limit integer DEFAULT 250)'
  );
  v_generic_definition := replace(
    v_generic_definition,
    $old$BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN$old$,
    $new$BEGIN
  IF p_source_slug NOT IN ('chewy', 'walmart') THEN
    RAISE EXCEPTION 'Unsupported retailer source %', p_source_slug;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 THEN$new$
  );
  v_generic_definition := replace(
    v_generic_definition,
    '''walmart-retailer-web''',
    'p_source_slug || ''-retailer-web'''
  );
  v_generic_definition := replace(
    v_generic_definition,
    '''walmart:'' ||',
    'p_source_slug || '':'' ||'
  );
  v_generic_definition := replace(
    v_generic_definition,
    'evidence.source_slug = ''walmart''',
    'evidence.source_slug = p_source_slug'
  );
  v_generic_definition := replace(
    v_generic_definition,
    $old$            'non_complete_or_non_food_identity'
          ]::TEXT[]$old$,
    $new$            'non_complete_or_non_food_identity',
            'non_dog_cat_product'
          ]::TEXT[]$new$
  );
  v_generic_definition := replace(
    v_generic_definition,
    $old$      validation_reasons = array_remove(array_remove(array_remove(
        evidence.validation_reasons,
        'no_unique_exact_catalog_sku_identity'
      ), 'variant_ingredient_mismatch'), 'non_complete_or_non_food_identity'),$old$,
    $new$      validation_reasons = array_remove(array_remove(array_remove(array_remove(
        evidence.validation_reasons,
        'no_unique_exact_catalog_sku_identity'
      ), 'variant_ingredient_mismatch'), 'non_complete_or_non_food_identity'),
        'non_dog_cat_product'),$new$
  );

  IF v_generic_definition = v_definition
    OR position('reconcile_retailer_unique_ingredient_formulas' IN v_generic_definition) = 0
    OR position('p_source_slug || ''-retailer-web''' IN v_generic_definition) = 0
    OR position('non_dog_cat_product' IN v_generic_definition) = 0
  THEN
    RAISE EXCEPTION 'Generic retailer reconciliation markers not found';
  END IF;

  EXECUTE v_generic_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.reconcile_retailer_unique_ingredient_formulas(
  UUID, TEXT, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_retailer_unique_ingredient_formulas(
  UUID, TEXT, INTEGER
) TO service_role;
