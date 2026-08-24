-- Multiple retailers may publish the same GTIN for one formula. Return one
-- canonical resolution per formula/GTIN instead of duplicate rows.

CREATE OR REPLACE FUNCTION public.resolve_verified_product_by_gtin(
  q TEXT,
  max_results INTEGER DEFAULT 8
)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gtin TEXT := regexp_replace(COALESCE(q, ''), '[^0-9]', '', 'g');
  v_normalized_gtin TEXT;
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(max_results, 8), 1), 25);
BEGIN
  IF length(v_gtin) < 8 OR length(v_gtin) > 14 THEN
    RETURN;
  END IF;

  v_normalized_gtin := ltrim(v_gtin, '0');
  IF v_normalized_gtin = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH candidates AS MATERIALIZED (
    SELECT
      formula.id AS formula_id,
      ltrim(
        regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) AS normalized_gtin,
      product.cache_key,
      product.product_name,
      product.brand,
      sku.gtin,
      NULLIF(trim(product.product_line), '') AS product_line,
      NULLIF(trim(product.flavor), '') AS flavor,
      NULLIF(trim(product.life_stage), '') AS life_stage,
      NULLIF(trim(product.food_form), '') AS food_form,
      COALESCE(
        NULLIF(trim(sku.package_size), ''),
        NULLIF(trim(product.package_size), '')
      ) AS package_size,
      product.pet_type,
      product.ingredient_count,
      product.source,
      product.source_quality,
      product.ingredient_verification_status,
      product.image_verification_status,
      product.verified_at,
      product.image_url,
      product.ingredients,
      COALESCE(
        NULLIF(product.ingredient_text, ''),
        array_to_string(product.ingredients, ', ')
      ) AS ingredient_text,
      product.nutritional_info,
      product.nutrient_panel,
      COALESCE(product.has_published_nutrients, FALSE)
        AS has_published_nutrients,
      product.source_url,
      CASE formula.source_authority
        WHEN 'gdsn' THEN 5
        WHEN 'official' THEN 4
        WHEN 'manufacturer' THEN 3
        WHEN 'retailer_verified' THEN 2
        ELSE 0
      END AS authority_rank
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
     AND formula.active
     AND formula.verification_status = 'verified'
     AND formula.promoted_cache_key IS NOT NULL
    JOIN public.product_data product
      ON product.cache_key = formula.promoted_cache_key
    WHERE sku.active
      AND ltrim(
        regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = v_normalized_gtin
      AND product.expires_at > now()
      AND product.ingredient_count >= 5
      AND product.is_complete_food = TRUE
      AND product.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
      AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
      AND product.source_quality IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified'
      )
      AND product.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND product.image_verification_status IN (
        'official',
        'manufacturer',
        'retailer_verified'
      )
      AND product.image_url IS NOT NULL
      AND product.image_url !~* '^data:'
  ),
  deduped AS (
    SELECT DISTINCT ON (candidate.formula_id, candidate.normalized_gtin)
      candidate.*
    FROM candidates candidate
    ORDER BY
      candidate.formula_id,
      candidate.normalized_gtin,
      candidate.authority_rank DESC,
      candidate.ingredient_count DESC,
      candidate.verified_at DESC NULLS LAST,
      candidate.package_size
  )
  SELECT
    deduped.cache_key,
    deduped.product_name,
    deduped.brand,
    deduped.gtin,
    deduped.product_line,
    deduped.flavor,
    deduped.life_stage,
    deduped.food_form,
    deduped.package_size,
    deduped.pet_type,
    deduped.ingredient_count,
    deduped.source,
    deduped.source_quality,
    deduped.ingredient_verification_status,
    deduped.image_verification_status,
    deduped.verified_at,
    deduped.image_url,
    deduped.ingredients,
    deduped.ingredient_text,
    deduped.nutritional_info,
    deduped.nutrient_panel,
    deduped.has_published_nutrients,
    deduped.source_url,
    20.0::REAL AS rank
  FROM deduped
  ORDER BY
    deduped.authority_rank DESC,
    deduped.ingredient_count DESC,
    deduped.verified_at DESC NULLS LAST
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM anon;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO authenticated;
GRANT EXECUTE
  ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO service_role;

DO $$
DECLARE
  duplicate_result_count INTEGER;
  expected_result_count INTEGER;
BEGIN
  SELECT count(*)
  INTO duplicate_result_count
  FROM (
    SELECT gtin
    FROM public.resolve_verified_product_by_gtin('030111524034', 8)
    GROUP BY gtin
    HAVING count(*) > 1
  ) duplicated;

  SELECT count(*)
  INTO expected_result_count
  FROM public.resolve_verified_product_by_gtin('030111524034', 8)
  WHERE product_name = 'Hair & Skin Care Dry Cat Food';

  IF duplicate_result_count <> 0 OR expected_result_count <> 1 THEN
    RAISE EXCEPTION
      'verified SKU dedupe failed: duplicate groups %, expected rows %',
      duplicate_result_count,
      expected_result_count;
  END IF;
END $$;
