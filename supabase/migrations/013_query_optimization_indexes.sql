-- 013: Query optimization indexes
--
-- The hot lookup paths are:
--   1. analysis_cache: WHERE cache_key = ? AND expires_at > NOW()      (every scan/search)
--   2. product_data:   WHERE cache_key = ? AND expires_at > NOW()      (every scan/search)
--   3. product_data:   WHERE product_name ILIKE ? AND ingredient_count >= 5 ORDER BY ingredient_count DESC  (search bar, fuzzy matcher)
--
-- Existing single-column indexes force a recheck of expires_at after the index scan.
-- These compound indexes let Postgres satisfy the filter + sort entirely from the index,
-- which is meaningfully faster once the tables grow past a few thousand rows.

-- ── analysis_cache: covering index for the "live, unexpired" lookup ──
-- cache_key already has a unique constraint (PK), so this adds the expires_at filter.
CREATE INDEX IF NOT EXISTS idx_analysis_cache_key_expires
  ON public.analysis_cache (cache_key, expires_at DESC);

-- ── product_data: covering index for live-row lookup ──
CREATE INDEX IF NOT EXISTS idx_product_data_key_expires
  ON public.product_data (cache_key, expires_at DESC);

-- ── product_data: index for the fuzzy product-name search used by the search bar ──
-- Uses pg_trgm (already enabled in many Supabase projects) when available so ILIKE is fast.
-- Falls back gracefully if the extension isn't installed.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_product_data_name_trgm
             ON public.product_data USING gin (product_name gin_trgm_ops)';
  ELSE
    -- Plain B-tree on lower(product_name) — helps prefix matches but not arbitrary ILIKE.
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_product_data_name_lower
             ON public.product_data (LOWER(product_name))';
  END IF;
END$$;

-- ── product_data: covering index for the search-bar query specifically ──
-- The search bar filters by ingredient_count >= 5 and orders by ingredient_count DESC.
CREATE INDEX IF NOT EXISTS idx_product_data_ingredient_count
  ON public.product_data (ingredient_count DESC)
  WHERE ingredient_count >= 5;

-- ── scan_history: improve the "most recent N for this user" query ──
-- Existing (user_id, date_scanned DESC) is good, but adding cache_key here lets us
-- de-duplicate history entries by product without a separate query.
CREATE INDEX IF NOT EXISTS idx_scan_history_user_cachekey
  ON public.scan_history (user_id, cache_key, date_scanned DESC);

-- Touch updated_at columns so Supabase notices the schema change in dashboards.
ANALYZE public.analysis_cache;
ANALYZE public.product_data;
ANALYZE public.scan_history;
