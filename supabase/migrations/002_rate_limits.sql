-- Rate limits table for Edge Function abuse prevention
CREATE TABLE IF NOT EXISTS rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- No RLS — only accessed by Edge Function via service_role key
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic rate limit check + increment
-- Returns TRUE if the request is allowed, FALSE if rate limited.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_user_id UUID,
  p_max_requests INTEGER DEFAULT 20,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  -- Lock the row for atomic read-then-write
  SELECT request_count, window_start
  INTO v_count, v_window_start
  FROM rate_limits
  WHERE user_id = p_user_id
  FOR UPDATE;

  -- First request ever from this user
  IF NOT FOUND THEN
    INSERT INTO rate_limits (user_id, request_count, window_start)
    VALUES (p_user_id, 1, NOW());
    RETURN TRUE;
  END IF;

  -- Window expired — reset counter
  IF v_window_start < NOW() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE rate_limits
    SET request_count = 1, window_start = NOW()
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  -- Within window and over limit
  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  -- Within window and under limit — increment
  UPDATE rate_limits
  SET request_count = v_count + 1
  WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;
