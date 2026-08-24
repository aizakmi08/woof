-- Typed search represents an unidentified package, so prefer the current
-- manufacturer version. Exact package/barcode resolution may still return a
-- dated retailer web version. Hide retailer versions already attached to a
-- manufacturer formula whose default pointer is a different current result.

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.search_verified_products_unprotected_age_v1(text,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$    AND product.expires_at > now()
$old$,
    $new$    AND product.expires_at > now()
      AND NOT (
        product.source IN ('chewy-retailer-web', 'walmart-retailer-web')
        AND EXISTS (
          SELECT 1
          FROM public.catalog_retailer_ingredient_evidence evidence
          JOIN public.catalog_formulas formula
            ON formula.id = evidence.linked_formula_id
          WHERE evidence.is_current
            AND evidence.evidence_status = 'promoted'
            AND evidence.promoted_cache_key = product.cache_key
            AND formula.active
            AND formula.source_authority = 'manufacturer'
            AND formula.promoted_cache_key IS DISTINCT FROM product.cache_key
        )
      )
$new$
  );

  v_fixed_definition := replace(
    v_fixed_definition,
    $old$  ORDER BY
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
$old$,
    $new$  ORDER BY
    CASE
      WHEN product.source_quality = 'manufacturer'
        OR product.ingredient_verification_status = 'manufacturer'
        THEN 0
      WHEN product.source_quality IN ('gdsn', 'official')
        OR product.ingredient_verification_status IN ('gdsn', 'official')
        THEN 1
      ELSE 2
    END,
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
$new$
  );

  v_fixed_definition := replace(
    v_fixed_definition,
    $old$  RETURN QUERY
  SELECT *
  FROM public.search_verified_products_species_filter_v2(q, v_safe_limit)
  LIMIT v_safe_limit;
$old$,
    $new$  RETURN QUERY
  SELECT candidate.*
  FROM public.search_verified_products_species_filter_v2(q, 25) AS candidate
  WHERE NOT (
    candidate.source IN ('chewy-retailer-web', 'walmart-retailer-web')
    AND EXISTS (
      SELECT 1
      FROM public.catalog_retailer_ingredient_evidence evidence
      JOIN public.catalog_formulas formula
        ON formula.id = evidence.linked_formula_id
      WHERE evidence.is_current
        AND evidence.evidence_status = 'promoted'
        AND evidence.promoted_cache_key = candidate.cache_key
        AND formula.active
        AND formula.source_authority = 'manufacturer'
        AND formula.promoted_cache_key IS DISTINCT FROM candidate.cache_key
    )
  )
  ORDER BY
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
    candidate.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
$new$
  );

  IF v_fixed_definition = v_definition
    OR position('formula.source_authority = ''manufacturer''' IN v_fixed_definition) = 0
    OR position('search_verified_products_species_filter_v2(q, 25)' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'typed search manufacturer preference markers not found';
  END IF;
  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  TO service_role;
