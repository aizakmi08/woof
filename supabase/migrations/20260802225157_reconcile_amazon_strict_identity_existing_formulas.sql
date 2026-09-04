-- Resolve legacy Amazon aliases when the existing strict catalog identity
-- gates agree on one verified formula identity and the ingredient version is
-- byte-equivalent after normalization. Multiple serving rows may represent
-- package sizes, but conflicting identities always remain queued.

CREATE OR REPLACE FUNCTION public.reconcile_catalog_amazon_strict_existing_evidence()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_candidates INTEGER := 0;
  v_alias_rows INTEGER := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS pg_temp.amazon_strict_existing_match (
    candidate_key TEXT PRIMARY KEY,
    verified_cache_key TEXT NOT NULL,
    verified_source_url TEXT NOT NULL,
    verified_source_authority TEXT NOT NULL,
    alias_text TEXT NOT NULL,
    source_cache_keys TEXT[] NOT NULL
  ) ON COMMIT DROP;

  DELETE FROM pg_temp.amazon_strict_existing_match;

  WITH candidates AS (
    SELECT
      queue.*,
      source_row.product_name AS source_title,
      public.catalog_normalize_ingredient_evidence(source_row.ingredient_text)
        AS normalized_ingredients
    FROM public.catalog_amazon_evidence_queue queue
    JOIN public.product_data source_row
      ON source_row.cache_key = queue.representative_cache_key
    WHERE queue.status = 'ready_existing_evidence_review'
      AND queue.pet_type IN ('dog', 'cat')
  ), raw_matches AS (
    SELECT
      candidate.candidate_key,
      candidate.product_name AS alias_text,
      candidate.source_cache_keys,
      verified.cache_key,
      verified.source_url,
      COALESCE(NULLIF(verified.source_quality, ''), 'retailer_verified')
        AS source_authority,
      lower(concat_ws(
        '|',
        verified.brand,
        verified.pet_type,
        public.catalog_amazon_formula_title(verified.product_name),
        COALESCE(verified.product_line, ''),
        COALESCE(verified.flavor, ''),
        COALESCE(verified.life_stage, ''),
        COALESCE(verified.food_form, ''),
        public.catalog_normalize_ingredient_evidence(verified.ingredient_text)
      )) AS verified_identity,
      CASE verified.formula_evidence_tier
        WHEN 'manufacturer_current_exact' THEN 0
        WHEN 'retailer_web_version' THEN 1
        WHEN 'web_label_version' THEN 2
        ELSE 3
      END AS evidence_preference,
      verified.verified_at
    FROM candidates candidate
    JOIN public.product_data verified
      ON lower(verified.brand) = lower(candidate.brand)
     AND verified.pet_type = candidate.pet_type
     AND public.catalog_normalize_ingredient_evidence(verified.ingredient_text) =
       candidate.normalized_ingredients
     AND verified.ingredient_verification_status IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified',
       'label_ocr_verified'
     )
     AND verified.image_verification_status IN (
       'official', 'manufacturer', 'retailer_verified'
     )
     AND verified.catalog_exclusion_reason IS NULL
     AND NULLIF(btrim(verified.source_url), '') IS NOT NULL
    WHERE public.catalog_acquisition_identity_match(
        candidate.source_title,
        candidate.pet_type,
        concat_ws(
          ' ', verified.brand, verified.product_line, verified.product_name,
          verified.flavor, verified.life_stage, verified.food_form,
          verified.pet_type
        ),
        verified.pet_type
      )
      AND public.catalog_acquisition_alias_formula_terms_match(
        candidate.source_title,
        concat_ws(
          ' ', verified.brand, verified.product_line, verified.product_name,
          verified.flavor, verified.life_stage, verified.food_form,
          verified.pet_type
        )
      )
      AND public.catalog_acquisition_food_form_terms_match(
        candidate.source_title,
        concat_ws(
          ' ', verified.brand, verified.product_line, verified.product_name,
          verified.flavor, verified.life_stage, verified.food_form,
          verified.pet_type
        )
      )
      AND public.catalog_acquisition_life_stage_terms_match(
        candidate.source_title,
        concat_ws(
          ' ', verified.brand, verified.product_line, verified.product_name,
          verified.flavor, verified.life_stage, verified.food_form,
          verified.pet_type
        )
      )
      AND public.catalog_acquisition_protected_line_terms_match(
        candidate.source_title,
        concat_ws(
          ' ', verified.brand, verified.product_line, verified.product_name,
          verified.flavor, verified.life_stage, verified.food_form,
          verified.pet_type
        )
      )
  ), identity_counts AS (
    SELECT candidate_key, count(DISTINCT verified_identity) AS identity_count
    FROM raw_matches
    GROUP BY candidate_key
  ), ranked AS (
    SELECT
      match.*,
      row_number() OVER (
        PARTITION BY match.candidate_key
        ORDER BY
          match.evidence_preference,
          match.verified_at DESC NULLS LAST,
          match.cache_key
      ) AS preference
    FROM raw_matches match
    JOIN identity_counts identity
      ON identity.candidate_key = match.candidate_key
     AND identity.identity_count = 1
  ), selected AS (
    SELECT *
    FROM ranked
    WHERE preference = 1
  ), alias_counts AS (
    SELECT
      public.normalize_verified_product_search_query(alias_text)
        AS normalized_alias,
      count(DISTINCT candidate_key) AS candidate_count
    FROM selected
    GROUP BY public.normalize_verified_product_search_query(alias_text)
  )
  INSERT INTO pg_temp.amazon_strict_existing_match (
    candidate_key,
    verified_cache_key,
    verified_source_url,
    verified_source_authority,
    alias_text,
    source_cache_keys
  )
  SELECT
    candidate_key,
    cache_key,
    source_url,
    source_authority,
    alias_text,
    source_cache_keys
  FROM selected
  JOIN alias_counts
    ON alias_counts.normalized_alias =
      public.normalize_verified_product_search_query(selected.alias_text)
   AND alias_counts.candidate_count = 1;

  GET DIAGNOSTICS v_candidates = ROW_COUNT;

  UPDATE public.product_data source_row
  SET
    catalog_exclusion_reason = 'exact_alias_of_verified_formula',
    formula_version_provenance = source_row.formula_version_provenance ||
      jsonb_build_object(
        'reconciled_as_strict_formula_alias', TRUE,
        'reconciled_at', NOW()
      ),
    updated_at = NOW()
  FROM pg_temp.amazon_strict_existing_match match
  WHERE source_row.cache_key = ANY(match.source_cache_keys)
    AND source_row.catalog_exclusion_reason IS NULL;

  GET DIAGNOSTICS v_alias_rows = ROW_COUNT;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    updated_at
  )
  SELECT
    match.verified_cache_key,
    match.alias_text,
    public.normalize_verified_product_search_query(match.alias_text),
    match.verified_source_url,
    match.verified_source_authority,
    NOW(),
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'resolution', 'legacy_amazon_alias_to_strict_existing_formula',
      'candidate_key', match.candidate_key,
      'amazon_claimed_as_evidence', FALSE,
      'matched_on', ARRAY[
        'consumer_brand', 'species', 'ingredient_version',
        'protein_recipe_terms', 'food_form', 'life_stage',
        'protected_product_line'
      ]::TEXT[]
    ),
    TRUE,
    NOW()
  FROM pg_temp.amazon_strict_existing_match match
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = NOW();

  UPDATE public.catalog_amazon_evidence_queue queue
  SET
    status = 'verified',
    evidence = queue.evidence || jsonb_build_object(
      'resolution', 'strict_existing_formula_alias',
      'amazon_claimed_as_evidence', FALSE,
      'resolved_at', NOW(),
      'verified_cache_key', match.verified_cache_key
    ),
    updated_at = NOW()
  FROM pg_temp.amazon_strict_existing_match match
  WHERE queue.candidate_key = match.candidate_key;

  RETURN jsonb_build_object(
    'resolved_candidates', v_candidates,
    'excluded_legacy_alias_rows', v_alias_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_catalog_amazon_strict_existing_evidence()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_catalog_amazon_strict_existing_evidence()
  TO service_role;

SELECT public.reconcile_catalog_amazon_strict_existing_evidence();
