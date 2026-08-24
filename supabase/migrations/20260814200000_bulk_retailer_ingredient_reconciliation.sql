-- Separate exact-SKU linking from source-version promotion and use a direct,
-- deterministic cache-key upsert. The generic feed RPC performs a full
-- serving-table identity duplicate scan, which is unnecessary here because
-- every row is already linked to a canonical formula and version hash.

CREATE OR REPLACE FUNCTION public.link_retailer_ingredient_evidence(
  p_import_run_id UUID
)
RETURNS TABLE(
  linked_with_image INTEGER,
  linked_missing_image INTEGER,
  unmatched_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_with_image INTEGER := 0;
  v_missing_image INTEGER := 0;
  v_unmatched INTEGER := 0;
BEGIN
  WITH pending AS (
    SELECT evidence.*
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.evidence_status = 'usable_exact_page'
      AND evidence.is_current
  ), candidate_matches AS (
    SELECT
      pending.id AS evidence_id,
      observation.id AS observation_id,
      observation.formula_id,
      observation.front_image_url,
      row_number() OVER (
        PARTITION BY pending.id
        ORDER BY
          CASE WHEN NULLIF(btrim(observation.front_image_url), '') IS NOT NULL THEN 0 ELSE 1 END,
          similarity(
            public.catalog_normalize_retailer_title(pending.product_name),
            public.catalog_normalize_retailer_title(observation.product_name)
          ) DESC,
          observation.observed_at DESC,
          observation.id DESC
      ) AS match_rank
    FROM pending
    JOIN public.catalog_observations observation
      ON observation.source_external_id = pending.source_external_id
     AND observation.source_slug = CASE pending.source_slug
       WHEN 'chewy' THEN 'chewy-public-sitemap'
       WHEN 'walmart' THEN 'walmart-public-sitemap'
     END
     AND observation.formula_id IS NOT NULL
    JOIN public.catalog_formulas formula
      ON formula.id = observation.formula_id
     AND formula.active
     AND formula.is_complete_food
     AND formula.pet_type = pending.pet_type
    WHERE similarity(
      public.catalog_normalize_retailer_title(pending.product_name),
      public.catalog_normalize_retailer_title(observation.product_name)
    ) >= 0.58
  ), chosen AS (
    SELECT * FROM candidate_matches WHERE match_rank = 1
  ), linked AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      linked_observation_id = chosen.observation_id,
      linked_formula_id = chosen.formula_id,
      evidence_status = CASE
        WHEN NULLIF(btrim(chosen.front_image_url), '') IS NULL
          THEN 'linked_missing_exact_image'
        ELSE 'promotable_exact_package'
      END,
      updated_at = now()
    FROM chosen
    WHERE evidence.id = chosen.evidence_id
    RETURNING evidence.evidence_status
  ), unmatched AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      evidence_status = 'unmatched_catalog_sku',
      validation_reasons = CASE
        WHEN 'no_unique_exact_catalog_sku_identity' = ANY(evidence.validation_reasons)
          THEN evidence.validation_reasons
        ELSE array_append(
          evidence.validation_reasons,
          'no_unique_exact_catalog_sku_identity'
        )
      END,
      updated_at = now()
    WHERE evidence.id IN (SELECT id FROM pending)
      AND NOT EXISTS (
        SELECT 1 FROM chosen WHERE chosen.evidence_id = evidence.id
      )
    RETURNING evidence.id
  )
  SELECT
    count(*) FILTER (WHERE evidence_status = 'promotable_exact_package'),
    count(*) FILTER (WHERE evidence_status = 'linked_missing_exact_image'),
    (SELECT count(*) FROM unmatched)
  INTO v_with_image, v_missing_image, v_unmatched
  FROM linked;

  RETURN QUERY SELECT v_with_image, v_missing_image, v_unmatched;
END;
$function$;

CREATE OR REPLACE FUNCTION public.catalog_retailer_ingredient_is_serving_safe(
  value TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  WITH parsed AS (
    SELECT ingredient
    FROM unnest(public.catalog_split_ingredient_statement(COALESCE(value, '')))
      AS ingredient
    WHERE public.is_plausible_product_ingredient(ingredient)
  ), counted AS (
    SELECT count(*)::INTEGER AS ingredient_count FROM parsed
  )
  SELECT ingredient_count >= 5
    AND (
      ingredient_count >= 20
      OR COALESCE(value, '') ~* '\m(taurine|vitamin|zinc|ferrous|iron\s+sulfate|manganese|copper|potassium\s+iodide|calcium\s+iodate|choline\s+chloride|biotin|folic\s+acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M'
    )
  FROM counted;
$function$;

CREATE OR REPLACE FUNCTION public.promote_retailer_ingredient_versions(
  p_import_run_id UUID,
  p_limit INTEGER DEFAULT 1000
)
RETURNS TABLE(
  promoted_evidence_rows INTEGER,
  promoted_serving_rows INTEGER,
  remaining_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_promoted_evidence INTEGER := 0;
  v_promoted_serving INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'product_data_ingredient_contract'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.evidence_status = 'promotable_exact_package'
    AND NOT public.catalog_retailer_ingredient_is_serving_safe(
      evidence.ingredient_text
    );

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'product_data_ingredient_artifact_contract' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'product_data_ingredient_artifact_contract'
      )
    END,
    updated_at = now()
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.evidence_status = 'promotable_exact_package'
    AND (
      length(evidence.ingredient_text) < 30
      OR evidence.ingredient_count < 5
      OR evidence.ingredient_text ~ '(\.\.\.|…)'
      OR public.catalog_has_unbalanced_parentheses(evidence.ingredient_text)
      OR public.catalog_has_ingredient_ocr_artifacts(evidence.ingredient_text)
    );

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'canonical_formula_non_product' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(
        evidence.validation_reasons,
        'canonical_formula_non_product'
      )
    END,
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE formula.id = evidence.linked_formula_id
    AND evidence.import_run_id = p_import_run_id
    AND evidence.evidence_status = 'promotable_exact_package'
    AND public.is_likely_non_product_catalog_row(
      formula.product_name,
      formula.brand
    );

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT evidence.id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.evidence_status = 'promotable_exact_package'
      AND evidence.is_current
    ORDER BY evidence.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) selected;

  IF cardinality(v_ids) = 0 THEN
    SELECT count(*) INTO v_remaining
    FROM public.catalog_retailer_ingredient_evidence
    WHERE import_run_id = p_import_run_id
      AND evidence_status = 'promotable_exact_package';
    RETURN QUERY SELECT 0, 0, v_remaining;
    RETURN;
  END IF;

  WITH eligible AS (
    SELECT
      evidence.*,
      formula.identity_hash,
      formula.product_name AS canonical_product_name,
      formula.brand,
      formula.product_line,
      formula.flavor,
      formula.life_stage,
      formula.food_form,
      formula.pet_type AS canonical_pet_type,
      observation.front_image_url,
      'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
        left(evidence.ingredient_hash, 16) AS serving_cache_key
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
     AND formula.active
     AND formula.is_complete_food
    JOIN public.catalog_observations observation
      ON observation.id = evidence.linked_observation_id
    WHERE evidence.id = ANY(v_ids)
      AND evidence.ingredient_count >= 5
      AND length(evidence.ingredient_text) >= 30
      AND evidence.ingredient_text !~ '(\.\.\.|…)'
      AND NOT public.catalog_has_unbalanced_parentheses(evidence.ingredient_text)
      AND NOT public.catalog_has_ingredient_ocr_artifacts(evidence.ingredient_text)
      AND NULLIF(btrim(observation.front_image_url), '') IS NOT NULL
  ), deduped AS (
    SELECT DISTINCT ON (serving_cache_key) *
    FROM eligible
    ORDER BY serving_cache_key, fetched_at DESC NULLS LAST, id DESC
  )
  INSERT INTO public.product_data (
    cache_key,
    product_name,
    brand,
    gtin,
    product_line,
    flavor,
    life_stage,
    food_form,
    package_size,
    pet_type,
    ingredients,
    ingredient_text,
    ingredient_count,
    nutritional_info,
    nutrient_panel,
    has_published_nutrients,
    source,
    source_quality,
    ingredient_verification_status,
    image_verification_status,
    verified_at,
    source_url,
    scraped_at,
    expires_at,
    image_url,
    is_complete_food,
    catalog_exclusion_reason,
    updated_at
  )
  SELECT
    serving_cache_key,
    canonical_product_name,
    brand,
    NULL,
    product_line,
    flavor,
    life_stage,
    food_form,
    NULL,
    canonical_pet_type,
    regexp_split_to_array(ingredient_text, '\s*,\s*'),
    ingredient_text,
    ingredient_count,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'formula_version_provenance', jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'dated_retailer_web_version',
        'gtin_resolution_policy', 'abstain_on_version_conflict',
        'package_identifier', source_slug || ':' || source_external_id,
        'ingredient_text_hash', ingredient_hash,
        'front_image_url', front_image_url,
        'source_url', source_url,
        'captured_at', fetched_at,
        'retailer_sku', source_external_id
      )
    ),
    NULL,
    false,
    source_slug || '-retailer-web',
    'retailer_verified',
    'retailer_verified',
    'retailer_verified',
    fetched_at,
    source_url,
    fetched_at,
    COALESCE(fetched_at, now()) + interval '180 days',
    front_image_url,
    true,
    NULL,
    now()
  FROM deduped
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = EXCLUDED.product_name,
    brand = EXCLUDED.brand,
    product_line = EXCLUDED.product_line,
    flavor = EXCLUDED.flavor,
    life_stage = EXCLUDED.life_stage,
    food_form = EXCLUDED.food_form,
    pet_type = EXCLUDED.pet_type,
    ingredients = EXCLUDED.ingredients,
    ingredient_text = EXCLUDED.ingredient_text,
    ingredient_count = EXCLUDED.ingredient_count,
    nutritional_info = EXCLUDED.nutritional_info,
    source = EXCLUDED.source,
    source_quality = EXCLUDED.source_quality,
    ingredient_verification_status = EXCLUDED.ingredient_verification_status,
    image_verification_status = EXCLUDED.image_verification_status,
    verified_at = EXCLUDED.verified_at,
    source_url = EXCLUDED.source_url,
    scraped_at = EXCLUDED.scraped_at,
    expires_at = EXCLUDED.expires_at,
    image_url = EXCLUDED.image_url,
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    updated_at = now();

  GET DIAGNOSTICS v_promoted_serving = ROW_COUNT;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'promoted',
    promoted_cache_key =
      'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
      left(evidence.ingredient_hash, 16),
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE formula.id = evidence.linked_formula_id
    AND evidence.id = ANY(v_ids)
    AND EXISTS (
      SELECT 1
      FROM public.product_data serving
      WHERE serving.cache_key =
        'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
        left(evidence.ingredient_hash, 16)
        AND serving.formula_evidence_tier = 'retailer_web_version'
    );

  GET DIAGNOSTICS v_promoted_evidence = ROW_COUNT;

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at
  )
  SELECT
    evidence.linked_formula_id,
    NULL,
    COALESCE(NULLIF(evidence.package_size, ''), 'unknown'),
    evidence.source_slug || '-retailer-web',
    evidence.source_external_id,
    evidence.source_url,
    true,
    COALESCE(evidence.fetched_at, now()),
    COALESCE(evidence.fetched_at, now())
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promoted'
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = true,
    last_observed_at = GREATEST(
      public.catalog_skus.last_observed_at,
      EXCLUDED.last_observed_at
    );

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
    evidence.linked_formula_id,
    evidence.linked_observation_id,
    'ingredient_text',
    to_jsonb(evidence.ingredient_text),
    evidence.source_url,
    'retailer_verified',
    false,
    COALESCE(evidence.fetched_at, now()),
    evidence.ingredient_hash
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promoted'
  ON CONFLICT (formula_id, field_name, source_url, content_hash)
  DO UPDATE SET
    accepted = false,
    observed_at = GREATEST(
      public.catalog_field_evidence.observed_at,
      EXCLUDED.observed_at
    );

  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence
  WHERE import_run_id = p_import_run_id
    AND evidence_status = 'promotable_exact_package';

  UPDATE public.catalog_import_runs
  SET
    updated_at = now(),
    imported_rows = (
      SELECT count(*)
      FROM public.catalog_retailer_ingredient_evidence
      WHERE import_run_id = p_import_run_id
        AND evidence_status = 'promoted'
    ),
    verified_ready_rows = (
      SELECT count(DISTINCT promoted_cache_key)
      FROM public.catalog_retailer_ingredient_evidence
      WHERE import_run_id = p_import_run_id
        AND evidence_status = 'promoted'
    ),
    report = COALESCE(report, '{}'::JSONB) || jsonb_build_object(
      'remaining_promotion', v_remaining
    )
  WHERE id = p_import_run_id;

  RETURN QUERY SELECT v_promoted_evidence, v_promoted_serving, v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.link_retailer_ingredient_evidence(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_retailer_ingredient_evidence(UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
