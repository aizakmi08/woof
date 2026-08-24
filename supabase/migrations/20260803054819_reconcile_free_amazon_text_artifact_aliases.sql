-- Resolve legacy Amazon discovery aliases whose exact formula identity and
-- ordered ingredient tokens match one verified retailer formula. Amazon is
-- not claimed as ingredient evidence; the verified Target package version
-- remains the serving source. Ambiguous candidates are intentionally omitted.

DO $$
DECLARE
  v_alias_rows INTEGER := 0;
  v_candidates INTEGER := 0;
BEGIN
  CREATE TEMP TABLE pg_temp.amazon_text_artifact_match (
    candidate_key TEXT PRIMARY KEY,
    verified_cache_key TEXT NOT NULL,
    alias_text TEXT NOT NULL,
    verified_source_url TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO pg_temp.amazon_text_artifact_match (
    candidate_key,
    verified_cache_key,
    alias_text,
    verified_source_url
  )
  VALUES
    (
      '7af8735d32fe5c9d2db6fc13a6c3cd0f73f3877f028e7acef5db839250639a03',
      'census:30b6faf418cd6681fd85418df3a6a234',
      'Blue Buffalo Life Protection Formula Healthy Weight Adult Dry Dog Food, Supports an Ideal Weight, Made with Natural Ingredients, Chicken & Brown Rice Recipe, 30-lb Bag',
      'https://www.target.com/p/-/A-53261928'
    );

  UPDATE public.product_data source_row
  SET
    catalog_exclusion_reason = 'exact_alias_of_verified_formula',
    formula_version_provenance = source_row.formula_version_provenance ||
      jsonb_build_object(
        'reconciled_as_text_artifact_alias', TRUE,
        'amazon_claimed_as_evidence', FALSE,
        'verified_serving_source', match.verified_source_url,
        'reconciled_at', NOW()
      ),
    updated_at = NOW()
  FROM pg_temp.amazon_text_artifact_match match
  JOIN public.catalog_amazon_evidence_queue queue
    ON queue.candidate_key = match.candidate_key
  WHERE source_row.cache_key = ANY(queue.source_cache_keys)
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
    'retailer_verified',
    NOW(),
    jsonb_build_object(
      'exact_formula_identity', TRUE,
      'resolution', 'legacy_amazon_text_artifact_alias_to_verified_retailer_formula',
      'candidate_key', match.candidate_key,
      'amazon_claimed_as_evidence', FALSE,
      'matched_on', ARRAY[
        'consumer_brand', 'species', 'recipe', 'food_form',
        'life_stage', 'protected_product_line',
        'ordered_ingredient_tokens_after_html_artifact_cleanup'
      ]::TEXT[]
    ),
    TRUE,
    NOW()
  FROM pg_temp.amazon_text_artifact_match match
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE
  SET
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
    conflict_reason = NULL,
    evidence = queue.evidence || jsonb_build_object(
      'resolution', 'text_artifact_existing_formula_alias',
      'amazon_claimed_as_evidence', FALSE,
      'resolved_at', NOW(),
      'verified_cache_key', match.verified_cache_key,
      'verified_source_url', match.verified_source_url
    ),
    updated_at = NOW()
  FROM pg_temp.amazon_text_artifact_match match
  WHERE queue.candidate_key = match.candidate_key;

  GET DIAGNOSTICS v_candidates = ROW_COUNT;

  IF v_candidates <> 1 OR v_alias_rows <> 2 THEN
    RAISE EXCEPTION
      'Unexpected Amazon artifact reconciliation counts: candidates %, alias rows %',
      v_candidates,
      v_alias_rows;
  END IF;
END;
$$;
