-- 005: Cleanup jobs, missing indexes, and maintenance

-- 1. Index on scan_history.cache_key for faster cache lookups by key
CREATE INDEX IF NOT EXISTS idx_scan_history_cache_key
  ON public.scan_history (cache_key);

-- 2. Index on analysis_cache.lookup_type for filtered queries
CREATE INDEX IF NOT EXISTS idx_cache_lookup_type
  ON public.analysis_cache (lookup_type);

-- 3. Cleanup function: delete expired cache entries
--    Run this periodically via pg_cron or a scheduled Edge Function.
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM analysis_cache
  WHERE expires_at < NOW()
  RETURNING 1 INTO deleted_count;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE LOG '[CLEANUP] Deleted % expired cache entries', deleted_count;
  RETURN deleted_count;
END;
$$;

-- 4. Cleanup function: reset stale rate limit windows
--    Removes rate_limit rows whose window expired more than 24 hours ago
--    to keep the table lean.
CREATE OR REPLACE FUNCTION cleanup_stale_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE LOG '[CLEANUP] Deleted % stale rate limit rows', deleted_count;
  RETURN deleted_count;
END;
$$;

-- 5. Schedule cleanup via pg_cron (if the extension is enabled).
--    Supabase projects have pg_cron available. Uncomment these after
--    enabling the extension in Dashboard > Database > Extensions.

-- SELECT cron.schedule(
--   'cleanup-expired-cache',
--   '0 3 * * *',  -- daily at 3 AM UTC
--   $$SELECT cleanup_expired_cache()$$
-- );

-- SELECT cron.schedule(
--   'cleanup-stale-rate-limits',
--   '0 4 * * *',  -- daily at 4 AM UTC
--   $$SELECT cleanup_stale_rate_limits()$$
-- );
