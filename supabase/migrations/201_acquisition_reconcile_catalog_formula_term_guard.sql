-- High-confidence acquisition reconciliation must not accept a verified catalog
-- formula that adds protected formula terms absent from the queued title. This
-- prevents safe-looking exact rows like "Chicken Feast" from resolving to
-- "Chicken & Beef" or "Chicken & Cheddar" variants.

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.catalog_acquisition_strict_search_high_confidence(text, text, text, text, text, text, real)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'catalog_acquisition_strict_search_high_confidence not found';
  END IF;

  IF function_sql NOT LIKE '%catalog formula-term containment guard%' THEN
    function_sql := replace(
      function_sql,
      $$  IF cardinality(q_terms) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(q_terms) AS q_required(term)
    WHERE NOT q_required.term = ANY(c_terms)
  ) THEN
    RETURN FALSE;
  END IF;$$,
      $$  IF cardinality(q_terms) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(q_terms) AS q_required(term)
    WHERE NOT q_required.term = ANY(c_terms)
  ) THEN
    RETURN FALSE;
  END IF;

  IF cardinality(q_terms) > 0 AND EXISTS (
    SELECT 1
    FROM unnest(c_terms) AS c_extra(term)
    WHERE NOT c_extra.term = ANY(q_terms)
  ) THEN
    -- catalog formula-term containment guard
    RETURN FALSE;
  END IF;$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog formula-term containment guard%' THEN
    RAISE EXCEPTION 'catalog formula-term containment guard patch failed';
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
    'Fancy Feast',
    'Fancy Feast Chicken Feast Pate Classic G.F. Wet Cat Food',
    'cat',
    'Fancy Feast',
    'Classic Paté Chicken Feast Gourmet Wet Cat Food Classic Paté Chicken wet 3 oz',
    'cat',
    8.8
  ) THEN
    RAISE EXCEPTION 'Fancy Feast exact classic chicken pate title should reconcile';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Fancy Feast',
    'Fancy Feast Chicken Feast Pate Classic G.F. Wet Cat Food',
    'cat',
    'Fancy Feast',
    'Classic Paté Tender Beef & Chicken Feast Gourmet Wet Cat Food Classic Paté Tender Beef & Chicken wet 3 oz',
    'cat',
    6.2
  ) THEN
    RAISE EXCEPTION 'Fancy Feast chicken pate title must not reconcile to beef chicken variant';
  END IF;

  IF public.catalog_acquisition_strict_search_high_confidence(
    'Fancy Feast',
    'Fancy Feast Purina Grilled Wet Cat Food Chicken Feast in Wet Cat Food Gravy',
    'cat',
    'Fancy Feast',
    'Purina Fancy Feast Delights With Cheddar Grilled Chicken & Cheddar Cheese Feast in Wet Cat Food Gravy Cat Food Delights With Cheddar Grilled Chicken Cheddar Cheese wet 3 oz',
    'cat',
    9.4
  ) THEN
    RAISE EXCEPTION 'Fancy Feast plain grilled chicken title must not reconcile to cheddar variant';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Fancy Feast',
    'Fancy Feast Purina Delights with Cheddar Grilled Chicken and Cheddar Cheese Feast in Wet Cat Food Gravy Cat Food',
    'cat',
    'Fancy Feast',
    'Purina Fancy Feast Delights With Cheddar Grilled Chicken & Cheddar Cheese Feast in Wet Cat Food Gravy Cat Food Delights With Cheddar Grilled Chicken Cheddar Cheese wet 3 oz',
    'cat',
    9.4
  ) THEN
    RAISE EXCEPTION 'Fancy Feast cheddar grilled chicken title should reconcile to cheddar variant';
  END IF;

  IF NOT public.catalog_acquisition_strict_search_high_confidence(
    'Fancy Feast',
    'Fancy Feast Cat Food Cod Sole & Shrimp Feast',
    'cat',
    'Fancy Feast',
    'Classic Paté Cod, Sole & Shrimp Gourmet Wet Cat Food Classic Paté Cod Sole Shrimp wet 3 oz',
    'cat',
    6.9
  ) THEN
    RAISE EXCEPTION 'Fancy Feast cod sole shrimp title should reconcile';
  END IF;
END $$;
