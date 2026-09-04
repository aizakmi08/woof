-- Keep one serving row when independent imports produced the same verified
-- physical product. Conflicting ingredient or image evidence is intentionally
-- left active for review rather than merged automatically.
WITH verified_rows AS (
  SELECT
    pd.id,
    pd.cache_key,
    regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g') AS gtin_key,
    md5(
      regexp_replace(
        lower(trim(COALESCE(pd.ingredient_text, ''))),
        '\\s+',
        ' ',
        'g'
      )
    ) AS ingredient_key,
    lower(trim(COALESCE(pd.image_url, ''))) AS image_key,
    lower(trim(COALESCE(pd.pet_type, ''))) AS pet_key,
    row_number() OVER (
      PARTITION BY
        regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g'),
        md5(
          regexp_replace(
            lower(trim(COALESCE(pd.ingredient_text, ''))),
            '\\s+',
            ' ',
            'g'
          )
        ),
        lower(trim(COALESCE(pd.image_url, ''))),
        lower(trim(COALESCE(pd.pet_type, '')))
      ORDER BY
        CASE lower(COALESCE(pd.source_quality, ''))
          WHEN 'gdsn' THEN 5
          WHEN 'official' THEN 4
          WHEN 'manufacturer' THEN 3
          WHEN 'retailer_verified' THEN 2
          ELSE 1
        END DESC,
        CASE WHEN pd.source ~* 'manufacturer|official' THEN 1 ELSE 0 END DESC,
        pd.verified_at DESC NULLS LAST,
        pd.updated_at DESC NULLS LAST,
        pd.cache_key
    ) AS duplicate_rank,
    count(*) OVER (
      PARTITION BY
        regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g'),
        md5(
          regexp_replace(
            lower(trim(COALESCE(pd.ingredient_text, ''))),
            '\\s+',
            ' ',
            'g'
          )
        ),
        lower(trim(COALESCE(pd.image_url, ''))),
        lower(trim(COALESCE(pd.pet_type, '')))
    ) AS duplicate_count
  FROM public.product_data pd
  WHERE public.catalog_quality_state(
    pd.pet_type,
    pd.is_complete_food,
    pd.catalog_exclusion_reason,
    pd.ingredient_text,
    pd.ingredient_count,
    pd.ingredient_verification_status,
    pd.image_url,
    pd.image_verification_status,
    pd.source_url,
    pd.expires_at
  ) = 'verified_ready'
    AND length(regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
    AND COALESCE(NULLIF(trim(pd.ingredient_text), ''), '') <> ''
    AND COALESCE(NULLIF(trim(pd.image_url), ''), '') <> ''
),
redundant_rows AS (
  SELECT id
  FROM verified_rows
  WHERE duplicate_count > 1
    AND duplicate_rank > 1
)
UPDATE public.product_data pd
SET
  catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row',
  updated_at = now()
FROM redundant_rows redundant
WHERE pd.id = redundant.id
  AND COALESCE(NULLIF(trim(pd.catalog_exclusion_reason), ''), '') = '';

DO $$
DECLARE
  remaining_duplicate_groups INTEGER;
BEGIN
  WITH active_verified AS (
    SELECT
      regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g') AS gtin_key,
      md5(
        regexp_replace(
          lower(trim(COALESCE(pd.ingredient_text, ''))),
          '\\s+',
          ' ',
          'g'
        )
      ) AS ingredient_key,
      lower(trim(COALESCE(pd.image_url, ''))) AS image_key,
      lower(trim(COALESCE(pd.pet_type, ''))) AS pet_key
    FROM public.product_data pd
    WHERE public.catalog_quality_state(
      pd.pet_type,
      pd.is_complete_food,
      pd.catalog_exclusion_reason,
      pd.ingredient_text,
      pd.ingredient_count,
      pd.ingredient_verification_status,
      pd.image_url,
      pd.image_verification_status,
      pd.source_url,
      pd.expires_at
    ) = 'verified_ready'
      AND length(regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g')) BETWEEN 8 AND 14
      AND COALESCE(NULLIF(trim(pd.ingredient_text), ''), '') <> ''
      AND COALESCE(NULLIF(trim(pd.image_url), ''), '') <> ''
  ),
  duplicate_groups AS (
    SELECT gtin_key, ingredient_key, image_key, pet_key
    FROM active_verified
    GROUP BY gtin_key, ingredient_key, image_key, pet_key
    HAVING count(*) > 1
  )
  SELECT count(*)
  INTO remaining_duplicate_groups
  FROM duplicate_groups;

  IF remaining_duplicate_groups <> 0 THEN
    RAISE EXCEPTION
      'Exact verified GTIN duplicate cleanup left % active group(s)',
      remaining_duplicate_groups;
  END IF;
END
$$;
