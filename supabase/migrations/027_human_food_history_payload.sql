-- Store user-scoped human-food safety history details so account-synced
-- history can replay without putting private safety answers in analysis_cache.
ALTER TABLE public.scan_history
  ADD COLUMN IF NOT EXISTS safety_level TEXT,
  ADD COLUMN IF NOT EXISTS analysis_payload JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'scan_history_safety_level_check'
      AND conrelid = 'public.scan_history'::regclass
  ) THEN
    ALTER TABLE public.scan_history
      ADD CONSTRAINT scan_history_safety_level_check
      CHECK (safety_level IS NULL OR safety_level IN ('safe', 'caution', 'dangerous'));
  END IF;
END $$;
