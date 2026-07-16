-- Keep broad legacy titles from resolving to protected line variants such as
-- High-Protein when the legacy title does not contain that line term.

CREATE OR REPLACE FUNCTION public.catalog_acquisition_protected_line_terms_match(
  p_query_identity TEXT,
  p_candidate_identity TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
WITH normalized AS (
  SELECT
    regexp_replace(lower(COALESCE(p_query_identity, '')), '[^a-z0-9]+', ' ', 'g') AS q_norm,
    regexp_replace(lower(COALESCE(p_candidate_identity, '')), '[^a-z0-9]+', ' ', 'g') AS c_norm
),
flags AS (
  SELECT
    q_norm ~ '(^| )high protein( |$)' AS q_high_protein,
    c_norm ~ '(^| )high protein( |$)' AS c_high_protein
  FROM normalized
)
SELECT q_high_protein = c_high_protein
FROM flags;
$$;

REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_acquisition_protected_line_terms_match(TEXT, TEXT) TO service_role;

DO $migration$
DECLARE
  function_sql TEXT;
BEGIN
  SELECT pg_get_functiondef('public.exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql IS NULL THEN
    RAISE EXCEPTION 'exclude_unknown_species_legacy_duplicate_rows_for_brand not found';
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match%' THEN
    function_sql := replace(
      function_sql,
      $$      AND public.catalog_acquisition_strict_search_high_confidence(
        rm.legacy_brand,$$,
      $$      AND public.catalog_acquisition_protected_line_terms_match(
        rm.legacy_product_name,
        concat_ws(
          ' ',
          rm.matched_product_name,
          rm.matched_product_line,
          rm.matched_flavor,
          rm.matched_food_form,
          rm.matched_package_size
        )
      )
      AND public.catalog_acquisition_strict_search_high_confidence(
        rm.legacy_brand,$$
    );
  END IF;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer must enforce protected line terms';
  END IF;

  EXECUTE function_sql;
END $migration$;

REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.exclude_unknown_species_legacy_duplicate_rows_for_brand(TEXT, INTEGER) TO service_role;

WITH exact_match AS (
  SELECT
    cache_key,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url
  FROM public.product_data
  WHERE brand = 'Nulo'
    AND source = 'nulo'
    AND product_name = 'FreeStyle Turkey & Sweet Potato Recipe'
    AND source_url = 'https://nulo.com/products/pate-turkey-sweet-potato-recipe-for-dogs'
    AND source_quality IN ('manufacturer', 'official', 'gdsn', 'retailer_verified')
    AND catalog_exclusion_reason IS NULL
  ORDER BY cache_key
  LIMIT 1
)
UPDATE public.catalog_acquisition_queue q
SET
  updated_at = now(),
  sample_metadata = COALESCE(q.sample_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'matched_cache_key', em.cache_key,
      'matched_product_name', em.product_name,
      'matched_brand', em.brand,
      'matched_pet_type', em.pet_type,
      'matched_source', em.source,
      'matched_source_quality', em.source_quality,
      'matched_source_url', em.source_url,
      'corrected_after_protected_line_guard', true,
      'previous_matched_product_name', q.sample_metadata->>'matched_product_name',
      'previous_matched_source_url', q.sample_metadata->>'matched_source_url'
    )
FROM exact_match em
WHERE q.cache_key = 'nulo nulo freestyle turkey and sweet potato'
  AND q.status = 'resolved'
  AND q.sample_metadata->>'matched_source_url' = 'https://nulo.com/products/freestyle-turkey-sweet-potato-recipe-for-dogs';

DO $$
DECLARE
  function_sql TEXT;
  corrected_url TEXT;
BEGIN
  IF public.catalog_acquisition_protected_line_terms_match(
    'Nulo FreeStyle Turkey and Sweet Potato',
    'FreeStyle High-Protein Kibble Turkey & Sweet Potato Recipe'
  ) THEN
    RAISE EXCEPTION 'protected line guard must reject missing high-protein term';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Nulo FreeStyle High-Protein Turkey and Sweet Potato',
    'FreeStyle High-Protein Kibble Turkey & Sweet Potato Recipe'
  ) THEN
    RAISE EXCEPTION 'protected line guard should accept matching high-protein term';
  END IF;

  IF NOT public.catalog_acquisition_protected_line_terms_match(
    'Nulo FreeStyle Turkey and Sweet Potato',
    'FreeStyle Turkey & Sweet Potato Recipe'
  ) THEN
    RAISE EXCEPTION 'protected line guard should accept exact non-high-protein variant';
  END IF;

  SELECT pg_get_functiondef('public.exclude_unknown_species_legacy_duplicate_rows_for_brand(text, integer)'::regprocedure)
    INTO function_sql;

  IF function_sql NOT LIKE '%catalog_acquisition_protected_line_terms_match%' THEN
    RAISE EXCEPTION 'unknown-species duplicate closer must call protected line guard';
  END IF;

  SELECT sample_metadata->>'matched_source_url'
  INTO corrected_url
  FROM public.catalog_acquisition_queue
  WHERE cache_key = 'nulo nulo freestyle turkey and sweet potato';

  IF corrected_url IS DISTINCT FROM 'https://nulo.com/products/pate-turkey-sweet-potato-recipe-for-dogs' THEN
    RAISE EXCEPTION 'Nulo FreeStyle Turkey Sweet Potato should resolve to non-high-protein official source, got %', corrected_url;
  END IF;
END $$;
