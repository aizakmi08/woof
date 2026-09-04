-- Amazon evidence must be versioned by exact ASIN/package. Legacy Amazon rows
-- were imported without source URLs, so they are discovery leads rather than
-- verified evidence until the exact variation page is reacquired.

CREATE TABLE IF NOT EXISTS public.catalog_amazon_evidence_queue (
  candidate_key TEXT PRIMARY KEY,
  representative_cache_key TEXT NOT NULL,
  brand TEXT NOT NULL,
  product_name TEXT NOT NULL,
  pet_type TEXT NOT NULL DEFAULT 'unknown',
  normalized_formula_title TEXT NOT NULL,
  ingredient_text_hash TEXT NOT NULL,
  source_row_count INTEGER NOT NULL DEFAULT 1 CHECK (source_row_count > 0),
  source_cache_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  image_url TEXT,
  asin TEXT,
  source_url TEXT,
  status TEXT NOT NULL DEFAULT 'needs_asin_reacquisition' CHECK (
    status IN (
      'needs_asin_reacquisition',
      'ready_existing_evidence_review',
      'ready_exact_page_review',
      'verified',
      'quarantined',
      'source_blocked',
      'not_complete_food',
      'archived'
    )
  ),
  verified_match_count INTEGER NOT NULL DEFAULT 0,
  matched_verified_cache_keys TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  conflict_reason TEXT,
  priority_score INTEGER NOT NULL DEFAULT 0,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_amazon_evidence_queue_status_priority_idx
  ON public.catalog_amazon_evidence_queue (
    status,
    priority_score DESC,
    updated_at DESC
  );

CREATE INDEX IF NOT EXISTS catalog_amazon_evidence_queue_brand_idx
  ON public.catalog_amazon_evidence_queue (lower(brand), status);

ALTER TABLE public.catalog_amazon_evidence_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.catalog_amazon_evidence_queue FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.catalog_amazon_formula_title(
  p_title TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
SET search_path = public, extensions
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        public.normalize_verified_product_search_query(p_title),
        '(^| )[0-9]+([.][0-9]+)? (lb|lbs|pound|pounds|oz|ounce|ounces|kg|g)( pack of [0-9]+)?( |$)',
        ' ',
        'g'
      ),
      '(^| )pack of [0-9]+( |$)',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.refresh_catalog_amazon_evidence_queue()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_upserted INTEGER := 0;
  v_total INTEGER := 0;
  v_existing_match INTEGER := 0;
  v_reacquire INTEGER := 0;
BEGIN
  WITH amazon_rows AS (
    SELECT
      serving.cache_key,
      serving.brand,
      serving.product_name,
      COALESCE(NULLIF(lower(btrim(serving.pet_type)), ''), 'unknown') AS pet_type,
      public.catalog_amazon_formula_title(serving.product_name) AS normalized_formula_title,
      encode(
        digest(
          public.catalog_normalize_ingredient_evidence(serving.ingredient_text),
          'sha256'
        ),
        'hex'
      ) AS ingredient_text_hash,
      serving.image_url,
      NULLIF(serving.formula_version_provenance ->> 'asin', '') AS asin,
      NULLIF(btrim(serving.source_url), '') AS source_url
    FROM public.product_data serving
    WHERE lower(COALESCE(serving.source, '')) = 'amazon'
      AND serving.ingredient_verification_status = 'unverified'
      AND NULLIF(btrim(serving.ingredient_text), '') IS NOT NULL
      AND serving.catalog_exclusion_reason IS NULL
  ), grouped AS (
    SELECT
      encode(
        digest(
          lower(concat_ws(
            '|',
            min(brand),
            pet_type,
            normalized_formula_title,
            ingredient_text_hash
          )),
          'sha256'
        ),
        'hex'
      ) AS candidate_key,
      min(cache_key) AS representative_cache_key,
      min(brand) AS brand,
      min(product_name) AS product_name,
      pet_type,
      normalized_formula_title,
      ingredient_text_hash,
      count(*)::INTEGER AS source_row_count,
      array_agg(cache_key ORDER BY cache_key) AS source_cache_keys,
      max(image_url) FILTER (WHERE NULLIF(btrim(image_url), '') IS NOT NULL) AS image_url,
      max(asin) AS asin,
      max(source_url) AS source_url
    FROM amazon_rows
    GROUP BY pet_type, normalized_formula_title, ingredient_text_hash, lower(brand)
  ), matched AS (
    SELECT
      grouped.*,
      COALESCE(match_data.match_count, 0)::INTEGER AS verified_match_count,
      COALESCE(match_data.cache_keys, ARRAY[]::TEXT[]) AS matched_verified_cache_keys
    FROM grouped
    LEFT JOIN LATERAL (
      SELECT
        count(DISTINCT verified.cache_key) AS match_count,
        array_agg(DISTINCT verified.cache_key ORDER BY verified.cache_key) AS cache_keys
      FROM public.product_data verified
      WHERE lower(verified.brand) = lower(grouped.brand)
        AND public.catalog_normalize_ingredient_evidence(verified.ingredient_text) =
          (
            SELECT public.catalog_normalize_ingredient_evidence(source_row.ingredient_text)
            FROM public.product_data source_row
            WHERE source_row.cache_key = grouped.representative_cache_key
          )
        AND verified.ingredient_verification_status IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified',
          'label_ocr_verified'
        )
        AND verified.image_verification_status IN (
          'official', 'manufacturer', 'retailer_verified'
        )
        AND NULLIF(btrim(verified.source_url), '') IS NOT NULL
        AND (
          grouped.pet_type = 'unknown'
          OR lower(COALESCE(verified.pet_type, '')) = grouped.pet_type
        )
    ) match_data ON TRUE
  ), upserted AS (
    INSERT INTO public.catalog_amazon_evidence_queue (
      candidate_key,
      representative_cache_key,
      brand,
      product_name,
      pet_type,
      normalized_formula_title,
      ingredient_text_hash,
      source_row_count,
      source_cache_keys,
      image_url,
      asin,
      source_url,
      status,
      verified_match_count,
      matched_verified_cache_keys,
      priority_score,
      evidence,
      updated_at
    )
    SELECT
      candidate_key,
      representative_cache_key,
      brand,
      product_name,
      pet_type,
      normalized_formula_title,
      ingredient_text_hash,
      source_row_count,
      source_cache_keys,
      image_url,
      asin,
      source_url,
      CASE
        WHEN source_url IS NOT NULL AND asin IS NOT NULL
          THEN 'ready_exact_page_review'
        WHEN verified_match_count > 0
          THEN 'ready_existing_evidence_review'
        ELSE 'needs_asin_reacquisition'
      END,
      verified_match_count,
      matched_verified_cache_keys,
      LEAST(1000, source_row_count * 10 + CASE WHEN verified_match_count > 0 THEN 50 ELSE 0 END),
      jsonb_build_object(
        'source', 'legacy_amazon_import',
        'provenance_state', 'missing_asin_and_source_url_requires_reacquisition',
        'no_guess_policy', TRUE
      ),
      NOW()
    FROM matched
    ON CONFLICT (candidate_key) DO UPDATE
    SET
      representative_cache_key = EXCLUDED.representative_cache_key,
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      pet_type = EXCLUDED.pet_type,
      normalized_formula_title = EXCLUDED.normalized_formula_title,
      ingredient_text_hash = EXCLUDED.ingredient_text_hash,
      source_row_count = EXCLUDED.source_row_count,
      source_cache_keys = EXCLUDED.source_cache_keys,
      image_url = EXCLUDED.image_url,
      asin = COALESCE(
        public.catalog_amazon_evidence_queue.asin,
        EXCLUDED.asin
      ),
      source_url = COALESCE(
        public.catalog_amazon_evidence_queue.source_url,
        EXCLUDED.source_url
      ),
      status = CASE
        WHEN public.catalog_amazon_evidence_queue.status IN (
          'verified', 'quarantined', 'not_complete_food', 'archived'
        ) THEN public.catalog_amazon_evidence_queue.status
        ELSE EXCLUDED.status
      END,
      verified_match_count = EXCLUDED.verified_match_count,
      matched_verified_cache_keys = EXCLUDED.matched_verified_cache_keys,
      priority_score = EXCLUDED.priority_score,
      updated_at = NOW()
    RETURNING 1
  )
  SELECT count(*) INTO v_upserted FROM upserted;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'ready_existing_evidence_review'),
    count(*) FILTER (WHERE status = 'needs_asin_reacquisition')
  INTO v_total, v_existing_match, v_reacquire
  FROM public.catalog_amazon_evidence_queue
  WHERE status <> 'archived';

  RETURN jsonb_build_object(
    'upserted_candidates', v_upserted,
    'total_candidates', v_total,
    'ready_existing_evidence_review', v_existing_match,
    'needs_asin_reacquisition', v_reacquire
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_amazon_evidence_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_amazon_evidence_queue() TO service_role;

DO $$
DECLARE
  v_run_id BIGINT;
  v_hill_formula_id BIGINT;
  v_royal_formula_id BIGINT;
  v_open_formula_id BIGINT;
  v_open_ingredients TEXT :=
    'Chicken, Oats, Ocean Whitefish Meal, Millet, Quinoa, Coconut Oil, Herring Meal, Sorghum, Pumpkin, Natural Flavor, Carrots, Apples, Salmon Oil (source of DHA), Cranberries, Salt, Choline Chloride, Dried Chicory Root, Vitamins (Vitamin E Supplement, Vitamin A Supplement, Niacin Supplement, Calcium Pantothenate, Riboflavin Supplement, Vitamin D3 Supplement, Thiamine Mononitrate, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Folic Acid), Minerals (Zinc Proteinate, Iron Proteinate, Copper Proteinate, Manganese Proteinate, Selenium Yeast, Calcium Iodate), Potassium Chloride, Taurine, Mixed Tocopherols (a preservative), Cinnamon, Turmeric, Rosemary Extract.';
  v_hill_ingredients TEXT :=
    'Chicken, Whole Grain Wheat, Cracked Pearled Barley, Whole Grain Sorghum, Whole Grain Corn, Corn Gluten Meal, Chicken Meal, Chicken Fat, Chicken Liver Flavor, Dried Beet Pulp, Soybean Oil, Pork Flavor, Lactic Acid, Flaxseed, Potassium Chloride, Choline Chloride, Iodized Salt, Calcium Carbonate, vitamins (Vitamin E Supplement, L-Ascorbyl-2-Polyphosphate (source of Vitamin C), Niacin Supplement, Thiamine Mononitrate, Vitamin A Supplement, Calcium Pantothenate, Riboflavin Supplement, Biotin, Vitamin B12 Supplement, Pyridoxine Hydrochloride, Folic Acid, Vitamin D3 Supplement), minerals (Ferrous Sulfate, Zinc Oxide, Copper Sulfate, Manganous Oxide, Calcium Iodate, Sodium Selenite), Taurine, Oat Fiber, Mixed Tocopherols for freshness, Natural Flavors, Beta-Carotene, Apples, Broccoli, Carrots, Cranberries, Green Peas.';
  v_royal_ingredients TEXT :=
    'Water sufficient for processing, pork by-products, chicken by-products, pork liver, chicken, wheat flour, wheat gluten, modified corn starch, powdered cellulose, pork plasma, natural flavors, calcium sulfate, potassium chloride, carob bean gum, taurine, vitamins[DL-alpha tocopherol acetate (source of vitamin E), L-ascorbyl-2-polyphosphate (source of vitamin C), thiamine mononitrate (vitamin B1), niacin supplement, biotin, D-calcium pantothenate, pyridoxine hydrochloride (vitamin B6), riboflavin supplement, folic acid, vitamin B12 supplement, vitamin D3 supplement], sodium tripolyphosphate, choline chloride, salt, sodium carbonate, marigold extract (Tagetes erecta L.), trace minerals[zinc proteinate, zinc oxide, ferrous sulfate, copper sulfate, manganous oxide, sodium selenite, calcium iodate].';
BEGIN
  SELECT id INTO STRICT v_hill_formula_id
  FROM public.catalog_formulas
  WHERE id = 7384
    AND verification_status = 'verified'
    AND public.catalog_normalize_ingredient_evidence(ingredient_text) =
      public.catalog_normalize_ingredient_evidence(v_hill_ingredients);

  -- Repair the Royal Canin formula boundary before attaching the ASIN. The
  -- legacy generic "Feline Care Nutrition" formula had mixed several diet
  -- variants and incorrectly owned urinary-care GTINs.
  SELECT id INTO STRICT v_royal_formula_id
  FROM public.catalog_formulas
  WHERE id = 18018;

  UPDATE public.catalog_formulas formula
  SET
    manufacturer = 'royal canin',
    brand = 'royal canin',
    product_name = 'Urinary Care Thin Slices In Gravy Canned Cat Food',
    product_line = 'feline care nutrition urinary care',
    pet_type = 'cat',
    life_stage = 'adult',
    food_form = 'wet',
    flavor = 'thin slices in gravy',
    diet_condition = 'urinary care',
    is_complete_food = TRUE,
    complete_food_evidence = 'Royal Canin official Urinary Care PDP and exact Amazon ASIN B0BXPLQ985 package page.',
    ingredient_text = v_royal_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_royal_ingredients),
    front_image_url = 'https://marspetcareaprimocdn.petcare.global/4a282358-a893-45e7-8f9b-b1ef000ed8e7/4a282358-a893-45e7-8f9b-b1ef000ed8e7_DownloadAsJpg.jpg',
    source_url = 'https://www.royalcanin.com/us/cats/products/retail-products/urinary-care-thin-slices-in-gravy-1588/1',
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY['royal canin','feline care nutrition','urinary care','adult','cat','thin slices','gravy']::TEXT[],
    verification_status = 'verified',
    active = TRUE,
    promoted_cache_key = 'royal-canin-mars-petcare:1053816:030111416650',
    promoted_at = NOW(),
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = jsonb_build_object(
      'source', 'royal-canin-mars-petcare',
      'source_url', 'https://www.royalcanin.com/us/cats/products/retail-products/urinary-care-thin-slices-in-gravy-1588/1',
      'captured_at', '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
      'ingredient_text_hash', encode(digest(public.catalog_normalize_ingredient_evidence(v_royal_ingredients), 'sha256'), 'hex'),
      'amazon_asin_confirmation', 'B0BXPLQ985'
    ),
    last_observed_at = NOW(),
    updated_at = NOW()
  WHERE formula.id = v_royal_formula_id;

  UPDATE public.catalog_skus sku
  SET formula_id = v_royal_formula_id, updated_at = NOW()
  WHERE sku.formula_id = 8765
    AND (
      sku.source_url ILIKE '%/urinary-care-thin-slices-in-gravy-%'
      OR sku.source_url ILIKE '%urinary-care-adult-cat%'
    );

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, source_url, scraped_at, expires_at, image_url,
    nutrient_panel, has_published_nutrients, is_complete_food,
    catalog_exclusion_reason, pet_type, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    gtin, product_line, flavor, life_stage, food_form, package_size,
    formula_evidence_tier, formula_version_provenance, updated_at
  ) VALUES (
    'amazon:B07YMTSM2P',
    'Open Farm Ancient Grains Dry Dog Food, Harvest Chicken Kibble',
    'Open Farm',
    public.catalog_split_ingredient_statement(v_open_ingredients),
    v_open_ingredients,
    cardinality(public.catalog_split_ingredient_statement(v_open_ingredients)),
    'amazon-manual-exact',
    'https://www.amazon.com/dp/B07YMTSM2P',
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
    NOW() + INTERVAL '180 days',
    'https://m.media-amazon.com/images/I/81DJXEY4mBL._AC_SL1500_.jpg',
    '{}'::JSONB,
    FALSE,
    TRUE,
    NULL,
    'dog',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
    NULL,
    'Ancient Grains',
    'Harvest Chicken',
    'all life stages',
    'dry',
    '22 lb',
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', FALSE,
      'source', 'amazon-manual-exact',
      'source_url', 'https://www.amazon.com/dp/B07YMTSM2P',
      'asin', 'B07YMTSM2P',
      'captured_at', '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
      'package_size', '22 lb',
      'selected_flavor', 'Harvest Chicken Ancient Grain',
      'front_image_url', 'https://m.media-amazon.com/images/I/81DJXEY4mBL._AC_SL1500_.jpg',
      'ingredient_text_hash', encode(digest(public.catalog_normalize_ingredient_evidence(v_open_ingredients), 'sha256'), 'hex')
    ),
    NOW()
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    brand = EXCLUDED.brand,
    ingredients = EXCLUDED.ingredients,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_count = EXCLUDED.ingredient_count,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    scraped_at = EXCLUDED.scraped_at,
    expires_at = EXCLUDED.expires_at,
    image_url = EXCLUDED.image_url,
    is_complete_food = TRUE,
    catalog_exclusion_reason = NULL,
    pet_type = EXCLUDED.pet_type,
    source_quality = EXCLUDED.source_quality,
    ingredient_verification_status = EXCLUDED.ingredient_verification_status,
    image_verification_status = EXCLUDED.image_verification_status,
    verified_at = EXCLUDED.verified_at,
    product_line = EXCLUDED.product_line,
    flavor = EXCLUDED.flavor,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    package_size = EXCLUDED.package_size,
    formula_evidence_tier = EXCLUDED.formula_evidence_tier,
    formula_version_provenance = EXCLUDED.formula_version_provenance,
    updated_at = NOW();

  INSERT INTO public.catalog_formulas (
    formula_key, manufacturer, brand, product_name, product_line, pet_type,
    life_stage, food_form, flavor, diet_condition, is_complete_food,
    complete_food_evidence, ingredient_text, ingredients, front_image_url,
    source_url, source_authority, ingredient_verification_status,
    image_verification_status, protected_terms, verification_status, active,
    is_popular_brand, first_observed_at, last_observed_at, promoted_cache_key,
    promoted_at, identity_hash, formula_evidence_tier,
    formula_version_provenance, updated_at
  ) VALUES (
    'amazon-version:' || encode(digest('B07YMTSM2P|' || public.catalog_normalize_ingredient_evidence(v_open_ingredients), 'sha256'), 'hex'),
    'open farm', 'open farm',
    'Open Farm Ancient Grains Dry Dog Food, Harvest Chicken Kibble',
    'ancient grains', 'dog', 'all life stages', 'dry', 'harvest chicken', '',
    TRUE,
    'Exact Amazon ASIN B07YMTSM2P selected Harvest Chicken Ancient Grain, 22 lb package page with a complete ingredient statement and matching front package image.',
    v_open_ingredients,
    public.catalog_split_ingredient_statement(v_open_ingredients),
    'https://m.media-amazon.com/images/I/81DJXEY4mBL._AC_SL1500_.jpg',
    'https://www.amazon.com/dp/B07YMTSM2P',
    'retailer_verified', 'retailer_verified', 'retailer_verified',
    ARRAY['open farm','ancient grains','harvest chicken','dog','dry','all life stages']::TEXT[],
    'verified', TRUE, TRUE,
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
    'amazon:B07YMTSM2P', NOW(),
    encode(digest('open farm|ancient grains|harvest chicken|dog|dry|B07YMTSM2P|' || public.catalog_normalize_ingredient_evidence(v_open_ingredients), 'sha256'), 'hex'),
    'retailer_web_version',
    jsonb_build_object(
      'version_status', 'source_versioned',
      'manufacturer_current_equivalence', FALSE,
      'source', 'amazon-manual-exact',
      'source_url', 'https://www.amazon.com/dp/B07YMTSM2P',
      'asin', 'B07YMTSM2P',
      'captured_at', '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
      'package_size', '22 lb',
      'ingredient_text_hash', encode(digest(public.catalog_normalize_ingredient_evidence(v_open_ingredients), 'sha256'), 'hex')
    ),
    NOW()
  )
  ON CONFLICT (formula_key) DO UPDATE SET
    ingredient_text = EXCLUDED.ingredient_text,
    ingredients = EXCLUDED.ingredients,
    front_image_url = EXCLUDED.front_image_url,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    ingredient_verification_status = EXCLUDED.ingredient_verification_status,
    image_verification_status = EXCLUDED.image_verification_status,
    verification_status = 'verified',
    active = TRUE,
    promoted_cache_key = EXCLUDED.promoted_cache_key,
    promoted_at = NOW(),
    formula_evidence_tier = EXCLUDED.formula_evidence_tier,
    formula_version_provenance = EXCLUDED.formula_version_provenance,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = NOW()
  RETURNING id INTO v_open_formula_id;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES (
    v_open_formula_id, NULL, '22 lb', 1, 'amazon-manual-exact',
    'ASIN:B07YMTSM2P', 'https://www.amazon.com/dp/B07YMTSM2P', TRUE,
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ,
    '2026-08-02T22:36:00Z'::TIMESTAMPTZ, NOW()
  )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    package_size = EXCLUDED.package_size,
    package_count = EXCLUDED.package_count,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = NOW();

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (v_hill_formula_id, NULL, '35 lb', 1, 'amazon-manual-exact', 'ASIN:B06W5GWSGZ', 'https://www.amazon.com/dp/B06W5GWSGZ', TRUE, '2026-08-02T22:36:00Z', '2026-08-02T22:36:00Z', NOW()),
    (v_royal_formula_id, NULL, '3 oz x 24', 24, 'amazon-manual-exact', 'ASIN:B0BXPLQ985', 'https://www.amazon.com/dp/B0BXPLQ985', TRUE, '2026-08-02T22:36:00Z', '2026-08-02T22:36:00Z', NOW())
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    package_size = EXCLUDED.package_size,
    package_count = EXCLUDED.package_count,
    source_url = EXCLUDED.source_url,
    active = TRUE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = NOW();

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    metadata, updated_at
  ) VALUES (
    'amazon-manual-exact:examples:20260802',
    'amazon-manual-exact', 'retailer', 'verification', 'completed',
    '2026-08-02T22:36:00Z', '2026-08-02T22:36:00Z',
    3, 3, 3, 0, TRUE,
    encode(digest('B06W5GWSGZ|B0BXPLQ985|B07YMTSM2P', 'sha256'), 'hex'),
    jsonb_build_object('last_asin', 'B0BXPLQ985'),
    jsonb_build_object(
      'policy', 'exact selected Amazon variation plus full ingredients and matching front image',
      'formula_evidence_tier', 'retailer_web_version',
      'captured_at', '2026-08-02T22:36:00Z'::TIMESTAMPTZ
    ),
    NOW()
  )
  ON CONFLICT (run_key) DO UPDATE SET
    status = 'completed', observed_count = 3, accepted_count = 3,
    rejected_count = 0, pagination_complete = TRUE,
    checkpoint = EXCLUDED.checkpoint, metadata = EXCLUDED.metadata,
    updated_at = NOW()
  RETURNING id INTO v_run_id;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, formula_evidence_tier, formula_version_provenance
  ) VALUES
    (v_run_id, v_hill_formula_id, 'amazon-manual-exact', 'ASIN:B06W5GWSGZ', 'https://www.amazon.com/dp/B06W5GWSGZ', 'retailer_verified', NULL, 'Hill''s Pet Nutrition', 'Hill''s Science Diet', 'Hill''s Science Diet Adult 1-6 Small Bites Dry Dog Food, Chicken & Barley', 'Adult 1-6 Small Bites', 'dog', 'adult', 'dry', 'Chicken & Barley', '', '35 lb', v_hill_ingredients, 'https://m.media-amazon.com/images/I/81A1LquqKEL._AC_SL1500_.jpg', TRUE, TRUE, '2026-08-02T22:36:00Z', encode(digest('B06W5GWSGZ|' || public.catalog_normalize_ingredient_evidence(v_hill_ingredients), 'sha256'), 'hex'), 'accepted', ARRAY[]::TEXT[], jsonb_build_object('asin','B06W5GWSGZ','selected_flavor','Chicken & Barley','selected_size','35 Pound (Pack of 1)','exact_package_identity',TRUE,'ingredients_verbatim_from_exact_pdp',TRUE,'matching_front_package_image',TRUE), 'retailer_web_version', jsonb_build_object('source','amazon-manual-exact','source_url','https://www.amazon.com/dp/B06W5GWSGZ','asin','B06W5GWSGZ','captured_at','2026-08-02T22:36:00Z'::TIMESTAMPTZ,'manufacturer_current_equivalence',FALSE)),
    (v_run_id, v_royal_formula_id, 'amazon-manual-exact', 'ASIN:B0BXPLQ985', 'https://www.amazon.com/dp/B0BXPLQ985', 'retailer_verified', NULL, 'Royal Canin', 'Royal Canin', 'Royal Canin Feline Care Nutrition Urinary Care Adult Thin Slices in Gravy Cat Food', 'Feline Care Nutrition Urinary Care', 'cat', 'adult', 'wet', 'Thin Slices in Gravy', 'urinary care', '3 oz x 24', v_royal_ingredients, 'https://m.media-amazon.com/images/I/71f0rli1GHL._AC_SL1500_.jpg', TRUE, TRUE, '2026-08-02T22:36:00Z', encode(digest('B0BXPLQ985|' || public.catalog_normalize_ingredient_evidence(v_royal_ingredients), 'sha256'), 'hex'), 'accepted', ARRAY[]::TEXT[], jsonb_build_object('asin','B0BXPLQ985','selected_size','3 Ounce (Pack of 24)','exact_package_identity',TRUE,'ingredients_verbatim_from_exact_pdp',TRUE,'matching_front_package_image',TRUE), 'manufacturer_current_exact', jsonb_build_object('source','amazon-manual-exact','source_url','https://www.amazon.com/dp/B0BXPLQ985','asin','B0BXPLQ985','captured_at','2026-08-02T22:36:00Z'::TIMESTAMPTZ,'manufacturer_current_equivalence',TRUE)),
    (v_run_id, v_open_formula_id, 'amazon-manual-exact', 'ASIN:B07YMTSM2P', 'https://www.amazon.com/dp/B07YMTSM2P', 'retailer_verified', NULL, 'Open Farm', 'Open Farm', 'Open Farm Ancient Grains Dry Dog Food, Harvest Chicken Kibble', 'Ancient Grains', 'dog', 'all life stages', 'dry', 'Harvest Chicken', '', '22 lb', v_open_ingredients, 'https://m.media-amazon.com/images/I/81DJXEY4mBL._AC_SL1500_.jpg', TRUE, TRUE, '2026-08-02T22:36:00Z', encode(digest('B07YMTSM2P|' || public.catalog_normalize_ingredient_evidence(v_open_ingredients), 'sha256'), 'hex'), 'accepted', ARRAY[]::TEXT[], jsonb_build_object('asin','B07YMTSM2P','selected_flavor','Harvest Chicken Ancient Grain','selected_size','22 Pound (Pack of 1)','exact_package_identity',TRUE,'ingredients_verbatim_from_exact_pdp',TRUE,'matching_front_package_image',TRUE), 'retailer_web_version', jsonb_build_object('source','amazon-manual-exact','source_url','https://www.amazon.com/dp/B07YMTSM2P','asin','B07YMTSM2P','captured_at','2026-08-02T22:36:00Z'::TIMESTAMPTZ,'manufacturer_current_equivalence',FALSE))
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    ingredient_text = EXCLUDED.ingredient_text,
    front_image_url = EXCLUDED.front_image_url,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = EXCLUDED.raw_payload,
    formula_evidence_tier = EXCLUDED.formula_evidence_tier,
    formula_version_provenance = EXCLUDED.formula_version_provenance;

  -- Remove the unsafe legacy rows from normal results. Exact searches now
  -- resolve to the reviewed canonical/source-version records below.
  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'exact_alias_of_verified_formula',
    source_url = CASE cache_key
      WHEN 'hills science diet adult 16 small bites dry chicken amp barley' THEN 'https://www.amazon.com/dp/B06W5GWSGZ'
      WHEN 'royal canin feline care nutrition urinary care adult thin slices in gravy' THEN 'https://www.amazon.com/dp/B0BXPLQ985'
      WHEN 'open farm open farm harvest chicken ancient grains dry' THEN 'https://www.amazon.com/dp/B07YMTSM2P'
      ELSE source_url
    END,
    formula_version_provenance = formula_version_provenance ||
      jsonb_build_object('reconciled_to_exact_evidence_at', NOW()),
    updated_at = NOW()
  WHERE cache_key IN (
    'hills science diet adult 16 small bites dry chicken amp barley',
    'royal canin feline care nutrition urinary care adult thin slices in gravy',
    'open farm open farm harvest chicken ancient grains dry'
  );

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url, source_authority,
    evidence_observed_at, provenance, active, updated_at
  ) VALUES
    ('petsmart-retail-catalog:052742015989', 'Hill''s Science Diet Adult 1-6 Small Bites Dry Dog Food, Chicken & Barley', public.normalize_verified_product_search_query('Hill''s Science Diet Adult 1-6 Small Bites Dry Dog Food, Chicken & Barley'), 'https://www.amazon.com/dp/B06W5GWSGZ', 'retailer_verified', '2026-08-02T22:36:00Z', jsonb_build_object('asin','B06W5GWSGZ','exact_formula_identity',TRUE,'formula_evidence_tier','retailer_web_version'), TRUE, NOW()),
    ('royal-canin-mars-petcare:1053816:030111416650', 'Royal Canin Feline Care Nutrition Urinary Care Adult Thin Slices in Gravy Cat Food', public.normalize_verified_product_search_query('Royal Canin Feline Care Nutrition Urinary Care Adult Thin Slices in Gravy Cat Food'), 'https://www.amazon.com/dp/B0BXPLQ985', 'retailer_verified', '2026-08-02T22:36:00Z', jsonb_build_object('asin','B0BXPLQ985','exact_formula_identity',TRUE,'formula_evidence_tier','manufacturer_current_exact'), TRUE, NOW()),
    ('amazon:B07YMTSM2P', 'Open Farm Ancient Grains Dry Dog Food, Harvest Chicken Kibble', public.normalize_verified_product_search_query('Open Farm Ancient Grains Dry Dog Food, Harvest Chicken Kibble'), 'https://www.amazon.com/dp/B07YMTSM2P', 'retailer_verified', '2026-08-02T22:36:00Z', jsonb_build_object('asin','B07YMTSM2P','exact_formula_identity',TRUE,'formula_evidence_tier','retailer_web_version'), TRUE, NOW()),
    ('amazon:B07YMTSM2P', 'Open Farm Harvest Chicken & Ancient Grains Dry Dog Food', public.normalize_verified_product_search_query('Open Farm Harvest Chicken & Ancient Grains Dry Dog Food'), 'https://www.amazon.com/dp/B07YMTSM2P', 'retailer_verified', '2026-08-02T22:36:00Z', jsonb_build_object('asin','B07YMTSM2P','exact_formula_identity',TRUE,'formula_evidence_tier','retailer_web_version'), TRUE, NOW())
  ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_url = EXCLUDED.source_url,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    updated_at = NOW();

  PERFORM public.refresh_catalog_amazon_evidence_queue();

  UPDATE public.catalog_amazon_evidence_queue
  SET
    status = 'verified',
    asin = CASE
      WHEN source_cache_keys @> ARRAY['hills science diet adult 16 small bites dry chicken amp barley']::TEXT[] THEN 'B06W5GWSGZ'
      WHEN source_cache_keys @> ARRAY['royal canin feline care nutrition urinary care adult thin slices in gravy']::TEXT[] THEN 'B0BXPLQ985'
      WHEN source_cache_keys @> ARRAY['open farm open farm harvest chicken ancient grains dry']::TEXT[] THEN 'B07YMTSM2P'
      ELSE asin
    END,
    source_url = CASE
      WHEN source_cache_keys @> ARRAY['hills science diet adult 16 small bites dry chicken amp barley']::TEXT[] THEN 'https://www.amazon.com/dp/B06W5GWSGZ'
      WHEN source_cache_keys @> ARRAY['royal canin feline care nutrition urinary care adult thin slices in gravy']::TEXT[] THEN 'https://www.amazon.com/dp/B0BXPLQ985'
      WHEN source_cache_keys @> ARRAY['open farm open farm harvest chicken ancient grains dry']::TEXT[] THEN 'https://www.amazon.com/dp/B07YMTSM2P'
      ELSE source_url
    END,
    captured_at = '2026-08-02T22:36:00Z',
    evidence = evidence || jsonb_build_object('exact_page_reviewed', TRUE),
    updated_at = NOW()
  WHERE source_cache_keys && ARRAY[
    'hills science diet adult 16 small bites dry chicken amp barley',
    'royal canin feline care nutrition urinary care adult thin slices in gravy',
    'open farm open farm harvest chicken ancient grains dry'
  ]::TEXT[];
END;
$$;
