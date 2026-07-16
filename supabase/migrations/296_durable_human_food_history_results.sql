-- Human-food results are user-specific and cannot be rebuilt from the verified
-- pet-food catalog. Keep a bounded snapshot on the user's own history row so
-- saved results still open after the shared seven-day analysis cache expires.
ALTER TABLE public.scan_history
  ADD COLUMN IF NOT EXISTS result_snapshot JSONB;

ALTER TABLE public.scan_history
  DROP CONSTRAINT IF EXISTS scan_history_result_snapshot_shape_check;

ALTER TABLE public.scan_history
  ADD CONSTRAINT scan_history_result_snapshot_shape_check
  CHECK (
    result_snapshot IS NULL
    OR (
      scan_mode = 'human_food'
      AND jsonb_typeof(result_snapshot) = 'object'
      AND pg_column_size(result_snapshot) <= 131072
    )
  );

COMMENT ON COLUMN public.scan_history.result_snapshot IS
  'Bounded user-owned human-food result used only to reopen saved history after cache expiry.';
