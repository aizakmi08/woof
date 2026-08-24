-- Private, resumable discovery ledger for exact catalog gaps.
--
-- Nothing in these tables is serving catalog evidence. Search results and
-- snippets are leads only, are always explicitly unverified, and may never be
-- promoted without a separate exact-evidence review.

CREATE TABLE IF NOT EXISTS public.catalog_gap_search_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE
    CHECK (NULLIF(btrim(run_key), '') IS NOT NULL),
  source_snapshot TEXT NOT NULL
    CHECK (NULLIF(btrim(source_snapshot), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'completed_with_errors', 'cancelled')),
  provider TEXT NOT NULL DEFAULT 'bing_rss',
  total_jobs INTEGER NOT NULL DEFAULT 0 CHECK (total_jobs >= 0),
  completed_jobs INTEGER NOT NULL DEFAULT 0 CHECK (completed_jobs >= 0),
  candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  configuration JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(configuration) = 'object'),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.catalog_gap_search_jobs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL
    REFERENCES public.catalog_gap_search_runs(id) ON DELETE CASCADE,
  formula_key TEXT NOT NULL
    CHECK (NULLIF(btrim(formula_key), '') IS NOT NULL),
  brand TEXT NOT NULL
    CHECK (NULLIF(btrim(brand), '') IS NOT NULL),
  product_name TEXT NOT NULL
    CHECK (NULLIF(btrim(product_name), '') IS NOT NULL),
  formula_identity JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(formula_identity) = 'object'),
  search_query TEXT NOT NULL
    CHECK (NULLIF(btrim(search_query), '') IS NOT NULL),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (
      status IN (
        'queued',
        'searching',
        'completed',
        'no_results',
        'retryable_error',
        'terminal_error'
      )
    ),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
  best_candidate_url TEXT,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, formula_key)
);

CREATE TABLE IF NOT EXISTS public.catalog_gap_search_candidates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id BIGINT NOT NULL
    REFERENCES public.catalog_gap_search_jobs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  result_rank INTEGER NOT NULL CHECK (result_rank > 0),
  result_url TEXT NOT NULL CHECK (NULLIF(btrim(result_url), '') IS NOT NULL),
  canonical_url TEXT NOT NULL CHECK (NULLIF(btrim(canonical_url), '') IS NOT NULL),
  result_domain TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  source_authority_guess TEXT NOT NULL DEFAULT 'unknown'
    CHECK (
      source_authority_guess IN (
        'manufacturer_candidate',
        'retailer_candidate',
        'marketplace_candidate',
        'other_candidate',
        'unknown'
      )
    ),
  identity_score NUMERIC(6,5) NOT NULL DEFAULT 0
    CHECK (identity_score >= 0 AND identity_score <= 1),
  identity_match_reasons JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(identity_match_reasons) = 'array'),
  ingredient_signal BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_status TEXT NOT NULL DEFAULT 'unverified_discovery'
    CHECK (evidence_status IN ('unverified_discovery', 'quarantined')),
  quarantine_reason TEXT,
  discovered_at TIMESTAMPTZ NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_id, canonical_url)
);

CREATE INDEX IF NOT EXISTS catalog_gap_search_runs_status_idx
  ON public.catalog_gap_search_runs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS catalog_gap_search_jobs_status_idx
  ON public.catalog_gap_search_jobs (run_id, status, updated_at);

CREATE INDEX IF NOT EXISTS catalog_gap_search_jobs_brand_idx
  ON public.catalog_gap_search_jobs (lower(brand), status);

CREATE INDEX IF NOT EXISTS catalog_gap_search_candidates_review_idx
  ON public.catalog_gap_search_candidates (
    evidence_status,
    source_authority_guess,
    identity_score DESC
  );

ALTER TABLE public.catalog_gap_search_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_gap_search_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_gap_search_candidates ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_gap_search_runs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_gap_search_jobs
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_gap_search_candidates
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_gap_search_runs_id_seq
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_gap_search_jobs_id_seq
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_gap_search_candidates_id_seq
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_gap_search_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_gap_search_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_gap_search_candidates TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_gap_search_runs_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_gap_search_jobs_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_gap_search_candidates_id_seq TO service_role;

COMMENT ON TABLE public.catalog_gap_search_runs IS
  'Private gap discovery runs. Counts only internet-search attempts and unverified leads.';
COMMENT ON TABLE public.catalog_gap_search_jobs IS
  'One resumable exact-product search job per independent census formula gap.';
COMMENT ON TABLE public.catalog_gap_search_candidates IS
  'Unverified discovery leads only. Search titles/snippets are never ingredient or identity proof.';
