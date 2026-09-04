-- Durable, private provenance for search-led exact manufacturer evidence.
-- Search results are discovery leads only; authoritative evidence and all
-- promotion gates remain mandatory.

CREATE TABLE IF NOT EXISTS public.catalog_manual_evidence_reviews (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_key TEXT NOT NULL UNIQUE CHECK (NULLIF(btrim(review_key), '') IS NOT NULL),
  target_formula_key TEXT NOT NULL CHECK (NULLIF(btrim(target_formula_key), '') IS NOT NULL),
  corrected_formula_key TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL CHECK (NULLIF(btrim(brand), '') IS NOT NULL),
  product_name TEXT NOT NULL CHECK (NULLIF(btrim(product_name), '') IS NOT NULL),
  search_query TEXT NOT NULL CHECK (NULLIF(btrim(search_query), '') IS NOT NULL),
  discovery_urls JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(discovery_urls) = 'array'),
  authoritative_source_url TEXT,
  authoritative_source_type TEXT
    CHECK (
      authoritative_source_type IS NULL
      OR authoritative_source_type IN (
        'manufacturer_page',
        'manufacturer_pdf',
        'manufacturer_label'
      )
    ),
  expected_identity JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(expected_identity) = 'object'),
  resolved_identity JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(resolved_identity) = 'object'),
  evidence_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (
      evidence_status IN (
        'queued',
        'candidate_verified',
        'staged',
        'promoted',
        'quarantined'
      )
    ),
  quarantine_reason TEXT,
  authoritative_content_hash TEXT,
  ingredient_text_hash TEXT,
  front_image_url_hash TEXT,
  observed_at TIMESTAMPTZ,
  formula_id BIGINT REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  promoted_cache_key TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  review_notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_manual_evidence_reviews_status_brand_idx
  ON public.catalog_manual_evidence_reviews (evidence_status, lower(brand), updated_at DESC);

CREATE INDEX IF NOT EXISTS catalog_manual_evidence_reviews_formula_id_idx
  ON public.catalog_manual_evidence_reviews (formula_id)
  WHERE formula_id IS NOT NULL;

ALTER TABLE public.catalog_manual_evidence_reviews ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_manual_evidence_reviews
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.catalog_manual_evidence_reviews_id_seq
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_manual_evidence_reviews TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_manual_evidence_reviews_id_seq TO service_role;

COMMENT ON TABLE public.catalog_manual_evidence_reviews IS
  'Private manual-search acquisition ledger. Search leads never count as evidence; only exact authoritative manufacturer evidence may reach candidate_verified.';
