-- Promote already-computed, schema-valid analysis_cache rows into app-visible
-- product_data species keys when there is exactly one normalized product match.
-- This does not overwrite any existing app-visible cache row.

WITH valid_cache AS (
  SELECT
    cache_key,
    lookup_type,
    analysis,
    data_source,
    opff_data,
    expires_at
  FROM public.analysis_cache
  WHERE expires_at > NOW()
    AND lookup_type IN ('name', 'barcode')
    AND jsonb_typeof(analysis) = 'object'
    AND analysis->>'schemaVersion' ~ '^[0-9]+(\.[0-9]+)?$'
    AND (analysis->>'schemaVersion')::numeric >= 2
    AND length(trim(coalesce(analysis->>'productName', ''))) > 0
    AND analysis->>'overallScore' ~ '^[0-9]+(\.[0-9]+)?$'
    AND (analysis->>'overallScore')::numeric BETWEEN 1 AND 100
    AND lower(coalesce(analysis->>'petType', '')) IN ('dog', 'cat')
),
product_targets AS (
  SELECT
    cache_key,
    product_name,
    brand,
    CASE
      WHEN lower(coalesce(brand, '') || ' ' || coalesce(product_name, '') || ' ' || coalesce(cache_key, '')) ~* '\m(cat|cats|kitten|kittens|feline|hairball|litter|fancy feast|friskies|sheba|tiki cat|meow mix|9 lives|temptations|whiskas|delectables)\M'
        THEN 'cat'
      ELSE 'dog'
    END AS pet_type
  FROM public.product_data
  WHERE coalesce(array_length(ingredients, 1), 0) >= 5
    AND expires_at > NOW()
    AND cache_key IS NOT NULL
),
already_visible AS (
  SELECT DISTINCT cache.cache_key
  FROM valid_cache cache
  JOIN product_targets target
    ON cache.cache_key IN (target.cache_key || '__' || target.pet_type, target.cache_key)
),
hidden_cache AS (
  SELECT cache.*
  FROM valid_cache cache
  LEFT JOIN already_visible visible
    ON visible.cache_key = cache.cache_key
  WHERE visible.cache_key IS NULL
),
candidate_matches AS (
  SELECT
    hidden.cache_key AS source_cache_key,
    hidden.lookup_type,
    hidden.analysis,
    hidden.data_source,
    hidden.opff_data,
    hidden.expires_at,
    target.cache_key AS product_cache_key,
    target.pet_type,
    target.cache_key || '__' || target.pet_type AS target_cache_key
  FROM hidden_cache hidden
  JOIN product_targets target
    ON public.normalize_product_catalog_name(coalesce(nullif(hidden.opff_data->>'productName', ''), hidden.analysis->>'productName'))
     = public.normalize_product_catalog_name(target.product_name)
   AND coalesce(nullif(lower(hidden.opff_data->>'petType'), ''), lower(hidden.analysis->>'petType'), target.pet_type)
       IN (target.pet_type, 'unknown')
),
unique_matches AS (
  SELECT candidate.*
  FROM candidate_matches candidate
  WHERE NOT EXISTS (
    SELECT 1
    FROM candidate_matches other
    WHERE other.source_cache_key = candidate.source_cache_key
      AND (
        other.product_cache_key IS DISTINCT FROM candidate.product_cache_key
        OR other.pet_type IS DISTINCT FROM candidate.pet_type
      )
  )
)
INSERT INTO public.analysis_cache (
  cache_key,
  lookup_type,
  analysis,
  data_source,
  opff_data,
  created_at,
  updated_at,
  expires_at,
  hit_count,
  last_hit_at
)
SELECT
  target_cache_key,
  'name',
  analysis,
  data_source,
  opff_data,
  NOW(),
  NOW(),
  expires_at,
  0,
  NULL
FROM unique_matches
WHERE NOT EXISTS (
  SELECT 1
  FROM public.analysis_cache existing
  WHERE existing.cache_key = unique_matches.target_cache_key
)
ON CONFLICT (cache_key) DO NOTHING;
