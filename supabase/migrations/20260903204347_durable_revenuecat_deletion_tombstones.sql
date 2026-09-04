-- Preserve a non-reversible deletion marker so delayed RevenueCat webhooks
-- cannot recreate identifiers or subscription state for a deleted account.

CREATE TABLE IF NOT EXISTS public.deleted_revenuecat_identities (
  identity_hash BYTEA PRIMARY KEY,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT deleted_revenuecat_identities_sha256_length
    CHECK (octet_length(identity_hash) = 32)
);

ALTER TABLE public.deleted_revenuecat_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deleted_revenuecat_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.deleted_revenuecat_identities TO service_role;

CREATE OR REPLACE FUNCTION public.is_deleted_revenuecat_identity(
  p_identities TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_identities, ARRAY[]::TEXT[])) AS candidate(identity)
    JOIN public.deleted_revenuecat_identities AS deleted
      ON deleted.identity_hash = extensions.digest(lower(trim(candidate.identity)), 'sha256')
    WHERE NULLIF(trim(candidate.identity), '') IS NOT NULL
  );
$function$;

REVOKE ALL ON FUNCTION public.is_deleted_revenuecat_identity(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_deleted_revenuecat_identity(TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION public.reject_deleted_revenuecat_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_payload_ids TEXT[];
  v_identities TEXT[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT lower(capture[1])), ARRAY[]::TEXT[])
  INTO v_payload_ids
  FROM regexp_matches(
    COALESCE(NEW.payload::TEXT, ''),
    '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})',
    'g'
  ) AS capture;

  v_identities := ARRAY[
    NEW.app_user_id,
    NEW.original_app_user_id,
    NEW.subscriber_app_user_id
  ]::TEXT[]
    || COALESCE(NEW.aliases, ARRAY[]::TEXT[])
    || COALESCE(
      ARRAY(SELECT identity::TEXT FROM unnest(NEW.processed_user_ids) AS identity),
      ARRAY[]::TEXT[]
    )
    || v_payload_ids;

  IF public.is_deleted_revenuecat_identity(v_identities) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'deleted_revenuecat_identity';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reject_deleted_revenuecat_event() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_deleted_revenuecat_event() TO service_role;

DROP TRIGGER IF EXISTS reject_deleted_revenuecat_event ON public.revenuecat_events;
CREATE TRIGGER reject_deleted_revenuecat_event
BEFORE INSERT OR UPDATE ON public.revenuecat_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_deleted_revenuecat_event();

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account requires an authenticated user';
  END IF;

  INSERT INTO public.deleted_revenuecat_identities (identity_hash)
  VALUES (extensions.digest(lower(v_user_id::TEXT), 'sha256'))
  ON CONFLICT (identity_hash) DO UPDATE
    SET deleted_at = LEAST(
      public.deleted_revenuecat_identities.deleted_at,
      EXCLUDED.deleted_at
    );

  DELETE FROM public.analytics_events
  WHERE user_id = v_user_id;

  DELETE FROM public.product_events
  WHERE user_id = v_user_id;

  DELETE FROM public.revenuecat_events
  WHERE app_user_id = v_user_id::TEXT
    OR original_app_user_id = v_user_id::TEXT
    OR subscriber_app_user_id = v_user_id::TEXT
    OR v_user_id = ANY(processed_user_ids)
    OR v_user_id::TEXT = ANY(aliases)
    OR payload::TEXT LIKE ('%' || v_user_id::TEXT || '%');

  DELETE FROM public.scan_usage_events
  WHERE user_id = v_user_id;

  DELETE FROM public.rate_limits
  WHERE user_id = v_user_id;

  DELETE FROM auth.users
  WHERE id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
