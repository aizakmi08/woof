-- Prefer the exact verified serving/package version for a scanned GTIN when it
-- exists, while retaining the existing ingredient-version conflict abstention.
--
-- Canonical formulas correctly group package-size/GTIN children under one
-- formula and normally prefer current manufacturer evidence. For a barcode,
-- however, a verified product_data row carrying that exact GTIN identifies the
-- package version more precisely than the formula's default serving row. This
-- wrapper considers both exact package rows and canonical formula candidates,
-- proves that all verified evidence for the GTIN has one normalized ingredient
-- statement, and only then ranks the exact package first. Reused/conflicted
-- GTINs still return no result.

DO $precondition$
DECLARE
  v_tiki_cache TEXT;
BEGIN
  IF to_regprocedure(
    'public.resolve_verified_product_by_gtin(text,integer)'
  ) IS NULL OR to_regprocedure(
    'public.resolve_verified_product_by_gtin_unfiltered(text,integer)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required verified GTIN resolver is missing';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('851893001731', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('038100026743', 8)
  ) <> 0 THEN
    RAISE EXCEPTION 'Verified GTIN conflict abstention precondition changed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('076344060048', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('627975010348', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('073893041016', 8)
  ) <> 1 THEN
    RAISE EXCEPTION 'Unambiguous verified GTIN precondition changed';
  END IF;

  SELECT cache_key
  INTO STRICT v_tiki_cache
  FROM public.resolve_verified_product_by_gtin('693804805805', 8);

  IF v_tiki_cache IS DISTINCT FROM
    'tiki-pets:tiki cat kitten health deboned chicken egg recipe kitten kittens-chicken-egg-luau'
  THEN
    RAISE EXCEPTION
      'Tiki canonical GTIN precondition returned %', v_tiki_cache;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
    WHERE sku.gtin = '693804805805'
      AND sku.active
      AND formula.formula_key =
        'whitebridge pet brands|tiki cat|born carnivore baby|cat|kitten|dry|chicken and egg recipe|'
      AND formula.active
      AND formula.verification_status = 'verified'
      AND formula.promoted_cache_key =
        'tiki-pets:tiki cat kitten health deboned chicken egg recipe kitten kittens-chicken-egg-luau'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:693804805805'
      AND gtin = '693804805805'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND source_quality = 'retailer_verified'
      AND ingredient_verification_status = 'retailer_verified'
      AND image_verification_status = 'retailer_verified'
      AND formula_evidence_tier = 'retailer_web_version'
      AND ingredient_count = 43
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Tiki exact-package GTIN evidence precondition changed';
  END IF;
END
$precondition$;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH input AS (
    SELECT ltrim(
      regexp_replace(COALESCE(q, ''), '[^0-9]', '', 'g'),
      '0'
    ) AS normalized_gtin
    WHERE length(regexp_replace(COALESCE(q, ''), '[^0-9]', '', 'g'))
      BETWEEN 8 AND 14
  ),
  direct_package AS MATERIALIZED (
    SELECT
      product.cache_key,
      product.product_name,
      product.brand,
      product.gtin,
      NULLIF(trim(product.product_line), '') AS product_line,
      NULLIF(trim(product.flavor), '') AS flavor,
      NULLIF(trim(product.life_stage), '') AS life_stage,
      NULLIF(trim(product.food_form), '') AS food_form,
      NULLIF(trim(product.package_size), '') AS package_size,
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
      25.0::REAL AS rank,
      TRUE AS exact_package_version,
      CASE product.source_quality
        WHEN 'gdsn' THEN 0
        WHEN 'official' THEN 1
        WHEN 'manufacturer' THEN 2
        WHEN 'retailer_verified' THEN 3
        WHEN 'label_ocr_verified' THEN 4
        ELSE 5
      END AS source_priority
    FROM public.product_data product
    CROSS JOIN input
    WHERE input.normalized_gtin <> ''
      AND ltrim(
        regexp_replace(COALESCE(product.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = input.normalized_gtin
      AND product.expires_at > NOW()
      AND product.ingredient_count >= 5
      AND product.is_complete_food = TRUE
      AND product.catalog_exclusion_reason IS NULL
      AND lower(COALESCE(product.pet_type, '')) IN ('dog', 'cat')
      AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
      AND product.source_quality IN (
        'gdsn', 'official', 'manufacturer', 'retailer_verified'
      )
      AND product.ingredient_verification_status IN (
        'gdsn',
        'official',
        'manufacturer',
        'retailer_verified',
        'label_ocr_verified'
      )
      AND product.image_verification_status IN (
        'official', 'manufacturer', 'retailer_verified'
      )
      AND NULLIF(trim(product.ingredient_text), '') IS NOT NULL
      AND product.image_url IS NOT NULL
      AND product.image_url !~* '^data:'
  ),
  canonical_candidate AS MATERIALIZED (
    SELECT
      candidate.cache_key,
      candidate.product_name,
      candidate.brand,
      candidate.gtin,
      candidate.product_line,
      candidate.flavor,
      candidate.life_stage,
      candidate.food_form,
      candidate.package_size,
      candidate.pet_type,
      candidate.ingredient_count,
      candidate.source,
      candidate.source_quality,
      candidate.ingredient_verification_status,
      candidate.image_verification_status,
      candidate.verified_at,
      candidate.image_url,
      candidate.ingredients,
      candidate.ingredient_text,
      candidate.nutritional_info,
      candidate.nutrient_panel,
      candidate.has_published_nutrients,
      candidate.source_url,
      candidate.rank,
      FALSE AS exact_package_version,
      CASE candidate.source_quality
        WHEN 'gdsn' THEN 0
        WHEN 'official' THEN 1
        WHEN 'manufacturer' THEN 2
        WHEN 'retailer_verified' THEN 3
        WHEN 'label_ocr_verified' THEN 4
        ELSE 5
      END AS source_priority
    FROM public.resolve_verified_product_by_gtin_unfiltered(q, 50) candidate
  ),
  verified_evidence AS MATERIALIZED (
    SELECT product.ingredient_text
    FROM public.product_data product
    CROSS JOIN input
    WHERE input.normalized_gtin <> ''
      AND ltrim(
        regexp_replace(COALESCE(product.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = input.normalized_gtin
      AND NULLIF(trim(product.ingredient_text), '') IS NOT NULL
      AND product.ingredient_verification_status IN (
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
    CROSS JOIN input
    WHERE sku.active
      AND input.normalized_gtin <> ''
      AND ltrim(
        regexp_replace(COALESCE(sku.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = input.normalized_gtin
      AND NULLIF(trim(formula.ingredient_text), '') IS NOT NULL
  ),
  safe_version AS (
    SELECT
      min(public.catalog_normalize_ingredient_evidence(ingredient_text))
        AS normalized_ingredient_text
    FROM verified_evidence
    HAVING count(DISTINCT public.catalog_normalize_ingredient_evidence(
      ingredient_text
    )) = 1
  ),
  combined AS (
    SELECT * FROM direct_package
    UNION ALL
    SELECT * FROM canonical_candidate
  ),
  deduped_cache AS (
    SELECT DISTINCT ON (candidate.cache_key)
      candidate.*
    FROM combined candidate
    ORDER BY
      candidate.cache_key,
      candidate.exact_package_version DESC,
      candidate.source_priority,
      candidate.verified_at DESC NULLS LAST,
      candidate.rank DESC
  ),
  eligible AS (
    SELECT candidate.*
    FROM deduped_cache candidate
    CROSS JOIN safe_version safe
    WHERE public.catalog_normalize_ingredient_evidence(
      candidate.ingredient_text
    ) = safe.normalized_ingredient_text
  ),
  ranked AS (
    SELECT
      eligible.*,
      row_number() OVER (
        PARTITION BY public.catalog_normalize_ingredient_evidence(
          eligible.ingredient_text
        )
        ORDER BY
          eligible.exact_package_version DESC,
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
    ranked.exact_package_version DESC,
    ranked.source_priority,
    ranked.cache_key
  LIMIT greatest(1, least(COALESCE(max_results, 8), 50));
$function$;

COMMENT ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER) IS
  'Resolves a verified GTIN to its exact serving/package version when every verified ingredient source agrees; safely abstains across ingredient-version conflicts.';

REVOKE ALL ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER)
  TO authenticated, service_role;

DO $postcondition$
DECLARE
  v_tiki RECORD;
BEGIN
  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('851893001731', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('038100026743', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.search_verified_products('851893001731', 8)
  ) <> 0 OR (
    SELECT count(*)
    FROM public.search_verified_products('038100026743', 8)
  ) <> 0 THEN
    RAISE EXCEPTION 'Conflicting ingredient-version GTIN no longer abstains';
  END IF;

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('076344060048', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('627975010348', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('073893041016', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.search_verified_products('076344060048', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.search_verified_products('627975010348', 8)
  ) <> 1 OR (
    SELECT count(*)
    FROM public.search_verified_products('073893041016', 8)
  ) <> 1 THEN
    RAISE EXCEPTION 'Unambiguous verified GTIN lookup regressed';
  END IF;

  SELECT *
  INTO STRICT v_tiki
  FROM public.resolve_verified_product_by_gtin('693804805805', 8);

  IF v_tiki.cache_key IS DISTINCT FROM
       'petsmart-retail-catalog:693804805805'
     OR v_tiki.gtin IS DISTINCT FROM '693804805805'
     OR v_tiki.pet_type IS DISTINCT FROM 'cat'
     OR v_tiki.life_stage IS DISTINCT FROM 'kitten'
     OR v_tiki.food_form IS DISTINCT FROM 'dry'
     OR v_tiki.ingredient_count IS DISTINCT FROM 43
     OR v_tiki.source_quality IS DISTINCT FROM 'retailer_verified'
  THEN
    RAISE EXCEPTION 'Tiki exact GTIN did not return exact verified package';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products('693804805805', 8)
  ) IS DISTINCT FROM 'petsmart-retail-catalog:693804805805' THEN
    RAISE EXCEPTION 'Verified numeric search did not delegate exact package';
  END IF;

  IF (
    SELECT public.catalog_normalize_ingredient_evidence(package.ingredient_text)
         = public.catalog_normalize_ingredient_evidence(official.ingredient_text)
    FROM public.product_data package
    CROSS JOIN public.product_data official
    WHERE package.cache_key = 'petsmart-retail-catalog:693804805805'
      AND official.cache_key =
        'tiki-pets:tiki cat kitten health deboned chicken egg recipe kitten kittens-chicken-egg-luau'
  ) IS DISTINCT FROM TRUE THEN
    RAISE EXCEPTION 'Tiki exact package/current manufacturer ingredients diverged';
  END IF;
END
$postcondition$;
