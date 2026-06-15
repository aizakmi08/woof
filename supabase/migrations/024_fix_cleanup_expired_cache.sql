-- 024: Fix expired cache cleanup row-count handling
--
-- The original function attempted to DELETE ... RETURNING into a scalar before
-- reading ROW_COUNT, which fails whenever more than one expired cache row is
-- removed. Keep the operational privileges from the hardening migration while
-- replacing the function body with a multi-row safe implementation.

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

REVOKE ALL ON FUNCTION public.cleanup_expired_cache()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache()
  TO service_role;
