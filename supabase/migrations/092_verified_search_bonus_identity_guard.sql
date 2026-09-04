-- Verified rows should outrank duplicates only when they match the searched
-- product identity well enough. This prevents a source-backed wrong flavor from
-- beating an exact but unverified flavor match.

DO $$
DECLARE
  function_sql TEXT;
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

  IF function_sql NOT LIKE '%word_similarity(query.normalized, r.identity_lc) > 0.72%' THEN
    function_sql := replace(
      function_sql,
      '+ r.verified_rank_bonus)::REAL AS rank',
      '+ CASE
        WHEN r.identity_lc LIKE ''%'' || query.normalized || ''%''
          OR word_similarity(query.normalized, r.identity_lc) > 0.72
        THEN r.verified_rank_bonus
        ELSE r.verified_rank_bonus * 0.25
      END)::REAL AS rank'
    );
  END IF;

  IF regexp_count(function_sql, 'word_similarity\\(query.normalized, r.identity_lc\\) > 0.72') <> 2 THEN
    RAISE EXCEPTION 'search_products verified bonus identity guard patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
