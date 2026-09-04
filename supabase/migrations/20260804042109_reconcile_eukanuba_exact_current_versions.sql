-- Repair the Eukanuba Premium Performance ledger collision and reconcile four
-- exact current official package pages that were excluded from the July 26
-- refresh because their serving evidence predated the current URL/package.
--
-- Safety boundaries:
--   * 21/13 SPRINT, 26/16 EXERCISE, and 30/20 SPORT stay distinct formulas.
--   * The current ingredient statement, GTIN, and front image must agree with
--     the exact package evidence captured from each official Eukanuba page.
--   * The PetSmart Lamb & Rice version is retained as retailer_web_version;
--     the official LP package is promoted as a separate web_label_version.
--   * Package sizes remain SKU children.
--   * A promotion may reuse a serving row only when its exact ingredient and
--     image version agree. A shared GTIN alone can never overwrite a source
--     version.

CREATE OR REPLACE FUNCTION public.promote_catalog_formula_without_exact_evidence_reuse(
  p_formula_id BIGINT
)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_formula public.catalog_formulas%ROWTYPE;
  v_gtin TEXT;
  v_cache_key TEXT;
  v_source_slug TEXT;
  v_package_size TEXT;
  v_observation_provenance JSONB;
  v_payload JSONB;
BEGIN
  SELECT *
  INTO v_formula
  FROM public.catalog_formulas
  WHERE id = p_formula_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog formula % does not exist', p_formula_id;
  END IF;
  IF NOT v_formula.active OR v_formula.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'Catalog formula % is not active and verified', p_formula_id;
  END IF;
  IF v_formula.pet_type NOT IN ('dog', 'cat')
     OR NOT v_formula.is_complete_food
     OR cardinality(v_formula.ingredients) < 5
     OR btrim(v_formula.ingredient_text) = ''
     OR btrim(v_formula.front_image_url) = ''
     OR btrim(v_formula.source_url) = ''
     OR v_formula.source_authority NOT IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified'
     )
     OR v_formula.ingredient_verification_status NOT IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified',
       'label_ocr_verified'
     )
     OR v_formula.image_verification_status NOT IN (
       'official', 'manufacturer', 'retailer_verified'
     ) THEN
    RAISE EXCEPTION
      'Catalog formula % does not satisfy serving evidence requirements',
      p_formula_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'ingredient_text'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'front_image_url'
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % lacks accepted field-level evidence', p_formula_id;
  END IF;

  SELECT
    observation.gtin,
    observation.source_slug,
    observation.package_size,
    observation.formula_version_provenance
  INTO
    v_gtin,
    v_source_slug,
    v_package_size,
    v_observation_provenance
  FROM public.catalog_observations observation
  JOIN public.catalog_source_runs source_run
    ON source_run.id = observation.run_id
  WHERE observation.formula_id = p_formula_id
    AND observation.validation_status = 'accepted'
    AND observation.source_url = v_formula.source_url
    AND NULLIF(btrim(observation.gtin), '') IS NOT NULL
    AND btrim(observation.ingredient_text) <> ''
    AND btrim(observation.front_image_url) <> ''
    AND public.catalog_normalize_ingredient_evidence(
          observation.ingredient_text
        ) = public.catalog_normalize_ingredient_evidence(
          v_formula.ingredient_text
        )
    AND observation.front_image_url = v_formula.front_image_url
    AND (
      (source_run.status = 'completed' AND source_run.pagination_complete)
      OR (
        source_run.status IN ('completed', 'quarantined')
        AND source_run.metadata->>'bounded_exact_evidence' = 'true'
        AND source_run.metadata->>'exact_formula_evidence' = 'true'
        AND COALESCE(source_run.expected_count, -1) =
            source_run.observed_count
        AND source_run.observed_count = source_run.accepted_count
        AND source_run.rejected_count = 0
      )
    )
  ORDER BY observation.observed_at DESC, observation.id DESC
  LIMIT 1;

  IF v_gtin IS NULL THEN
    SELECT sku.gtin, sku.source_slug, sku.package_size, '{}'::JSONB
    INTO v_gtin, v_source_slug, v_package_size, v_observation_provenance
    FROM public.catalog_skus sku
    WHERE sku.formula_id = p_formula_id
      AND sku.active
      AND NULLIF(btrim(sku.gtin), '') IS NOT NULL
    ORDER BY sku.last_observed_at DESC, sku.id DESC
    LIMIT 1;
  END IF;

  v_cache_key := v_formula.promoted_cache_key;
  IF v_cache_key IS NULL THEN
    -- Reuse only an exact evidence version. A matching GTIN or URL is not
    -- enough when the ingredient statement or package image differs.
    SELECT existing.cache_key
    INTO v_cache_key
    FROM public.product_data existing
    WHERE lower(btrim(COALESCE(existing.brand, ''))) =
            lower(btrim(COALESCE(v_formula.brand, '')))
      AND lower(btrim(COALESCE(existing.pet_type, ''))) =
            lower(btrim(COALESCE(v_formula.pet_type, '')))
      AND lower(btrim(COALESCE(existing.food_form, ''))) =
            lower(btrim(COALESCE(v_formula.food_form, '')))
      AND public.catalog_product_feed_identity_key(
            existing.brand,
            existing.product_name
          ) = public.catalog_product_feed_identity_key(
            v_formula.brand,
            v_formula.product_name
          )
      AND public.catalog_normalize_ingredient_evidence(
            existing.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_formula.ingredient_text
          )
      AND btrim(COALESCE(existing.image_url, '')) =
            btrim(COALESCE(v_formula.front_image_url, ''))
      AND existing.is_complete_food IS TRUE
      AND COALESCE(existing.catalog_exclusion_reason, '') = ''
      AND (
        (
          NULLIF(btrim(v_gtin), '') IS NOT NULL
          AND existing.gtin = v_gtin
        )
        OR existing.source_url = v_formula.source_url
      )
    ORDER BY existing.updated_at DESC NULLS LAST, existing.cache_key
    LIMIT 1;
  END IF;

  IF v_cache_key IS NULL THEN
    SELECT NULLIF(btrim(observation.raw_payload->>'cache_key'), '')
    INTO v_cache_key
    FROM public.catalog_observations observation
    WHERE observation.formula_id = p_formula_id
      AND observation.validation_status = 'accepted'
      AND observation.source_url = v_formula.source_url
      AND public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_formula.ingredient_text
          )
      AND observation.front_image_url = v_formula.front_image_url
    ORDER BY observation.observed_at DESC, observation.id DESC
    LIMIT 1;
  END IF;

  v_cache_key := COALESCE(
    v_cache_key,
    'census-version:' || md5(
      v_formula.formula_key || ':' ||
      COALESCE(v_gtin, '') || ':' ||
      v_formula.source_url || ':' ||
      v_formula.ingredient_text || ':' ||
      v_formula.front_image_url
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.product_data existing
    WHERE existing.cache_key = v_cache_key
      AND NOT (
        lower(btrim(COALESCE(existing.brand, ''))) =
          lower(btrim(COALESCE(v_formula.brand, '')))
        AND lower(btrim(COALESCE(existing.pet_type, ''))) =
          lower(btrim(COALESCE(v_formula.pet_type, '')))
        AND lower(btrim(COALESCE(existing.food_form, ''))) =
          lower(btrim(COALESCE(v_formula.food_form, '')))
        AND public.catalog_product_feed_identity_key(
              existing.brand,
              existing.product_name
            ) = public.catalog_product_feed_identity_key(
              v_formula.brand,
              v_formula.product_name
            )
        AND public.catalog_normalize_ingredient_evidence(
              existing.ingredient_text
            ) = public.catalog_normalize_ingredient_evidence(
              v_formula.ingredient_text
            )
        AND btrim(COALESCE(existing.image_url, '')) =
          btrim(COALESCE(v_formula.front_image_url, ''))
      )
  ) THEN
    v_cache_key := 'census-version:' || md5(
      v_formula.formula_key || ':' ||
      COALESCE(v_gtin, '') || ':' ||
      v_formula.source_url || ':' ||
      v_formula.ingredient_text || ':' ||
      v_formula.front_image_url
    );
  END IF;

  v_payload := jsonb_build_array(jsonb_build_object(
    'cache_key', v_cache_key,
    'product_name', v_formula.product_name,
    'brand', v_formula.brand,
    'gtin', v_gtin,
    'product_line', v_formula.product_line,
    'flavor', v_formula.flavor,
    'life_stage', v_formula.life_stage,
    'food_form', v_formula.food_form,
    'package_size', COALESCE(v_package_size, ''),
    'pet_type', v_formula.pet_type,
    'ingredients', to_jsonb(v_formula.ingredients),
    'ingredient_text', v_formula.ingredient_text,
    'source', COALESCE(NULLIF(v_source_slug, ''), 'independent-census'),
    'source_quality', v_formula.source_authority,
    'ingredient_verification_status',
      v_formula.ingredient_verification_status,
    'image_verification_status', v_formula.image_verification_status,
    'verified_at', NOW(),
    'source_url', v_formula.source_url,
    'scraped_at', COALESCE(v_formula.last_observed_at, NOW()),
    'expires_at', COALESCE(v_formula.last_observed_at, NOW()) +
      CASE
        WHEN v_formula.source_authority IN ('manufacturer', 'official', 'gdsn')
          THEN INTERVAL '365 days'
        ELSE INTERVAL '90 days'
      END,
    'image_url', v_formula.front_image_url,
    'is_complete_food', TRUE,
    'catalog_exclusion_reason', NULL,
    'formula_evidence_tier', v_formula.formula_evidence_tier,
    'formula_version_provenance',
      COALESCE(v_formula.formula_version_provenance, '{}'::JSONB) ||
      COALESCE(v_observation_provenance, '{}'::JSONB),
    'updated_at', NOW()
  ));

  RETURN QUERY
  SELECT
    imported.cache_key,
    imported.product_name,
    imported.brand,
    imported.source_url
  FROM public.upsert_catalog_product_feed(v_payload) imported;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data serving
    WHERE serving.cache_key = v_cache_key
      AND serving.is_complete_food
      AND COALESCE(serving.catalog_exclusion_reason, '') = ''
      AND lower(btrim(serving.brand)) = lower(btrim(v_formula.brand))
      AND lower(btrim(serving.pet_type)) = lower(btrim(v_formula.pet_type))
      AND lower(btrim(serving.food_form)) = lower(btrim(v_formula.food_form))
      AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            v_formula.ingredient_text
          )
      AND serving.image_url = v_formula.front_image_url
  ) THEN
    RAISE EXCEPTION
      'Catalog formula % did not create or reuse exact serving version %',
      p_formula_id,
      v_cache_key;
  END IF;

  UPDATE public.catalog_formulas
  SET promoted_cache_key = v_cache_key,
      promoted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_formula_id;
END;
$$;

REVOKE ALL
  ON FUNCTION public.promote_catalog_formula_without_exact_evidence_reuse(BIGINT)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_adult_lp_ingredients TEXT :=
    $ingredients$Lamb meal, brewers rice, soybean meal, corn, wheat, chicken fat, ground grain sorghum, corn protein meal, brown rice, dried plain beet pulp, natural flavors, monocalcium phosphate, calcium carbonate, salt, potassium chloride, sodium tripolyphosphate, choline chloride, rosemary extract, preserved with mixed tocopherols and citric acid, DL-methionine, fructooligosaccharides, vitamins [DL-alpha tocopherol acetate (source of vitamin E), biotin, D-calcium pantothenate, vitamin A acetate, riboflavin supplement, niacin supplement, vitamin B12 supplement, pyridoxine hydrochloride (vitamin B6), thiamine mononitrate (vitamin B1), vitamin D3 supplement, folic acid], glucosamine hydrochloride, trace minerals [zinc oxide, ferrous sulfate, manganous oxide, copper sulfate, sodium selenite, calcium iodate], chondroitin sulfate.$ingredients$;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 4336
      AND active
      AND formula_key =
        'eukanuba|eukanuba|premium performance|dog|adult|dry||'
      AND product_name = 'Premium Performance 30/20 Sport Dry Dog Food'
      AND source_url =
        'https://www.eukanuba.com/products/adult-dog-food/premium-performance-3020-sport-dry-dog-food'
      AND md5(ingredient_text) = '0cc80ee04f0226ff64e692106ed09909'
  ) THEN
    RAISE EXCEPTION 'Eukanuba broad Premium Performance precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 31982
      AND active
      AND verification_status = 'verified'
      AND formula_key =
        'mars petcare|eukanuba|premium performance 30 20 sport dry dog food|dog|adult|dry|chicken|'
      AND promoted_cache_key = 'eukanuba:030111861412'
      AND md5(ingredient_text) = '0cc80ee04f0226ff64e692106ed09909'
  ) THEN
    RAISE EXCEPTION 'Eukanuba current 30/20 formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 4335
      AND active
      AND promoted_cache_key = 'eukanuba:030111151025'
      AND md5(ingredient_text) = '289a4cacad81963373b15b43951023ef'
  ) THEN
    RAISE EXCEPTION 'Eukanuba Fit Body formula precondition changed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 7867
      AND active
      AND formula_evidence_tier = 'retailer_web_version'
      AND formula_key =
        'eukanuba|eukanuba|eukanuba large breed adult dry dog food lamb and rice|dog|adult|dry|lamb and rice|'
      AND md5(ingredient_text) = '05833c3b9730b01dcedb0c168193193f'
  ) THEN
    RAISE EXCEPTION 'Eukanuba retailer Lamb & Rice formula precondition changed';
  END IF;

  IF public.catalog_normalize_ingredient_evidence(v_adult_lp_ingredients) <>
     (
       SELECT public.catalog_normalize_ingredient_evidence(ingredient_text)
       FROM public.product_data
       WHERE cache_key = 'petsmart-retail-catalog:030111731333'
     ) THEN
    RAISE EXCEPTION
      'Eukanuba Adult LP official and retailer ingredient versions diverged';
  END IF;

  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE cache_key IN (
      'eukanuba:030111151025',
      'eukanuba:030111610416',
      'eukanuba:030111851413'
    )
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'label_ocr_verified'
      AND image_verification_status = 'manufacturer'
      AND public.catalog_quality_state(
        pet_type,
        is_complete_food,
        catalog_exclusion_reason,
        ingredient_text,
        ingredient_count,
        ingredient_verification_status,
        image_url,
        image_verification_status,
        source_url,
        expires_at
      ) = 'verified_ready'
  ) <> 3 THEN
    RAISE EXCEPTION 'Eukanuba exact serving preconditions changed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE active
      AND identity_hash IN (
        'a2e9978bc862e830d4557d71ec87d54074742940b1d6e8c28bb015aecbe16d67',
        '1179539863f26aca0581021379e74aff144fb486fa2a398eb1ae64983c483882',
        'f7a0c3facdae6b903c11a3638b9ad7b3b4e6766226dd7889e3db4ec0200cd984'
      )
  ) THEN
    RAISE EXCEPTION 'Eukanuba corrected identity already exists';
  END IF;
END;
$$;

CREATE TEMP TABLE eukanuba_exact_formula_map (
  target_key TEXT PRIMARY KEY,
  formula_id BIGINT NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO public.catalog_formulas (
  formula_key,
  manufacturer,
  brand,
  product_name,
  product_line,
  pet_type,
  life_stage,
  food_form,
  flavor,
  diet_condition,
  is_complete_food,
  complete_food_evidence,
  ingredient_text,
  ingredients,
  front_image_url,
  source_url,
  source_authority,
  ingredient_verification_status,
  image_verification_status,
  protected_terms,
  verification_status,
  active,
  is_popular_brand,
  first_observed_at,
  last_observed_at,
  promoted_cache_key,
  promoted_at,
  identity_hash,
  formula_evidence_tier,
  formula_version_provenance,
  created_at,
  updated_at
)
SELECT
  target.formula_key,
  'mars petcare',
  'eukanuba',
  serving.product_name,
  target.product_line,
  'dog',
  'adult',
  'dry',
  'Chicken',
  '',
  TRUE,
  'Exact Eukanuba official package page, GTIN, full label ingredient statement, and matching manufacturer front image.',
  serving.ingredient_text,
  serving.ingredients,
  serving.image_url,
  target.source_url,
  'manufacturer',
  'label_ocr_verified',
  'manufacturer',
  target.protected_terms,
  'verified',
  TRUE,
  TRUE,
  serving.scraped_at,
  '2026-07-26 06:54:08.980+00'::TIMESTAMPTZ,
  NULL,
  NULL,
  target.identity_hash,
  'web_label_version',
  jsonb_build_object(
    'source_url', target.source_url,
    'captured_at', '2026-07-26T06:54:08.980Z',
    'package_gtin', serving.gtin,
    'ingredient_text_hash',
      encode(digest(serving.ingredient_text, 'sha256'), 'hex'),
    'evidence_method',
      'official_package_label_ocr_structurally_reviewed',
    'collision_repair', 'premium_performance_exact_variant_split'
  ),
  NOW(),
  NOW()
FROM public.product_data serving
JOIN (
  VALUES
    (
      'eukanuba:030111610416',
      'mars petcare|eukanuba|premium performance 21 13 sprint dry dog food|dog|adult|dry|chicken|',
      'PREMIUM PERFORMANCE 21/13 SPRINT',
      'https://www.eukanuba.com/products/dry/premium-performance-2113-sprint-dry-dog-food',
      'a2e9978bc862e830d4557d71ec87d54074742940b1d6e8c28bb015aecbe16d67',
      ARRAY['Eukanuba','Premium Performance','21/13','Sprint','Chicken','Dog','Adult','Dry']::TEXT[]
    ),
    (
      'eukanuba:030111851413',
      'mars petcare|eukanuba|premium performance 26 16 exercise dry dog food|dog|adult|dry|chicken|',
      'PREMIUM PERFORMANCE 26/16 EXERCISE',
      'https://www.eukanuba.com/products/dry/premium-performance-2616-exercise-dry-dog-food',
      '1179539863f26aca0581021379e74aff144fb486fa2a398eb1ae64983c483882',
      ARRAY['Eukanuba','Premium Performance','26/16','Exercise','Chicken','Dog','Adult','Dry']::TEXT[]
    )
) AS target(
  cache_key,
  formula_key,
  product_line,
  source_url,
  identity_hash,
  protected_terms
) ON target.cache_key = serving.cache_key;

INSERT INTO eukanuba_exact_formula_map (target_key, formula_id)
SELECT 'performance_21_13', id
FROM public.catalog_formulas
WHERE identity_hash =
  'a2e9978bc862e830d4557d71ec87d54074742940b1d6e8c28bb015aecbe16d67';

INSERT INTO eukanuba_exact_formula_map (target_key, formula_id)
SELECT 'performance_26_16', id
FROM public.catalog_formulas
WHERE identity_hash =
  '1179539863f26aca0581021379e74aff144fb486fa2a398eb1ae64983c483882';

INSERT INTO eukanuba_exact_formula_map VALUES
  ('fit_body_small', 4335),
  ('adult_lp_large', 7867),
  ('performance_30_20', 31982);

DO $$
BEGIN
  IF (SELECT count(*) FROM eukanuba_exact_formula_map) <> 5 THEN
    RAISE EXCEPTION 'Eukanuba exact formula map is incomplete';
  END IF;
END;
$$;

-- Move every observation, SKU, and field-evidence record out of the invalid
-- broad Performance formula before deactivating it.
UPDATE public.catalog_observations
SET formula_id = (
  SELECT formula_id
  FROM eukanuba_exact_formula_map
  WHERE target_key = 'performance_21_13'
)
WHERE formula_id = 4336
  AND (
    source_external_id IN ('533190', 'eukanuba:030111610416')
    OR product_name ILIKE '%21/13%'
  );

UPDATE public.catalog_observations
SET formula_id = (
  SELECT formula_id
  FROM eukanuba_exact_formula_map
  WHERE target_key = 'performance_26_16'
)
WHERE formula_id = 4336
  AND (
    source_external_id = 'eukanuba:030111851413'
    OR product_name ILIKE '%26/16 Exercise Dry Dog Food%'
  );

UPDATE public.catalog_observations
SET formula_id = 31982
WHERE formula_id = 4336
  AND (
    source_external_id = 'eukanuba:030111820419'
    OR product_name ILIKE '%30/20 Sport Dry Dog Food%'
  );

UPDATE public.catalog_skus
SET formula_id = (
      SELECT formula_id
      FROM eukanuba_exact_formula_map
      WHERE target_key = 'performance_21_13'
    ),
    updated_at = NOW()
WHERE formula_id = 4336
  AND source_external_id IN ('533190', 'eukanuba:030111610416');

UPDATE public.catalog_skus
SET formula_id = (
      SELECT formula_id
      FROM eukanuba_exact_formula_map
      WHERE target_key = 'performance_26_16'
    ),
    updated_at = NOW()
WHERE formula_id = 4336
  AND source_external_id = 'eukanuba:030111851413';

UPDATE public.catalog_skus
SET formula_id = 31982,
    updated_at = NOW()
WHERE formula_id = 4336
  AND source_external_id = 'eukanuba:030111820419';

UPDATE public.catalog_field_evidence
SET formula_id = (
  SELECT formula_id
  FROM eukanuba_exact_formula_map
  WHERE target_key = 'performance_21_13'
)
WHERE formula_id = 4336
  AND source_url LIKE '%premium-performance-2113-sprint-dry-dog-food';

UPDATE public.catalog_field_evidence
SET formula_id = (
  SELECT formula_id
  FROM eukanuba_exact_formula_map
  WHERE target_key = 'performance_26_16'
)
WHERE formula_id = 4336
  AND source_url LIKE '%premium-performance-2616-exercise-dry-dog-food';

UPDATE public.catalog_field_evidence
SET formula_id = 31982
WHERE formula_id = 4336
  AND source_url LIKE '%premium-performance-3020-sport-dry-dog-food';

UPDATE public.catalog_formulas
SET active = FALSE,
    verification_status = 'quarantined',
    absent_since = NOW(),
    complete_food_evidence =
      'Invalid legacy ledger collision: 21/13, 26/16, and 30/20 were merged despite distinct exact package evidence.',
    formula_evidence_tier = 'conflicted',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'quarantine_reason',
          'cross_variant_premium_performance_formula_collision',
        'reconciled_at', NOW(),
        'replacement_formula_ids',
          (SELECT jsonb_agg(formula_id ORDER BY target_key)
           FROM eukanuba_exact_formula_map
           WHERE target_key LIKE 'performance_%')
      ),
    updated_at = NOW()
WHERE id = 4336;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.catalog_observations WHERE formula_id = 4336
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_skus WHERE formula_id = 4336 AND active
  ) OR EXISTS (
    SELECT 1 FROM public.catalog_field_evidence WHERE formula_id = 4336
  ) THEN
    RAISE EXCEPTION 'Eukanuba broad formula still owns exact evidence';
  END IF;
END;
$$;

CREATE TEMP TABLE eukanuba_current_evidence (
  target_key TEXT PRIMARY KEY,
  formula_id BIGINT NOT NULL,
  cache_key TEXT NOT NULL,
  formula_key TEXT NOT NULL,
  identity_hash TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  flavor TEXT NOT NULL,
  gtin TEXT NOT NULL,
  package_size TEXT NOT NULL,
  source_url TEXT NOT NULL,
  front_image_url TEXT NOT NULL,
  ingredient_text TEXT NOT NULL,
  ingredients TEXT[] NOT NULL,
  content_hash TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL
) ON COMMIT DROP;

INSERT INTO eukanuba_current_evidence
SELECT
  target.target_key,
  map.formula_id,
  target.cache_key,
  target.formula_key,
  target.identity_hash,
  target.product_name,
  target.product_line,
  target.flavor,
  target.gtin,
  target.package_size,
  target.source_url,
  target.front_image_url,
  serving.ingredient_text,
  serving.ingredients,
  target.content_hash,
  '2026-07-26 06:54:08.980+00'::TIMESTAMPTZ
FROM (
  VALUES
    (
      'fit_body_small',
      'eukanuba:030111151025',
      'eukanuba|eukanuba|fit body weight control small breed|dog|adult|dry|chicken|',
      '295b1ad13fd66b53c977fd1276373a9625c40d1f4afe4fa8c18e785ce382345d',
      'Fit Body Weight Control Small Breed Dry Dog Food',
      'FIT BODY Weight Control Small Breed',
      'Chicken',
      '030111151025',
      '15 lb',
      'https://www.eukanuba.com/products/dry/eukanuba-fit-body-weight-control-small-breed-dry-dog-food-15-lb',
      'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/b626d6eb40c161fbf6a1c686195bb27850fbf267.png',
      'b391275523b098472a79a59853b806fa21de256b5db410b33621342ca0209c04'
    ),
    (
      'performance_21_13',
      'eukanuba:030111610416',
      'mars petcare|eukanuba|premium performance 21 13 sprint dry dog food|dog|adult|dry|chicken|',
      'a2e9978bc862e830d4557d71ec87d54074742940b1d6e8c28bb015aecbe16d67',
      'Premium Performance 21/13 Sprint Dry Dog Food',
      'PREMIUM PERFORMANCE 21/13 SPRINT',
      'Chicken',
      '030111610416',
      '4.5 lb, 28 lb',
      'https://www.eukanuba.com/products/dry/premium-performance-2113-sprint-dry-dog-food',
      'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/4a0fe756f236a5673207ebd0af8a90e613812fbc.png',
      '52f28d2f1299bc4e5a45db4a280a0f747cd1acad558d67831d108b3f61bf005a'
    ),
    (
      'performance_26_16',
      'eukanuba:030111851413',
      'mars petcare|eukanuba|premium performance 26 16 exercise dry dog food|dog|adult|dry|chicken|',
      '1179539863f26aca0581021379e74aff144fb486fa2a398eb1ae64983c483882',
      'Premium Performance 26/16 Exercise Dry Dog Food',
      'PREMIUM PERFORMANCE 26/16 EXERCISE',
      'Chicken',
      '030111851413',
      '14 lb, 28 lb, 4.5 lb',
      'https://www.eukanuba.com/products/dry/premium-performance-2616-exercise-dry-dog-food',
      'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/5e13447d5d9f8527a6eff1454967332ca4709d2a.png',
      'a24b764c7c22136738693b8e8c4f538142bc56c4e8660be1bce2a71782fd1978'
    )
) AS target(
  target_key,
  cache_key,
  formula_key,
  identity_hash,
  product_name,
  product_line,
  flavor,
  gtin,
  package_size,
  source_url,
  front_image_url,
  content_hash
)
JOIN eukanuba_exact_formula_map map
  ON map.target_key = target.target_key
JOIN public.product_data serving
  ON serving.cache_key = target.cache_key;

INSERT INTO eukanuba_current_evidence VALUES (
  'adult_lp_large',
  7867,
  'eukanuba:030111731333',
  'mars petcare|eukanuba|eukanuba adult lp large breed dry dog food|dog|adult|dry|lamb|',
  'f7a0c3facdae6b903c11a3638b9ad7b3b4e6766226dd7889e3db4ec0200cd984',
  'Adult LP Large Breed Dry Dog Food',
  'ADULT LP Large Breed',
  'Lamb',
  '030111731333',
  '33 lb',
  'https://www.eukanuba.com/products/dry/eukanuba-adult-lp-large-breed-dry-dog-food-33-lb',
  'https://www.eukanuba.com/sites/g/files/fnmzdf5906/files/migrate-product-files/images/wccydjw2b67socqwx8fk.png',
  $ingredients$Lamb meal, brewers rice, soybean meal, corn, wheat, chicken fat, ground grain sorghum, corn protein meal, brown rice, dried plain beet pulp, natural flavors, monocalcium phosphate, calcium carbonate, salt, potassium chloride, sodium tripolyphosphate, choline chloride, rosemary extract, preserved with mixed tocopherols and citric acid, DL-methionine, fructooligosaccharides, vitamins [DL-alpha tocopherol acetate (source of vitamin E), biotin, D-calcium pantothenate, vitamin A acetate, riboflavin supplement, niacin supplement, vitamin B12 supplement, pyridoxine hydrochloride (vitamin B6), thiamine mononitrate (vitamin B1), vitamin D3 supplement, folic acid], glucosamine hydrochloride, trace minerals [zinc oxide, ferrous sulfate, manganous oxide, copper sulfate, sodium selenite, calcium iodate], chondroitin sulfate.$ingredients$,
  public.catalog_split_ingredient_statement(
    $ingredients$Lamb meal, brewers rice, soybean meal, corn, wheat, chicken fat, ground grain sorghum, corn protein meal, brown rice, dried plain beet pulp, natural flavors, monocalcium phosphate, calcium carbonate, salt, potassium chloride, sodium tripolyphosphate, choline chloride, rosemary extract, preserved with mixed tocopherols and citric acid, DL-methionine, fructooligosaccharides, vitamins [DL-alpha tocopherol acetate (source of vitamin E), biotin, D-calcium pantothenate, vitamin A acetate, riboflavin supplement, niacin supplement, vitamin B12 supplement, pyridoxine hydrochloride (vitamin B6), thiamine mononitrate (vitamin B1), vitamin D3 supplement, folic acid], glucosamine hydrochloride, trace minerals [zinc oxide, ferrous sulfate, manganous oxide, copper sulfate, sodium selenite, calcium iodate], chondroitin sulfate.$ingredients$
  ),
  'bdd92d2d4f187f8f13753806dd2927e077b544a7689ce353ada123fac1adc9f8',
  '2026-07-26 06:54:08.980+00'::TIMESTAMPTZ
);

DO $$
BEGIN
  IF (SELECT count(*) FROM eukanuba_current_evidence) <> 4
     OR EXISTS (
       SELECT 1
       FROM eukanuba_current_evidence
       WHERE cardinality(ingredients) < 5
          OR btrim(ingredient_text) = ''
          OR btrim(front_image_url) = ''
          OR btrim(gtin) = ''
     ) THEN
    RAISE EXCEPTION 'Eukanuba current evidence inventory is incomplete';
  END IF;
END;
$$;

-- Refresh the three already-serving exact versions only after their exact
-- current evidence rows have been materialized locally in this transaction.
UPDATE public.product_data serving
SET product_name = target.product_name,
    brand = 'Eukanuba',
    product_line = target.product_line,
    flavor = target.flavor,
    life_stage = 'adult',
    food_form = 'dry',
    pet_type = 'dog',
    source = 'eukanuba',
    source_quality = 'manufacturer',
    source_url = target.source_url,
    image_url = target.front_image_url,
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    verified_at = NOW(),
    scraped_at = target.observed_at,
    expires_at = target.observed_at + INTERVAL '365 days',
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'source_url', target.source_url,
        'captured_at', target.observed_at,
        'package_gtin', target.gtin,
        'package_size', target.package_size,
        'ingredient_text_hash',
          encode(digest(target.ingredient_text, 'sha256'), 'hex'),
        'front_image_url', target.front_image_url,
        'evidence_method',
          'official_package_label_ocr_structurally_reviewed',
        'previous_version_retained_in_catalog_observations', TRUE
      ),
    updated_at = NOW()
FROM eukanuba_current_evidence target
WHERE serving.cache_key = target.cache_key
  AND target.target_key <> 'adult_lp_large'
  AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) = public.catalog_normalize_ingredient_evidence(
        target.ingredient_text
      );

-- Refresh canonical formula identity/evidence without merging formulas.
UPDATE public.catalog_formulas formula
SET formula_key = target.formula_key,
    identity_hash = target.identity_hash,
    manufacturer = 'mars petcare',
    brand = 'eukanuba',
    product_name = target.product_name,
    product_line = target.product_line,
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = target.flavor,
    diet_condition = '',
    is_complete_food = TRUE,
    complete_food_evidence =
      'Exact current official Eukanuba package page with product-local complete-food identity, full label ingredient statement, GTIN, and matching front image.',
    ingredient_text = target.ingredient_text,
    ingredients = target.ingredients,
    front_image_url = target.front_image_url,
    source_url = target.source_url,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'label_ocr_verified',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'Eukanuba', target.product_line, target.flavor,
      'Dog', 'Adult', 'Dry'
    ]::TEXT[],
    verification_status = 'verified',
    active = TRUE,
    absent_since = NULL,
    is_popular_brand = TRUE,
    last_observed_at = target.observed_at,
    formula_evidence_tier = 'web_label_version',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'source_url', target.source_url,
        'captured_at', target.observed_at,
        'package_gtin', target.gtin,
        'package_size', target.package_size,
        'ingredient_text_hash',
          encode(digest(target.ingredient_text, 'sha256'), 'hex'),
        'front_image_url', target.front_image_url,
        'evidence_method',
          'official_package_label_ocr_structurally_reviewed',
        'identity_reconciliation',
          'exact_current_package_version'
      ),
    updated_at = NOW()
FROM eukanuba_current_evidence target
WHERE formula.id = target.formula_id;

-- Make the already-current 30/20 line explicit after moving the legacy SKU.
UPDATE public.catalog_formulas
SET product_line = 'PREMIUM PERFORMANCE 30/20 SPORT',
    flavor = 'Chicken',
    protected_terms = ARRAY[
      'Eukanuba','Premium Performance','30/20','Sport',
      'Chicken','Dog','Adult','Dry'
    ]::TEXT[],
    updated_at = NOW()
WHERE id = 31982;

UPDATE public.product_data
SET product_line = 'PREMIUM PERFORMANCE 30/20 SPORT',
    flavor = 'Chicken',
    updated_at = NOW()
WHERE cache_key = 'eukanuba:030111861412';

INSERT INTO public.catalog_source_runs (
  run_key,
  source_slug,
  source_type,
  coverage_role,
  status,
  started_at,
  finished_at,
  expected_count,
  observed_count,
  accepted_count,
  rejected_count,
  pagination_complete,
  source_content_hash,
  checkpoint,
  metadata,
  updated_at
) VALUES (
  'eukanuba:bounded-current-package-evidence:2026-07-26-v1',
  'eukanuba',
  'manufacturer',
  'verification',
  'completed',
  '2026-07-26 06:54:08.980+00'::TIMESTAMPTZ,
  NOW(),
  4,
  4,
  4,
  0,
  TRUE,
  encode(digest(
    'b391275523b098472a79a59853b806fa21de256b5db410b33621342ca0209c04|' ||
    '52f28d2f1299bc4e5a45db4a280a0f747cd1acad558d67831d108b3f61bf005a|' ||
    'a24b764c7c22136738693b8e8c4f538142bc56c4e8660be1bce2a71782fd1978|' ||
    'bdd92d2d4f187f8f13753806dd2927e077b544a7689ce353ada123fac1adc9f8',
    'sha256'
  ), 'hex'),
  jsonb_build_object(
    'captured_count', 4,
    'official_urls_http_reconfirmed', 4,
    'official_urls_http_reconfirmed_at', NOW()
  ),
  jsonb_build_object(
    'bounded_exact_evidence', TRUE,
    'exact_formula_evidence', TRUE,
    'package_size_is_sku_only', TRUE,
    'ingredient_evidence_method',
      'official_package_label_ocr_structurally_reviewed',
    'current_page_identity_and_image_reconfirmed', TRUE,
    'source_versions_preserved', TRUE
  ),
  NOW()
);

INSERT INTO public.catalog_observations (
  run_id,
  formula_id,
  source_slug,
  source_external_id,
  source_url,
  source_authority,
  gtin,
  manufacturer,
  brand,
  product_name,
  product_line,
  pet_type,
  life_stage,
  food_form,
  flavor,
  diet_condition,
  package_size,
  ingredient_text,
  front_image_url,
  is_complete_food,
  available_in_us,
  observed_at,
  content_hash,
  validation_status,
  validation_reasons,
  raw_payload,
  formula_evidence_tier,
  formula_version_provenance
)
SELECT
  source_run.id,
  target.formula_id,
  'eukanuba',
  target.cache_key,
  target.source_url,
  'manufacturer',
  target.gtin,
  'Mars Petcare',
  'Eukanuba',
  target.product_name,
  target.product_line,
  'dog',
  'adult',
  'dry',
  target.flavor,
  '',
  target.package_size,
  target.ingredient_text,
  target.front_image_url,
  TRUE,
  TRUE,
  target.observed_at,
  target.content_hash,
  'accepted',
  ARRAY[]::TEXT[],
  jsonb_build_object(
    'cache_key', target.cache_key,
    'formula_key', target.formula_key,
    'identity_hash', target.identity_hash,
    'ingredient_source_url', target.source_url,
    'image_source_url', target.source_url,
    'ingredient_verification_status', 'label_ocr_verified',
    'image_verification_status', 'manufacturer',
    'exact_formula_evidence', TRUE,
    'package_size_is_sku_only', TRUE,
    'source_page_identity_http_reconfirmed_at', NOW()
  ),
  'web_label_version',
  jsonb_build_object(
    'source_url', target.source_url,
    'captured_at', target.observed_at,
    'package_gtin', target.gtin,
    'package_size', target.package_size,
    'ingredient_text_hash',
      encode(digest(target.ingredient_text, 'sha256'), 'hex'),
    'front_image_url', target.front_image_url,
    'evidence_method',
      'official_package_label_ocr_structurally_reviewed'
  )
FROM eukanuba_current_evidence target
CROSS JOIN public.catalog_source_runs source_run
WHERE source_run.run_key =
  'eukanuba:bounded-current-package-evidence:2026-07-26-v1';

INSERT INTO public.catalog_skus (
  formula_id,
  gtin,
  package_size,
  package_count,
  source_slug,
  source_external_id,
  source_url,
  active,
  first_observed_at,
  last_observed_at,
  created_at,
  updated_at
)
SELECT
  target.formula_id,
  target.gtin,
  target.package_size,
  NULL,
  'eukanuba',
  target.cache_key,
  target.source_url,
  TRUE,
  target.observed_at,
  target.observed_at,
  NOW(),
  NOW()
FROM eukanuba_current_evidence target
ON CONFLICT (
  source_slug,
  source_external_id,
  gtin,
  package_size
) DO UPDATE
SET formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = TRUE,
    last_observed_at = excluded.last_observed_at,
    updated_at = NOW();

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash
)
SELECT
  target.formula_id,
  observation.id,
  evidence.field_name,
  evidence.field_value,
  target.source_url,
  'manufacturer',
  TRUE,
  target.observed_at,
  evidence.content_hash
FROM eukanuba_current_evidence target
JOIN public.catalog_source_runs source_run
  ON source_run.run_key =
    'eukanuba:bounded-current-package-evidence:2026-07-26-v1'
JOIN public.catalog_observations observation
  ON observation.run_id = source_run.id
 AND observation.source_external_id = target.cache_key
CROSS JOIN LATERAL (
  VALUES
    (
      'ingredient_text'::TEXT,
      to_jsonb(target.ingredient_text),
      encode(digest(target.ingredient_text, 'sha256'), 'hex')
    ),
    (
      'front_image_url'::TEXT,
      to_jsonb(target.front_image_url),
      encode(digest(target.front_image_url, 'sha256'), 'hex')
    ),
    (
      'canonical_identity'::TEXT,
      jsonb_build_object(
        'formula_key', target.formula_key,
        'identity_hash', target.identity_hash,
        'product_name', target.product_name,
        'product_line', target.product_line,
        'pet_type', 'dog',
        'life_stage', 'adult',
        'food_form', 'dry',
        'flavor', target.flavor,
        'gtin', target.gtin
      ),
      target.identity_hash
    )
) AS evidence(field_name, field_value, content_hash)
ON CONFLICT (
  formula_id,
  field_name,
  source_url,
  content_hash
) DO UPDATE
SET observation_id = excluded.observation_id,
    field_value = excluded.field_value,
    accepted = TRUE,
    observed_at = excluded.observed_at;

-- Use the gated promotion path. The hardened internal promoter reuses the
-- exact 21/13 and 26/16 rows, while creating a distinct official LP source
-- version instead of overwriting its exact PetSmart package record.
DO $$
DECLARE
  v_target RECORD;
  v_result RECORD;
BEGIN
  FOR v_target IN
    SELECT target_key, formula_id
    FROM eukanuba_exact_formula_map
    WHERE target_key IN (
      'performance_21_13',
      'performance_26_16',
      'adult_lp_large'
    )
    ORDER BY target_key
  LOOP
    SELECT *
    INTO v_result
    FROM public.promote_catalog_formula(v_target.formula_id);

    IF v_result.cache_key IS NULL THEN
      RAISE EXCEPTION
        'Eukanuba gated promotion returned no serving row for %',
        v_target.target_key;
    END IF;
  END LOOP;
END;
$$;

-- Preserve every exact old/current identity as an explicit alias. The invalid
-- broad "Premium Performance" key is intentionally not aliased to any one
-- product.
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata,
  created_at,
  updated_at
)
SELECT
  aliases.alias_formula_key,
  target.formula_id,
  target.identity_hash,
  'manual_review',
  target.source_url,
  jsonb_build_object(
    'review_kind', 'exact_current_eukanuba_package_reconciliation',
    'gtin', target.gtin,
    'ingredient_text_hash',
      encode(digest(target.ingredient_text, 'sha256'), 'hex'),
    'front_image_url', target.front_image_url,
    'identity_boundaries', ARRAY[
      'brand','product_line','performance_ratio','life_stage',
      'food_form','recipe','formula_version'
    ]::TEXT[],
    'reviewed_at', NOW()
  ),
  NOW(),
  NOW()
FROM eukanuba_current_evidence target
CROSS JOIN LATERAL unnest(
  CASE target.target_key
    WHEN 'fit_body_small' THEN ARRAY[
      'mars petcare|eukanuba|eukanuba fit body weight control small breed dry dog food|dog|adult|dry|chicken|',
      'eukanuba|eukanuba|eukanuba fit body weight control small breed dry dog food|dog|adult|dry|chicken|'
    ]::TEXT[]
    WHEN 'performance_21_13' THEN ARRAY[
      'eukanuba|eukanuba|premium performance 21 13 sprint dry dog food|dog|adult|dry|chicken|'
    ]::TEXT[]
    WHEN 'performance_26_16' THEN ARRAY[
      'eukanuba|eukanuba|premium performance 26 16 exercise dry dog food|dog|adult|dry|chicken|'
    ]::TEXT[]
    WHEN 'adult_lp_large' THEN ARRAY[
      'eukanuba|eukanuba|eukanuba adult lp large breed dry dog food|dog|adult|dry|lamb|',
      'eukanuba|eukanuba|eukanuba large breed adult dry dog food lamb and rice|dog|adult|dry|lamb and rice|'
    ]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END
) aliases(alias_formula_key)
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = NOW();

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata,
  created_at,
  updated_at
)
SELECT
  'eukanuba|eukanuba|premium performance 30 20 sport dry dog food|dog|adult|dry|chicken|',
  formula.id,
  formula.identity_hash,
  'manual_review',
  formula.source_url,
  jsonb_build_object(
    'review_kind', 'exact_legacy_package_same_ingredient_version',
    'legacy_gtin', '030111820419',
    'current_gtin', '030111861412',
    'ingredient_md5', '0cc80ee04f0226ff64e692106ed09909',
    'not_merged_with_21_13_or_26_16', TRUE,
    'reviewed_at', NOW()
  ),
  NOW(),
  NOW()
FROM public.catalog_formulas formula
WHERE formula.id = 31982
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = NOW();

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  updated_at
)
SELECT
  formula.promoted_cache_key,
  aliases.alias_text,
  public.normalize_verified_product_search_query(aliases.alias_text),
  target.source_url,
  'label_ocr_verified',
  target.observed_at,
  jsonb_build_object(
    'source', 'eukanuba_exact_current_version_reconciliation',
    'formula_id', target.formula_id,
    'canonical_formula_key', target.formula_key,
    'gtin', target.gtin,
    'ingredient_text_hash',
      encode(digest(target.ingredient_text, 'sha256'), 'hex'),
    'front_image_url', target.front_image_url,
    'identity_boundaries', ARRAY[
      'brand','product_line','performance_ratio','life_stage',
      'food_form','recipe','formula_version'
    ]::TEXT[]
  ),
  NOW()
FROM eukanuba_current_evidence target
JOIN public.catalog_formulas formula ON formula.id = target.formula_id
CROSS JOIN LATERAL unnest(
  CASE target.target_key
    WHEN 'fit_body_small' THEN ARRAY[
      'Eukanuba Fit Body Weight Control Small Breed Dry Dog Food'
    ]::TEXT[]
    WHEN 'performance_21_13' THEN ARRAY[
      'Eukanuba Premium Performance 21/13 Sprint Dry Dog Food'
    ]::TEXT[]
    WHEN 'performance_26_16' THEN ARRAY[
      'Eukanuba Premium Performance 26/16 Exercise Dry Dog Food'
    ]::TEXT[]
    WHEN 'adult_lp_large' THEN ARRAY[
      'Eukanuba Adult LP Large Breed Dry Dog Food',
      'Eukanuba Large Breed Adult Dry Dog Food Lamb & Rice'
    ]::TEXT[]
    ELSE ARRAY[]::TEXT[]
  END
) aliases(alias_text)
WHERE formula.promoted_cache_key IS NOT NULL
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET cache_key = excluded.cache_key,
    alias_text = excluded.alias_text,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    updated_at = NOW();

DO $$
DECLARE
  v_target RECORD;
  v_top_cache_key TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 4336
      AND (active OR verification_status <> 'quarantined')
  ) THEN
    RAISE EXCEPTION 'Eukanuba broad formula was not quarantined';
  END IF;

  IF (
    SELECT count(DISTINCT formula_id)
    FROM public.catalog_skus
    WHERE active
      AND gtin IN (
        '030111610416',
        '030111851413',
        '030111820419',
        '030111861412'
      )
  ) <> 3 THEN
    RAISE EXCEPTION 'Eukanuba Premium Performance variants are not distinct';
  END IF;

  IF EXISTS (
    SELECT gtin
    FROM public.catalog_skus
    JOIN public.catalog_formulas formula
      ON formula.id = catalog_skus.formula_id
    WHERE catalog_skus.active
      AND formula.active
      AND gtin IN (
        '030111610416',
        '030111851413',
        '030111820419',
        '030111861412'
      )
    GROUP BY gtin
    HAVING count(DISTINCT formula.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Eukanuba exact GTIN ownership remains ambiguous';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'petsmart-retail-catalog:030111731333'
      AND formula_evidence_tier = 'retailer_web_version'
      AND source_url =
        'https://www.petsmart.com/dog/food/dry-food/eukanuba-and-trade-large-breed-adult-dry-dog-food-lamb-and-rice-73799.html'
      AND md5(ingredient_text) = '05833c3b9730b01dcedb0c168193193f'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'eukanuba:030111731333'
      AND formula_evidence_tier = 'web_label_version'
      AND source_url =
        'https://www.eukanuba.com/products/dry/eukanuba-adult-lp-large-breed-dry-dog-food-33-lb'
      AND md5(ingredient_text) = '3aa2b865afc41c1befbab5f26e586c86'
  ) THEN
    RAISE EXCEPTION 'Eukanuba Adult LP source versions were not preserved';
  END IF;

  IF (
    SELECT count(*)
    FROM eukanuba_current_evidence target
    JOIN public.catalog_formulas formula ON formula.id = target.formula_id
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.active
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'web_label_version'
      AND serving.formula_evidence_tier = 'web_label_version'
      AND public.catalog_quality_state(
        serving.pet_type,
        serving.is_complete_food,
        serving.catalog_exclusion_reason,
        serving.ingredient_text,
        serving.ingredient_count,
        serving.ingredient_verification_status,
        serving.image_url,
        serving.image_verification_status,
        serving.source_url,
        serving.expires_at
      ) = 'verified_ready'
      AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) = public.catalog_normalize_ingredient_evidence(
            target.ingredient_text
          )
      AND serving.image_url = target.front_image_url
      AND serving.source_url = target.source_url
  ) <> 4 THEN
    RAISE EXCEPTION 'Eukanuba current exact serving verification failed';
  END IF;

  FOR v_target IN
    SELECT *
    FROM (
      VALUES
        (
          'Eukanuba Fit Body Weight Control Small Breed Dry Dog Food',
          'eukanuba:030111151025'
        ),
        (
          'Eukanuba Premium Performance 21/13 Sprint Dry Dog Food',
          'eukanuba:030111610416'
        ),
        (
          'Eukanuba Premium Performance 26/16 Exercise Dry Dog Food',
          'eukanuba:030111851413'
        ),
        (
          'Eukanuba Adult LP Large Breed Dry Dog Food',
          'eukanuba:030111731333'
        )
    ) AS targets(query_text, expected_cache_key)
  LOOP
    SELECT result.cache_key
    INTO v_top_cache_key
    FROM public.search_verified_products(v_target.query_text, 5) result
    LIMIT 1;

    IF v_top_cache_key IS DISTINCT FROM v_target.expected_cache_key THEN
      RAISE EXCEPTION
        'Eukanuba exact search failed for %, expected %, found %',
        v_target.query_text,
        v_target.expected_cache_key,
        v_top_cache_key;
    END IF;
  END LOOP;
END;
$$;
