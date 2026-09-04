-- Treat NULL queue pet types as unknown species in acquisition identity guards.
-- Without COALESCE, NULL NOT IN ('dog', 'cat') evaluates to NULL and skips the
-- multi-species brand ambiguity check.

DO $$
DECLARE
  v_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_identity_match(text,text,text,text)'::regprocedure)
  INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_identity_match(text,text,text,text) not found';
  END IF;

  IF position('p_queue_pet_type NOT IN (''dog'', ''cat'')' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition unknown species guard patch point not found';
  END IF;

  v_sql := replace(
    v_sql,
    'p_queue_pet_type NOT IN (''dog'', ''cat'')',
    'COALESCE(p_queue_pet_type, '''') NOT IN (''dog'', ''cat'')'
  );

  IF position('COALESCE(p_queue_pet_type, '''') NOT IN (''dog'', ''cat'')' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition unknown species null guard patch failed';
  END IF;

  EXECUTE v_sql;
END $$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

UPDATE public.catalog_acquisition_queue q
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = (
    COALESCE(q.sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'identity_similarity'
    - 'identity_word_similarity'
  ) || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', 'catalog_acquisition_unknown_species_null_guard',
    'reopen_reason', 'unknown-species queue identity no longer passes strict species guard'
  )
FROM public.product_data p
WHERE q.status = 'resolved'
  AND q.resolution_reason = 'source-backed catalog product matched queued product identity'
  AND q.sample_metadata->>'matched_cache_key' = p.cache_key
  AND COALESCE(q.pet_type, '') NOT IN ('dog', 'cat')
  AND NOT public.catalog_acquisition_identity_match(
    concat_ws(' ', q.brand, q.product_name),
    q.pet_type,
    concat_ws(' ', p.brand, p.product_name, p.product_line, p.flavor, p.life_stage, p.food_form),
    p.pet_type
  );
