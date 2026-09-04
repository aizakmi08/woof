-- Rows reopened by the strict-search food-form guard should not retain stale
-- reconciliation markers. Reports and audits use these keys to count active
-- strict-search closures, so clear them after reopening.

UPDATE public.catalog_acquisition_queue
SET
  sample_metadata = COALESCE(sample_metadata, '{}'::jsonb)
    - 'reconciled_at'
    - 'reconciled_by',
  updated_at = now()
WHERE status = 'open'
  AND sample_metadata->>'reopened_by' = '236_strict_search_food_form_guard'
  AND sample_metadata->>'reconciled_by' = 'reconcile_catalog_acquisition_queue_strict_search_for_brand';

DO $$
DECLARE
  stale_rows INTEGER;
BEGIN
  SELECT count(*)::INTEGER
  INTO stale_rows
  FROM public.catalog_acquisition_queue
  WHERE status = 'open'
    AND sample_metadata->>'reopened_by' = '236_strict_search_food_form_guard'
    AND sample_metadata ? 'reconciled_by';

  IF stale_rows <> 0 THEN
    RAISE EXCEPTION 'reopened strict-search rows still have stale reconciled_by metadata: %', stale_rows;
  END IF;
END $$;
