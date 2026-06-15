-- Repair shared cache lookup metadata before using cache analytics for
-- barcode/search/photo performance decisions.
DELETE FROM public.analysis_cache
WHERE lookup_type = 'human_food';

UPDATE public.analysis_cache
SET lookup_type = CASE
  WHEN cache_key ~ '^[0-9]{8,14}$' THEN 'barcode'
  ELSE 'name'
END
WHERE lookup_type IS DISTINCT FROM CASE
  WHEN cache_key ~ '^[0-9]{8,14}$' THEN 'barcode'
  ELSE 'name'
END;
