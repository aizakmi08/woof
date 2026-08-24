-- Availability-first acquisition must distinguish an exact current
-- manufacturer formula from an exact readable retailer/package-label version.
-- Either can safely answer a package-specific lookup, but different ingredient
-- versions must remain separate formulas with explicit provenance.

ALTER TABLE public.catalog_formulas
  ADD COLUMN IF NOT EXISTS formula_evidence_tier TEXT NOT NULL
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS formula_version_provenance JSONB NOT NULL
    DEFAULT '{}'::JSONB;

ALTER TABLE public.catalog_observations
  ADD COLUMN IF NOT EXISTS formula_evidence_tier TEXT NOT NULL
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS formula_version_provenance JSONB NOT NULL
    DEFAULT '{}'::JSONB;

ALTER TABLE public.product_data
  ADD COLUMN IF NOT EXISTS formula_evidence_tier TEXT NOT NULL
    DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS formula_version_provenance JSONB NOT NULL
    DEFAULT '{}'::JSONB;

ALTER TABLE public.catalog_formulas
  DROP CONSTRAINT IF EXISTS catalog_formulas_formula_evidence_tier_check;
ALTER TABLE public.catalog_formulas
  ADD CONSTRAINT catalog_formulas_formula_evidence_tier_check
  CHECK (
    formula_evidence_tier IN (
      'manufacturer_current_exact',
      'retailer_web_version',
      'web_label_version',
      'conflicted',
      'unverified'
    )
  );

ALTER TABLE public.catalog_observations
  DROP CONSTRAINT IF EXISTS catalog_observations_formula_evidence_tier_check;
ALTER TABLE public.catalog_observations
  ADD CONSTRAINT catalog_observations_formula_evidence_tier_check
  CHECK (
    formula_evidence_tier IN (
      'manufacturer_current_exact',
      'retailer_web_version',
      'web_label_version',
      'conflicted',
      'unverified'
    )
  );

ALTER TABLE public.product_data
  DROP CONSTRAINT IF EXISTS product_data_formula_evidence_tier_check;
ALTER TABLE public.product_data
  ADD CONSTRAINT product_data_formula_evidence_tier_check
  CHECK (
    formula_evidence_tier IN (
      'manufacturer_current_exact',
      'retailer_web_version',
      'web_label_version',
      'conflicted',
      'unverified'
    )
  );

CREATE OR REPLACE FUNCTION public.catalog_classify_formula_evidence_tier(
  p_verification_status TEXT,
  p_source_authority TEXT,
  p_ingredient_status TEXT,
  p_image_status TEXT,
  p_is_complete_food BOOLEAN,
  p_has_version_conflict BOOLEAN
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_has_version_conflict, FALSE)
      THEN 'conflicted'
    WHEN p_verification_status = 'verified'
      AND COALESCE(p_is_complete_food, FALSE)
      AND p_source_authority IN ('manufacturer', 'official', 'gdsn')
      AND p_ingredient_status IN ('manufacturer', 'official', 'gdsn')
      AND p_image_status IN ('manufacturer', 'official')
      THEN 'manufacturer_current_exact'
    WHEN p_verification_status = 'verified'
      AND COALESCE(p_is_complete_food, FALSE)
      AND p_source_authority = 'retailer_verified'
      AND p_ingredient_status = 'retailer_verified'
      AND p_image_status = 'retailer_verified'
      THEN 'retailer_web_version'
    WHEN p_verification_status = 'verified'
      AND COALESCE(p_is_complete_food, FALSE)
      AND p_ingredient_status = 'label_ocr_verified'
      THEN 'web_label_version'
    ELSE 'unverified'
  END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_backfill_formula_evidence_tiers(
  p_after_id BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
  v_rows INTEGER := 0;
  v_next_id BIGINT := COALESCE(p_after_id, 0);
BEGIN
  WITH batch AS (
    SELECT formula.id
    FROM public.catalog_formulas formula
    WHERE formula.id > COALESCE(p_after_id, 0)
    ORDER BY formula.id
    LIMIT v_limit
  ),
  updated AS (
    UPDATE public.catalog_formulas formula
    SET
      formula_evidence_tier =
        public.catalog_classify_formula_evidence_tier(
          formula.verification_status,
          formula.source_authority,
          formula.ingredient_verification_status,
          formula.image_verification_status,
          formula.is_complete_food,
          formula.verification_status = 'quarantined'
            AND (
              lower(COALESCE(formula.complete_food_evidence, ''))
                LIKE '%conflict%'
              OR lower(COALESCE(formula.product_line, ''))
                LIKE '%conflict%'
            )
        ),
      formula_version_provenance =
        formula.formula_version_provenance ||
        jsonb_strip_nulls(
          jsonb_build_object(
            'source_url', NULLIF(trim(formula.source_url), ''),
            'source_authority', formula.source_authority,
            'captured_at', formula.last_observed_at,
            'ingredient_verification_status',
              formula.ingredient_verification_status,
            'image_verification_status',
              formula.image_verification_status,
            'version_identity_hash',
              encode(
                digest(
                  formula.formula_key || '|' ||
                  COALESCE(formula.ingredient_text, '') || '|' ||
                  COALESCE(formula.front_image_url, ''),
                  'sha256'
                ),
                'hex'
              )
          )
        ),
      updated_at = now()
    FROM batch
    WHERE formula.id = batch.id
    RETURNING formula.id
  )
  SELECT count(*), COALESCE(max(id), v_next_id)
  INTO v_rows, v_next_id
  FROM updated;

  RETURN jsonb_build_object(
    'rows_updated', v_rows,
    'next_id', v_next_id,
    'done', v_rows < v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_backfill_observation_evidence_tiers(
  p_after_id BIGINT DEFAULT 0,
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 2000);
  v_rows INTEGER := 0;
  v_next_id BIGINT := COALESCE(p_after_id, 0);
BEGIN
  WITH batch AS (
    SELECT observation.id
    FROM public.catalog_observations observation
    WHERE observation.id > COALESCE(p_after_id, 0)
    ORDER BY observation.id
    LIMIT v_limit
  ),
  updated AS (
    UPDATE public.catalog_observations observation
    SET
      formula_evidence_tier = CASE
        WHEN observation.validation_status = 'quarantined'
          AND EXISTS (
            SELECT 1
            FROM unnest(
              COALESCE(
                observation.validation_reasons,
                ARRAY[]::TEXT[]
              )
            ) reason
            WHERE lower(reason) LIKE '%conflict%'
               OR lower(reason) LIKE '%version%'
          )
          THEN 'conflicted'
        WHEN observation.validation_status = 'accepted'
          AND observation.source_authority IN (
            'manufacturer',
            'official',
            'gdsn'
          )
          AND COALESCE(
                NULLIF(trim(observation.ingredient_text), ''),
                ''
              ) <> ''
          AND COALESCE(
                NULLIF(trim(observation.front_image_url), ''),
                ''
              ) <> ''
          THEN 'manufacturer_current_exact'
        WHEN observation.validation_status = 'accepted'
          AND observation.source_authority = 'retailer_verified'
          AND COALESCE(
                NULLIF(trim(observation.ingredient_text), ''),
                ''
              ) <> ''
          AND COALESCE(
                NULLIF(trim(observation.front_image_url), ''),
                ''
              ) <> ''
          THEN 'retailer_web_version'
        ELSE 'unverified'
      END,
      formula_version_provenance =
        observation.formula_version_provenance ||
        jsonb_strip_nulls(
          jsonb_build_object(
            'source_url', NULLIF(trim(observation.source_url), ''),
            'source_slug', observation.source_slug,
            'captured_at', observation.observed_at,
            'package_gtin', NULLIF(trim(observation.gtin), ''),
            'package_size', NULLIF(trim(observation.package_size), ''),
            'content_hash', observation.content_hash
          )
        )
    FROM batch
    WHERE observation.id = batch.id
    RETURNING observation.id
  )
  SELECT count(*), COALESCE(max(id), v_next_id)
  INTO v_rows, v_next_id
  FROM updated;

  RETURN jsonb_build_object(
    'rows_updated', v_rows,
    'next_id', v_next_id,
    'done', v_rows < v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.catalog_backfill_product_evidence_tiers(
  p_after_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit INTEGER DEFAULT 250
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 250), 1), 1000);
  v_rows INTEGER := 0;
  v_next_id UUID := COALESCE(
    p_after_id,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
BEGIN
  WITH batch AS (
    SELECT product.id
    FROM public.product_data product
    WHERE product.id > COALESCE(
        p_after_id,
        '00000000-0000-0000-0000-000000000000'::UUID
      )
      AND product.ingredient_count >= 5
      AND cardinality(product.ingredients) >= 5
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
      AND COALESCE(NULLIF(trim(product.source_url), ''), '') <> ''
      AND (
        (
          product.source_quality IN (
            'manufacturer',
            'official',
            'gdsn'
          )
          AND product.ingredient_verification_status IN (
            'manufacturer',
            'official',
            'gdsn'
          )
          AND product.image_verification_status IN (
            'manufacturer',
            'official'
          )
        )
        OR (
          product.source_quality = 'retailer_verified'
          AND product.ingredient_verification_status =
            'retailer_verified'
          AND product.image_verification_status =
            'retailer_verified'
        )
        OR product.ingredient_verification_status =
          'label_ocr_verified'
      )
    ORDER BY product.id
    LIMIT v_limit
  ),
  updated AS (
    UPDATE public.product_data product
    SET
      formula_evidence_tier = CASE
        WHEN product.source_quality IN (
            'manufacturer',
            'official',
            'gdsn'
          )
          AND product.ingredient_verification_status IN (
            'manufacturer',
            'official',
            'gdsn'
          )
          AND product.image_verification_status IN (
            'manufacturer',
            'official'
          )
          THEN 'manufacturer_current_exact'
        WHEN product.source_quality = 'retailer_verified'
          AND product.ingredient_verification_status =
            'retailer_verified'
          AND product.image_verification_status =
            'retailer_verified'
          THEN 'retailer_web_version'
        WHEN product.ingredient_verification_status =
          'label_ocr_verified'
          THEN 'web_label_version'
        ELSE 'unverified'
      END,
      formula_version_provenance =
        product.formula_version_provenance ||
        jsonb_strip_nulls(
          jsonb_build_object(
            'source_url', NULLIF(trim(product.source_url), ''),
            'source', product.source,
            'captured_at',
              COALESCE(product.verified_at, product.scraped_at),
            'package_gtin', NULLIF(trim(product.gtin), ''),
            'package_size', NULLIF(trim(product.package_size), ''),
            'ingredient_text_hash',
              encode(
                digest(
                  public.catalog_normalize_ingredient_evidence(
                    product.ingredient_text
                  ),
                  'sha256'
                ),
                'hex'
              )
          )
        ),
      nutritional_info =
        COALESCE(product.nutritional_info, '{}'::JSONB) ||
        jsonb_build_object(
          'formula_evidence_tier',
          CASE
            WHEN product.source_quality IN (
                'manufacturer',
                'official',
                'gdsn'
              )
              AND product.ingredient_verification_status IN (
                'manufacturer',
                'official',
                'gdsn'
              )
              AND product.image_verification_status IN (
                'manufacturer',
                'official'
              )
              THEN 'manufacturer_current_exact'
            WHEN product.source_quality = 'retailer_verified'
              AND product.ingredient_verification_status =
                'retailer_verified'
              AND product.image_verification_status =
                'retailer_verified'
              THEN 'retailer_web_version'
            WHEN product.ingredient_verification_status =
              'label_ocr_verified'
              THEN 'web_label_version'
            ELSE 'unverified'
          END
        ),
      updated_at = now()
    FROM batch
    WHERE product.id = batch.id
    RETURNING product.id
  )
  SELECT count(*), COALESCE(max(id), v_next_id)
  INTO v_rows, v_next_id
  FROM updated;

  RETURN jsonb_build_object(
    'rows_updated', v_rows,
    'next_id', v_next_id,
    'done', v_rows < v_limit
  );
END;
$$;

REVOKE ALL
  ON FUNCTION public.catalog_backfill_formula_evidence_tiers(
    BIGINT,
    INTEGER
  )
  FROM PUBLIC, anon, authenticated;
REVOKE ALL
  ON FUNCTION public.catalog_backfill_observation_evidence_tiers(
    BIGINT,
    INTEGER
  )
  FROM PUBLIC, anon, authenticated;
REVOKE ALL
  ON FUNCTION public.catalog_backfill_product_evidence_tiers(
    UUID,
    INTEGER
  )
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE
  ON FUNCTION public.catalog_backfill_formula_evidence_tiers(
    BIGINT,
    INTEGER
  )
  TO service_role;
GRANT EXECUTE
  ON FUNCTION public.catalog_backfill_observation_evidence_tiers(
    BIGINT,
    INTEGER
  )
  TO service_role;
GRANT EXECUTE
  ON FUNCTION public.catalog_backfill_product_evidence_tiers(
    UUID,
    INTEGER
  )
  TO service_role;

-- The three older exact Wellness retailer packages have full readable
-- ingredient panels, matching images, and exact UPCs. Make those source
-- versions barcode-resolvable without claiming current-manufacturer equality.
UPDATE public.catalog_formulas formula
SET
  promoted_cache_key = product.cache_key,
  promoted_at = COALESCE(formula.promoted_at, now()),
  formula_evidence_tier = 'retailer_web_version',
  formula_version_provenance =
    formula.formula_version_provenance ||
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', FALSE,
      'package_gtin', product.gtin,
      'package_size', product.package_size,
      'source_url', product.source_url,
      'captured_at', COALESCE(product.verified_at, product.scraped_at)
    ),
  updated_at = now()
FROM public.product_data product
WHERE product.cache_key IN (
    'petsmart-retail-catalog:076344088936',
    'petsmart-retail-catalog:076344088912',
    'petsmart-retail-catalog:076344182184'
  )
  AND formula.source_url = product.source_url
  AND formula.verification_status = 'verified'
  AND formula.active
  AND formula.source_authority = 'retailer_verified'
  AND product.source_quality = 'retailer_verified'
  AND product.ingredient_verification_status = 'retailer_verified'
  AND product.image_verification_status = 'retailer_verified'
  AND product.is_complete_food
  AND product.catalog_exclusion_reason IS NULL
  AND product.gtin IN (
    '076344088936',
    '076344088912',
    '076344182184'
  )
  AND public.catalog_normalize_ingredient_evidence(
        formula.ingredient_text
      ) =
      public.catalog_normalize_ingredient_evidence(
        product.ingredient_text
      );

UPDATE public.product_data product
SET
  formula_evidence_tier = 'retailer_web_version',
  formula_version_provenance =
    product.formula_version_provenance ||
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', FALSE,
      'package_gtin', product.gtin,
      'package_size', product.package_size,
      'source_url', product.source_url,
      'captured_at', COALESCE(product.verified_at, product.scraped_at)
    ),
  nutritional_info =
    COALESCE(product.nutritional_info, '{}'::JSONB) ||
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version'
    ),
  updated_at = now()
WHERE product.cache_key IN (
    'petsmart-retail-catalog:076344088936',
    'petsmart-retail-catalog:076344088912',
    'petsmart-retail-catalog:076344182184'
  );

UPDATE public.catalog_formulas formula
SET
  formula_evidence_tier = 'manufacturer_current_exact',
  formula_version_provenance =
    formula.formula_version_provenance ||
    jsonb_build_object(
      'version_status', 'manufacturer_current',
      'manufacturer_current_equivalence', TRUE
    ),
  updated_at = now()
WHERE formula.promoted_cache_key IN (
    'wellness-pet-company:wellness wellness complete health chicken oatmeal',
    'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
    'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe'
  );

UPDATE public.product_data product
SET
  formula_evidence_tier = 'manufacturer_current_exact',
  formula_version_provenance =
    product.formula_version_provenance ||
    jsonb_build_object(
      'version_status', 'manufacturer_current',
      'manufacturer_current_equivalence', TRUE
    ),
  nutritional_info =
    COALESCE(product.nutritional_info, '{}'::JSONB) ||
    jsonb_build_object(
      'formula_evidence_tier', 'manufacturer_current_exact'
    ),
  updated_at = now()
WHERE product.cache_key IN (
    'wellness-pet-company:wellness wellness complete health chicken oatmeal',
    'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
    'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe'
  );

CREATE INDEX IF NOT EXISTS
  catalog_formulas_evidence_tier_brand_idx
ON public.catalog_formulas (
  formula_evidence_tier,
  lower(brand),
  pet_type,
  food_form
)
WHERE active;

CREATE INDEX IF NOT EXISTS
  product_data_formula_evidence_tier_idx
ON public.product_data (
  formula_evidence_tier,
  lower(brand),
  pet_type,
  food_form
)
WHERE is_complete_food
  AND catalog_exclusion_reason IS NULL;

CREATE OR REPLACE VIEW public.catalog_formula_evidence_tier_summary
WITH (security_invoker = TRUE)
AS
SELECT
  lower(formula.brand) AS brand_key,
  formula.brand,
  formula.pet_type,
  COALESCE(NULLIF(formula.food_form, ''), 'unknown') AS food_form,
  count(*)::BIGINT AS active_formula_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier =
      'manufacturer_current_exact'
  )::BIGINT AS manufacturer_current_exact_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier =
      'retailer_web_version'
  )::BIGINT AS retailer_web_version_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier =
      'web_label_version'
  )::BIGINT AS web_label_version_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier IN (
        'manufacturer_current_exact',
        'retailer_web_version',
        'web_label_version'
      )
      AND formula.promoted_cache_key IS NOT NULL
      AND cardinality(formula.ingredients) >= 5
      AND COALESCE(NULLIF(trim(formula.front_image_url), ''), '')
        <> ''
  )::BIGINT AS searchable_web_evidenced_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier = 'conflicted'
  )::BIGINT AS conflicted_count,
  count(*) FILTER (
    WHERE formula.formula_evidence_tier = 'unverified'
  )::BIGINT AS unresolved_count
FROM public.catalog_formulas formula
WHERE formula.active
  AND formula.is_complete_food
GROUP BY
  lower(formula.brand),
  formula.brand,
  formula.pet_type,
  COALESCE(NULLIF(formula.food_form, ''), 'unknown');

REVOKE ALL
  ON public.catalog_formula_evidence_tier_summary
  FROM PUBLIC, anon, authenticated;
GRANT SELECT
  ON public.catalog_formula_evidence_tier_summary
  TO service_role;

COMMENT ON COLUMN public.catalog_formulas.formula_evidence_tier IS
  'Source-version evidence tier; retailer/web-label versions stay separate from manufacturer-current exact formulas.';
COMMENT ON COLUMN public.product_data.formula_evidence_tier IS
  'Serving provenance tier also mirrored into nutritional_info for the existing search interface.';
COMMENT ON VIEW public.catalog_formula_evidence_tier_summary IS
  'Reports searchable web-evidenced, manufacturer-current exact, source-versioned, conflicted, and unresolved formulas separately.';

DO $$
DECLARE
  v_current_count INTEGER;
  v_retailer_count INTEGER;
  v_equal_version_collision_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_current_count
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key IN (
      'wellness-pet-company:wellness wellness complete health chicken oatmeal',
      'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
      'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe'
    )
    AND formula.formula_evidence_tier =
      'manufacturer_current_exact';

  SELECT count(*)
  INTO v_retailer_count
  FROM public.catalog_formulas formula
  WHERE formula.promoted_cache_key IN (
      'petsmart-retail-catalog:076344088936',
      'petsmart-retail-catalog:076344088912',
      'petsmart-retail-catalog:076344182184'
    )
    AND formula.formula_evidence_tier =
      'retailer_web_version';

  SELECT count(*)
  INTO v_equal_version_collision_count
  FROM public.catalog_formulas current_formula
  JOIN public.catalog_formulas retailer_formula
    ON retailer_formula.brand = current_formula.brand
   AND retailer_formula.pet_type = current_formula.pet_type
   AND retailer_formula.formula_evidence_tier =
     'retailer_web_version'
   AND current_formula.formula_evidence_tier =
     'manufacturer_current_exact'
   AND retailer_formula.promoted_cache_key IN (
     'petsmart-retail-catalog:076344088936',
     'petsmart-retail-catalog:076344088912',
     'petsmart-retail-catalog:076344182184'
   )
   AND current_formula.promoted_cache_key IN (
     'wellness-pet-company:wellness wellness complete health chicken oatmeal',
     'wellness-pet-company:wellness wellness complete health whitefish sweet potato',
     'wellness-pet-company:wellness wellness core sensitive skin stomach salmon rice recipe'
   )
   AND public.catalog_normalize_ingredient_evidence(
         retailer_formula.ingredient_text
       ) =
       public.catalog_normalize_ingredient_evidence(
         current_formula.ingredient_text
       );

  IF v_current_count <> 3
      OR v_retailer_count <> 3
      OR v_equal_version_collision_count <> 0 THEN
    RAISE EXCEPTION
      'Formula evidence tier gate failed: current %, retailer %, equal-version collisions %',
      v_current_count,
      v_retailer_count,
      v_equal_version_collision_count;
  END IF;
END;
$$;
