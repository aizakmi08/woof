-- Server-side scan entitlement enforcement.
-- Idempotent per user + scan_id so the app and Edge Function can both call
-- this without double-counting the same scan attempt.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.scan_usage_events (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL,
  scan_mode TEXT NOT NULL DEFAULT 'unknown',
  allowed BOOLEAN NOT NULL,
  counted BOOLEAN NOT NULL DEFAULT false,
  reason TEXT NOT NULL,
  scan_count_after INTEGER NOT NULL DEFAULT 0,
  free_limit INTEGER NOT NULL DEFAULT 3,
  is_pro_at_time BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  PRIMARY KEY (user_id, scan_id)
);

CREATE INDEX IF NOT EXISTS idx_scan_usage_events_user_created
  ON public.scan_usage_events (user_id, created_at DESC);

ALTER TABLE public.scan_usage_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.scan_usage_events FROM PUBLIC;
REVOKE ALL ON TABLE public.scan_usage_events FROM anon;
REVOKE ALL ON TABLE public.scan_usage_events FROM authenticated;
GRANT SELECT ON TABLE public.scan_usage_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_usage_events TO service_role;

DROP POLICY IF EXISTS "Users read own scan usage" ON public.scan_usage_events;
CREATE POLICY "Users read own scan usage" ON public.scan_usage_events
  FOR SELECT USING (auth.uid() = user_id);

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
  v_free_limit := GREATEST(COALESCE(p_free_limit, 3), 0);

  SELECT *
  INTO v_existing
  FROM public.scan_usage_events
  WHERE user_id = v_user_id
    AND scan_id = v_scan_id;

  IF FOUND THEN
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
