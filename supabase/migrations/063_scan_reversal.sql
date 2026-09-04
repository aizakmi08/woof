-- Idempotent reversal for free scans consumed before downstream analysis fails.

ALTER TABLE public.scan_usage_events
  ADD COLUMN IF NOT EXISTS reversed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

CREATE OR REPLACE FUNCTION public.reverse_scan(
  p_user_id UUID DEFAULT NULL,
  p_scan_id TEXT DEFAULT NULL,
  p_reversal_reason TEXT DEFAULT 'analysis_failed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_scan_id TEXT;
  v_reversal_reason TEXT;
  v_event public.scan_usage_events%ROWTYPE;
  v_scan_count INTEGER;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'reverse_scan requires service_role';
  END IF;

  v_user_id := p_user_id;
  v_scan_id := NULLIF(TRIM(p_scan_id), '');
  v_reversal_reason := COALESCE(NULLIF(TRIM(p_reversal_reason), ''), 'analysis_failed');

  IF v_user_id IS NULL OR v_scan_id IS NULL THEN
    RETURN jsonb_build_object(
      'reversed', false,
      'reason', 'missing_user_or_scan_id',
      'scan_count', 0,
      'remaining', 0,
      'scan_id', v_scan_id,
      'counted', false
    );
  END IF;

  SELECT *
  INTO v_event
  FROM public.scan_usage_events
  WHERE user_id = v_user_id
    AND scan_id = v_scan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'reversed', false,
      'reason', 'scan_event_not_found',
      'scan_count', 0,
      'remaining', 0,
      'scan_id', v_scan_id,
      'counted', false
    );
  END IF;

  SELECT COALESCE(scan_count, 0)
  INTO v_scan_count
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  v_scan_count := COALESCE(v_scan_count, 0);

  IF v_event.reversed THEN
    RETURN jsonb_build_object(
      'allowed', v_event.allowed,
      'reversed', true,
      'reason', COALESCE(v_event.reversal_reason, 'already_reversed'),
      'scan_count', v_scan_count,
      'remaining', GREATEST(v_event.free_limit - v_scan_count, 0),
      'is_pro', v_event.is_pro_at_time,
      'scan_id', v_event.scan_id,
      'counted', false
    );
  END IF;

  IF NOT v_event.counted THEN
    RETURN jsonb_build_object(
      'allowed', v_event.allowed,
      'reversed', false,
      'reason', 'scan_was_not_counted',
      'scan_count', v_scan_count,
      'remaining', GREATEST(v_event.free_limit - v_scan_count, 0),
      'is_pro', v_event.is_pro_at_time,
      'scan_id', v_event.scan_id,
      'counted', false
    );
  END IF;

  v_scan_count := GREATEST(v_scan_count - 1, 0);

  UPDATE public.profiles
  SET scan_count = v_scan_count,
      updated_at = now()
  WHERE id = v_user_id;

  UPDATE public.scan_usage_events
  SET counted = false,
      reversed = true,
      reversed_at = now(),
      reversal_reason = v_reversal_reason,
      reason = 'reversed_' || v_reversal_reason,
      scan_count_after = v_scan_count
  WHERE user_id = v_user_id
    AND scan_id = v_scan_id;

  RETURN jsonb_build_object(
    'allowed', v_event.allowed,
    'reversed', true,
    'reason', v_reversal_reason,
    'scan_count', v_scan_count,
    'remaining', GREATEST(v_event.free_limit - v_scan_count, 0),
    'is_pro', v_event.is_pro_at_time,
    'scan_id', v_event.scan_id,
    'counted', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_scan(UUID, TEXT, TEXT) TO service_role;
