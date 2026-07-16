-- Tighten the 128/129 fallback after live review. Unknown-species queue rows
-- should not resolve to dog/cat-specific identities for brands that sell both
-- species, and source identities with extra line/diet terms such as "Indoor"
-- should not satisfy a shorter generic queue title.

DO $$
DECLARE
  v_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_identity_match(text,text,text,text)'::regprocedure)
  INTO v_sql;

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_identity_match(text,text,text,text) not found';
  END IF;

  IF position('catalog_acquisition_species_ambiguity_guard' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition species ambiguity guard patch point not found';
  END IF;

  v_sql := replace(
    v_sql,
    '''vegetable'', ''wild''',
    '''vegetable'', ''garden'', ''green'', ''greens'', ''bean'', ''beans'', ''apple'', ''apples'', ''pumpkin'', ''wild'''
  );

  v_sql := replace(
    v_sql,
    '  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  -- catalog_acquisition_species_ambiguity_guard
  IF p_queue_pet_type NOT IN (''dog'', ''cat'')
     AND q_norm !~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND c_norm ~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND identity_similarity < 0.62
     AND identity_word_similarity < 0.90 THEN
    RETURN FALSE;
  END IF;',
    '  FOREACH required_term IN ARRAY ARRAY[
    ''adult 7'',
    ''classic ground'',
    ''digestive'',
    ''hairball'',
    ''healthy weight'',
    ''high protein'',
    ''hydrolyzed'',
    ''indoor'',
    ''kitten'',
    ''large breed'',
    ''mousse'',
    ''pate'',
    ''puppy'',
    ''renal'',
    ''senior'',
    ''sensitive'',
    ''shreds'',
    ''skin'',
    ''small breed'',
    ''stomach'',
    ''tender'',
    ''urinary'',
    ''weight''
  ] LOOP
    IF position(required_term IN c_norm) > 0
       AND position(required_term IN q_norm) = 0 THEN
      RETURN FALSE;
    END IF;
  END LOOP;

  identity_similarity := similarity(q_norm, c_norm);
  identity_word_similarity := word_similarity(q_norm, c_norm);

  -- catalog_acquisition_species_ambiguity_guard
  IF p_queue_pet_type NOT IN (''dog'', ''cat'')
     AND q_norm !~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND c_norm ~ ''\m(dog|dogs|puppy|canine|cat|cats|kitten|feline)\M''
     AND q_norm !~ ''\m(cesar|pedigree|eukanuba|fancy feast|friskies|sheba|9lives)\M'' THEN
    RETURN FALSE;
  END IF;'
  );

  IF position('unknown-species queue rows require known single-species brand') > 0 THEN
    RAISE EXCEPTION 'unexpected stale marker';
  END IF;

  IF position('q_norm !~ ''\m(cesar|pedigree|eukanuba|fancy feast|friskies|sheba|9lives)\M''' IN v_sql) = 0 THEN
    RAISE EXCEPTION 'catalog acquisition stricter species guard patch failed';
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
    'reopened_by', 'catalog_acquisition_species_and_line_term_guard',
    'reopen_reason', 'unknown-species or extra line-term identity ambiguity'
  )
WHERE status = 'resolved'
  AND resolution_reason = 'source-backed catalog product matched queued product identity'
  AND (
    (brand = 'Blue Buffalo' AND product_name = 'Blue Buffalo Basics Grain Free Turkey and Potato Recipe')
    OR (brand = 'Friskies' AND product_name = 'Chicken dinner pate')
    OR (brand = 'Nutrish' AND product_name = 'Rachael Ray Nutrish Chicken & Brown Rice')
  );
