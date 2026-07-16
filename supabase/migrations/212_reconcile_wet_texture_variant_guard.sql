-- Wet-form texture words such as entree, gravy, pate, and loaf identify
-- distinct formulas. A generic dry/unknown title must not reconcile to a wet
-- texture row just because the protein and side terms overlap.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%wet texture/form variant guard%' THEN
    function_sql := replace(
      function_sql,
      $$  IF q_has_cat AND p_matched_pet_type <> 'cat' THEN
    RETURN FALSE;
  END IF;$$,
      $$  IF q_has_cat AND p_matched_pet_type <> 'cat' THEN
    RETURN FALSE;
  END IF;

  IF c_norm ~ '\m(wet|entree|entrée|gravy|pate|paté|loaf)\M'
     AND q_norm !~ '\m(wet|can|cans|canned|entree|entrée|gravy|pate|paté|loaf)\M' THEN
    -- wet texture/form variant guard
    RETURN FALSE;
  END IF;$$
    );
  END IF;

  IF function_sql NOT LIKE '%wet texture/form variant guard%' THEN
    RAISE EXCEPTION 'wet texture/form variant guard patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'matched_pet_type'
    - 'matched_source'
    - 'matched_source_url'
    - 'matched_rank'
    - 'match_strategy'
    || jsonb_build_object(
      'last_reconcile_checked_at', now(),
      'last_reconcile_checked_by', 'reconcile_wet_texture_variant_guard',
      'last_reconcile_checked_result', 'reopened_ambiguous_wet_texture_variant',
      'reopened_at', now(),
      'reopened_by', '212_reconcile_wet_texture_variant_guard',
      'reopen_reason', 'Generic Lamb and Oat Meal title did not explicitly identify wet entree texture.'
    )
WHERE brand = 'Purina Pro Plan'
  AND product_name = 'Purina Pro Plan Sensitive Skin and Sensitive Stomach Dog Food Lamb and Oat Meal Formula -'
  AND status = 'resolved'
  AND sample_metadata->>'matched_source_url' = 'https://www.purina.com/dogs/shop/pro-plan-sensitive-skin-stomach-lamb-oatmeal-wet-dog-food';

DO $$
BEGIN
  IF public.catalog_acquisition_strict_search_high_confidence(
    'Purina Pro Plan',
    'Purina Pro Plan Sensitive Skin and Sensitive Stomach Dog Food Lamb and Oat Meal Formula -',
    'dog',
    'Purina Pro Plan',
    'Pro Plan Sensitive Skin & Stomach Lamb & Oat Meal Entrée Classic Wet Dog Food Sensitive Skin Stomach Lamb Oat Meal Entrée wet 13 oz',
    'dog',
    14.0
  ) THEN
    RAISE EXCEPTION 'generic lamb oat meal title must not reconcile to wet entree row';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Purina Pro Plan',
    'Purina Pro Plan Sensitive Skin and Stomach Lamb and Oat Meal Entree Wet Dog Food',
    'dog',
    'Purina Pro Plan',
    'Pro Plan Sensitive Skin & Stomach Lamb & Oat Meal Entrée Classic Wet Dog Food Sensitive Skin Stomach Lamb Oat Meal Entrée wet 13 oz',
    'dog',
    14.0
  ) THEN
    RAISE EXCEPTION 'explicit wet lamb oat meal entree title should still reconcile';
  END IF;
END $$;
