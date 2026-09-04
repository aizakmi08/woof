-- Dog Food Advisor legacy imports use source = 'dfa'. Preserve that source
-- meaning in catalog pet-type inference so acquisition jobs can reconcile
-- community duplicate gaps against official dog catalog rows without treating
-- the community row as verified ingredient or image evidence.

CREATE OR REPLACE FUNCTION public.catalog_source_pet_type_inference(
  p_existing_pet_type TEXT,
  p_source TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_cache_key TEXT,
  p_source_url TEXT
)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    lower(NULLIF(trim(COALESCE(p_existing_pet_type, '')), '')) AS existing_pet_type,
    lower(NULLIF(trim(COALESCE(p_source, '')), '')) AS source_key,
    regexp_replace(
      lower(concat_ws(' ', p_product_name, p_brand, p_cache_key, p_source_url)),
      '[^a-z0-9]+',
      ' ',
      'g'
    ) AS identity_text
)
SELECT CASE
  WHEN existing_pet_type IN ('dog', 'cat') THEN existing_pet_type
  WHEN source_key = 'dfa' THEN 'dog'
  WHEN identity_text ~ '\m(dog|dogs|puppy|puppies|canine|canines|pup)\M'
    AND identity_text !~ '\m(cat|cats|kitten|kittens|feline|felines|kitty)\M'
    THEN 'dog'
  WHEN identity_text ~ '\m(cat|cats|kitten|kittens|feline|felines|kitty)\M'
    AND identity_text !~ '\m(dog|dogs|puppy|puppies|canine|canines|pup)\M'
    THEN 'cat'
  ELSE 'unknown'
END
FROM normalized;
$$;

REVOKE ALL ON FUNCTION public.catalog_source_pet_type_inference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_source_pet_type_inference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_source_pet_type_inference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_source_pet_type_inference(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.refresh_catalog_acquisition_queue(integer,integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'refresh_catalog_acquisition_queue(integer,integer) not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_source_pet_type_inference(%'
    OR function_sql NOT LIKE '%product_source,%'
    OR function_sql NOT LIKE '%source_url%'
  THEN
    function_sql := regexp_replace(
      function_sql,
      $pattern$      CASE
        WHEN pet_type IN \('dog', 'cat'\) THEN pet_type
        WHEN lower\(concat_ws\(' ', product_name, brand\)\) ~ '[^']*' THEN 'dog'
        WHEN lower\(concat_ws\(' ', product_name, brand\)\) ~ '[^']*' THEN 'cat'
        ELSE 'unknown'
      END AS inferred_pet_type,$pattern$,
      $$      public.catalog_source_pet_type_inference(
        pet_type,
        product_source,
        product_name,
        brand,
        cache_key,
        source_url
      ) AS inferred_pet_type,$$,
      'm'
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_source_pet_type_inference(%'
    OR function_sql NOT LIKE '%product_source,%'
    OR function_sql NOT LIKE '%source_url%'
  THEN
    RAISE EXCEPTION 'refresh_catalog_acquisition_queue source pet-type inference patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_acquisition_queue(INTEGER, INTEGER) TO service_role;

WITH updated_queue AS (
  UPDATE public.catalog_acquisition_queue q
  SET
    pet_type = 'dog',
    needs_pet_type = FALSE,
    priority_score = GREATEST(q.priority_score - CASE WHEN q.needs_pet_type THEN 2 ELSE 0 END, 0),
    updated_at = now(),
    sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb) || jsonb_build_object(
      'pet_type_inferred_from_source', 'dfa',
      'pet_type_inferred_by', '242_infer_dfa_pet_type',
      'pet_type_inferred_at', now()
    )
  WHERE lower(COALESCE(q.product_source, '')) = 'dfa'
    AND COALESCE(q.pet_type, 'unknown') NOT IN ('dog', 'cat')
    AND q.status IN ('open', 'in_progress', 'imported')
  RETURNING q.id
)
SELECT
  (SELECT count(*) FROM updated_queue) AS updated_dfa_queue_rows;

DO $$
DECLARE
  refreshed_unknown_dfa_rows INTEGER;
BEGIN
  IF public.catalog_source_pet_type_inference(
    'unknown',
    'dfa',
    'Blue Buffalo Family Favorites Sunday Chicken Dinner',
    'Blue Buffalo',
    NULL,
    NULL
  ) <> 'dog' THEN
    RAISE EXCEPTION 'dfa source rows must infer dog pet type';
  END IF;

  IF public.catalog_source_pet_type_inference(
    NULL,
    'opff',
    'Blue Buffalo Tastefuls Kitten Chicken',
    'Blue Buffalo',
    NULL,
    NULL
  ) <> 'cat' THEN
    RAISE EXCEPTION 'text pet-type inference must still infer kitten rows as cat';
  END IF;

  IF public.catalog_source_pet_type_inference(
    'cat',
    'dfa',
    'Explicit Cat Row',
    'Example',
    NULL,
    NULL
  ) <> 'cat' THEN
    RAISE EXCEPTION 'explicit pet_type must override source-derived inference';
  END IF;

  SELECT count(*)::INTEGER
  INTO refreshed_unknown_dfa_rows
  FROM public.catalog_acquisition_queue
  WHERE lower(COALESCE(product_source, '')) = 'dfa'
    AND status IN ('open', 'in_progress', 'imported')
    AND COALESCE(pet_type, 'unknown') <> 'dog';

  IF refreshed_unknown_dfa_rows <> 0 THEN
    RAISE EXCEPTION 'open dfa queue rows still have non-dog pet type: %', refreshed_unknown_dfa_rows;
  END IF;
END $$;
