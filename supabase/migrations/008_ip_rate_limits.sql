-- IP-based rate limiting for anonymous/guest Edge Function requests.
-- The existing rate_limits table is keyed by user_id (UUID FK to auth.users),
-- so it cannot store IP addresses. This table handles guest abuse prevention.

CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_address TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE ip_rate_limits ENABLE ROW LEVEL SECURITY;

-- No user-facing policies — accessed only by Edge Functions via service_role key.

-- Atomic check-and-increment for IP-based rate limiting.
-- Same sliding-window pattern as check_rate_limit but keyed by IP.
CREATE OR REPLACE FUNCTION check_ip_rate_limit(
  p_ip_address TEXT,
  p_max_requests INTEGER DEFAULT 5,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
  v_window TIMESTAMPTZ;
BEGIN
  -- Try to lock the row for this IP
  SELECT request_count, window_start
    INTO v_count, v_window
    FROM ip_rate_limits
   WHERE ip_address = p_ip_address
     FOR UPDATE;

  -- First request from this IP: insert and allow
  IF NOT FOUND THEN
    INSERT INTO ip_rate_limits (ip_address, request_count, window_start)
    VALUES (p_ip_address, 1, NOW());
    RETURN TRUE;
  END IF;

  -- Window expired: reset counter and allow
  IF v_window < NOW() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE ip_rate_limits
       SET request_count = 1,
           window_start = NOW()
     WHERE ip_address = p_ip_address;
    RETURN TRUE;
  END IF;

  -- Within window, at or over limit: deny
  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  -- Within window, under limit: increment and allow
  UPDATE ip_rate_limits
     SET request_count = request_count + 1
   WHERE ip_address = p_ip_address;
  RETURN TRUE;
END;
$$;

-- Cleanup function to remove stale IP entries (call periodically)
CREATE OR REPLACE FUNCTION cleanup_stale_ip_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM ip_rate_limits
   WHERE window_start < NOW() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
