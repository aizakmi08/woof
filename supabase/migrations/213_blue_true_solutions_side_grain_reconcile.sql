-- Blue Buffalo True Solutions dry package/retailer titles often use a short
-- recipe label such as "Chicken" or "Salmon", while the manufacturer catalog
-- identity includes side-grain terms such as oatmeal, barley, or brown rice.
-- Allow those side terms to be omitted only when the True Solutions line,
-- species, dry form, and primary protein already match.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%Blue True Solutions side-grain allowance%' THEN
    function_sql := replace(
      function_sql,
      '''and'', ''blue'', ''breed'', ''brown'',',
      '''and'', ''bag'', ''bags'', ''blue'', ''breed'', ''brown'','
    );

    function_sql := replace(
      function_sql,
      $$    WHERE NOT c_extra.term = ANY(q_terms)
      AND NOT (
        c_extra.term = 'brown'
        AND 'rice' = ANY(q_terms)
        AND 'rice' = ANY(c_terms)
      )$$,
      $$    WHERE NOT c_extra.term = ANY(q_terms)
      AND NOT (
        c_extra.term = 'brown'
        AND 'rice' = ANY(q_terms)
        AND 'rice' = ANY(c_terms)
      )
      AND NOT (
        -- Blue True Solutions side-grain allowance
        c_extra.term IN ('oat', 'oatmeal', 'barley', 'rice', 'brown')
        AND q_brand_norm = 'blue'
        AND c_brand_norm = 'blue'
        AND lower(COALESCE(p_queue_brand, '')) LIKE 'blue buffalo%'
        AND lower(COALESCE(p_matched_brand, '')) LIKE 'blue buffalo%'
        AND q_norm ~ '\mtrue solutions\M'
        AND c_norm ~ '\mtrue solutions\M'
        AND q_norm ~ '\mdry\M'
        AND c_norm ~ '\mdry\M'
        AND p_matched_pet_type IN ('dog', 'cat')
        AND (
          (p_matched_pet_type = 'dog' AND (p_queue_pet_type = 'dog' OR q_norm ~ '\m(dog|dogs|canine)\M'))
          OR (p_matched_pet_type = 'cat' AND (p_queue_pet_type = 'cat' OR q_norm ~ '\m(cat|cats|feline)\M'))
        )
        AND (
          (q_norm ~ '\mdigestive care\M' AND c_norm ~ '\mdigestive care\M')
          OR (q_norm ~ '\mskin coat care\M' AND c_norm ~ '\mskin coat care\M')
          OR (q_norm ~ '\mlarge breed care\M' AND c_norm ~ '\mlarge breed care\M')
          OR (q_norm ~ '\msmall breed care\M' AND c_norm ~ '\msmall breed care\M')
        )
      )$$
    );
  END IF;

  IF function_sql NOT LIKE '%Blue True Solutions side-grain allowance%' THEN
    RAISE EXCEPTION 'Blue True Solutions side-grain allowance patch failed';
  END IF;

  IF function_sql NOT LIKE '%''bag'', ''bags''%' THEN
    RAISE EXCEPTION 'package bag stoplist patch failed';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_strict_search_high_confidence(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, REAL) TO service_role;

DO $$
BEGIN
  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo True Solutions Digestive Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'dog',
    'Blue Buffalo',
    'BLUE True Solutions Digestive Care Chicken & Oatmeal Recipe for Adult Dogs True Solutions Digestive Care Chicken Oatmeal dry 24 lb',
    'dog',
    14.0
  ) THEN
    RAISE EXCEPTION 'Blue True Solutions dog digestive care chicken title should reconcile to official chicken oatmeal dry row';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo True Solutions Skin & Coat Care Natural Dry Cat Food for Adult Cats, Salmon, 3.5-lb. Bag',
    'cat',
    'Blue Buffalo',
    'BLUE True Solutions Skin & Coat Care Salmon & Brown Rice Recipe for Adult Cats True Solutions Skin Coat Care Salmon Brown Rice dry 3.5 lb',
    'cat',
    14.0
  ) THEN
    RAISE EXCEPTION 'Blue True Solutions cat skin coat salmon title should reconcile to official salmon brown rice dry row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo True Solutions Digestive Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'dog',
    'Blue Buffalo',
    'BLUE True Solutions Skin & Coat Care Salmon & Oatmeal Recipe for Adult Dogs True Solutions Skin Coat Care Salmon Oatmeal dry 24 lb',
    'dog',
    14.0
  ) THEN
    RAISE EXCEPTION 'Blue True Solutions digestive chicken title must not reconcile to skin coat salmon row';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Blue Buffalo',
    'Blue Buffalo True Solutions Digestive Care Natural Dry Dog Food for Adult Dogs, Chicken, 24-lb. Bag',
    'dog',
    'Blue Buffalo',
    'BLUE True Solutions Digestive Care Chicken Recipe for Adult Dogs True Solutions Digestive Care Chicken wet 12.5 oz',
    'dog',
    14.0
  ) THEN
    RAISE EXCEPTION 'Blue True Solutions dry title must not reconcile to wet row';
  END IF;
END $$;
