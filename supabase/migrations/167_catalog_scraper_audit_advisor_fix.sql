CREATE INDEX IF NOT EXISTS idx_catalog_product_evidence_run_id
  ON public.catalog_product_evidence (run_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_import_runs'
      AND policyname = 'Service role manages catalog import runs'
  ) THEN
    CREATE POLICY "Service role manages catalog import runs"
      ON public.catalog_import_runs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'catalog_product_evidence'
      AND policyname = 'Service role manages catalog product evidence'
  ) THEN
    CREATE POLICY "Service role manages catalog product evidence"
      ON public.catalog_product_evidence
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
