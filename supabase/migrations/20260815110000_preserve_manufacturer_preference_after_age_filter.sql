-- The adult-7+ guard wraps typed search and used to reorder the safer inner
-- result back to raw text rank. Preserve manufacturer-current preference at
-- this final typed-search boundary. Barcode resolution uses a separate path.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.search_verified_products_unfiltered_gtin_v1(text,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$  ORDER BY candidate.rank DESC,
    candidate.ingredient_count DESC,
    candidate.verified_at DESC NULLS LAST
$old$,
    $new$  ORDER BY
    CASE
      WHEN candidate.source_quality = 'manufacturer'
        OR candidate.ingredient_verification_status = 'manufacturer'
        THEN 0
      WHEN candidate.source_quality IN ('gdsn', 'official')
        OR candidate.ingredient_verification_status IN ('gdsn', 'official')
        THEN 1
      ELSE 2
    END,
    candidate.rank DESC,
    candidate.ingredient_count DESC,
    candidate.verified_at DESC NULLS LAST
$new$
  );

  IF v_fixed_definition = v_definition
    OR position('candidate.source_quality = ''manufacturer''' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'final typed-search ordering marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.search_verified_products_unfiltered_gtin_v1(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products_unfiltered_gtin_v1(TEXT, INTEGER)
  TO service_role;
