-- Schedule cache/rate-limit cleanup jobs with Supabase Cron.
-- Supabase Cron is backed by pg_cron and stores jobs in the cron schema.

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.cleanup_expired_cache()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.analysis_cache
  WHERE expires_at < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE LOG '[CLEANUP] Deleted % expired cache entries', deleted_count;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_stale_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < NOW() - INTERVAL '24 hours';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE LOG '[CLEANUP] Deleted % stale rate limit rows', deleted_count;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_cache() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_expired_cache() FROM authenticated;
REVOKE ALL ON FUNCTION public.cleanup_stale_rate_limits() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_stale_rate_limits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rate_limits() TO service_role;

SELECT cron.schedule(
  'cleanup-expired-cache',
  '0 3 * * *',
  $$SELECT public.cleanup_expired_cache();$$
);

SELECT cron.schedule(
  'cleanup-stale-rate-limits',
  '15 3 * * *',
  $$SELECT public.cleanup_stale_rate_limits();$$
);
