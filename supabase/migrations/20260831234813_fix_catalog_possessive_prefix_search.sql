-- Build a bounded prefix query from normalized catalog terms.
--
-- Apostrophes normalize to spaces in the catalog RPCs.  The previous builders
-- therefore turned "Nature's" into `nature:* & s:*`; that one-character prefix
-- is extremely broad and can force a large GIN/heap scan.  Ignore tokens shorter
-- than two characters and make a trailing possessive/plural `s` a bounded
-- singular alternative so both "Nature's" and "natures" find the same brand.
CREATE OR REPLACE FUNCTION public.catalog_bounded_prefix_tsquery(value TEXT)
RETURNS TSQUERY
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH normalized AS (
    SELECT NULLIF(
      trim(regexp_replace(
        extensions.unaccent(lower(left(COALESCE(value, ''), 512))),
        '[^a-z0-9]+',
        ' ',
        'g'
      )),
      ''
    ) AS value
  ),
  tokens AS (
    SELECT token.value, token.ordinality
    FROM normalized
    CROSS JOIN LATERAL regexp_split_to_table(normalized.value, '\s+')
      WITH ORDINALITY AS token(value, ordinality)
    WHERE token.ordinality <= 12
      AND length(token.value) BETWEEN 2 AND 64
      AND token.value ~ '^[a-z0-9]+$'
  ),
  deduped AS (
    SELECT DISTINCT ON (tokens.value)
      tokens.value,
      tokens.ordinality
    FROM tokens
    ORDER BY tokens.value, tokens.ordinality
  ),
  lexemes AS (
    SELECT
      deduped.ordinality,
      CASE
        WHEN deduped.value ~ '^[a-z]{3,63}s$'
        THEN '(' || quote_literal(deduped.value) || ':* | '
          || quote_literal(left(deduped.value, length(deduped.value) - 1)) || ':*)'
        ELSE quote_literal(deduped.value) || ':*'
      END AS expression
    FROM deduped
  )
  SELECT CASE
    WHEN count(*) = 0 THEN NULL::TSQUERY
    ELSE to_tsquery('simple'::regconfig, string_agg(lexemes.expression, ' & ' ORDER BY lexemes.ordinality))
  END
  FROM lexemes;
$function$;

REVOKE ALL ON FUNCTION public.catalog_bounded_prefix_tsquery(TEXT) FROM PUBLIC;

DO $migration$
DECLARE
  target RECORD;
  definition TEXT;
  rewritten TEXT;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      (
        'public.search_products(text,integer)'::regprocedure,
        $$CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query$$,
        $$public.catalog_bounded_prefix_tsquery(normalized) AS ts_query$$
      ),
      (
        'public.search_verified_products_ranked_v1(text,integer)'::regprocedure,
        $$CASE
        WHEN length(normalized) >= 2 THEN
          to_tsquery('simple', regexp_replace(normalized, '[[:space:]]+', ':* & ', 'g') || ':*')
        ELSE NULL
      END AS ts_query$$,
        $$public.catalog_bounded_prefix_tsquery(normalized) AS ts_query$$
      ),
      (
        'public.search_verified_products_base_v2(text,integer)'::regprocedure,
        $$v_ts_query := to_tsquery('simple', regexp_replace(regexp_replace(v_normalized, '\mpate\M', 'pat', 'g'), '[[:space:]]+', ':* & ', 'g') || ':*');$$,
        $$v_ts_query := public.catalog_bounded_prefix_tsquery(
    regexp_replace(v_normalized, '\mpate\M', 'pat', 'g')
  );
  IF v_ts_query IS NULL THEN
    RETURN;
  END IF;$$
      )
    ) AS patches(signature, old_fragment, new_fragment)
  LOOP
    SELECT pg_get_functiondef(target.signature::OID)
    INTO definition;

    IF position(target.new_fragment IN definition) > 0 THEN
      CONTINUE;
    END IF;
    IF position(target.old_fragment IN definition) = 0 THEN
      RAISE EXCEPTION 'Expected prefix-query fragment was not found in %', target.signature;
    END IF;

    rewritten := replace(definition, target.old_fragment, target.new_fragment);
    EXECUTE rewritten;
  END LOOP;
END;
$migration$;

DO $assertions$
BEGIN
  IF public.catalog_bounded_prefix_tsquery('s') IS NOT NULL
    OR public.catalog_bounded_prefix_tsquery('a b') IS NOT NULL
    OR public.catalog_bounded_prefix_tsquery('  --  ') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Degenerate catalog prefix queries must return NULL';
  END IF;

  IF public.catalog_bounded_prefix_tsquery('Nature''s Logic')::TEXT ~ '''s'':\*'
    OR public.catalog_bounded_prefix_tsquery('Hill''s Science Diet')::TEXT ~ '''s'':\*'
    OR public.catalog_bounded_prefix_tsquery('Newman''s Own')::TEXT ~ '''s'':\*'
  THEN
    RAISE EXCEPTION 'A one-character prefix lexeme survived catalog query normalization';
  END IF;

  IF NOT (
    to_tsvector('simple', 'Nature''s Logic') @@ public.catalog_bounded_prefix_tsquery('natures logic')
    AND to_tsvector('simple', 'Hill''s Science Diet') @@ public.catalog_bounded_prefix_tsquery('hills science diet')
    AND to_tsvector('simple', 'Newman''s Own') @@ public.catalog_bounded_prefix_tsquery('newmans own')
    AND to_tsvector('simple', 'Nature''s Logic') @@ public.catalog_bounded_prefix_tsquery('Nature''s Logic')
    AND to_tsvector('simple', 'Hill''s Science Diet') @@ public.catalog_bounded_prefix_tsquery('Hill''s Science Diet')
    AND to_tsvector('simple', 'Newman''s Own') @@ public.catalog_bounded_prefix_tsquery('Newman''s Own')
    AND to_tsvector('simple', 'Acme''s Field & Farm') @@ public.catalog_bounded_prefix_tsquery('Acme’s Field-and-Farm')
  ) THEN
    RAISE EXCEPTION 'Possessive/plain brand equivalence regression';
  END IF;

  IF numnode(public.catalog_bounded_prefix_tsquery(
    'token01 token02 token03 token04 token05 token06 token07 token08 token09 token10 token11 token12 token13 token14 token15'
  )) > 12
    OR public.catalog_bounded_prefix_tsquery(repeat('x', 600)) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Catalog prefix-query resource bounds regressed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND pg_get_functiondef(p.oid) LIKE '%to_tsquery%:* & %'
  ) THEN
    RAISE EXCEPTION 'An unsafe catalog prefix-query builder remains installed';
  END IF;
END;
$assertions$;
