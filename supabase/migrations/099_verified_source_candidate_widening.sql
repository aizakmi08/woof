-- Let source-backed official/manufacturer rows enter the strict candidate pool
-- even when legacy retailer titles satisfy the full-text query first. Without
-- this, shorter official identities can be hidden behind long unverified
-- marketplace titles and never receive the verified-source rank bonus.

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

  function_sql := replace(
    function_sql,
    '        r.search_document @@ query.ts_query
        OR r.identity_lc LIKE ''%'' || query.normalized || ''%''
        OR r.gtin = query.normalized
      )',
    '        r.search_document @@ query.ts_query
        OR r.identity_lc LIKE ''%'' || query.normalized || ''%''
        OR r.gtin = query.normalized
        OR (
          r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE ''%'' || r.brand_lc || ''%''
          AND NOT (query.query_has_dog AND r.pet_type = ''cat'')
          AND NOT (query.query_has_cat AND r.pet_type = ''dog'')
          AND (
            word_similarity(query.normalized, r.identity_lc) > 0.54
            OR word_similarity(query.normalized, r.brand_lc || '' '' || r.product_name_lc) > 0.54
            OR similarity(r.identity_lc, query.normalized) > 0.24
          )
        )
      )'
  );

  function_sql := replace(
    function_sql,
    '            OR word_similarity(query.normalized, r.identity_lc) > 0.62
            OR word_similarity(query.normalized, r.brand_lc || '' '' || r.product_name_lc) > 0.62',
    '            OR word_similarity(query.normalized, r.identity_lc) > 0.54
            OR word_similarity(query.normalized, r.brand_lc || '' '' || r.product_name_lc) > 0.54'
  );

  IF function_sql NOT LIKE '%r.verified_source_rank_bonus > 0
          AND r.brand_lc IS NOT NULL
          AND query.normalized LIKE ''%'' || r.brand_lc || ''%''%' THEN
    RAISE EXCEPTION 'search_products verified source candidate widening patch failed';
  END IF;

  EXECUTE function_sql;
END $$;
