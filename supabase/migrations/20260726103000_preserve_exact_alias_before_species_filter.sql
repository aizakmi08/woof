-- Exact manufacturer titles must win before generic species words are removed
-- from the indexed query. Otherwise a full title such as "... Large Breed
-- Senior Dry Dog Food" can rank a newer sibling above the exact requested
-- formula merely because both documents contain the remaining tokens.

INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  updated_at
)
SELECT DISTINCT
  formula.promoted_cache_key,
  serving.product_name,
  public.normalize_verified_product_search_query(serving.product_name),
  serving.source_url,
  'manufacturer',
  COALESCE(serving.verified_at, observation.observed_at),
  jsonb_build_object(
    'exact_current_manufacturer_title', TRUE,
    'source_run_key', run.run_key,
    'formula_key', formula.formula_key,
    'species_boundary', formula.pet_type,
    'life_stage_boundary', formula.life_stage,
    'food_form_boundary', formula.food_form,
    'recipe_boundary', formula.flavor
  ),
  TRUE,
  now()
FROM public.catalog_source_runs run
JOIN public.catalog_observations observation
  ON observation.run_id = run.id
 AND observation.validation_status = 'accepted'
JOIN public.catalog_formulas formula
  ON formula.id = observation.formula_id
 AND formula.active
 AND formula.verification_status = 'verified'
JOIN public.product_data serving
  ON serving.cache_key = formula.promoted_cache_key
 AND serving.is_complete_food
 AND serving.catalog_exclusion_reason IS NULL
WHERE run.run_key =
    'nestle-purina-pro-plan:official-formula-inventory:72de3bb513bb4c62f36337bd'
  AND serving.source_url LIKE 'https://www.purina.com/%'
  AND serving.source_quality = 'manufacturer'
  AND serving.ingredient_verification_status = 'manufacturer'
  AND serving.image_verification_status = 'manufacturer'
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

-- Purina's current PDP title sometimes starts with "Pro Plan" while shoppers
-- and retailer labels use the full "Purina Pro Plan" brand. Preserve that
-- exact, product-local conjunction without creating a broad sibling alias.
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance,
  active,
  updated_at
)
SELECT DISTINCT
  formula.promoted_cache_key,
  'Purina ' || serving.product_name,
  public.normalize_verified_product_search_query(
    'Purina ' || serving.product_name
  ),
  serving.source_url,
  'manufacturer',
  COALESCE(serving.verified_at, observation.observed_at),
  jsonb_build_object(
    'exact_current_manufacturer_title', TRUE,
    'consumer_brand_prefix', 'Purina',
    'source_run_key', run.run_key,
    'formula_key', formula.formula_key,
    'species_boundary', formula.pet_type,
    'life_stage_boundary', formula.life_stage,
    'food_form_boundary', formula.food_form,
    'recipe_boundary', formula.flavor
  ),
  TRUE,
  now()
FROM public.catalog_source_runs run
JOIN public.catalog_observations observation
  ON observation.run_id = run.id
 AND observation.validation_status = 'accepted'
JOIN public.catalog_formulas formula
  ON formula.id = observation.formula_id
 AND formula.active
 AND formula.verification_status = 'verified'
JOIN public.product_data serving
  ON serving.cache_key = formula.promoted_cache_key
 AND serving.is_complete_food
 AND serving.catalog_exclusion_reason IS NULL
WHERE run.run_key =
    'nestle-purina-pro-plan:official-formula-inventory:72de3bb513bb4c62f36337bd'
  AND serving.product_name ~* '^Pro Plan\M'
  AND serving.source_url LIKE 'https://www.purina.com/%'
  AND serving.source_quality = 'manufacturer'
  AND serving.ingredient_verification_status = 'manufacturer'
  AND serving.image_verification_status = 'manufacturer'
ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

DO $$
DECLARE
  v_formula_count INTEGER;
  v_exact_alias_count INTEGER;
  v_conflict_count INTEGER;
  v_brand_prefixed_count INTEGER;
  v_brand_prefixed_expected INTEGER;
BEGIN
  WITH run_formulas AS (
    SELECT DISTINCT
      formula.promoted_cache_key,
      serving.product_name
    FROM public.catalog_source_runs run
    JOIN public.catalog_observations observation
      ON observation.run_id = run.id
     AND observation.validation_status = 'accepted'
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE run.run_key =
      'nestle-purina-pro-plan:official-formula-inventory:72de3bb513bb4c62f36337bd'
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE alias.cache_key = run_formulas.promoted_cache_key
    ),
    count(*) FILTER (
      WHERE alias.cache_key IS NOT NULL
        AND alias.cache_key <> run_formulas.promoted_cache_key
    )
  INTO v_formula_count, v_exact_alias_count, v_conflict_count
  FROM run_formulas
  LEFT JOIN public.catalog_verified_product_search_aliases alias
    ON alias.active
   AND alias.normalized_alias =
       public.normalize_verified_product_search_query(
         run_formulas.product_name
       );

  WITH run_formulas AS (
    SELECT DISTINCT
      formula.promoted_cache_key,
      serving.product_name
    FROM public.catalog_source_runs run
    JOIN public.catalog_observations observation
      ON observation.run_id = run.id
     AND observation.validation_status = 'accepted'
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE run.run_key =
      'nestle-purina-pro-plan:official-formula-inventory:72de3bb513bb4c62f36337bd'
      AND serving.product_name ~* '^Pro Plan\M'
  )
  SELECT
    count(*),
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1
        FROM public.catalog_verified_product_search_aliases alias
        WHERE alias.active
          AND alias.cache_key = run_formulas.promoted_cache_key
          AND alias.normalized_alias =
              public.normalize_verified_product_search_query(
                'Purina ' || run_formulas.product_name
              )
      )
    )
  INTO v_brand_prefixed_expected, v_brand_prefixed_count
  FROM run_formulas;

  IF v_formula_count <> 141
      OR v_exact_alias_count <> 141
      OR v_conflict_count <> 0
      OR v_brand_prefixed_count <> v_brand_prefixed_expected THEN
    RAISE EXCEPTION
      'Pro Plan exact-title alias gate failed: formulas %, exact %, conflicts %, brand-prefixed % of %',
      v_formula_count,
      v_exact_alias_count,
      v_conflict_count,
      v_brand_prefixed_count,
      v_brand_prefixed_expected;
  END IF;
END $$;

ALTER FUNCTION public.search_verified_products_unprotected_age_v1(
  TEXT,
  INTEGER
)
  RENAME TO search_verified_products_species_filter_v2;

REVOKE ALL ON FUNCTION
  public.search_verified_products_species_filter_v2(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_verified_products_unprotected_age_v1(
  q TEXT,
  max_results INTEGER DEFAULT 10
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
  v_safe_limit INTEGER :=
    LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
  v_query_lc TEXT := lower(COALESCE(q, ''));
  v_requires_dog BOOLEAN :=
    v_query_lc ~ '\m(dogs?|pupp(y|ies)|canines?)\M';
  v_requires_cat BOOLEAN :=
    v_query_lc ~ '\m(cats?|kittens?|felines?)\M';
  v_normalized TEXT :=
    public.normalize_verified_product_search_query(q);
  v_result_count INTEGER := 0;
BEGIN
  IF v_normalized IS NULL
      OR length(v_normalized) < 2
      OR (v_requires_dog AND v_requires_cat) THEN
    RETURN;
  END IF;

  -- Preserve the full formula title for exact source-backed aliases. Species
  -- filtering still occurs as a hard boundary, but only after alias identity
  -- has been resolved.
  RETURN QUERY
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    NULLIF(trim(product.gtin), ''),
    NULLIF(trim(product.product_line), ''),
    NULLIF(trim(product.flavor), ''),
    NULLIF(trim(product.life_stage), ''),
    NULLIF(trim(product.food_form), ''),
    NULLIF(trim(product.package_size), ''),
    COALESCE(product.pet_type, 'unknown'),
    product.ingredient_count,
    product.source,
    product.source_quality,
    product.ingredient_verification_status,
    product.image_verification_status,
    product.verified_at,
    CASE
      WHEN product.image_url ILIKE 'data:%' THEN NULL
      ELSE product.image_url
    END,
    product.ingredients,
    COALESCE(
      NULLIF(product.ingredient_text, ''),
      array_to_string(product.ingredients, ', ')
    ),
    product.nutritional_info,
    product.nutrient_panel,
    COALESCE(product.has_published_nutrients, FALSE),
    product.source_url,
    30.0::REAL
  FROM public.catalog_verified_product_search_aliases alias
  JOIN public.product_data product
    ON product.cache_key = alias.cache_key
  WHERE alias.active
    AND alias.normalized_alias = v_normalized
    AND (NOT v_requires_dog OR product.pet_type = 'dog')
    AND (NOT v_requires_cat OR product.pet_type = 'cat')
    AND product.expires_at > now()
    AND product.ingredient_count >= 5
    AND product.is_complete_food
    AND product.catalog_exclusion_reason IS NULL
    AND product.source_quality IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified'
    )
    AND product.ingredient_verification_status IN (
      'gdsn', 'official', 'manufacturer',
      'retailer_verified', 'label_ocr_verified'
    )
    AND product.image_verification_status IN (
      'official', 'manufacturer', 'retailer_verified'
    )
    AND NULLIF(btrim(product.source_url), '') IS NOT NULL
    AND NULLIF(btrim(product.image_url), '') IS NOT NULL
  ORDER BY
    product.ingredient_count DESC,
    product.verified_at DESC NULLS LAST
  LIMIT 1;

  GET DIAGNOSTICS v_result_count = ROW_COUNT;
  IF v_result_count > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.search_verified_products_species_filter_v2(q, v_safe_limit)
  LIMIT v_safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION
  public.search_verified_products_unprotected_age_v1(TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_large TEXT;
  v_small TEXT;
  v_active TEXT;
  v_performance TEXT;
  v_beef_carrots TEXT;
  v_sensitive_chicken TEXT;
  v_adult_seven TEXT;
BEGIN
  SELECT cache_key INTO v_large
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Shredded Blend Chicken & Rice Formula Large Breed Senior Dry Dog Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_small
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Shredded Blend Chicken & Rice Formula Small Breed Senior Dry Dog Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_active
  FROM public.search_verified_products(
    'Pro Plan SPORT Active 26/16 Formula Dry Dog Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_performance
  FROM public.search_verified_products(
    'Pro Plan Sport Performance 30/20 Beef & Bison Dry Dog Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_beef_carrots
  FROM public.search_verified_products(
    'Pro Plan Complete Essentials Beef & Carrots Entrée Wet Cat Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_sensitive_chicken
  FROM public.search_verified_products(
    'Pro Plan Sensitive Skin & Stomach Chicken Entrée Grain Free Classic Wet Cat Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  SELECT cache_key INTO v_adult_seven
  FROM public.search_verified_products(
    'Purina Pro Plan Adult 7+ Indoor Chicken & Rice Formula Dry Cat Food',
    5
  ) ORDER BY rank DESC LIMIT 1;

  IF v_large <> 'nestle-purina-pro-plan:038100189233'
      OR v_small <> 'nestle-purina-pro-plan:038100189196'
      OR v_active <> 'nestle-purina-pro-plan:038100136763'
      OR v_performance <> 'nestle-purina-pro-plan:038100189844'
      OR v_beef_carrots <> 'nestle-purina-pro-plan:038100153050'
      OR v_sensitive_chicken <> 'nestle-purina-pro-plan:038100186218'
      OR v_adult_seven <> 'nestle-purina-pro-plan:038100104014' THEN
    RAISE EXCEPTION
      'Pro Plan exact-title search regression: large %, small %, active %, performance %, beef-carrots %, sensitive-chicken %, adult-7 %',
      v_large,
      v_small,
      v_active,
      v_performance,
      v_beef_carrots,
      v_sensitive_chicken,
      v_adult_seven;
  END IF;
END $$;
