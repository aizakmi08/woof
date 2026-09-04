-- Explicit dog/cat words in a search query should affect every result, not
-- only the verified-source bonus. This keeps "cat" searches from being led by
-- dog products when both species have plausible text matches.

DO $$
DECLARE
  function_sql TEXT;
  species_adjustment TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO function_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'search_products'
    AND pg_get_function_identity_arguments(p.oid) = 'q text, max_results integer';

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'search_products(q text, max_results integer) not found';
  END IF;

  IF function_sql LIKE '%explicit pet species rank alignment%' THEN
    RETURN;
  END IF;

  IF regexp_count(function_sql, 'verified source distinctive token overlap') <> 2 THEN
    RAISE EXCEPTION 'search_products distinctive token overlap block count unexpected';
  END IF;

  species_adjustment := $patch$END + CASE
        -- explicit pet species rank alignment
        WHEN query.query_has_dog AND r.pet_type = 'dog' THEN 0.85
        WHEN query.query_has_cat AND r.pet_type = 'cat' THEN 0.85
        WHEN query.query_has_dog AND r.pet_type = 'cat' THEN -1.35
        WHEN query.query_has_cat AND r.pet_type = 'dog' THEN -1.35
        ELSE 0.0
      END + CASE
        -- verified source distinctive token overlap$patch$;

  function_sql := replace(
    function_sql,
    'END + CASE
        -- verified source distinctive token overlap',
    species_adjustment
  );

  IF regexp_count(function_sql, 'explicit pet species rank alignment') <> 2 THEN
    RAISE EXCEPTION 'search_products species alignment patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
