-- 025: Fix get_brand_recall_summary PL/pgSQL ambiguity.
--
-- The function returns an OUT column named "severity". Unqualified references
-- to severity inside RETURN QUERY can resolve as either that OUT variable or
-- brand_recalls.severity, which Supabase DB lint correctly flags as ambiguous.

CREATE OR REPLACE FUNCTION get_brand_recall_summary(p_brand_normalized TEXT)
RETURNS TABLE (
  severity         TEXT,
  recall_count     INT,
  most_recent_date DATE,
  oldest_date      DATE,
  summary          TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH agg AS (
    SELECT
      -- Severity ordering: active > major > minor. Worst one wins.
      CASE
        WHEN COUNT(*) FILTER (WHERE br.severity = 'active') > 0 THEN 'active'
        WHEN COUNT(*) FILTER (WHERE br.severity = 'major')  > 0 THEN 'major'
        ELSE 'minor'
      END                            AS worst_sev,
      COUNT(*)::INT                  AS n,
      MAX(br.recall_date)            AS max_d,
      MIN(br.recall_date)            AS min_d,
      ARRAY_AGG(DISTINCT br.cause) FILTER (WHERE br.cause IS NOT NULL) AS causes
    FROM brand_recalls br
    WHERE br.brand_normalized = p_brand_normalized
  )
  SELECT
    agg.worst_sev,
    agg.n,
    agg.max_d,
    agg.min_d,
    CASE
      WHEN agg.n = 0 THEN NULL
      WHEN agg.n = 1 THEN 'One recall on record (' || COALESCE(TO_CHAR(agg.max_d, 'YYYY'), 'date unknown') ||
                          CASE WHEN ARRAY_LENGTH(agg.causes, 1) > 0
                               THEN ', ' || agg.causes[1]
                               ELSE '' END || ').'
      ELSE agg.n || ' recalls on record between ' ||
           COALESCE(TO_CHAR(agg.min_d, 'YYYY'), 'unknown') || ' and ' ||
           COALESCE(TO_CHAR(agg.max_d, 'YYYY'), 'unknown') ||
           CASE WHEN ARRAY_LENGTH(agg.causes, 1) > 0
                THEN ' (' || ARRAY_TO_STRING(agg.causes[1:3], ', ') || ')'
                ELSE '' END || '.'
    END AS summary
  FROM agg
  WHERE agg.n > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION get_brand_recall_summary(TEXT) TO anon, authenticated, service_role;
