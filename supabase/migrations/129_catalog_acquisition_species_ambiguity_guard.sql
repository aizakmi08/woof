-- Avoid resolving species-ambiguous queue rows to a dog/cat-specific catalog
-- product on weak similarity alone. Brands such as Nutrish sell both dog and
-- cat food with overlapping protein and grain terms, so unknown-species queue
-- rows need a stronger identity signal when the source-backed catalog row
-- explicitly names a species.

DO $$
DECLARE
  v_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_identity_match(text,text,text,text)'::regprocedure)
  INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_identity_match(text,text,text,text) not found';
  END IF;

  IF position('identity_similarity := similarity(q_norm, c_norm);' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition identity similarity block not found';
  END IF;

  IF position('catalog_acquisition_species_ambiguity_guard' IN v_sql) > 0 THEN
    RAISE EXCEPTION 'catalog acquisition species ambiguity guard already installed';
  END IF;

  v_sql := replace(
    v_sql,
    '  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO q_key_terms',
    '  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  -- catalog_acquisition_species_ambiguity_guard
  IF p_queue_pet_type NOT IN (''dog'', ''cat'')
     AND q_norm !~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND c_norm ~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND identity_similarity < 0.62
     AND identity_word_similarity < 0.90 THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT token ORDER BY token), ARRAY[]::TEXT[])
  INTO q_key_terms'
  );

  IF position('catalog_acquisition_species_ambiguity_guard' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition species ambiguity guard patch failed';
  END IF;

  EXECUTE v_sql;
END $$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_identity_match(TEXT, TEXT, TEXT, TEXT) TO service_role;

UPDATE public.catalog_acquisition_queue
SET
  status = 'open',
  resolved_at = NULL,
  resolution_reason = NULL,
  updated_at = now(),
  sample_metadata = (
    COALESCE(sample_metadata, '{}'::jsonb)
    - 'matched_cache_key'
    - 'matched_product_name'
    - 'matched_brand'
    - 'identity_similarity'
    - 'identity_word_similarity'
  ) || jsonb_build_object(
    'reopened_at', now(),
    'reopened_by', 'catalog_acquisition_species_ambiguity_guard',
    'reopen_reason', 'unknown-species Nutrish title overlaps dog and cat formulas'
  )
WHERE status = 'resolved'
  AND brand = 'Nutrish'
  AND product_name = 'Rachael Ray Nutrish Salmon & Brown Rice'
  AND resolution_reason = 'source-backed catalog product matched queued product identity';
