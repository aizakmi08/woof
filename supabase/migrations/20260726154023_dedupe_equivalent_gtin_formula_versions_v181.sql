-- A barcode can legitimately point at both a manufacturer-current serving row
-- and an exact retailer package record. If their complete ingredient evidence is
-- identical, return one preferred record. If the ingredient versions differ,
-- continue to abstain until package-level evidence selects the exact version.
CREATE OR REPLACE FUNCTION public.resolve_verified_product_by_gtin(
  q text,
  max_results integer DEFAULT 8
)
RETURNS TABLE(
  cache_key text,
  product_name text,
  brand text,
  gtin text,
  product_line text,
  flavor text,
  life_stage text,
  food_form text,
  package_size text,
  pet_type text,
  ingredient_count integer,
  source text,
  source_quality text,
  ingredient_verification_status text,
  image_verification_status text,
  verified_at timestamptz,
  image_url text,
  ingredients text[],
  ingredient_text text,
  nutritional_info jsonb,
  nutrient_panel jsonb,
  has_published_nutrients boolean,
  source_url text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH eligible AS (
    SELECT
      candidate.*,
      CASE candidate.source_quality
        WHEN 'gdsn' THEN 0
        WHEN 'official' THEN 1
        WHEN 'manufacturer' THEN 2
        WHEN 'retailer_verified' THEN 3
        WHEN 'label_ocr_verified' THEN 4
        ELSE 5
      END AS source_priority
    FROM public.resolve_verified_product_by_gtin_unfiltered(q, 50) candidate
    WHERE (
      SELECT
        count(DISTINCT public.catalog_normalize_ingredient_evidence(
          evidence.ingredient_text
        )) = 1
        AND bool_or(
          public.catalog_normalize_ingredient_evidence(
            evidence.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            candidate.ingredient_text
          )
        )
      FROM (
        SELECT serving.ingredient_text
        FROM public.product_data serving
        WHERE ltrim(
            regexp_replace(
              coalesce(serving.gtin, ''),
              '[^0-9]',
              '',
              'g'
            ),
            '0'
          ) = ltrim(
            regexp_replace(
              coalesce(candidate.gtin, ''),
              '[^0-9]',
              '',
              'g'
            ),
            '0'
          )
          AND nullif(btrim(serving.ingredient_text), '') IS NOT NULL
          AND serving.ingredient_verification_status IN (
            'gdsn',
            'official',
            'manufacturer',
            'retailer_verified',
            'label_ocr_verified'
          )

        UNION ALL

        SELECT formula.ingredient_text
        FROM public.catalog_skus sku
        JOIN public.catalog_formulas formula
          ON formula.id = sku.formula_id
         AND formula.active
         AND formula.verification_status = 'verified'
        WHERE sku.active
          AND ltrim(
            regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'),
            '0'
          ) = ltrim(
            regexp_replace(
              coalesce(candidate.gtin, ''),
              '[^0-9]',
              '',
              'g'
            ),
            '0'
          )
          AND nullif(btrim(formula.ingredient_text), '') IS NOT NULL
      ) evidence
    )
  ),
  ranked AS (
    SELECT
      eligible.*,
      row_number() OVER (
        PARTITION BY public.catalog_normalize_ingredient_evidence(
          eligible.ingredient_text
        )
        ORDER BY
          eligible.source_priority,
          eligible.verified_at DESC NULLS LAST,
          eligible.rank DESC,
          eligible.cache_key
      ) AS version_rank
    FROM eligible
  )
  SELECT
    ranked.cache_key,
    ranked.product_name,
    ranked.brand,
    ranked.gtin,
    ranked.product_line,
    ranked.flavor,
    ranked.life_stage,
    ranked.food_form,
    ranked.package_size,
    ranked.pet_type,
    ranked.ingredient_count,
    ranked.source,
    ranked.source_quality,
    ranked.ingredient_verification_status,
    ranked.image_verification_status,
    ranked.verified_at,
    ranked.image_url,
    ranked.ingredients,
    ranked.ingredient_text,
    ranked.nutritional_info,
    ranked.nutrient_panel,
    ranked.has_published_nutrients,
    ranked.source_url,
    ranked.rank
  FROM ranked
  WHERE ranked.version_rank = 1
  ORDER BY
    ranked.rank DESC,
    ranked.source_priority,
    ranked.cache_key
  LIMIT greatest(1, least(coalesce(max_results, 8), 50));
$$;

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(
  text,
  integer
) TO service_role;

DO $$
DECLARE
  v_equivalent_count integer;
  v_conflict_count integer;
  v_retailer_count integer;
  v_equivalent_cache_key text;
BEGIN
  SELECT count(*), min(result.cache_key)
  INTO v_equivalent_count, v_equivalent_cache_key
  FROM public.resolve_verified_product_by_gtin('076344060543', 8) result;

  SELECT count(*)
  INTO v_conflict_count
  FROM public.resolve_verified_product_by_gtin('030111177315', 8);

  SELECT count(*)
  INTO v_retailer_count
  FROM public.resolve_verified_product_by_gtin('017800194808', 8);

  IF v_equivalent_count <> 1
     OR v_equivalent_cache_key IS NULL
     OR v_equivalent_cache_key LIKE 'petsmart-source-version-v180:%' THEN
    RAISE EXCEPTION
      'v181 equivalent GTIN dedupe failed: count %, cache %',
      v_equivalent_count,
      v_equivalent_cache_key;
  END IF;

  IF v_conflict_count <> 0 THEN
    RAISE EXCEPTION
      'v181 conflicting GTIN must abstain, returned % rows',
      v_conflict_count;
  END IF;

  IF v_retailer_count <> 1 THEN
    RAISE EXCEPTION
      'v181 single retailer source version must resolve once, returned % rows',
      v_retailer_count;
  END IF;
END
$$;
