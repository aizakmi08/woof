-- RevenueCat webhook audit log and profile entitlement metadata.

CREATE TABLE IF NOT EXISTS public.revenuecat_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  app_user_id TEXT,
  original_app_user_id TEXT,
  aliases TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  transaction_id TEXT,
  original_transaction_id TEXT,
  product_id TEXT,
  entitlement_ids TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
  environment TEXT,
  store TEXT,
  event_timestamp TIMESTAMPTZ,
  payload JSONB NOT NULL,
  processed_user_ids UUID[] DEFAULT '{}'::UUID[] NOT NULL,
  ignored_reason TEXT,
  subscriber_sync_status TEXT,
  subscriber_sync_error TEXT,
  subscriber_synced_at TIMESTAMPTZ,
  subscriber_app_user_id TEXT,
  received_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_app_user_id
  ON public.revenuecat_events (app_user_id);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_type_received
  ON public.revenuecat_events (event_type, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenuecat_events_sync_status
  ON public.revenuecat_events (subscriber_sync_status, received_at DESC);

ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.revenuecat_events FROM PUBLIC;
REVOKE ALL ON TABLE public.revenuecat_events FROM anon;
REVOKE ALL ON TABLE public.revenuecat_events FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.revenuecat_events TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS revenuecat_app_user_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_product_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_store TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_environment TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_entitlement_ids TEXT[] DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS revenuecat_last_event_id TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_last_event_type TEXT,
  ADD COLUMN IF NOT EXISTS revenuecat_last_event_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenuecat_subscriber_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revenuecat_management_url TEXT;
