-- Evaluate auth.uid() once per statement instead of once per row.

DROP POLICY IF EXISTS "Users update own history" ON public.scan_history;
CREATE POLICY "Users update own history" ON public.scan_history
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own analytics events" ON public.analytics_events;
CREATE POLICY "Users can insert own analytics events" ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users read own scan usage" ON public.scan_usage_events;
CREATE POLICY "Users read own scan usage" ON public.scan_usage_events
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
