-- Allow authenticated clients to increment shared cache hit counters without
-- granting broad update access to the shared analysis_cache table.
CREATE OR REPLACE FUNCTION public.increment_cache_hit(p_key TEXT)
RETURNS void
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.analysis_cache
  SET hit_count = hit_count + 1,
      last_hit_at = NOW()
  WHERE cache_key = p_key;
$$;

GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT) TO authenticated;
