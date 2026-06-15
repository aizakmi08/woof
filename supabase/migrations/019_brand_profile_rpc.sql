-- 019: Consolidated brand lookup RPCs — performance + scraper cleanup.
--
-- Two new functions:
--
--   get_brand_profile(p_candidates TEXT[])
--     Returns ONE row combining brand_metadata + recall summary for the first
--     candidate that matches each. Replaces up to 6 round-trips (3 progressive
--     metadata lookups + 3 recall lookups) with a single RPC call.
--
--   get_brands_needing_metadata(p_min_scans INT, p_limit INT)
--     Returns brands in product_data that are NOT yet in brand_metadata,
--     ordered by product count. Used by scripts/scrape-brand-metadata.js to
--     replace a 10k-row client-side filter with a server-side query.

-- ── get_brand_profile ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_brand_profile(p_candidates TEXT[])
RETURNS TABLE (
  -- Metadata fields
  primary_processing       TEXT,
  processing_methods       TEXT[],
  testing_transparency     TEXT,
  testing_details          TEXT,
  certifications           TEXT[],
  third_party_tested       BOOLEAN,
  country_of_manufacture   TEXT,
  metadata_source          TEXT,
  metadata_confidence      NUMERIC,
  matched_metadata_brand   TEXT,
  -- Recall summary fields
  recall_severity          TEXT,
  recall_count             INT,
  recall_most_recent_date  DATE,
  recall_summary           TEXT,
  matched_recall_brand     TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cand                TEXT;
  meta                brand_metadata%ROWTYPE;
  has_meta            BOOLEAN := FALSE;
  recall_sev          TEXT;
  recall_n            INT;
  recall_date         DATE;
  recall_text         TEXT;
  matched_recall_on   TEXT;
  has_recall          BOOLEAN := FALSE;
BEGIN
  -- 1. First matching metadata row across candidates (progressive brand trim).
  FOREACH cand IN ARRAY p_candidates LOOP
    EXIT WHEN cand IS NULL OR cand = '';
    SELECT * INTO meta FROM brand_metadata WHERE brand_normalized = cand LIMIT 1;
    IF FOUND THEN has_meta := TRUE; EXIT; END IF;
  END LOOP;

  -- 2. First matching recall summary across candidates. Independent search —
  --    a brand may have metadata at "Purina Pro Plan" level but recalls only
  --    at "Purina" level, so we don't require the same candidate to win both.
  FOREACH cand IN ARRAY p_candidates LOOP
    EXIT WHEN cand IS NULL OR cand = '';
    SELECT s.severity, s.recall_count, s.most_recent_date, s.summary
      INTO recall_sev, recall_n, recall_date, recall_text
      FROM get_brand_recall_summary(cand) s
      LIMIT 1;
    IF recall_n IS NOT NULL AND recall_n > 0 THEN
      has_recall := TRUE;
      matched_recall_on := cand;
      EXIT;
    END IF;
  END LOOP;

  RETURN QUERY SELECT
    CASE WHEN has_meta THEN meta.primary_processing ELSE NULL END,
    CASE WHEN has_meta THEN meta.processing_methods ELSE NULL END,
    CASE WHEN has_meta THEN meta.testing_transparency ELSE NULL END,
    CASE WHEN has_meta THEN meta.testing_details ELSE NULL END,
    CASE WHEN has_meta THEN meta.certifications ELSE NULL END,
    CASE WHEN has_meta THEN meta.third_party_tested ELSE NULL END,
    CASE WHEN has_meta THEN meta.country_of_manufacture ELSE NULL END,
    CASE WHEN has_meta THEN meta.source ELSE NULL END,
    CASE WHEN has_meta THEN meta.confidence ELSE NULL END,
    CASE WHEN has_meta THEN meta.brand_normalized ELSE NULL END,
    recall_sev,
    recall_n,
    recall_date,
    recall_text,
    matched_recall_on;
END;
$$;

GRANT EXECUTE ON FUNCTION get_brand_profile(TEXT[]) TO anon, authenticated, service_role;

-- ── get_brands_needing_metadata ──────────────────────────────────────

CREATE OR REPLACE FUNCTION get_brands_needing_metadata(p_min_scans INT DEFAULT 1, p_limit INT DEFAULT 50)
RETURNS TABLE (brand TEXT, product_count INT)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pd.brand::TEXT,
    COUNT(*)::INT AS product_count
  FROM product_data pd
  LEFT JOIN brand_metadata bm
    ON bm.brand_normalized = TRIM(
         REGEXP_REPLACE(
           REGEXP_REPLACE(LOWER(pd.brand), '[^a-z0-9\s]', ' ', 'g'),
           '\s+', ' ', 'g'
         )
       )
  WHERE pd.brand IS NOT NULL
    AND pd.brand <> ''
    AND bm.id IS NULL
  GROUP BY pd.brand
  HAVING COUNT(*) >= p_min_scans
  ORDER BY product_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_brands_needing_metadata(INT, INT) TO service_role;
