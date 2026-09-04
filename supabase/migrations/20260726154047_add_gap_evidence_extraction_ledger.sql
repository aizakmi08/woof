-- Private, source-versioned evidence extraction ledger for independently
-- observed catalog gaps. Extracted pages remain non-serving until a separate
-- exact-formula promotion succeeds.

CREATE TABLE IF NOT EXISTS public.catalog_gap_evidence_extraction_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE
    CHECK (NULLIF(btrim(run_key), '') IS NOT NULL),
  source_search_run_key TEXT,
  source_snapshot TEXT NOT NULL
    CHECK (NULLIF(btrim(source_snapshot), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (
      status IN (
        'queued',
        'running',
        'completed',
        'completed_with_errors',
        'cancelled'
      )
    ),
  total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
  completed_jobs INTEGER NOT NULL DEFAULT 0 CHECK (completed_jobs >= 0),
  ready_for_promotion_count INTEGER NOT NULL DEFAULT 0
    CHECK (ready_for_promotion_count >= 0),
  quarantined_count INTEGER NOT NULL DEFAULT 0
    CHECK (quarantined_count >= 0),
  fetch_blocked_count INTEGER NOT NULL DEFAULT 0
    CHECK (fetch_blocked_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  configuration JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(configuration) = 'object'),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.catalog_gap_evidence_extractions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL
    REFERENCES public.catalog_gap_evidence_extraction_runs(id) ON DELETE CASCADE,
  extraction_key TEXT NOT NULL
    CHECK (NULLIF(btrim(extraction_key), '') IS NOT NULL),
  formula_key TEXT NOT NULL
    CHECK (NULLIF(btrim(formula_key), '') IS NOT NULL),
  source_candidate_url TEXT NOT NULL
    CHECK (NULLIF(btrim(source_candidate_url), '') IS NOT NULL),
  canonical_source_url TEXT NOT NULL
    CHECK (NULLIF(btrim(canonical_source_url), '') IS NOT NULL),
  source_domain TEXT NOT NULL DEFAULT '',
  source_authority TEXT NOT NULL DEFAULT 'unknown'
    CHECK (
      source_authority IN (
        'manufacturer',
        'retailer',
        'marketplace',
        'unknown'
      )
    ),
  package_identifier_type TEXT,
  package_identifier TEXT,
  expected_identity JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(expected_identity) = 'object'),
  extracted_identity JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(extracted_identity) = 'object'),
  identity_match_status TEXT NOT NULL DEFAULT 'not_evaluated'
    CHECK (
      identity_match_status IN (
        'not_evaluated',
        'exact_gtin',
        'exact_identity',
        'ambiguous',
        'conflict'
      )
    ),
  identity_score NUMERIC(6,5) NOT NULL DEFAULT 0
    CHECK (identity_score >= 0 AND identity_score <= 1),
  ingredient_text TEXT,
  ingredient_hash TEXT
    CHECK (ingredient_hash IS NULL OR ingredient_hash ~ '^[a-f0-9]{64}$'),
  front_image_url TEXT,
  source_content_hash TEXT
    CHECK (
      source_content_hash IS NULL
      OR source_content_hash ~ '^[a-f0-9]{64}$'
    ),
  formula_evidence_tier_candidate TEXT NOT NULL DEFAULT 'unverified'
    CHECK (
      formula_evidence_tier_candidate IN (
        'manufacturer_current_exact',
        'retailer_web_version',
        'web_label_version',
        'conflicted',
        'unverified'
      )
    ),
  extraction_status TEXT NOT NULL
    CHECK (
      extraction_status IN (
        'ready_for_promotion',
        'manual_review_required',
        'missing_evidence',
        'quarantined',
        'fetch_blocked',
        'terminal_error'
      )
    ),
  validation_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(evidence) = 'object'),
  observed_at TIMESTAMPTZ NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_formula_id BIGINT
    REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, extraction_key)
);

CREATE INDEX IF NOT EXISTS catalog_gap_evidence_runs_status_idx
  ON public.catalog_gap_evidence_extraction_runs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS catalog_gap_evidence_results_review_idx
  ON public.catalog_gap_evidence_extractions (
    extraction_status,
    source_authority,
    identity_score DESC
  );

CREATE INDEX IF NOT EXISTS catalog_gap_evidence_results_formula_idx
  ON public.catalog_gap_evidence_extractions (formula_key, extracted_at DESC);

CREATE INDEX IF NOT EXISTS catalog_gap_evidence_results_identifier_idx
  ON public.catalog_gap_evidence_extractions (
    package_identifier_type,
    package_identifier
  )
  WHERE package_identifier IS NOT NULL;

ALTER TABLE public.catalog_gap_evidence_extraction_runs
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_gap_evidence_extractions
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_gap_evidence_extraction_runs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_gap_evidence_extractions
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_gap_evidence_extraction_runs_id_seq
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_gap_evidence_extractions_id_seq
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_gap_evidence_extraction_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_gap_evidence_extractions TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_gap_evidence_extraction_runs_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_gap_evidence_extractions_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.record_catalog_gap_evidence_extraction_batch(
  p_run JSONB,
  p_results JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id BIGINT;
  v_result_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_run, '{}'::JSONB)) <> 'object'
    OR jsonb_typeof(COALESCE(p_results, '[]'::JSONB)) <> 'array'
    OR NULLIF(btrim(p_run->>'run_key'), '') IS NULL
  THEN
    RAISE EXCEPTION 'Invalid gap evidence extraction payload';
  END IF;

  INSERT INTO public.catalog_gap_evidence_extraction_runs (
    run_key,
    source_search_run_key,
    source_snapshot,
    status,
    total_jobs,
    completed_jobs,
    ready_for_promotion_count,
    quarantined_count,
    fetch_blocked_count,
    error_count,
    configuration,
    started_at,
    completed_at,
    updated_at
  )
  VALUES (
    p_run->>'run_key',
    NULLIF(btrim(p_run->>'source_search_run_key'), ''),
    p_run->>'source_snapshot',
    COALESCE(NULLIF(p_run->>'status', ''), 'running'),
    COALESCE((p_run->>'total_jobs')::INTEGER, 0),
    COALESCE((p_run->>'completed_jobs')::INTEGER, 0),
    COALESCE((p_run->>'ready_for_promotion_count')::INTEGER, 0),
    COALESCE((p_run->>'quarantined_count')::INTEGER, 0),
    COALESCE((p_run->>'fetch_blocked_count')::INTEGER, 0),
    COALESCE((p_run->>'error_count')::INTEGER, 0),
    COALESCE(p_run->'configuration', '{}'::JSONB),
    NULLIF(p_run->>'started_at', '')::TIMESTAMPTZ,
    NULLIF(p_run->>'completed_at', '')::TIMESTAMPTZ,
    NOW()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    status = EXCLUDED.status,
    total_jobs = EXCLUDED.total_jobs,
    completed_jobs = EXCLUDED.completed_jobs,
    ready_for_promotion_count = EXCLUDED.ready_for_promotion_count,
    quarantined_count = EXCLUDED.quarantined_count,
    fetch_blocked_count = EXCLUDED.fetch_blocked_count,
    error_count = EXCLUDED.error_count,
    configuration = EXCLUDED.configuration,
    started_at = COALESCE(
      public.catalog_gap_evidence_extraction_runs.started_at,
      EXCLUDED.started_at
    ),
    completed_at = EXCLUDED.completed_at,
    updated_at = NOW()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_gap_evidence_extractions (
    run_id,
    extraction_key,
    formula_key,
    source_candidate_url,
    canonical_source_url,
    source_domain,
    source_authority,
    package_identifier_type,
    package_identifier,
    expected_identity,
    extracted_identity,
    identity_match_status,
    identity_score,
    ingredient_text,
    ingredient_hash,
    front_image_url,
    source_content_hash,
    formula_evidence_tier_candidate,
    extraction_status,
    validation_reasons,
    evidence,
    observed_at,
    extracted_at,
    updated_at
  )
  SELECT
    v_run_id,
    row->>'extraction_key',
    row->>'formula_key',
    row->>'source_candidate_url',
    row->>'canonical_source_url',
    COALESCE(row->>'source_domain', ''),
    COALESCE(row->>'source_authority', 'unknown'),
    NULLIF(btrim(row->>'package_identifier_type'), ''),
    NULLIF(btrim(row->>'package_identifier'), ''),
    COALESCE(row->'expected_identity', '{}'::JSONB),
    COALESCE(row->'extracted_identity', '{}'::JSONB),
    COALESCE(row->>'identity_match_status', 'not_evaluated'),
    COALESCE((row->>'identity_score')::NUMERIC, 0),
    NULLIF(row->>'ingredient_text', ''),
    NULLIF(row->>'ingredient_hash', ''),
    NULLIF(row->>'front_image_url', ''),
    NULLIF(row->>'source_content_hash', ''),
    COALESCE(row->>'formula_evidence_tier_candidate', 'unverified'),
    row->>'extraction_status',
    COALESCE(
      ARRAY(
        SELECT jsonb_array_elements_text(
          COALESCE(row->'validation_reasons', '[]'::JSONB)
        )
      ),
      ARRAY[]::TEXT[]
    ),
    COALESCE(row->'evidence', '{}'::JSONB),
    (row->>'observed_at')::TIMESTAMPTZ,
    COALESCE(NULLIF(row->>'extracted_at', '')::TIMESTAMPTZ, NOW()),
    NOW()
  FROM jsonb_array_elements(COALESCE(p_results, '[]'::JSONB))
    AS source(row)
  ON CONFLICT (run_id, extraction_key) DO UPDATE SET
    extracted_identity = EXCLUDED.extracted_identity,
    identity_match_status = EXCLUDED.identity_match_status,
    identity_score = EXCLUDED.identity_score,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_hash = EXCLUDED.ingredient_hash,
    front_image_url = EXCLUDED.front_image_url,
    source_content_hash = EXCLUDED.source_content_hash,
    formula_evidence_tier_candidate =
      EXCLUDED.formula_evidence_tier_candidate,
    extraction_status = EXCLUDED.extraction_status,
    validation_reasons = EXCLUDED.validation_reasons,
    evidence = EXCLUDED.evidence,
    observed_at = EXCLUDED.observed_at,
    extracted_at = EXCLUDED.extracted_at,
    updated_at = NOW();

  GET DIAGNOSTICS v_result_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'recorded_results', v_result_count
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.record_catalog_gap_evidence_extraction_batch(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.record_catalog_gap_evidence_extraction_batch(JSONB, JSONB)
  TO service_role;

COMMENT ON TABLE public.catalog_gap_evidence_extractions IS
  'Private source-version evidence. ready_for_promotion is not serving state and never writes product_data.';
