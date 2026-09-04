-- Prevent a reversed failed scan_id from becoming a reusable free entitlement.
-- Reusing a reversed scan_id is treated as a fresh attempt: it must pass the
-- current Pro/free-limit check and, for free users, consumes a scan again.
-- Authenticated clients can call this RPC for barcode cache hits, so only
-- service_role callers may override the configured free-scan limit.

CREATE OR REPLACE FUNCTION public.consume_scan(
  p_user_id UUID DEFAULT NULL,
  p_scan_id TEXT DEFAULT NULL,
  p_scan_mode TEXT DEFAULT 'unknown',
  p_free_limit INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_scan_id TEXT;
  v_scan_mode TEXT;
  v_free_limit INTEGER;
  v_scan_count INTEGER;
  v_is_pro BOOLEAN;
  v_pro_expires_at TIMESTAMPTZ;
  v_existing public.scan_usage_events%ROWTYPE;
  v_has_existing BOOLEAN := false;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'scan_count', 0,
      'remaining', 0,
      'is_pro', false,
      'scan_id', p_scan_id,
      'counted', false
    );
  END IF;

  v_scan_id := COALESCE(NULLIF(TRIM(p_scan_id), ''), extensions.gen_random_uuid()::TEXT);
  v_scan_mode := COALESCE(NULLIF(TRIM(p_scan_mode), ''), 'unknown');

  IF auth.role() = 'service_role' THEN
    v_free_limit := GREATEST(COALESCE(p_free_limit, 3), 0);
  ELSE
    v_free_limit := 3;
  END IF;

  SELECT *
  INTO v_existing
  FROM public.scan_usage_events
  WHERE user_id = v_user_id
    AND scan_id = v_scan_id
  FOR UPDATE;

  v_has_existing := FOUND;

  IF v_has_existing AND NOT COALESCE(v_existing.reversed, false) THEN
    RETURN jsonb_build_object(
      'allowed', v_existing.allowed,
      'reason', v_existing.reason,
      'scan_count', v_existing.scan_count_after,
      'remaining', GREATEST(v_existing.free_limit - v_existing.scan_count_after, 0),
      'is_pro', v_existing.is_pro_at_time,
      'scan_id', v_existing.scan_id,
      'counted', v_existing.counted
    );
  END IF;

  INSERT INTO public.profiles (id, scan_count, is_pro)
  VALUES (v_user_id, 0, false)
  ON CONFLICT (id) DO NOTHING;

  SELECT
    COALESCE(scan_count, 0),
    COALESCE(is_pro, false),
    pro_expires_at
  INTO v_scan_count, v_is_pro, v_pro_expires_at
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  v_is_pro := v_is_pro AND (v_pro_expires_at IS NULL OR v_pro_expires_at > now());

  IF v_is_pro THEN
    IF v_has_existing THEN
      UPDATE public.scan_usage_events
      SET scan_mode = v_scan_mode,
          allowed = true,
          counted = false,
          reason = 'pro',
          scan_count_after = v_scan_count,
          free_limit = v_free_limit,
          is_pro_at_time = true,
          reversed = false,
          reversed_at = NULL,
          reversal_reason = NULL
      WHERE user_id = v_user_id
        AND scan_id = v_scan_id;
    ELSE
      INSERT INTO public.scan_usage_events (
        user_id,
        scan_id,
        scan_mode,
        allowed,
        counted,
        reason,
        scan_count_after,
        free_limit,
        is_pro_at_time
      )
      VALUES (
        v_user_id,
        v_scan_id,
        v_scan_mode,
        true,
        false,
        'pro',
        v_scan_count,
        v_free_limit,
        true
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', true,
      'reason', 'pro',
      'scan_count', v_scan_count,
      'remaining', NULL,
      'is_pro', true,
      'scan_id', v_scan_id,
      'counted', false
    );
  END IF;

  IF v_scan_count >= v_free_limit THEN
    IF v_has_existing THEN
      UPDATE public.scan_usage_events
      SET scan_mode = v_scan_mode,
          allowed = false,
          counted = false,
          reason = 'free_limit_reached',
          scan_count_after = v_scan_count,
          free_limit = v_free_limit,
          is_pro_at_time = false,
          reversed = false,
          reversed_at = NULL,
          reversal_reason = NULL
      WHERE user_id = v_user_id
        AND scan_id = v_scan_id;
    ELSE
      INSERT INTO public.scan_usage_events (
        user_id,
        scan_id,
        scan_mode,
        allowed,
        counted,
        reason,
        scan_count_after,
        free_limit,
        is_pro_at_time
      )
      VALUES (
        v_user_id,
        v_scan_id,
        v_scan_mode,
        false,
        false,
        'free_limit_reached',
        v_scan_count,
        v_free_limit,
        false
      );
    END IF;

    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'free_limit_reached',
      'scan_count', v_scan_count,
      'remaining', 0,
      'is_pro', false,
      'scan_id', v_scan_id,
      'counted', false
    );
  END IF;

  v_scan_count := v_scan_count + 1;

  UPDATE public.profiles
  SET scan_count = v_scan_count,
      updated_at = now()
  WHERE id = v_user_id;

  IF v_has_existing THEN
    UPDATE public.scan_usage_events
    SET scan_mode = v_scan_mode,
        allowed = true,
        counted = true,
        reason = 'free_scan_consumed',
        scan_count_after = v_scan_count,
        free_limit = v_free_limit,
        is_pro_at_time = false,
        reversed = false,
        reversed_at = NULL,
        reversal_reason = NULL
    WHERE user_id = v_user_id
      AND scan_id = v_scan_id;
  ELSE
    INSERT INTO public.scan_usage_events (
      user_id,
      scan_id,
      scan_mode,
      allowed,
      counted,
      reason,
      scan_count_after,
      free_limit,
      is_pro_at_time
    )
    VALUES (
      v_user_id,
      v_scan_id,
      v_scan_mode,
      true,
      true,
      'free_scan_consumed',
      v_scan_count,
      v_free_limit,
      false
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', 'free_scan_consumed',
    'scan_count', v_scan_count,
    'remaining', GREATEST(v_free_limit - v_scan_count, 0),
    'is_pro', false,
    'scan_id', v_scan_id,
    'counted', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO service_role;
