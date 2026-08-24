-- Read-only runtime controls for the strict label resolver. The app fails
-- closed when this row cannot be read, so a backend outage cannot re-enable
-- unsafe auto-open behavior.
CREATE TABLE IF NOT EXISTS public.app_runtime_config (
  config_key TEXT PRIMARY KEY,
  config JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_runtime_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_runtime_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_runtime_config TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read runtime configuration"
  ON public.app_runtime_config;
CREATE POLICY "Authenticated users can read runtime configuration"
  ON public.app_runtime_config
  FOR SELECT
  TO authenticated
  USING (config_key = 'label_resolution');

INSERT INTO public.app_runtime_config (config_key, config)
VALUES (
  'label_resolution',
  jsonb_build_object(
    'strict_matching', TRUE,
    'auto_open_enabled', TRUE,
    'visual_confirmation_required', TRUE,
    'reconciliation_timeout_ms', 7500
  )
)
ON CONFLICT (config_key) DO UPDATE
SET
  config = EXCLUDED.config,
  updated_at = NOW();

CREATE OR REPLACE FUNCTION public.get_label_resolution_config()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT config
      FROM public.app_runtime_config
      WHERE config_key = 'label_resolution'
    ),
    jsonb_build_object(
      'strict_matching', TRUE,
      'auto_open_enabled', FALSE,
      'visual_confirmation_required', TRUE,
      'reconciliation_timeout_ms', 7500
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_label_resolution_config() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_label_resolution_config() TO authenticated;
