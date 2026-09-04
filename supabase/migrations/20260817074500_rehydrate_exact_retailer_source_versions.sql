-- Close independently observed retailer gaps that already have a readable,
-- exact package page, full ingredients, and a matching package image. The
-- source version is materialized separately; it never overwrites or inherits
-- ingredients from a sibling/current manufacturer formula.

CREATE OR REPLACE FUNCTION public.catalog_strip_retailer_formula_code(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT btrim(regexp_replace(
    COALESCE(p_value, ''),
    '[[:space:]]+[A-Za-z][0-9]{6}[[:space:]]*$',
    '',
    'i'
  ));
$function$;

-- Purina and some other manufacturer ingredient panels append a formula code
-- such as "B440123" after the final ingredient. It identifies production
-- copy, not an ingredient or a different formula, so exclude it from exact
-- ingredient comparisons while retaining the original text in provenance.
CREATE OR REPLACE FUNCTION public.catalog_normalize_ingredient_evidence(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT regexp_replace(
    lower(regexp_replace(
      public.catalog_strip_retailer_formula_code(p_value),
      '^[[:space:]]*ingredients?[[:space:]]*:[[:space:]]*',
      '',
      'i'
    )),
    '[^a-z0-9]+',
    '',
    'g'
  );
$function$;

CREATE OR REPLACE FUNCTION public.rehydrate_exact_retailer_source_versions(
  p_payload JSONB
)
RETURNS TABLE(
  selected_rows INTEGER,
  created_formula_rows INTEGER,
  upserted_serving_rows INTEGER,
  upserted_source_aliases INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_run_id BIGINT;
  v_created INTEGER := 0;
  v_serving INTEGER := 0;
  v_aliases INTEGER := 0;
  v_observations INTEGER := 0;
  v_changed INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_payload, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Exact retailer source-version payload must be an array';
  END IF;
  IF jsonb_array_length(COALESCE(p_payload, '[]'::JSONB)) > 1000 THEN
    RAISE EXCEPTION 'Exact retailer source-version payload exceeds 1000 rows';
  END IF;

  WITH requested AS (
    SELECT DISTINCT
      lower(btrim(row.source_slug)) AS source_slug,
      btrim(row.source_external_id) AS source_external_id
    FROM jsonb_to_recordset(COALESCE(p_payload, '[]'::JSONB)) AS row(
      source_slug TEXT,
      source_external_id TEXT
    )
    WHERE lower(btrim(row.source_slug)) IN ('chewy', 'walmart')
      AND NULLIF(btrim(row.source_external_id), '') IS NOT NULL
  ), eligible AS (
    SELECT evidence.id
    FROM requested
    JOIN public.catalog_retailer_ingredient_evidence evidence
      USING (source_slug, source_external_id)
    LEFT JOIN public.catalog_formulas linked
      ON linked.id = evidence.linked_formula_id
    WHERE evidence.is_current
      AND (
        (
          evidence.evidence_status = 'promoted'
          AND COALESCE(cardinality(evidence.validation_reasons), 0) = 0
        )
        OR (
          evidence.evidence_status = 'quarantined_validation'
          AND evidence.validation_reasons =
            ARRAY['cross_retailer_protected_identity_conflict']::TEXT[]
        )
      )
      AND evidence.image_validation_status IN (
        'exact_retailer_sku', 'exact_catalog_formula'
      )
      AND evidence.source_url ~ '^https://'
      AND evidence.front_image_url ~ '^https://'
      AND NULLIF(btrim(evidence.formula_title), '') IS NOT NULL
      AND evidence.pet_type IN ('dog', 'cat')
      AND public.catalog_retailer_ingredient_is_serving_safe(
        public.catalog_strip_retailer_formula_code(evidence.ingredient_text)
      )
      AND evidence.ingredient_count >= 5
      AND length(public.catalog_strip_retailer_formula_code(
        evidence.ingredient_text
      )) >= 30
      AND NOT public.catalog_has_unbalanced_parentheses(
        public.catalog_strip_retailer_formula_code(evidence.ingredient_text)
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        public.catalog_strip_retailer_formula_code(evidence.ingredient_text)
      )
      AND lower(evidence.formula_title) !~
        '\\m(treat|treats|topper|toppers|supplement|supplements|complement|complements|mixer|mixers|broth|puree|purée|dental)\\M'
      AND (
        lower(evidence.formula_title) ~
          '\\m(dog|cat|puppy|kitten)\\M.*\\m(food|kibble|diet)\\M'
        OR lower(evidence.formula_title) ~
          '\\m(dry|wet|canned|pate|paté|gravy|freeze[ -]?dried)\\M.*\\m(dog|cat|puppy|kitten)\\M'
        OR COALESCE(linked.is_complete_food, false)
      )
      AND (
        NULLIF(btrim(evidence.retailer_brand), '') IS NOT NULL
        OR (
          linked.id IS NOT NULL
          AND NULLIF(btrim(linked.brand), '') IS NOT NULL
          AND public.catalog_normalize_retailer_boundary(evidence.formula_title)
            LIKE public.catalog_normalize_retailer_boundary(linked.brand) || '%'
        )
      )
  )
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM eligible;

  IF cardinality(v_ids) = 0 THEN
    RETURN QUERY SELECT 0, 0, 0, 0;
    RETURN;
  END IF;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status,
    started_at, finished_at, expected_count, observed_count,
    accepted_count, rejected_count, pagination_complete,
    source_content_hash, metadata
  ) VALUES (
    'coverage-92-exact-retailer-source-versions-v1',
    'chewy+walmart-exact-source-version-repair',
    'retailer',
    'verification',
    'completed',
    now(),
    now(),
    cardinality(v_ids),
    cardinality(v_ids),
    cardinality(v_ids),
    0,
    true,
    encode(extensions.digest(array_to_string(v_ids, ','), 'sha256'), 'hex'),
    jsonb_build_object(
      'policy', 'exact source-version rehydration',
      'identity', 'source URL + retailer item + package image + full ingredients',
      'formula_versions_separate', true,
      'package_size_is_sku_only', true,
      'input_count', cardinality(v_ids)
    )
  )
  ON CONFLICT (run_key) DO UPDATE SET
    finished_at = now(),
    expected_count = EXCLUDED.expected_count,
    observed_count = EXCLUDED.observed_count,
    accepted_count = EXCLUDED.accepted_count,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = EXCLUDED.source_content_hash,
    metadata = EXCLUDED.metadata,
    updated_at = now()
  RETURNING id INTO v_run_id;

  WITH prepared AS (
    SELECT
      evidence.*,
      COALESCE(NULLIF(btrim(evidence.retailer_brand), ''), linked.brand) AS exact_brand,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mpuppy\\M' THEN 'puppy'
        WHEN lower(evidence.formula_title) ~ '\\mkitten\\M' THEN 'kitten'
        WHEN lower(evidence.formula_title) ~
          '\\m(senior|mature|adult[[:space:]]+(7|8|11)[+])\\M' THEN 'senior'
        WHEN lower(evidence.formula_title) ~ '\\madult\\M' THEN 'adult'
        ELSE COALESCE(NULLIF(evidence.life_stage, ''), 'unknown')
      END AS exact_life_stage,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mfreeze[ -]?dried\\M'
          THEN 'freeze_dried'
        WHEN lower(evidence.formula_title) ~ '\\m(dry|kibble)\\M' THEN 'dry'
        WHEN lower(evidence.formula_title) ~
          '\\m(wet|canned|pate|paté|gravy|morsels|chunks)\\M' THEN 'wet'
        ELSE COALESCE(NULLIF(evidence.food_form, ''), 'unknown')
      END AS exact_food_form,
      public.catalog_strip_retailer_formula_code(
        evidence.ingredient_text
      ) AS exact_ingredient_text
    FROM public.catalog_retailer_ingredient_evidence evidence
    LEFT JOIN public.catalog_formulas linked
      ON linked.id = evidence.linked_formula_id
    WHERE evidence.id = ANY(v_ids)
  ), versioned AS (
    SELECT
      prepared.*,
      encode(extensions.digest(concat_ws('|',
        public.catalog_normalize_retailer_boundary(exact_brand),
        public.catalog_normalize_retailer_boundary(formula_title),
        pet_type,
        exact_life_stage,
        exact_food_form,
        public.catalog_normalize_retailer_boundary(flavor),
        public.catalog_normalize_retailer_boundary(diet_condition),
        public.catalog_normalize_ingredient_evidence(exact_ingredient_text)
      ), 'sha256'), 'hex') AS version_hash
    FROM prepared
  ), representatives AS (
    SELECT DISTINCT ON (version_hash) *
    FROM versioned
    ORDER BY version_hash, fetched_at DESC NULLS LAST, id DESC
  ), inserted AS (
    INSERT INTO public.catalog_formulas (
      formula_key, manufacturer, brand, product_name, product_line,
      pet_type, life_stage, food_form, flavor, diet_condition,
      is_complete_food, complete_food_evidence, ingredient_text, ingredients,
      front_image_url, source_url, source_authority,
      ingredient_verification_status, image_verification_status,
      protected_terms, verification_status, active, is_popular_brand,
      first_observed_at, last_observed_at, identity_hash,
      formula_evidence_tier, formula_version_provenance, updated_at
    )
    SELECT
      'retailer-source-version:' || version_hash,
      exact_brand,
      exact_brand,
      formula_title,
      formula_title,
      pet_type,
      exact_life_stage,
      exact_food_form,
      COALESCE(flavor, ''),
      COALESCE(diet_condition, ''),
      true,
      'Exact retailer package page with a readable full ingredient statement and an exact matching package image; stored as its own dated source version.',
      exact_ingredient_text,
      public.catalog_split_ingredient_statement(exact_ingredient_text),
      front_image_url,
      source_url,
      'retailer_verified',
      'retailer_verified',
      'retailer_verified',
      ARRAY(
        SELECT token
        FROM unnest(regexp_split_to_array(
          public.catalog_normalize_retailer_title(formula_title), '\\s+'
        )) AS token
        WHERE length(token) > 2
          AND token <> ALL(ARRAY[
            'and','cat','dog','food','for','formula','natural','recipe','the','with'
          ])
      ),
      'verified',
      true,
      EXISTS (
        SELECT 1
        FROM public.catalog_major_brands major
        WHERE major.inclusion_status = 'major'
          AND major.brand_key = public.catalog_normalize_retailer_title(exact_brand)
          AND major.snapshot_id = (
            SELECT max(snapshot.id)
            FROM public.catalog_major_brand_registry_snapshots snapshot
          )
      ),
      COALESCE(fetched_at, now()),
      COALESCE(fetched_at, now()),
      version_hash,
      'retailer_web_version',
      jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'source_versioned_exact_retailer_package',
        'census_formula_version_key', 'retailer-package-version:' || version_hash,
        'ingredient_text_hash', ingredient_hash,
        'image_content_hash', image_content_hash,
        'source', source_slug,
        'source_url', source_url,
        'retailer_sku', source_external_id,
        'retailer_gtin', retailer_gtin,
        'captured_at', fetched_at,
        'package_size_is_sku_only', true,
        'repair_version', 'coverage_92_exact_source_version_v1'
      ),
      now()
    FROM representatives
    ON CONFLICT (formula_key) DO UPDATE SET
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      pet_type = EXCLUDED.pet_type,
      life_stage = EXCLUDED.life_stage,
      food_form = EXCLUDED.food_form,
      flavor = EXCLUDED.flavor,
      diet_condition = EXCLUDED.diet_condition,
      is_complete_food = true,
      ingredient_text = EXCLUDED.ingredient_text,
      ingredients = EXCLUDED.ingredients,
      front_image_url = EXCLUDED.front_image_url,
      source_url = EXCLUDED.source_url,
      source_authority = 'retailer_verified',
      ingredient_verification_status = 'retailer_verified',
      image_verification_status = 'retailer_verified',
      verification_status = 'verified',
      active = true,
      absent_since = NULL,
      last_observed_at = GREATEST(
        public.catalog_formulas.last_observed_at,
        EXCLUDED.last_observed_at
      ),
      formula_evidence_tier = 'retailer_web_version',
      formula_version_provenance = EXCLUDED.formula_version_provenance,
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM inserted;

  WITH prepared AS (
    SELECT
      evidence.*,
      COALESCE(NULLIF(btrim(evidence.retailer_brand), ''), linked.brand) AS exact_brand,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mpuppy\\M' THEN 'puppy'
        WHEN lower(evidence.formula_title) ~ '\\mkitten\\M' THEN 'kitten'
        WHEN lower(evidence.formula_title) ~
          '\\m(senior|mature|adult[[:space:]]+(7|8|11)[+])\\M' THEN 'senior'
        WHEN lower(evidence.formula_title) ~ '\\madult\\M' THEN 'adult'
        ELSE COALESCE(NULLIF(evidence.life_stage, ''), 'unknown')
      END AS exact_life_stage,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mfreeze[ -]?dried\\M'
          THEN 'freeze_dried'
        WHEN lower(evidence.formula_title) ~ '\\m(dry|kibble)\\M' THEN 'dry'
        WHEN lower(evidence.formula_title) ~
          '\\m(wet|canned|pate|paté|gravy|morsels|chunks)\\M' THEN 'wet'
        ELSE COALESCE(NULLIF(evidence.food_form, ''), 'unknown')
      END AS exact_food_form,
      public.catalog_strip_retailer_formula_code(
        evidence.ingredient_text
      ) AS exact_ingredient_text
    FROM public.catalog_retailer_ingredient_evidence evidence
    LEFT JOIN public.catalog_formulas linked
      ON linked.id = evidence.linked_formula_id
    WHERE evidence.id = ANY(v_ids)
  ), versioned AS (
    SELECT prepared.*, encode(extensions.digest(concat_ws('|',
      public.catalog_normalize_retailer_boundary(exact_brand),
      public.catalog_normalize_retailer_boundary(formula_title),
      pet_type, exact_life_stage, exact_food_form,
      public.catalog_normalize_retailer_boundary(flavor),
      public.catalog_normalize_retailer_boundary(diet_condition),
      public.catalog_normalize_ingredient_evidence(exact_ingredient_text)
    ), 'sha256'), 'hex') AS version_hash
    FROM prepared
  ), representatives AS (
    SELECT DISTINCT ON (version_hash) *
    FROM versioned
    ORDER BY version_hash, fetched_at DESC NULLS LAST, id DESC
  ), upserted AS (
    INSERT INTO public.product_data (
      cache_key, product_name, brand, gtin, product_line, flavor,
      life_stage, food_form, package_size, pet_type,
      ingredients, ingredient_text, ingredient_count,
      nutritional_info, nutrient_panel, has_published_nutrients,
      source, source_quality, ingredient_verification_status,
      image_verification_status, verified_at, source_url, scraped_at,
      expires_at, image_url, is_complete_food, catalog_exclusion_reason,
      formula_evidence_tier, formula_version_provenance, updated_at
    )
    SELECT
      'retailer-source-version:' || version_hash,
      formula_title,
      exact_brand,
      retailer_gtin,
      formula_title,
      COALESCE(flavor, ''),
      exact_life_stage,
      exact_food_form,
      NULLIF(package_size, ''),
      pet_type,
      public.catalog_split_ingredient_statement(exact_ingredient_text),
      exact_ingredient_text,
      cardinality(public.catalog_split_ingredient_statement(exact_ingredient_text)),
      jsonb_build_object(
        'formula_version_provenance', jsonb_build_object(
          'manufacturer_current_equivalence', false,
          'version_status', 'source_versioned_exact_retailer_package',
          'census_formula_version_key', 'retailer-package-version:' || version_hash,
          'ingredient_text_hash', ingredient_hash,
          'image_content_hash', image_content_hash,
          'source_url', source_url,
          'retailer_sku', source_external_id,
          'retailer_gtin', retailer_gtin,
          'captured_at', fetched_at,
          'package_size_is_sku_only', true,
          'repair_version', 'coverage_92_exact_source_version_v1'
        )
      ),
      NULL,
      false,
      source_slug || '-retailer-web-version',
      'retailer_verified',
      'retailer_verified',
      'retailer_verified',
      COALESCE(fetched_at, now()),
      source_url,
      COALESCE(fetched_at, now()),
      COALESCE(fetched_at, now()) + interval '180 days',
      front_image_url,
      true,
      NULL,
      'retailer_web_version',
      jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'source_versioned_exact_retailer_package',
        'census_formula_version_key', 'retailer-package-version:' || version_hash,
        'ingredient_text_hash', ingredient_hash,
        'image_content_hash', image_content_hash,
        'source_url', source_url,
        'retailer_sku', source_external_id,
        'retailer_gtin', retailer_gtin,
        'captured_at', fetched_at,
        'package_size_is_sku_only', true,
        'repair_version', 'coverage_92_exact_source_version_v1'
      ),
      now()
    FROM representatives
    ON CONFLICT (cache_key) DO UPDATE SET
      product_name = EXCLUDED.product_name,
      brand = EXCLUDED.brand,
      gtin = EXCLUDED.gtin,
      product_line = EXCLUDED.product_line,
      flavor = EXCLUDED.flavor,
      life_stage = EXCLUDED.life_stage,
      food_form = EXCLUDED.food_form,
      package_size = EXCLUDED.package_size,
      pet_type = EXCLUDED.pet_type,
      ingredients = EXCLUDED.ingredients,
      ingredient_text = EXCLUDED.ingredient_text,
      ingredient_count = EXCLUDED.ingredient_count,
      nutritional_info = EXCLUDED.nutritional_info,
      source = EXCLUDED.source,
      source_quality = 'retailer_verified',
      ingredient_verification_status = 'retailer_verified',
      image_verification_status = 'retailer_verified',
      verified_at = EXCLUDED.verified_at,
      source_url = EXCLUDED.source_url,
      scraped_at = EXCLUDED.scraped_at,
      expires_at = EXCLUDED.expires_at,
      image_url = EXCLUDED.image_url,
      is_complete_food = true,
      catalog_exclusion_reason = NULL,
      formula_evidence_tier = 'retailer_web_version',
      formula_version_provenance = EXCLUDED.formula_version_provenance,
      updated_at = now()
    RETURNING cache_key
  )
  SELECT count(*) INTO v_serving FROM upserted;

  WITH prepared AS (
    SELECT
      evidence.*,
      COALESCE(NULLIF(btrim(evidence.retailer_brand), ''), linked.brand) AS exact_brand,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mpuppy\\M' THEN 'puppy'
        WHEN lower(evidence.formula_title) ~ '\\mkitten\\M' THEN 'kitten'
        WHEN lower(evidence.formula_title) ~
          '\\m(senior|mature|adult[[:space:]]+(7|8|11)[+])\\M' THEN 'senior'
        WHEN lower(evidence.formula_title) ~ '\\madult\\M' THEN 'adult'
        ELSE COALESCE(NULLIF(evidence.life_stage, ''), 'unknown')
      END AS exact_life_stage,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mfreeze[ -]?dried\\M'
          THEN 'freeze_dried'
        WHEN lower(evidence.formula_title) ~ '\\m(dry|kibble)\\M' THEN 'dry'
        WHEN lower(evidence.formula_title) ~
          '\\m(wet|canned|pate|paté|gravy|morsels|chunks)\\M' THEN 'wet'
        ELSE COALESCE(NULLIF(evidence.food_form, ''), 'unknown')
      END AS exact_food_form,
      public.catalog_strip_retailer_formula_code(
        evidence.ingredient_text
      ) AS exact_ingredient_text
    FROM public.catalog_retailer_ingredient_evidence evidence
    LEFT JOIN public.catalog_formulas linked
      ON linked.id = evidence.linked_formula_id
    WHERE evidence.id = ANY(v_ids)
  ), versioned AS (
    SELECT prepared.*, encode(extensions.digest(concat_ws('|',
      public.catalog_normalize_retailer_boundary(exact_brand),
      public.catalog_normalize_retailer_boundary(formula_title),
      pet_type, exact_life_stage, exact_food_form,
      public.catalog_normalize_retailer_boundary(flavor),
      public.catalog_normalize_retailer_boundary(diet_condition),
      public.catalog_normalize_ingredient_evidence(exact_ingredient_text)
    ), 'sha256'), 'hex') AS version_hash
    FROM prepared
  ), inserted_observations AS (
    INSERT INTO public.catalog_observations (
      run_id, formula_id, source_slug, source_external_id, source_url,
      source_authority, gtin, manufacturer, brand, product_name, product_line,
      pet_type, life_stage, food_form, flavor, diet_condition, package_size,
      ingredient_text, front_image_url, is_complete_food, available_in_us,
      observed_at, content_hash, validation_status, validation_reasons,
      raw_payload, formula_evidence_tier, formula_version_provenance
    )
    SELECT
      v_run_id,
      formula.id,
      versioned.source_slug || '-retailer-web-version',
      versioned.source_external_id,
      versioned.source_url,
      'retailer_verified',
      versioned.retailer_gtin,
      versioned.exact_brand,
      versioned.exact_brand,
      versioned.formula_title,
      versioned.formula_title,
      versioned.pet_type,
      versioned.exact_life_stage,
      versioned.exact_food_form,
      COALESCE(versioned.flavor, ''),
      COALESCE(versioned.diet_condition, ''),
      COALESCE(NULLIF(versioned.package_size, ''), 'unknown'),
      versioned.exact_ingredient_text,
      versioned.front_image_url,
      true,
      true,
      COALESCE(versioned.fetched_at, now()),
      COALESCE(NULLIF(versioned.content_hash, ''), versioned.ingredient_hash)
        || ':' || COALESCE(NULLIF(versioned.image_content_hash, ''),
          encode(extensions.digest(versioned.front_image_url, 'sha256'), 'hex')),
      'accepted',
      ARRAY[]::TEXT[],
      versioned.raw_payload || jsonb_build_object(
        'ingredient_text_hash', versioned.ingredient_hash,
        'image_content_hash', versioned.image_content_hash,
        'source_version_rehydrated', true,
        'repair_version', 'coverage_92_exact_source_version_v1'
      ),
      'retailer_web_version',
      jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'source_versioned_exact_retailer_package',
        'census_formula_version_key', 'retailer-package-version:' || versioned.version_hash,
        'package_identifier', versioned.source_slug || ':' || versioned.source_external_id,
        'retailer_gtin', versioned.retailer_gtin,
        'ingredient_text_hash', versioned.ingredient_hash,
        'image_content_hash', versioned.image_content_hash,
        'source_url', versioned.source_url,
        'captured_at', versioned.fetched_at,
        'package_size_is_sku_only', true,
        'repair_version', 'coverage_92_exact_source_version_v1'
      )
    FROM versioned
    JOIN public.catalog_formulas formula
      ON formula.formula_key = 'retailer-source-version:' || versioned.version_hash
    ON CONFLICT (run_id, source_slug, source_external_id, content_hash)
    DO UPDATE SET
      formula_id = EXCLUDED.formula_id,
      gtin = EXCLUDED.gtin,
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      product_line = EXCLUDED.product_line,
      life_stage = EXCLUDED.life_stage,
      food_form = EXCLUDED.food_form,
      ingredient_text = EXCLUDED.ingredient_text,
      front_image_url = EXCLUDED.front_image_url,
      validation_status = 'accepted',
      validation_reasons = ARRAY[]::TEXT[],
      raw_payload = EXCLUDED.raw_payload,
      formula_evidence_tier = 'retailer_web_version',
      formula_version_provenance = EXCLUDED.formula_version_provenance
    RETURNING id
  )
  SELECT count(*) INTO v_observations FROM inserted_observations;

  WITH prepared AS (
    SELECT
      evidence.*,
      COALESCE(NULLIF(btrim(evidence.retailer_brand), ''), linked.brand) AS exact_brand,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mpuppy\\M' THEN 'puppy'
        WHEN lower(evidence.formula_title) ~ '\\mkitten\\M' THEN 'kitten'
        WHEN lower(evidence.formula_title) ~
          '\\m(senior|mature|adult[[:space:]]+(7|8|11)[+])\\M' THEN 'senior'
        WHEN lower(evidence.formula_title) ~ '\\madult\\M' THEN 'adult'
        ELSE COALESCE(NULLIF(evidence.life_stage, ''), 'unknown')
      END AS exact_life_stage,
      CASE
        WHEN lower(evidence.formula_title) ~ '\\mfreeze[ -]?dried\\M'
          THEN 'freeze_dried'
        WHEN lower(evidence.formula_title) ~ '\\m(dry|kibble)\\M' THEN 'dry'
        WHEN lower(evidence.formula_title) ~
          '\\m(wet|canned|pate|paté|gravy|morsels|chunks)\\M' THEN 'wet'
        ELSE COALESCE(NULLIF(evidence.food_form, ''), 'unknown')
      END AS exact_food_form,
      public.catalog_strip_retailer_formula_code(
        evidence.ingredient_text
      ) AS exact_ingredient_text
    FROM public.catalog_retailer_ingredient_evidence evidence
    LEFT JOIN public.catalog_formulas linked
      ON linked.id = evidence.linked_formula_id
    WHERE evidence.id = ANY(v_ids)
  ), versioned AS (
    SELECT prepared.*, encode(extensions.digest(concat_ws('|',
      public.catalog_normalize_retailer_boundary(exact_brand),
      public.catalog_normalize_retailer_boundary(formula_title),
      pet_type, exact_life_stage, exact_food_form,
      public.catalog_normalize_retailer_boundary(flavor),
      public.catalog_normalize_retailer_boundary(diet_condition),
      public.catalog_normalize_ingredient_evidence(exact_ingredient_text)
    ), 'sha256'), 'hex') AS version_hash
    FROM prepared
  ), changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      retailer_brand = versioned.exact_brand,
      life_stage = versioned.exact_life_stage,
      food_form = versioned.exact_food_form,
      serving_ingredient_text = versioned.exact_ingredient_text,
      linked_formula_id = formula.id,
      linked_observation_id = observation.id,
      promoted_cache_key = 'retailer-source-version:' || versioned.version_hash,
      evidence_status = 'promoted',
      validation_reasons = ARRAY['source_version_rehydrated']::TEXT[],
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'prior_linked_formula_id', evidence.linked_formula_id,
        'source_version_rehydrated', true,
        'repair_version', 'coverage_92_exact_source_version_v1'
      ),
      updated_at = now()
    FROM versioned
    JOIN public.catalog_formulas formula
      ON formula.formula_key = 'retailer-source-version:' || versioned.version_hash
    JOIN public.catalog_observations observation
      ON observation.run_id = v_run_id
     AND observation.formula_id = formula.id
     AND observation.source_slug = versioned.source_slug || '-retailer-web-version'
     AND observation.source_external_id = versioned.source_external_id
    WHERE evidence.id = versioned.id
    RETURNING evidence.id
  )
  SELECT count(*) INTO v_changed FROM changed;

  WITH evidence_versions AS (
    SELECT
      evidence.*,
      formula.id AS exact_formula_id,
      formula.identity_hash AS version_hash,
      'retailer-source-version:' || formula.identity_hash AS exact_cache_key
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.formula_key = 'retailer-source-version:' || encode(
        extensions.digest(concat_ws('|',
          public.catalog_normalize_retailer_boundary(evidence.retailer_brand),
          public.catalog_normalize_retailer_boundary(evidence.formula_title),
          evidence.pet_type,
          evidence.life_stage,
          evidence.food_form,
          public.catalog_normalize_retailer_boundary(evidence.flavor),
          public.catalog_normalize_retailer_boundary(evidence.diet_condition),
          public.catalog_normalize_ingredient_evidence(
            COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
          )
        ), 'sha256'), 'hex'
      )
    WHERE evidence.id = ANY(v_ids)
  ), sku_upsert AS (
    INSERT INTO public.catalog_skus (
      formula_id, gtin, package_size, source_slug, source_external_id,
      source_url, active, first_observed_at, last_observed_at
    )
    SELECT
      exact_formula_id,
      CASE
        WHEN retailer_gtin IS NULL THEN NULL
        WHEN EXISTS (
          SELECT 1 FROM public.catalog_skus existing
          WHERE existing.active
            AND existing.gtin = evidence_versions.retailer_gtin
            AND existing.formula_id <> evidence_versions.exact_formula_id
        ) THEN NULL
        ELSE retailer_gtin
      END,
      COALESCE(NULLIF(package_size, ''), 'unknown'),
      source_slug || '-retailer-web-version',
      source_external_id,
      source_url,
      true,
      COALESCE(fetched_at, now()),
      COALESCE(fetched_at, now())
    FROM evidence_versions
    ON CONFLICT (source_slug, source_external_id, gtin, package_size)
    DO UPDATE SET
      formula_id = EXCLUDED.formula_id,
      source_url = EXCLUDED.source_url,
      active = true,
      last_observed_at = GREATEST(
        public.catalog_skus.last_observed_at,
        EXCLUDED.last_observed_at
      )
    RETURNING id
  ), alias_upsert AS (
    INSERT INTO public.catalog_verified_product_source_aliases (
      source_url, cache_key, alias_text, source_authority,
      evidence_observed_at, provenance, active, updated_at
    )
    SELECT
      source_url,
      exact_cache_key,
      formula_title,
      'retailer_verified',
      COALESCE(fetched_at, now()),
      jsonb_build_object(
        'source', 'coverage_92_exact_source_version_v1',
        'evidence_id', id,
        'source_slug', source_slug,
        'source_external_id', source_external_id,
        'formula_id', exact_formula_id,
        'ingredient_hash', ingredient_hash,
        'image_content_hash', image_content_hash,
        'exact_package_image', true,
        'package_size_is_sku_only', true,
        'formula_versions_separate', true
      ),
      true,
      now()
    FROM evidence_versions
    ON CONFLICT (source_url) DO UPDATE SET
      cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      active = true,
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_aliases FROM alias_upsert;

  -- Set the canonical ledger pointer only after the serving row and exact URL
  -- aliases exist. This cannot point at an older/sibling ingredient version.
  UPDATE public.catalog_formulas formula
  SET
    promoted_cache_key = 'retailer-source-version:' || formula.identity_hash,
    promoted_at = now(),
    verification_status = 'verified',
    active = true,
    absent_since = NULL,
    updated_at = now()
  WHERE formula.formula_key = 'retailer-source-version:' || formula.identity_hash
    AND EXISTS (
      SELECT 1 FROM public.product_data serving
      WHERE serving.cache_key = 'retailer-source-version:' || formula.identity_hash
        AND serving.ingredient_text = formula.ingredient_text
        AND serving.image_url = formula.front_image_url
    );

  IF EXISTS (
    SELECT 1
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
    JOIN public.product_data serving
      ON serving.cache_key = evidence.promoted_cache_key
    LEFT JOIN public.catalog_verified_product_source_aliases source_alias
      ON source_alias.source_url = evidence.source_url
     AND source_alias.active
    WHERE evidence.id = ANY(v_ids)
      AND (
        formula.promoted_cache_key IS DISTINCT FROM serving.cache_key
        OR source_alias.cache_key IS DISTINCT FROM serving.cache_key
        OR source_alias.provenance->>'image_content_hash'
          IS DISTINCT FROM evidence.image_content_hash
        OR public.catalog_normalize_ingredient_evidence(serving.ingredient_text)
          IS DISTINCT FROM public.catalog_normalize_ingredient_evidence(
            COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
          )
        OR public.catalog_canonical_retailer_brand_boundary(serving.brand)
          IS DISTINCT FROM public.catalog_canonical_retailer_brand_boundary(
            evidence.retailer_brand
          )
        OR serving.pet_type IS DISTINCT FROM evidence.pet_type
      )
  ) THEN
    RAISE EXCEPTION 'Exact source-version rehydration postcondition failed';
  END IF;

  RETURN QUERY SELECT cardinality(v_ids), v_created, v_serving, v_aliases;
END;
$function$;

REVOKE ALL ON FUNCTION public.catalog_strip_retailer_formula_code(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_normalize_ingredient_evidence(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rehydrate_exact_retailer_source_versions(JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_strip_retailer_formula_code(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_normalize_ingredient_evidence(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.rehydrate_exact_retailer_source_versions(JSONB)
  TO service_role;

DO $postcondition$
BEGIN
  IF public.catalog_strip_retailer_formula_code(
    'Chicken, Rice, Vitamins. B440123'
  ) <> 'Chicken, Rice, Vitamins.' THEN
    RAISE EXCEPTION 'Retailer formula-code stripping failed';
  END IF;
  IF public.catalog_normalize_ingredient_evidence(
    'Chicken, Rice, Vitamins. B440123'
  ) <> public.catalog_normalize_ingredient_evidence(
    'Chicken, Rice, Vitamins.'
  ) THEN
    RAISE EXCEPTION 'Formula code changed exact ingredient identity';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.rehydrate_exact_retailer_source_versions(jsonb)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.rehydrate_exact_retailer_source_versions(jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Exact source-version repair function is publicly executable';
  END IF;
END;
$postcondition$;
