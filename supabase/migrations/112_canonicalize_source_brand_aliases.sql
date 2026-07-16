-- Canonicalize source-owned brand labels that came from page/site metadata
-- instead of the shelf-facing brand. This lets search and acquisition
-- reconciliation match official rows to user-visible Hill's / Wellness names.

DO $$
DECLARE
  v_wellness_candidates INTEGER := 0;
  v_wellness_distinct_keys INTEGER := 0;
  v_wellness_collisions INTEGER := 0;
  v_wellness_updated INTEGER := 0;
  v_wellness_non_complete_updated INTEGER := 0;
  v_hills_updated INTEGER := 0;
  v_row_count INTEGER := 0;
BEGIN
  WITH wellness_candidates AS (
    SELECT
      cache_key AS old_key,
      'wellness-pet-company:wellness ' ||
        btrim(regexp_replace(regexp_replace(lower(product_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) AS new_key
    FROM public.product_data
    WHERE source = 'wellness-pet-company'
      AND brand = 'Wellness Pet Food'
      AND lower(product_name) NOT LIKE 'old mother hubbard%'
      AND lower(product_name) NOT LIKE 'whimzees%'
  )
  SELECT
    count(*),
    count(DISTINCT new_key),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.product_data pd
        WHERE pd.cache_key = wellness_candidates.new_key
          AND pd.cache_key <> wellness_candidates.old_key
      )
    )
  INTO
    v_wellness_candidates,
    v_wellness_distinct_keys,
    v_wellness_collisions
  FROM wellness_candidates;

  IF v_wellness_candidates <> v_wellness_distinct_keys OR v_wellness_collisions <> 0 THEN
    RAISE EXCEPTION 'Wellness canonical brand cache-key collision: rows %, distinct %, collisions %',
      v_wellness_candidates,
      v_wellness_distinct_keys,
      v_wellness_collisions;
  END IF;

  WITH wellness_candidates AS (
    SELECT
      cache_key AS old_key,
      'wellness-pet-company:wellness ' ||
        btrim(regexp_replace(regexp_replace(lower(product_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')) AS new_key
    FROM public.product_data
    WHERE source = 'wellness-pet-company'
      AND brand = 'Wellness Pet Food'
      AND lower(product_name) NOT LIKE 'old mother hubbard%'
      AND lower(product_name) NOT LIKE 'whimzees%'
  )
  UPDATE public.product_data pd
  SET
    cache_key = wc.new_key,
    brand = 'Wellness',
    updated_at = now()
  FROM wellness_candidates wc
  WHERE pd.cache_key = wc.old_key;

  GET DIAGNOSTICS v_wellness_updated = ROW_COUNT;

  UPDATE public.product_data
  SET
    cache_key = 'wellness-pet-company:old mother hubbard ' ||
      btrim(regexp_replace(regexp_replace(lower(product_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')),
    brand = 'Old Mother Hubbard',
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'not_complete_food',
    updated_at = now()
  WHERE source = 'wellness-pet-company'
    AND lower(product_name) LIKE 'old mother hubbard%';

  GET DIAGNOSTICS v_wellness_non_complete_updated = ROW_COUNT;

  UPDATE public.product_data
  SET
    cache_key = 'wellness-pet-company:whimzees ' ||
      btrim(regexp_replace(regexp_replace(lower(product_name), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g')),
    brand = 'WHIMZEES',
    is_complete_food = FALSE,
    catalog_exclusion_reason = 'not_complete_food',
    updated_at = now()
  WHERE source = 'wellness-pet-company'
    AND lower(product_name) LIKE 'whimzees%';

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  v_wellness_non_complete_updated := v_wellness_non_complete_updated + v_row_count;

  UPDATE public.product_data
  SET
    brand = CASE
      WHEN source_url LIKE '%/prescription-diet-%' THEN 'Hill''s Prescription Diet'
      WHEN source_url LIKE '%/science-diet-%' THEN 'Hill''s Science Diet'
      ELSE 'Hill''s'
    END,
    updated_at = now()
  WHERE source = 'hill-s-pet-nutrition'
    AND brand = 'Hills Pet';

  GET DIAGNOSTICS v_hills_updated = ROW_COUNT;

  RAISE NOTICE 'canonicalized source brands: wellness %, wellness non-complete %, hills %',
    v_wellness_updated,
    v_wellness_non_complete_updated,
    v_hills_updated;
END $$;

DO $$
BEGIN
  PERFORM public.refresh_catalog_acquisition_queue(30, 10000);
  PERFORM public.reconcile_catalog_acquisition_queue_batch(100);
END $$;
