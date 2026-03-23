-- Account deletion RPC (Apple App Store Guideline 5.1.1v)
-- Deletes all user data and the auth account.
-- profiles and scan_history cascade-delete via FK, but we explicitly clean up rate_limits.

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clean up rate limits (no FK cascade)
  DELETE FROM public.rate_limits WHERE user_id = auth.uid();

  -- Delete auth user — cascades to profiles, scan_history
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;

-- Only authenticated users can call this
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
