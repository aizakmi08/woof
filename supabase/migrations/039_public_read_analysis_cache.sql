-- Shared pet-food analysis_cache rows are product metadata, not user data.
-- Let guests and signed-in users reuse precomputed scores while preserving
-- service-role-only writes and excluding any accidental non-pet-food cache rows.

DROP POLICY IF EXISTS "Authenticated users can read cache" ON public.analysis_cache;
DROP POLICY IF EXISTS "Anyone can read pet analysis cache" ON public.analysis_cache;

CREATE POLICY "Anyone can read pet analysis cache"
  ON public.analysis_cache FOR SELECT
  TO anon, authenticated
  USING (
    lookup_type IN ('name', 'barcode')
    AND expires_at > NOW()
  );

CREATE OR REPLACE FUNCTION public.increment_cache_hit(p_key TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) < 1 OR length(p_key) > 220 THEN
    RETURN;
  END IF;

  UPDATE public.analysis_cache
     SET hit_count = COALESCE(hit_count, 0) + 1,
         last_hit_at = NOW()
   WHERE cache_key = p_key
     AND lookup_type IN ('name', 'barcode')
     AND expires_at > NOW();
END;
$$;

REVOKE ALL ON FUNCTION public.increment_cache_hit(TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_cache_hit(TEXT)
  TO anon, authenticated;
