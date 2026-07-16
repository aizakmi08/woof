-- Lightweight product analytics for funnel and monetization debugging.
-- Pre-auth events are queued on device and inserted after sign-in.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_name_created
  ON public.analytics_events (name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created
  ON public.analytics_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_properties_gin
  ON public.analytics_events USING GIN (properties);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.analytics_events FROM PUBLIC;
REVOKE ALL ON TABLE public.analytics_events FROM anon;
REVOKE ALL ON TABLE public.analytics_events FROM authenticated;
GRANT INSERT ON TABLE public.analytics_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analytics_events TO service_role;

CREATE POLICY "Users can insert own analytics events"
  ON public.analytics_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No client SELECT policy on purpose. Use service role, SQL editor, or a
-- reporting view/RPC for analysis dashboards.
