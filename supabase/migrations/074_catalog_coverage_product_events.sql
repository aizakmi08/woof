-- Catalog coverage telemetry for search and front-label lookup misses.
-- Product-event writes stay behind the allowlisted RPC; clients do not get
-- direct table access.

CREATE TABLE IF NOT EXISTS public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  platform TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.product_events
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_name TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS session_id TEXT NOT NULL,
  ADD COLUMN IF NOT EXISTS platform TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_product_events_name_created_at
  ON public.product_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_created_at
  ON public.product_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_metadata_gin
  ON public.product_events USING GIN (metadata);

ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.product_events FROM PUBLIC;
REVOKE ALL ON TABLE public.product_events FROM anon;
REVOKE ALL ON TABLE public.product_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_events TO service_role;

CREATE OR REPLACE FUNCTION public.log_product_event(
  p_event_name TEXT,
  p_session_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed_events CONSTANT TEXT[] := ARRAY[
    'app_opened',
    'onboarding_started',
    'onboarding_step_viewed',
    'onboarding_completed',
    'onboarding_skipped',
    'legal_consent_viewed',
    'legal_consent_accepted',
    'legal_consent_dismissed',
    'legal_document_opened',
    'auth_started',
    'auth_completed',
    'auth_cancelled',
    'auth_failed',
    'scan_started',
    'search_opened',
    'search_result_tapped',
    'product_not_found',
    'first_successful_result',
    'analysis_completed',
    'analysis_failed',
    'ingredient_label_requested',
    'pet_type_requested',
    'entitlement_active',
    'paywall_viewed',
    'paywall_plan_selected',
    'paywall_auth_started',
    'purchase_started',
    'purchase_completed',
    'purchase_cancelled',
    'purchase_failed',
    'purchase_no_entitlement',
    'restore_started',
    'restore_completed',
    'restore_failed',
    'restore_no_entitlement',
    'app_error',
    'catalog_lookup_completed',
    'catalog_lookup_miss',
    'catalog_lookup_failed'
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

REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_product_event(TEXT, TEXT, JSONB) TO service_role;
