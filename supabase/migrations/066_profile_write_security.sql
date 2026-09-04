-- Restrict client profile writes so monetization and entitlement state cannot
-- be changed with the public anon key. Service-role Edge Functions still own
-- scan counts, RevenueCat fields, and Pro status.

REVOKE INSERT, UPDATE ON TABLE public.profiles FROM anon;
REVOKE INSERT, UPDATE ON TABLE public.profiles FROM authenticated;

GRANT SELECT ON TABLE public.profiles TO authenticated;

GRANT INSERT (
  id,
  display_name,
  avatar_url,
  email,
  provider,
  updated_at
) ON TABLE public.profiles TO authenticated;

GRANT UPDATE (
  display_name,
  avatar_url,
  email,
  provider,
  updated_at
) ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

DROP POLICY IF EXISTS "Users update own history" ON public.scan_history;
CREATE POLICY "Users update own history" ON public.scan_history
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scan_history TO authenticated;
GRANT ALL ON TABLE public.scan_history TO service_role;
