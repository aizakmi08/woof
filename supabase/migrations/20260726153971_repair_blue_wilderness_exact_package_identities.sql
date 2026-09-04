-- Target's exact package fronts and full ingredient statements prove that two
-- legacy PetSmart rows have stale shelf titles. Repair only identity metadata;
-- ingredients stay byte-for-byte on their existing source versions.
DO $$
DECLARE
  v_review_run_id BIGINT;
BEGIN
  SELECT id
  INTO STRICT v_review_run_id
  FROM public.catalog_source_runs
  WHERE run_key =
    'target-blue-buffalo-review-v143:20b4602fc185e8e7bc2ca66e';

  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_review_run_id
      AND observation.source_external_id IN ('87393286', '87393266')
      AND observation.validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
      AND observation.raw_payload->>'reviewed_identity_evidence' <> ''
  ) <> 2 THEN
    RAISE EXCEPTION
      'Blue Wilderness v143 exact identity evidence changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      VALUES
        (
          7496::BIGINT,
          '87393286'::TEXT
        ),
        (
          7991::BIGINT,
          '87393266'::TEXT
        )
    ) mapping(formula_id, source_external_id)
    JOIN public.catalog_formulas formula
      ON formula.id = mapping.formula_id
    JOIN public.catalog_observations observation
      ON observation.run_id = v_review_run_id
     AND observation.source_external_id = mapping.source_external_id
    WHERE public.catalog_normalize_ingredient_evidence(
            formula.ingredient_text
          )
          <> public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          )
  ) THEN
    RAISE EXCEPTION
      'Blue Wilderness v143 identity repair crossed an ingredient version';
  END IF;

  UPDATE public.catalog_formulas formula
  SET
    formula_key = mapping.formula_key,
    identity_hash = encode(
      digest(mapping.formula_key, 'sha256'),
      'hex'
    ),
    product_name = mapping.product_name,
    product_line = mapping.product_line,
    flavor = mapping.flavor,
    protected_terms = ARRAY[
      'Blue Buffalo',
      'Wilderness',
      mapping.flavor,
      'dog',
      'adult',
      'dry'
    ],
    promoted_cache_key = mapping.cache_key,
    promoted_at = COALESCE(formula.promoted_at, now()),
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_repair',
        jsonb_build_object(
          'reason',
            'Exact reviewed Target package front supersedes stale '
            || 'retailer shelf title',
          'target_tcin', mapping.target_tcin,
          'target_source_url',
            'https://www.target.com/p/-/A-' || mapping.target_tcin,
          'ingredient_hash_equality_verified', true,
          'repaired_at', now()
        )
      ),
    updated_at = now()
  FROM (
    VALUES
      (
        7496::BIGINT,
        'blue buffalo|blue buffalo|blue buffalo wilderness adult with chicken dry dog food|dog|adult|dry|chicken|'::TEXT,
        'Blue Buffalo Wilderness Adult with Chicken Dry Dog Food'::TEXT,
        'blue buffalo wilderness adult with chicken dry dog food'::TEXT,
        'chicken'::TEXT,
        'petsmart-retail-catalog:840243148561'::TEXT,
        '87393286'::TEXT
      ),
      (
        7991::BIGINT,
        'blue buffalo|blue buffalo|blue buffalo wilderness adult with duck dry dog food|dog|adult|dry|duck|'::TEXT,
        'Blue Buffalo Wilderness Adult with Duck Dry Dog Food'::TEXT,
        'blue buffalo wilderness adult with duck dry dog food'::TEXT,
        'duck'::TEXT,
        'petsmart-retail-catalog:840243148653'::TEXT,
        '87393266'::TEXT
      )
  ) mapping(
    formula_id,
    formula_key,
    product_name,
    product_line,
    flavor,
    cache_key,
    target_tcin
  )
  WHERE formula.id = mapping.formula_id;

  UPDATE public.product_data serving
  SET
    product_name = mapping.product_name,
    product_line = mapping.product_line,
    flavor = mapping.flavor,
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'identity_repair',
        jsonb_build_object(
          'reason',
            'Exact reviewed Target package front supersedes stale '
            || 'retailer shelf title',
          'target_tcin', mapping.target_tcin,
          'target_source_url',
            'https://www.target.com/p/-/A-' || mapping.target_tcin,
          'ingredient_hash_equality_verified', true,
          'repaired_at', now()
        )
      ),
    updated_at = now()
  FROM (
    VALUES
      (
        'petsmart-retail-catalog:840243148561'::TEXT,
        'Blue Buffalo Wilderness Adult with Chicken Dry Dog Food'::TEXT,
        'blue buffalo wilderness adult with chicken dry dog food'::TEXT,
        'Chicken'::TEXT,
        '87393286'::TEXT
      ),
      (
        'petsmart-retail-catalog:840243148653'::TEXT,
        'Blue Buffalo Wilderness Adult with Duck Dry Dog Food'::TEXT,
        'blue buffalo wilderness adult with duck dry dog food'::TEXT,
        'Duck'::TEXT,
        '87393266'::TEXT
      )
  ) mapping(
    cache_key,
    product_name,
    product_line,
    flavor,
    target_tcin
  )
  WHERE serving.cache_key = mapping.cache_key;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    created_at,
    updated_at
  )
  SELECT
    mapping.cache_key,
    mapping.product_name,
    public.normalize_verified_product_search_query(
      mapping.product_name
    ),
    'https://www.target.com/p/-/A-' || mapping.target_tcin,
    'retailer_verified',
    now(),
    jsonb_build_object(
      'evidence_tier', 'retailer_web_version',
      'target_product_code', 'TCIN ' || mapping.target_tcin,
      'identity_repair', true,
      'ingredient_hash_equality_verified', true
    ),
    true,
    now(),
    now()
  FROM (
    VALUES
      (
        'petsmart-retail-catalog:840243148561'::TEXT,
        'Blue Buffalo Wilderness Adult with Chicken Dry Dog Food'::TEXT,
        '87393286'::TEXT
      ),
      (
        'petsmart-retail-catalog:840243148653'::TEXT,
        'Blue Buffalo Wilderness Adult with Duck Dry Dog Food'::TEXT,
        '87393266'::TEXT
      )
  ) mapping(cache_key, product_name, target_tcin)
  ON CONFLICT (normalized_alias)
    WHERE active
  DO UPDATE SET
    cache_key = excluded.cache_key,
    alias_text = excluded.alias_text,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    active = true,
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE id IN (7496, 7991)
      AND promoted_cache_key IS NOT NULL
      AND formula_version_provenance ? 'identity_repair'
  ) <> 2 THEN
    RAISE EXCEPTION
      'Blue Wilderness exact identity repair did not persist';
  END IF;
END
$$;
