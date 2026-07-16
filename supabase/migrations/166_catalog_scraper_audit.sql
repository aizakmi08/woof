CREATE TABLE IF NOT EXISTS public.catalog_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  mode TEXT NOT NULL,
  source TEXT,
  source_quality TEXT,
  coverage_tier TEXT,
  target_url TEXT,
  extractor_version TEXT,
  import_key TEXT,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  total_candidates INTEGER NOT NULL DEFAULT 0,
  accepted_candidates INTEGER NOT NULL DEFAULT 0,
  rejected_candidates INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  verified_ready_rows INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  CONSTRAINT catalog_import_runs_status_check
    CHECK (status IN ('planned', 'running', 'succeeded', 'failed', 'dry_run')),
  CONSTRAINT catalog_import_runs_counts_check
    CHECK (
      total_candidates >= 0
      AND accepted_candidates >= 0
      AND rejected_candidates >= 0
      AND imported_rows >= 0
      AND verified_ready_rows >= 0
    )
);

ALTER TABLE public.catalog_import_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_catalog_import_runs_source_created
  ON public.catalog_import_runs (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_import_runs_status_created
  ON public.catalog_import_runs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.catalog_product_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  run_id UUID REFERENCES public.catalog_import_runs(id) ON DELETE SET NULL,
  cache_key TEXT NOT NULL,
  gtin TEXT,
  product_name TEXT NOT NULL,
  brand TEXT,
  pet_type TEXT,
  source TEXT,
  source_quality TEXT,
  source_url TEXT,
  ingredient_source_url TEXT,
  image_source_url TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  raw_source_hash TEXT,
  content_hash TEXT,
  extractor_version TEXT,
  review_state TEXT NOT NULL DEFAULT 'candidate',
  rejection_reason TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT catalog_product_evidence_pet_type_check
    CHECK (pet_type IS NULL OR pet_type IN ('dog', 'cat', 'unknown')),
  CONSTRAINT catalog_product_evidence_review_state_check
    CHECK (review_state IN ('candidate', 'manual_review', 'rejected', 'promoted'))
);

ALTER TABLE public.catalog_product_evidence ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_catalog_product_evidence_cache_key
  ON public.catalog_product_evidence (cache_key);

CREATE INDEX IF NOT EXISTS idx_catalog_product_evidence_run_id
  ON public.catalog_product_evidence (run_id);

CREATE INDEX IF NOT EXISTS idx_catalog_product_evidence_source_created
  ON public.catalog_product_evidence (source, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_catalog_product_evidence_review_state
  ON public.catalog_product_evidence (review_state, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_product_evidence_content_unique
  ON public.catalog_product_evidence (cache_key, source, content_hash)
  WHERE content_hash IS NOT NULL;

REVOKE ALL ON TABLE public.catalog_import_runs FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_import_runs FROM anon;
REVOKE ALL ON TABLE public.catalog_import_runs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_import_runs TO service_role;

REVOKE ALL ON TABLE public.catalog_product_evidence FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_product_evidence FROM anon;
REVOKE ALL ON TABLE public.catalog_product_evidence FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_product_evidence TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_import_runs'
      AND policyname = 'Service role manages catalog import runs'
  ) THEN
    CREATE POLICY "Service role manages catalog import runs"
      ON public.catalog_import_runs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_product_evidence'
      AND policyname = 'Service role manages catalog product evidence'
  ) THEN
    CREATE POLICY "Service role manages catalog product evidence"
      ON public.catalog_product_evidence
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
