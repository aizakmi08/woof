-- 020: Fix get_brand_profile — PL/pgSQL ambiguity when calling
-- get_brand_recall_summary from inside it (both declare OUT columns named
-- "severity", which the planner can't cleanly disambiguate across the two
-- execution contexts). Inline the recall aggregation instead of delegating.

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
  cand              TEXT;
  meta              brand_metadata%ROWTYPE;
  has_meta          BOOLEAN := FALSE;
  v_recall_sev      TEXT;
  v_recall_n        INT := 0;
  v_recall_max_d    DATE;
  v_recall_min_d    DATE;
  v_recall_causes   TEXT[];
  v_recall_text     TEXT;
  v_recall_matched  TEXT;
BEGIN
  -- 1. First metadata match across candidates.
  FOREACH cand IN ARRAY p_candidates LOOP
    EXIT WHEN cand IS NULL OR cand = '';
    SELECT * INTO meta FROM brand_metadata WHERE brand_normalized = cand LIMIT 1;
    IF FOUND THEN has_meta := TRUE; EXIT; END IF;
  END LOOP;

  -- 2. First recall summary match (independent search — may match a different
  --    candidate than metadata). Aggregation is inlined here to avoid calling
  --    get_brand_recall_summary from within this PL/pgSQL function (nested
  --    call causes an "ambiguous column" planner error on 'severity').
  FOREACH cand IN ARRAY p_candidates LOOP
    EXIT WHEN cand IS NULL OR cand = '';

    SELECT
      CASE
        WHEN COUNT(*) FILTER (WHERE br.severity = 'active') > 0 THEN 'active'
        WHEN COUNT(*) FILTER (WHERE br.severity = 'major')  > 0 THEN 'major'
        WHEN COUNT(*) > 0                                   THEN 'minor'
        ELSE NULL
      END,
      COUNT(*)::INT,
      MAX(br.recall_date),
      MIN(br.recall_date),
      ARRAY_AGG(DISTINCT br.cause) FILTER (WHERE br.cause IS NOT NULL)
    INTO
      v_recall_sev, v_recall_n, v_recall_max_d, v_recall_min_d, v_recall_causes
    FROM brand_recalls br
    WHERE br.brand_normalized = cand;

    IF v_recall_n > 0 THEN
      v_recall_matched := cand;
      -- Build a human-readable summary mirroring the shape from migration 016.
      IF v_recall_n = 1 THEN
        v_recall_text := 'One recall on record (' ||
                         COALESCE(TO_CHAR(v_recall_max_d, 'YYYY'), 'date unknown') ||
                         CASE WHEN ARRAY_LENGTH(v_recall_causes, 1) > 0
                              THEN ', ' || v_recall_causes[1]
                              ELSE '' END || ').';
      ELSE
        v_recall_text := v_recall_n || ' recalls on record between ' ||
                         COALESCE(TO_CHAR(v_recall_min_d, 'YYYY'), 'unknown') || ' and ' ||
                         COALESCE(TO_CHAR(v_recall_max_d, 'YYYY'), 'unknown') ||
                         CASE WHEN ARRAY_LENGTH(v_recall_causes, 1) > 0
                              THEN ' (' || ARRAY_TO_STRING(v_recall_causes[1:3], ', ') || ')'
                              ELSE '' END || '.';
      END IF;
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
    v_recall_sev,
    v_recall_n,
    v_recall_max_d,
    v_recall_text,
    v_recall_matched;
END;
$$;

GRANT EXECUTE ON FUNCTION get_brand_profile(TEXT[]) TO anon, authenticated, service_role;
