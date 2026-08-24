-- A bounded promotion path for the audited hard-identity repair ledger. It
-- avoids the full-import alias refresh performed by the general importer, so
-- each repair batch commits well inside the database gateway deadline.

CREATE OR REPLACE FUNCTION public.promote_repaired_retailer_hard_identities(
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE(
  selected_rows INTEGER,
  promoted_rows INTEGER,
  remaining_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_selected INTEGER := 0;
  v_promoted INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 250 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 250';
  END IF;

  SELECT COALESCE(array_agg(selected.evidence_id ORDER BY selected.evidence_id),
    ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT repair.evidence_id
    FROM public.catalog_retailer_identity_repairs repair
    JOIN public.catalog_retailer_ingredient_evidence evidence
      ON evidence.id = repair.evidence_id
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
    WHERE repair.new_formula_id IS NULL
      AND evidence.is_current
      AND evidence.evidence_status = 'promotable_exact_package'
      AND evidence.image_validation_status = 'exact_retailer_sku'
      AND NULLIF(btrim(evidence.front_image_url), '') IS NOT NULL
      AND public.catalog_retailer_ingredient_is_serving_safe(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      )
      AND public.catalog_retailer_formula_hard_boundaries_match(
        evidence.retailer_brand,
        evidence.pet_type,
        evidence.life_stage,
        evidence.food_form,
        evidence.flavor,
        evidence.diet_condition,
        formula.brand,
        formula.pet_type,
        formula.life_stage,
        formula.food_form,
        formula.flavor,
        formula.diet_condition
      )
    ORDER BY repair.evidence_id
    LIMIT p_limit
    FOR UPDATE OF evidence SKIP LOCKED
  ) selected;

  v_selected := cardinality(v_ids);
  IF v_selected = 0 THEN
    SELECT count(*) INTO v_remaining
    FROM public.catalog_retailer_identity_repairs
    WHERE new_formula_id IS NULL;
    RETURN QUERY SELECT 0, 0, v_remaining;
    RETURN;
  END IF;

  WITH eligible AS (
    SELECT
      evidence.*,
      formula.identity_hash,
      formula.product_name AS canonical_product_name,
      formula.brand AS canonical_brand,
      formula.product_line AS canonical_product_line,
      formula.flavor AS canonical_flavor,
      formula.life_stage AS canonical_life_stage,
      formula.food_form AS canonical_food_form,
      formula.pet_type AS canonical_pet_type,
      COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
        AS normalized_ingredient_text,
      public.catalog_retailer_serving_ingredient_count(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      ) AS normalized_ingredient_count,
      'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
        left(evidence.ingredient_hash, 16) AS serving_cache_key
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
    WHERE evidence.id = ANY(v_ids)
  ), deduped AS (
    SELECT DISTINCT ON (serving_cache_key) *
    FROM eligible
    ORDER BY serving_cache_key, fetched_at DESC NULLS LAST, id DESC
  )
  INSERT INTO public.product_data (
    cache_key, product_name, brand, gtin, product_line, flavor, life_stage,
    food_form, package_size, pet_type, ingredients, ingredient_text,
    ingredient_count, nutritional_info, nutrient_panel,
    has_published_nutrients, source, source_quality,
    ingredient_verification_status, image_verification_status, verified_at,
    source_url, scraped_at, expires_at, image_url, is_complete_food,
    catalog_exclusion_reason, updated_at
  )
  SELECT
    serving_cache_key,
    canonical_product_name,
    canonical_brand,
    NULL,
    canonical_product_line,
    canonical_flavor,
    canonical_life_stage,
    canonical_food_form,
    NULL,
    canonical_pet_type,
    public.catalog_split_ingredient_statement(normalized_ingredient_text),
    normalized_ingredient_text,
    normalized_ingredient_count,
    jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'formula_version_provenance', jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'dated_retailer_web_version',
        'identity_repair_version', 'retailer_hard_identity_v1',
        'gtin_resolution_policy', 'abstain_on_version_conflict',
        'package_identifier', source_slug || ':' || source_external_id,
        'ingredient_text_hash', ingredient_hash,
        'raw_ingredient_text_preserved', true,
        'serving_ingredient_normalization_codes',
          to_jsonb(serving_ingredient_normalization_codes),
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
    COALESCE(fetched_at, now()),
    source_url,
    COALESCE(fetched_at, now()),
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

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'promoted',
    promoted_cache_key =
      'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
      left(evidence.ingredient_hash, 16),
    updated_at = now()
  FROM public.catalog_formulas formula
  WHERE evidence.id = ANY(v_ids)
    AND formula.id = evidence.linked_formula_id
    AND EXISTS (
      SELECT 1
      FROM public.product_data serving
      WHERE serving.cache_key =
        'retailer-web:' || evidence.source_slug || ':' || formula.identity_hash || ':' ||
        left(evidence.ingredient_hash, 16)
        AND serving.formula_evidence_tier = 'retailer_web_version'
        AND serving.expires_at > now()
        AND serving.catalog_exclusion_reason IS NULL
    );

  GET DIAGNOSTICS v_promoted = ROW_COUNT;

  -- Keep a published GTIN only when it does not conflict with another active
  -- canonical formula. The exact package identifier remains durable in the
  -- evidence/provenance when barcode resolution must abstain.
  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, source_slug, source_external_id,
    source_url, active, first_observed_at, last_observed_at
  )
  SELECT
    evidence.linked_formula_id,
    CASE WHEN evidence.retailer_gtin IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_skus existing
      WHERE existing.active
        AND existing.gtin = evidence.retailer_gtin
        AND existing.formula_id <> evidence.linked_formula_id
    ) THEN evidence.retailer_gtin ELSE NULL END,
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
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    evidence.linked_formula_id,
    evidence.linked_observation_id,
    'ingredient_text',
    to_jsonb(COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)),
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

  UPDATE public.catalog_formulas formula
  SET promoted_cache_key = evidence.promoted_cache_key, updated_at = now()
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND formula.id = evidence.linked_formula_id
    AND formula.formula_key =
      'retailer-web:' || evidence.source_slug || ':' || evidence.formula_identity_hash
    AND evidence.evidence_status = 'promoted';

  INSERT INTO public.catalog_verified_product_source_aliases (
    source_url, cache_key, alias_text, source_authority,
    evidence_observed_at, provenance, active, updated_at
  )
  SELECT
    evidence.source_url,
    evidence.promoted_cache_key,
    evidence.formula_title,
    'retailer_identity',
    COALESCE(evidence.fetched_at, now()),
    jsonb_build_object(
      'source', 'retailer_hard_identity_repair_v1',
      'evidence_id', evidence.id,
      'source_slug', evidence.source_slug,
      'formula_id', evidence.linked_formula_id,
      'ingredient_hash', evidence.ingredient_hash,
      'package_size_is_sku_only', true
    ),
    true,
    now()
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promoted'
  ON CONFLICT (source_url) DO UPDATE SET
    cache_key = EXCLUDED.cache_key,
    alias_text = EXCLUDED.alias_text,
    source_authority = EXCLUDED.source_authority,
    evidence_observed_at = EXCLUDED.evidence_observed_at,
    provenance = EXCLUDED.provenance,
    active = true,
    updated_at = now();

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key, alias_text, normalized_alias, source_url,
    source_authority, evidence_observed_at, provenance
  )
  SELECT DISTINCT ON (
    public.normalize_verified_product_search_query(evidence.formula_title)
  )
    evidence.promoted_cache_key,
    evidence.formula_title,
    public.normalize_verified_product_search_query(evidence.formula_title),
    evidence.source_url,
    'retailer_identity',
    COALESCE(evidence.fetched_at, now()),
    jsonb_build_object(
      'source', 'retailer_hard_identity_repair_v1',
      'evidence_id', evidence.id,
      'formula_id', evidence.linked_formula_id
    )
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promoted'
    AND NULLIF(public.normalize_verified_product_search_query(
      evidence.formula_title
    ), '') IS NOT NULL
  ORDER BY
    public.normalize_verified_product_search_query(evidence.formula_title),
    evidence.fetched_at DESC NULLS LAST,
    evidence.id DESC
  ON CONFLICT (normalized_alias) WHERE active DO NOTHING;

  UPDATE public.catalog_retailer_identity_repairs repair
  SET
    new_formula_id = evidence.linked_formula_id,
    new_observation_id = evidence.linked_observation_id,
    new_cache_key = evidence.promoted_cache_key,
    repaired_at = now()
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE repair.evidence_id = evidence.id
    AND evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'promoted'
    AND evidence.promoted_cache_key IS NOT NULL;

  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_identity_repairs
  WHERE new_formula_id IS NULL;

  RETURN QUERY SELECT v_selected, v_promoted, v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_repaired_retailer_hard_identities(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_repaired_retailer_hard_identities(INTEGER)
  TO service_role;
