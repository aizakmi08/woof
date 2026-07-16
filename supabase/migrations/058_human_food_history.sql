-- Persist human-food safety status across devices and reinstalls.
ALTER TABLE public.scan_history
  ADD COLUMN IF NOT EXISTS safety_level TEXT
  CHECK (safety_level IS NULL OR safety_level IN ('safe', 'caution', 'dangerous'));
