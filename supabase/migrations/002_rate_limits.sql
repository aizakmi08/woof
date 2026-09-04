-- Rate limits table for Edge Function abuse prevention
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS — only accessed by Edge Function via service_role key
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic tier-aware rate limit check + increment.
-- Free users keep the default abuse cap. Active Pro users get a much higher
-- operational safety cap so "unlimited scans" is not accidentally capped at
-- the free-user abuse threshold.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_max_requests INTEGER DEFAULT 20,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
  v_is_pro BOOLEAN := FALSE;
  v_effective_max_requests INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT COALESCE(is_pro, FALSE)
    AND (pro_expires_at IS NULL OR pro_expires_at > NOW())
  INTO v_is_pro
  FROM public.profiles
  WHERE id = p_user_id;

  v_effective_max_requests := CASE
    WHEN COALESCE(v_is_pro, FALSE) THEN GREATEST(p_max_requests, 240)
    ELSE p_max_requests
  END;

  -- Lock the row for atomic read-then-write
  SELECT request_count, window_start
  INTO v_count, v_window_start
  FROM public.rate_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- First request ever from this user
  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (user_id, request_count, window_start)
    VALUES (p_user_id, 1, NOW());
    RETURN TRUE;
  END IF;

  -- Window expired — reset counter
  IF v_window_start < NOW() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE public.rate_limits
    SET request_count = 1, window_start = NOW()
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- Within window and over limit
  IF v_count >= v_effective_max_requests THEN
    RETURN FALSE;
  END IF;

  -- Within window and under limit — increment
  UPDATE public.rate_limits
  SET request_count = v_count + 1
  WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, INTEGER, INTEGER) TO service_role;
