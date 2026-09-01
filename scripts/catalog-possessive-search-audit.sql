-- Run only after 20260831234813_fix_catalog_possessive_prefix_search.sql.
-- This transaction is read-only apart from local timeout configuration.
BEGIN;
SET LOCAL statement_timeout = '3000ms';

DO $audit$
DECLARE
  probe RECORD;
  started_at TIMESTAMPTZ;
  elapsed_ms NUMERIC;
  found_brand BOOLEAN;
  built_query TSQUERY;
BEGIN
  FOR probe IN
    SELECT *
    FROM (VALUES
      ('Nature''s Logic', 'natures logic'),
      ('natures logic', 'natures logic'),
      ('Hill''s Science Diet', 'hills science diet'),
      ('hills science diet', 'hills science diet'),
      ('Newman''s Own', 'newmans own'),
      ('newmans own', 'newmans own')
    ) AS probes(query_text, expected_brand)
  LOOP
    built_query := public.catalog_bounded_prefix_tsquery(probe.query_text);
    IF built_query IS NULL OR built_query::TEXT ~ '''[a-z0-9]'':\*' THEN
      RAISE EXCEPTION 'Unbounded or empty query shape for %: %', probe.query_text, built_query;
    END IF;

    started_at := clock_timestamp();
    SELECT EXISTS (
      SELECT 1
      FROM public.search_verified_products(probe.query_text, 10) result
      WHERE trim(regexp_replace(
        extensions.unaccent(lower(result.brand)),
        '[^a-z0-9]+',
        ' ',
        'g'
      )) = probe.expected_brand
    )
    INTO found_brand;
    elapsed_ms := extract(epoch FROM (clock_timestamp() - started_at)) * 1000;

    IF NOT found_brand THEN
      RAISE EXCEPTION 'Expected brand was not returned for %', probe.query_text;
    END IF;
    IF elapsed_ms > 2500 THEN
      RAISE EXCEPTION 'Catalog search timing regression for %: % ms', probe.query_text, round(elapsed_ms, 1);
    END IF;

    RAISE NOTICE 'catalog possessive probe: query=% elapsed_ms=%',
      probe.query_text,
      round(elapsed_ms, 1);
  END LOOP;

  IF public.catalog_bounded_prefix_tsquery('s') IS NOT NULL
    OR public.catalog_bounded_prefix_tsquery('a b') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Degenerate short-token query did not resolve to NULL';
  END IF;
END;
$audit$;

ROLLBACK;
