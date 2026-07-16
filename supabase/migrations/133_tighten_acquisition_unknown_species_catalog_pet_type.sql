-- Unknown-species acquisition rows for multi-species brands must not resolve
-- just because the catalog product title omits "dog" or "cat"; the catalog
-- row's pet_type is authoritative enough to trigger the ambiguity guard.

DO $$
DECLARE
  v_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_identity_match(text,text,text,text)'::regprocedure)
  INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_identity_match(text,text,text,text) not found';
  END IF;

  IF position('COALESCE(p_queue_pet_type, '''') NOT IN (''dog'', ''cat'')' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition NULL-safe unknown-species guard not found';
  END IF;

  v_sql := replace(
    v_sql,
    'AND c_norm ~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''',
    'AND (
       COALESCE(p_catalog_pet_type, '''') IN (''dog'', ''cat'')
       OR c_norm ~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     )'
  );

  v_sql := replace(
    v_sql,
    'q_norm !~ ''\m(cesar|pedigree|eukanuba|fancy feast|friskies|sheba|9lives)\M''',
    'q_norm !~ ''\m(beneful|cat chow|cesar|pedigree|eukanuba|fancy feast|friskies|meow mix|sheba|9lives)\M'''
  );

  IF position('COALESCE(p_catalog_pet_type, '''') IN (''dog'', ''cat'')' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition catalog-pet-type unknown species guard patch failed';
  END IF;

  IF position('beneful|cat chow|cesar|pedigree|eukanuba|fancy feast|friskies|meow mix|sheba|9lives' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition single-species allowlist patch failed';
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
    'reopened_by', 'catalog_acquisition_unknown_species_catalog_pet_type_guard',
    'reopen_reason', 'unknown-species multi-species brand identity no longer passes catalog pet-type guard'
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
