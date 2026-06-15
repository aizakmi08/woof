-- Product funnel and reliability events.
-- Clients can write bounded, redacted events through log_product_event(), but
-- cannot read the event table directly.

CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  platform TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct product event reads" ON public.product_events;
DROP POLICY IF EXISTS "No direct product event writes" ON public.product_events;

CREATE INDEX IF NOT EXISTS idx_product_events_created_at
  ON public.product_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_name_created_at
  ON public.product_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_created_at
  ON public.product_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.log_product_event(
  p_event_name TEXT,
  p_session_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_events CONSTANT TEXT[] := ARRAY[
    'scan_started',
    'search_result_tapped',
    'analysis_completed',
    'analysis_failed',
    'ingredient_label_requested',
    'pet_type_requested',
    'paywall_viewed',
    'paywall_plan_selected',
    'purchase_started',
    'purchase_completed',
    'purchase_cancelled',
    'purchase_failed',
    'purchase_no_entitlement',
    'restore_started',
    'restore_completed',
    'restore_failed',
    'restore_no_entitlement'
  ];
  v_metadata JSONB := COALESCE(p_metadata, '{}'::jsonb);
BEGIN
  IF p_event_name IS NULL OR NOT (p_event_name = ANY(v_allowed_events)) THEN
    RAISE EXCEPTION 'Unsupported product event'
      USING ERRCODE = '22023';
  END IF;

  IF p_session_id IS NULL
     OR length(p_session_id) < 8
     OR length(p_session_id) > 80 THEN
    RAISE EXCEPTION 'Invalid event session'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_metadata) <> 'object'
     OR pg_column_size(v_metadata) > 4096 THEN
    RAISE EXCEPTION 'Invalid event metadata'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.product_events (
    user_id,
    event_name,
    session_id,
    platform,
    metadata
  )
  VALUES (
    auth.uid(),
    p_event_name,
    left(p_session_id, 80),
    left(v_metadata->>'platform', 24),
    v_metadata - 'platform'
  );
END;
$$;

REVOKE ALL ON TABLE public.product_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB)
  TO anon, authenticated;
