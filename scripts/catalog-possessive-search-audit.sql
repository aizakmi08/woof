-- Run only after 20260831234813_fix_catalog_possessive_prefix_search.sql.
-- This transaction is read-only apart from local timeout configuration.
BEGIN;
-- statement_timeout covers the whole DO statement, not one loop iteration.
-- Keep a total watchdog here and enforce the stricter 2500 ms bound per probe
-- with elapsed wall time below.
SET LOCAL statement_timeout = '18000ms';

DO $audit$
DECLARE
  probe RECORD;
  started_at TIMESTAMPTZ;
  elapsed_ms NUMERIC;
  found_brand BOOLEAN;
  verified_brand_available BOOLEAN;
  built_query TSQUERY;
BEGIN
  FOR probe IN
    SELECT *
    FROM (VALUES
      ('Nature''s Logic', 'natureslogic'),
      ('natures logic', 'natureslogic'),
      ('Hill''s Science Diet', 'hillssciencediet'),
      ('hills science diet', 'hillssciencediet'),
      ('Newman''s Own', 'newmansown'),
      ('newmans own', 'newmansown')
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
      WHERE regexp_replace(
        extensions.unaccent(lower(result.brand)),
        '[^a-z0-9]+',
        '',
        'g'
      ) = probe.expected_brand
    )
    INTO found_brand;
    elapsed_ms := extract(epoch FROM (clock_timestamp() - started_at)) * 1000;

    SELECT EXISTS (
      SELECT 1
      FROM public.product_data product
      WHERE regexp_replace(
          extensions.unaccent(lower(product.brand)),
          '[^a-z0-9]+',
          '',
          'g'
        ) = probe.expected_brand
        AND product.expires_at > now()
        AND product.ingredient_count >= 5
        AND product.is_complete_food = TRUE
        AND product.catalog_exclusion_reason IS NULL
        AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
        AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
        AND product.source_quality IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
        AND product.ingredient_verification_status IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
        )
        AND product.image_verification_status IN ('official', 'manufacturer', 'retailer_verified')
        AND product.image_url IS NOT NULL
        AND product.image_url !~* '^data:'
    ) INTO verified_brand_available;

    IF verified_brand_available AND NOT found_brand THEN
      RAISE EXCEPTION 'Expected brand was not returned for %', probe.query_text;
    ELSIF NOT verified_brand_available THEN
      RAISE NOTICE 'verified catalog gap: query=% has no currently eligible complete-food row',
        probe.query_text;
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
    OR public.catalog_bounded_prefix_tsquery(' -- & '' ') IS NOT NULL
    OR public.catalog_bounded_prefix_tsquery(repeat('x', 600)) IS NOT NULL
  THEN
    RAISE EXCEPTION 'Degenerate short-token query did not resolve to NULL';
  END IF;

  IF NOT (
    to_tsvector('simple', 'Acme''s Field & Farm')
      @@ public.catalog_bounded_prefix_tsquery('Acme’s Field-&-Farm')
  ) OR numnode(public.catalog_bounded_prefix_tsquery(
    'token01 token02 token03 token04 token05 token06 token07 token08 token09 token10 token11 token12 token13 token14 token15'
  )) <> 23
    OR public.catalog_bounded_prefix_tsquery(
      'token01 token02 token03 token04 token05 token06 token07 token08 token09 token10 token11 token12 token13 token14 token15'
    )::TEXT LIKE '%token13%'
  THEN
    RAISE EXCEPTION 'Generic punctuation or catalog query bound regression';
  END IF;
END;
$audit$;

ROLLBACK;
