-- Ensure exact search-result taps always map to one canonical product_data row.
-- The original table definition declares cache_key UNIQUE, but this migration is
-- idempotent hardening for databases that drifted before/around early migrations.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY cache_key
      ORDER BY
        CASE WHEN expires_at > NOW() THEN 0 ELSE 1 END,
        COALESCE(ingredient_count, 0) DESC,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id
    ) AS rn
  FROM public.product_data
  WHERE cache_key IS NOT NULL
)
DELETE FROM public.product_data pd
USING ranked r
WHERE pd.id = r.id
  AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'product_data'
      AND indexname = 'product_data_cache_key_unique'
  ) THEN
    CREATE UNIQUE INDEX product_data_cache_key_unique
      ON public.product_data (cache_key);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_data_cache_key_unique'
      AND conrelid = 'public.product_data'::regclass
  ) THEN
    ALTER TABLE public.product_data
      ADD CONSTRAINT product_data_cache_key_unique
      UNIQUE USING INDEX product_data_cache_key_unique;
  END IF;
END $$;

ANALYZE public.product_data;
