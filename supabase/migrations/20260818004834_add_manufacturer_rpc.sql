-- Promote exact, current manufacturer evidence only when it is bound to a
-- durable pending census target. Canonical formulas never retain package-size
-- or GTIN data; those values belong exclusively to catalog_skus.

CREATE OR REPLACE FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  p_identity_hash TEXT,
  p_brand TEXT,
  p_product_name TEXT,
  p_ingredients TEXT,
  p_image_url TEXT,
  p_source_url TEXT
)
RETURNS TABLE(
  selected_rows INTEGER,
  created_formula_rows INTEGER,
  upserted_serving_rows INTEGER,
  recorded_evidence_rows INTEGER
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_queue public.catalog_acquisition_queue%ROWTYPE;
  v_formula public.catalog_formulas%ROWTYPE;
  v_formula_id BIGINT;
  v_formula_created INTEGER := 0;
  v_serving_count INTEGER := 0;
  v_evidence_count INTEGER := 0;
  v_formula_key TEXT;
  v_manufacturer TEXT;
  v_canonical_product_name TEXT;
  v_product_line TEXT;
  v_pet_type TEXT;
  v_life_stage TEXT;
  v_food_form TEXT;
  v_flavor TEXT;
  v_diet_condition TEXT;
  v_source_host TEXT;
  v_image_host TEXT;
  v_expected_domain TEXT;
  v_ingredient_text TEXT;
  v_ingredient_hash TEXT;
  v_version_hash TEXT;
  v_cache_key TEXT;
  v_formula_identity_hash TEXT;
  v_provenance JSONB;
BEGIN
  p_identity_hash := lower(btrim(COALESCE(p_identity_hash, '')));
  p_brand := btrim(COALESCE(p_brand, ''));
  p_product_name := btrim(COALESCE(p_product_name, ''));
  v_ingredient_text := btrim(COALESCE(p_ingredients, ''));
  p_image_url := btrim(COALESCE(p_image_url, ''));
  p_source_url := btrim(COALESCE(p_source_url, ''));

  IF p_identity_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Manufacturer promotion requires a SHA-256 census identity hash';
  END IF;

  SELECT queue.*
  INTO v_queue
  FROM public.catalog_acquisition_queue queue
  WHERE queue.gap_key = 'agentic:' || p_identity_hash
    AND queue.status IN ('open', 'in_progress')
    AND (
      queue.needs_product_record
      OR queue.needs_verified_ingredients
      OR queue.needs_verified_image
    )
    AND queue.sample_metadata->>'identity_hash' = p_identity_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  v_formula_key := btrim(COALESCE(v_queue.sample_metadata->>'canonical_formula_key', ''));
  v_manufacturer := btrim(COALESCE(v_queue.sample_metadata->>'manufacturer', ''));
  v_canonical_product_name := btrim(COALESCE(
    v_queue.sample_metadata->>'canonical_product_name',
    p_product_name
  ));
  v_product_line := btrim(COALESCE(v_queue.sample_metadata->>'product_line', ''));
  v_pet_type := lower(btrim(COALESCE(v_queue.sample_metadata->>'pet_type', '')));
  v_life_stage := lower(btrim(COALESCE(v_queue.sample_metadata->>'life_stage', 'unknown')));
  v_food_form := lower(btrim(COALESCE(v_queue.sample_metadata->>'food_form', 'unknown')));
  v_flavor := btrim(COALESCE(v_queue.sample_metadata->>'flavor', ''));
  v_diet_condition := btrim(COALESCE(v_queue.sample_metadata->>'diet_condition', ''));

  IF v_formula_key = ''
    OR encode(extensions.digest(v_formula_key, 'sha256'), 'hex') <> p_identity_hash
  THEN
    RAISE EXCEPTION 'Pending queue formula key does not match identity hash';
  END IF;
  IF v_manufacturer = '' OR v_product_line = '' OR v_pet_type NOT IN ('dog', 'cat') THEN
    RAISE EXCEPTION 'Pending queue lacks a complete canonical identity';
  END IF;
  IF public.catalog_normalize_retailer_boundary(v_queue.brand)
      IS DISTINCT FROM public.catalog_normalize_retailer_boundary(p_brand)
    OR public.catalog_normalize_retailer_boundary(v_queue.product_name)
      IS DISTINCT FROM public.catalog_normalize_retailer_boundary(p_product_name)
  THEN
    RAISE EXCEPTION 'Submitted brand or product name does not match pending census identity';
  END IF;
  IF lower(v_canonical_product_name) ~
      '(^|[^a-z])(treats?|toppers?|supplements?|mixers?|broths?|dental|chews?|snacks?)([^a-z]|$)'
  THEN
    RAISE EXCEPTION 'Non-complete product terms cannot be promoted as complete food';
  END IF;

  v_source_host := lower(COALESCE(
    substring(p_source_url FROM '^https://([^/:?#]+)'),
    ''
  ));
  v_image_host := lower(COALESCE(
    substring(p_image_url FROM '^https://([^/:?#]+)'),
    ''
  ));
  v_expected_domain := CASE
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'bluebuffalo%'
      THEN 'bluebuffalo.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'purina%'
      OR public.catalog_normalize_retailer_boundary(p_brand) IN (
        'beneful', 'moistandmeaty', 'fancyfeast', 'friskies', 'dogchow', 'catchow'
      ) THEN 'purina.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'wellness%'
      THEN 'wellnesspetfood.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'hill%'
      THEN 'hillspet.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'iams%'
      THEN 'iams.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'pedigree%'
      THEN 'pedigree.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'royalcanin%'
      THEN 'royalcanin.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'openfarm%'
      THEN 'openfarmpet.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'nulo%'
      THEN 'nulo.com'
    WHEN public.catalog_normalize_retailer_boundary(p_brand) LIKE 'firstmate%'
      THEN 'firstmate.com'
    ELSE NULL
  END;

  IF v_expected_domain IS NULL
    OR NOT (
      v_source_host = v_expected_domain
      OR v_source_host LIKE '%.' || v_expected_domain
    )
  THEN
    RAISE EXCEPTION 'Source URL is not an approved official domain for brand %', p_brand;
  END IF;
  IF NOT (
    v_image_host = v_expected_domain
    OR v_image_host LIKE '%.' || v_expected_domain
  ) THEN
    RAISE EXCEPTION 'Front image is not hosted by the approved official brand domain';
  END IF;

  IF length(v_ingredient_text) < 30
    OR NOT public.catalog_retailer_ingredient_is_serving_safe(v_ingredient_text)
    OR public.catalog_has_unbalanced_parentheses(v_ingredient_text)
    OR public.catalog_has_ingredient_ocr_artifacts(v_ingredient_text)
  THEN
    RAISE EXCEPTION 'Ingredient statement failed the complete-text safety gate';
  END IF;

  v_ingredient_hash := encode(
    extensions.digest(
      public.catalog_normalize_ingredient_evidence(v_ingredient_text),
      'sha256'
    ),
    'hex'
  );
  v_version_hash := encode(
    extensions.digest(p_identity_hash || '|' || v_ingredient_hash, 'sha256'),
    'hex'
  );
  v_cache_key := 'manufacturer-current:' || v_version_hash;
  v_provenance := jsonb_build_object(
    'verification_provenance', 'official_manufacturer',
    'manufacturer_verified', true,
    'retailer_verified', false,
    'version_status', 'manufacturer_current_exact',
    'census_identity_hash', p_identity_hash,
    'ingredient_text_hash', v_ingredient_hash,
    'source_url', p_source_url,
    'image_url', p_image_url,
    'captured_at', now(),
    'package_size_is_sku_only', true,
    'gtin_is_sku_only', true,
    'promotion_rpc', 'rehydrate_exact_manufacturer_source_versions'
  );

  SELECT formula.*
  INTO v_formula
  FROM public.catalog_formulas formula
  WHERE formula.identity_hash = p_identity_hash
  FOR UPDATE;

  IF FOUND
    AND v_formula.verification_status = 'verified'
    AND btrim(v_formula.ingredient_text) <> ''
    AND public.catalog_normalize_ingredient_evidence(v_formula.ingredient_text)
      IS DISTINCT FROM public.catalog_normalize_ingredient_evidence(v_ingredient_text)
  THEN
    -- Preserve the existing ingredient version. The official current version
    -- receives its own immutable version identity instead of overwriting it.
    v_formula_id := NULL;
    v_formula_identity_hash := v_version_hash;
  ELSE
    v_formula_id := v_formula.id;
    v_formula_identity_hash := p_identity_hash;
  END IF;

  IF v_formula_id IS NULL THEN
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
      first_observed_at,
      last_observed_at,
      identity_hash,
      formula_evidence_tier,
      formula_version_provenance,
      promoted_cache_key,
      promoted_at,
      updated_at
    ) VALUES (
      'manufacturer-current:' || v_version_hash,
      v_manufacturer,
      p_brand,
      v_canonical_product_name,
      v_product_line,
      v_pet_type,
      COALESCE(NULLIF(v_life_stage, ''), 'unknown'),
      COALESCE(NULLIF(v_food_form, ''), 'unknown'),
      v_flavor,
      v_diet_condition,
      true,
      'Exact official manufacturer product page with full ingredients and matching front image.',
      v_ingredient_text,
      public.catalog_split_ingredient_statement(v_ingredient_text),
      p_image_url,
      p_source_url,
      'manufacturer',
      'manufacturer',
      'manufacturer',
      ARRAY(
        SELECT token
        FROM unnest(regexp_split_to_array(
          public.catalog_normalize_retailer_boundary(v_canonical_product_name),
          '\\s+'
        )) AS token
        WHERE length(token) > 2
          AND token <> ALL(ARRAY[
            'and', 'cat', 'dog', 'food', 'for', 'formula', 'natural', 'recipe', 'the', 'with'
          ])
      ),
      'verified',
      true,
      now(),
      now(),
      v_formula_identity_hash,
      'manufacturer_current_exact',
      v_provenance,
      NULL,
      NULL,
      now()
    )
    ON CONFLICT (formula_key) DO UPDATE SET
      ingredient_text = EXCLUDED.ingredient_text,
      ingredients = EXCLUDED.ingredients,
      front_image_url = EXCLUDED.front_image_url,
      source_url = EXCLUDED.source_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = true,
      absent_since = NULL,
      last_observed_at = now(),
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = EXCLUDED.formula_version_provenance,
      promoted_cache_key = NULL,
      promoted_at = NULL,
      updated_at = now()
    RETURNING id INTO v_formula_id;
    v_formula_created := 1;
  ELSE
    UPDATE public.catalog_formulas formula
    SET
      manufacturer = v_manufacturer,
      brand = p_brand,
      product_name = v_canonical_product_name,
      product_line = v_product_line,
      pet_type = v_pet_type,
      life_stage = COALESCE(NULLIF(v_life_stage, ''), 'unknown'),
      food_form = COALESCE(NULLIF(v_food_form, ''), 'unknown'),
      flavor = v_flavor,
      diet_condition = v_diet_condition,
      is_complete_food = true,
      complete_food_evidence =
        'Exact official manufacturer product page with full ingredients and matching front image.',
      ingredient_text = v_ingredient_text,
      ingredients = public.catalog_split_ingredient_statement(v_ingredient_text),
      front_image_url = p_image_url,
      source_url = p_source_url,
      source_authority = 'manufacturer',
      ingredient_verification_status = 'manufacturer',
      image_verification_status = 'manufacturer',
      verification_status = 'verified',
      active = true,
      absent_since = NULL,
      last_observed_at = now(),
      formula_evidence_tier = 'manufacturer_current_exact',
      formula_version_provenance = v_provenance,
      promoted_cache_key = NULL,
      promoted_at = NULL,
      updated_at = now()
    WHERE formula.id = v_formula_id;
  END IF;

  INSERT INTO public.product_data (
    cache_key,
    product_name,
    brand,
    ingredients,
    ingredient_text,
    ingredient_count,
    nutritional_info,
    source,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    is_complete_food,
    catalog_exclusion_reason,
    pet_type,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    formula_evidence_tier,
    formula_version_provenance,
    updated_at
  ) VALUES (
    v_cache_key,
    v_canonical_product_name,
    p_brand,
    public.catalog_split_ingredient_statement(v_ingredient_text),
    v_ingredient_text,
    cardinality(public.catalog_split_ingredient_statement(v_ingredient_text)),
    jsonb_build_object('formula_version_provenance', v_provenance),
    'official-manufacturer:' || v_source_host,
    p_source_url,
    now(),
    now() + interval '180 days',
    p_image_url,
    true,
    NULL,
    v_pet_type,
    'manufacturer',
    'manufacturer',
    'manufacturer',
    now(),
    NULL,
    v_product_line,
    v_flavor,
    COALESCE(NULLIF(v_life_stage, ''), 'unknown'),
    COALESCE(NULLIF(v_food_form, ''), 'unknown'),
    NULL,
    'manufacturer_current_exact',
    v_provenance,
    now()
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    brand = EXCLUDED.brand,
    ingredients = EXCLUDED.ingredients,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_count = EXCLUDED.ingredient_count,
    nutritional_info = EXCLUDED.nutritional_info,
    source = EXCLUDED.source,
    source_url = EXCLUDED.source_url,
    scraped_at = EXCLUDED.scraped_at,
    expires_at = EXCLUDED.expires_at,
    image_url = EXCLUDED.image_url,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    pet_type = EXCLUDED.pet_type,
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = EXCLUDED.verified_at,
    gtin = NULL,
    product_line = EXCLUDED.product_line,
    flavor = EXCLUDED.flavor,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    package_size = NULL,
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = EXCLUDED.formula_version_provenance,
    updated_at = now();
  GET DIAGNOSTICS v_serving_count = ROW_COUNT;

  UPDATE public.catalog_formulas formula
  SET
    promoted_cache_key = v_cache_key,
    promoted_at = now(),
    updated_at = now()
  WHERE formula.id = v_formula_id;

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
  ) VALUES
    (
      v_formula_id,
      NULL,
      'ingredient_text',
      to_jsonb(v_ingredient_text),
      p_source_url,
      'manufacturer',
      true,
      now(),
      v_ingredient_hash
    ),
    (
      v_formula_id,
      NULL,
      'front_image_url',
      to_jsonb(p_image_url),
      p_source_url,
      'manufacturer',
      true,
      now(),
      encode(extensions.digest(p_image_url, 'sha256'), 'hex')
    )
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET
    field_value = EXCLUDED.field_value,
    source_authority = 'manufacturer',
    accepted = true,
    observed_at = EXCLUDED.observed_at;
  GET DIAGNOSTICS v_evidence_count = ROW_COUNT;

  UPDATE public.catalog_acquisition_queue queue
  SET
    status = 'resolved',
    cache_key = v_cache_key,
    product_source = 'official_manufacturer',
    source_quality = 'manufacturer',
    source_url = p_source_url,
    needs_product_record = false,
    needs_verified_ingredients = false,
    needs_verified_image = false,
    ready_rows = 1,
    affected_product_count = 0,
    sample_metadata = queue.sample_metadata || jsonb_build_object(
      'agentic_status', 'PROMOTED_MANUFACTURER',
      'verification_provenance', 'official_manufacturer',
      'manufacturer_verified', true,
      'retailer_verified', false,
      'ingredient_text_hash', v_ingredient_hash,
      'source_url', p_source_url,
      'image_url', p_image_url,
      'package_size_is_sku_only', true,
      'resolved_at', now()
    ),
    acquisition_notes = 'Resolved with exact current official-manufacturer ingredients and image.',
    resolution_reason = 'official_manufacturer_exact',
    resolved_at = now(),
    last_refreshed_at = now(),
    updated_at = now()
  WHERE queue.id = v_queue.id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas formula
    JOIN public.product_data serving
      ON serving.cache_key = formula.promoted_cache_key
    WHERE formula.id = v_formula_id
      AND formula.verification_status = 'verified'
      AND formula.formula_evidence_tier = 'manufacturer_current_exact'
      AND formula.source_authority = 'manufacturer'
      AND serving.source_quality = 'manufacturer'
      AND serving.ingredient_verification_status = 'manufacturer'
      AND serving.image_verification_status = 'manufacturer'
      AND serving.ingredient_text = formula.ingredient_text
      AND serving.image_url = formula.front_image_url
      AND serving.package_size IS NULL
      AND serving.gtin IS NULL
  ) THEN
    RAISE EXCEPTION 'Manufacturer promotion postcondition failed';
  END IF;

  RETURN QUERY SELECT 1, v_formula_created, v_serving_count, v_evidence_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.rehydrate_exact_manufacturer_source_versions(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) IS 'Promotes only exact, pending, official-manufacturer evidence; canonical rows deliberately exclude package size and GTIN variants.';
