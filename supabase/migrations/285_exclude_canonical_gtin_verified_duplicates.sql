-- Keep one serving row when the same verified physical product was imported
-- with a zero-padded and an unpadded GTIN. Evidence rows remain in place; only
-- the redundant product_data row is excluded from serving.
WITH verified_rows AS (
  SELECT
    pd.id,
    pd.cache_key,
    pd.source,
    pd.source_quality,
    pd.verified_at,
    pd.updated_at,
    pd.package_size,
    pd.product_line,
    pd.flavor,
    pd.life_stage,
    pd.food_form,
    regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g') AS gtin_digits,
    md5(
      regexp_replace(
        lower(trim(COALESCE(pd.ingredient_text, ''))),
        '\\s+',
        ' ',
        'g'
      )
    ) AS ingredient_key,
    trim(regexp_replace(lower(COALESCE(pd.brand, '')), '[^a-z0-9]+', ' ', 'g')) AS brand_key,
    trim(regexp_replace(lower(COALESCE(pd.product_name, '')), '[^a-z0-9]+', ' ', 'g')) AS product_key,
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
),
canonical_rows AS (
  SELECT
    verified_rows.*,
    CASE
      WHEN length(gtin_digits) = 14 AND left(gtin_digits, 2) = '00' THEN substr(gtin_digits, 3)
      WHEN length(gtin_digits) = 14 AND left(gtin_digits, 1) = '0' THEN substr(gtin_digits, 2)
      WHEN length(gtin_digits) = 13 AND left(gtin_digits, 1) = '0' THEN substr(gtin_digits, 2)
      ELSE gtin_digits
    END AS canonical_gtin
  FROM verified_rows
),
ranked_rows AS (
  SELECT
    canonical_rows.*,
    row_number() OVER (
      PARTITION BY canonical_gtin, ingredient_key, brand_key, product_key, pet_key
      ORDER BY
        CASE lower(COALESCE(source_quality, ''))
          WHEN 'gdsn' THEN 5
          WHEN 'official' THEN 4
          WHEN 'manufacturer' THEN 3
          WHEN 'retailer_verified' THEN 2
          ELSE 1
        END DESC,
        CASE WHEN gtin_digits = canonical_gtin THEN 1 ELSE 0 END DESC,
        CASE WHEN NULLIF(trim(package_size), '') IS NOT NULL THEN 1 ELSE 0 END DESC,
        (
          (product_line IS NOT NULL)::INTEGER
          + (flavor IS NOT NULL)::INTEGER
          + (life_stage IS NOT NULL)::INTEGER
          + (food_form IS NOT NULL)::INTEGER
        ) DESC,
        verified_at DESC NULLS LAST,
        updated_at DESC NULLS LAST,
        cache_key
    ) AS duplicate_rank,
    count(*) OVER (
      PARTITION BY canonical_gtin, ingredient_key, brand_key, product_key, pet_key
    ) AS duplicate_count
  FROM canonical_rows
  WHERE canonical_gtin <> ''
    AND brand_key <> ''
    AND product_key <> ''
    AND pet_key IN ('dog', 'cat')
),
redundant_rows AS (
  SELECT id
  FROM ranked_rows
  WHERE duplicate_count > 1
    AND duplicate_rank > 1
)
UPDATE public.product_data pd
SET
  catalog_exclusion_reason = 'duplicate_canonical_gtin_verified_catalog_row',
  updated_at = now()
FROM redundant_rows redundant
WHERE pd.id = redundant.id
  AND COALESCE(NULLIF(trim(pd.catalog_exclusion_reason), ''), '') = '';

DO $$
DECLARE
  remaining_duplicate_groups INTEGER;
BEGIN
  WITH verified_rows AS (
    SELECT
      regexp_replace(COALESCE(pd.gtin, ''), '[^0-9]', '', 'g') AS gtin_digits,
      md5(
        regexp_replace(
          lower(trim(COALESCE(pd.ingredient_text, ''))),
          '\\s+',
          ' ',
          'g'
        )
      ) AS ingredient_key,
      trim(regexp_replace(lower(COALESCE(pd.brand, '')), '[^a-z0-9]+', ' ', 'g')) AS brand_key,
      trim(regexp_replace(lower(COALESCE(pd.product_name, '')), '[^a-z0-9]+', ' ', 'g')) AS product_key,
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
  ),
  canonical_rows AS (
    SELECT
      CASE
        WHEN length(gtin_digits) = 14 AND left(gtin_digits, 2) = '00' THEN substr(gtin_digits, 3)
        WHEN length(gtin_digits) = 14 AND left(gtin_digits, 1) = '0' THEN substr(gtin_digits, 2)
        WHEN length(gtin_digits) = 13 AND left(gtin_digits, 1) = '0' THEN substr(gtin_digits, 2)
        ELSE gtin_digits
      END AS canonical_gtin,
      ingredient_key,
      brand_key,
      product_key,
      pet_key
    FROM verified_rows
  ),
  duplicate_groups AS (
    SELECT canonical_gtin, ingredient_key, brand_key, product_key, pet_key
    FROM canonical_rows
    WHERE canonical_gtin <> ''
      AND brand_key <> ''
      AND product_key <> ''
      AND pet_key IN ('dog', 'cat')
    GROUP BY canonical_gtin, ingredient_key, brand_key, product_key, pet_key
    HAVING count(*) > 1
  )
  SELECT count(*)
  INTO remaining_duplicate_groups
  FROM duplicate_groups;

  IF remaining_duplicate_groups <> 0 THEN
    RAISE EXCEPTION
      'Canonical verified GTIN duplicate cleanup left % active group(s)',
      remaining_duplicate_groups;
  END IF;
END
$$;
