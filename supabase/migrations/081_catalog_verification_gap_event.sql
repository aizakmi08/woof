-- Allow the app to log catalog records that are searchable but not yet safe
-- for instant scoring because ingredients, product images, or pet type need
-- stronger verification.

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
    'catalog_lookup_failed',
    'catalog_verification_gap'
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
