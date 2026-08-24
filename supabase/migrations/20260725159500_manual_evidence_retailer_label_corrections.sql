-- Extend the private exact-evidence ledger for retailer-owned private-label
-- evidence and preserve every bounded package-label correction.

ALTER TABLE public.catalog_manual_evidence_reviews
  DROP CONSTRAINT IF EXISTS catalog_manual_evidence_reviews_authoritative_source_type_check;

ALTER TABLE public.catalog_manual_evidence_reviews
  ADD CONSTRAINT catalog_manual_evidence_reviews_authoritative_source_type_check
  CHECK (
    authoritative_source_type IS NULL
    OR authoritative_source_type IN (
      'manufacturer_page',
      'manufacturer_pdf',
      'manufacturer_label',
      'retailer_page',
      'retailer_label'
    )
  );

ALTER TABLE public.catalog_manual_evidence_reviews
  ADD COLUMN IF NOT EXISTS ingredient_evidence_url TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_evidence_mode TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_original_text_hash TEXT,
  ADD COLUMN IF NOT EXISTS ingredient_corrections JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE public.catalog_manual_evidence_reviews
  DROP CONSTRAINT IF EXISTS catalog_manual_evidence_reviews_ingredient_evidence_mode_check;

ALTER TABLE public.catalog_manual_evidence_reviews
  ADD CONSTRAINT catalog_manual_evidence_reviews_ingredient_evidence_mode_check
  CHECK (
    ingredient_evidence_mode IS NULL
    OR ingredient_evidence_mode IN (
      'source_text_exact',
      'bounded_source_text_correction',
      'authoritative_label_transcription'
    )
  );

ALTER TABLE public.catalog_manual_evidence_reviews
  DROP CONSTRAINT IF EXISTS catalog_manual_evidence_reviews_ingredient_corrections_check;

ALTER TABLE public.catalog_manual_evidence_reviews
  ADD CONSTRAINT catalog_manual_evidence_reviews_ingredient_corrections_check
  CHECK (jsonb_typeof(ingredient_corrections) = 'array');

COMMENT ON TABLE public.catalog_manual_evidence_reviews IS
  'Private exact-evidence acquisition ledger. Search leads never count as evidence. Candidate verification requires an exact authoritative manufacturer source, or an exact retailer-owned private-label page/package label. Any reviewed ingredient correction is bounded and recorded character-for-character.';

COMMENT ON COLUMN public.catalog_manual_evidence_reviews.ingredient_evidence_url IS
  'Exact authoritative page or package-label image used to verify the ingredient statement.';

COMMENT ON COLUMN public.catalog_manual_evidence_reviews.ingredient_evidence_mode IS
  'Whether ingredients were exact source text, a bounded token-preserving correction, or a human-reviewed transcription of the exact authoritative package label.';

COMMENT ON COLUMN public.catalog_manual_evidence_reviews.ingredient_original_text_hash IS
  'SHA-256 of the uncorrected source-published ingredient text.';

COMMENT ON COLUMN public.catalog_manual_evidence_reviews.ingredient_corrections IS
  'Ordered character-level corrections reproduced against authoritative package-label evidence; never sibling-derived ingredient changes.';
