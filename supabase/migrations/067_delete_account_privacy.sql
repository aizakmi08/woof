-- Keep delete-account aligned with every user-linked table added during the
-- audit. This must run before deleting auth.users, because some tables use
-- ON DELETE SET NULL or store RevenueCat user IDs without a foreign key.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account requires an authenticated user';
  END IF;

  DELETE FROM public.analytics_events
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

  -- Deleting the auth user cascades to profiles and scan_history.
  DELETE FROM auth.users
  WHERE id = v_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
