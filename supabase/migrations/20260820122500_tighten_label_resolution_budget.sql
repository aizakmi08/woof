-- Keep the timeout recovery state inside the release p95 target. Successful
-- OCR/catalog matches normally finish much earlier; this is only the hard stop.
UPDATE public.app_runtime_config
SET
  config = jsonb_set(config, '{reconciliation_timeout_ms}', '4800'::JSONB, TRUE),
  updated_at = statement_timestamp()
WHERE config_key = 'label_resolution';
