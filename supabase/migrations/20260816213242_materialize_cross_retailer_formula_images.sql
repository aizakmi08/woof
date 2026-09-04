-- Materialize exact Walmart ingredient-page versions when an independently
-- enumerated Chewy package image resolves to the same formula under the strict
-- catalog identity contract. The two retailer sources retain separate URLs,
-- timestamps, hashes, and roles; this does not assert manufacturer-current
-- ingredient equivalence and never overwrites a different formula version.

CREATE OR REPLACE FUNCTION public.apply_cross_retailer_formula_images(
  p_import_run_id UUID,
  p_payload JSONB
)
RETURNS TABLE(updated_rows INTEGER, rejected_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_input INTEGER := 0;
  v_updated INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id
  ) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;
  IF jsonb_typeof(COALESCE(p_payload, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Cross-retailer image payload must be a JSON array';
  END IF;
  SELECT jsonb_array_length(COALESCE(p_payload, '[]'::JSONB)) INTO v_input;

  WITH parsed AS (
    SELECT row.*
    FROM jsonb_to_recordset(COALESCE(p_payload, '[]'::JSONB)) AS row(
      source_slug TEXT,
      source_external_id TEXT,
      source_url TEXT,
      content_hash TEXT,
      ingredient_hash TEXT,
      product_name TEXT,
      pet_type TEXT,
      retailer_brand TEXT,
      retailer_gtin TEXT,
      formula_title TEXT,
      life_stage TEXT,
      food_form TEXT,
      flavor TEXT,
      diet_condition TEXT,
      formula_identity_hash TEXT,
      front_image_url TEXT,
      image_title TEXT,
      image_source_url TEXT,
      image_observed_at TIMESTAMPTZ,
      image_content_hash TEXT,
      image_validation_status TEXT,
      evidence_method TEXT,
      identity_resolution JSONB
    )
  ), valid AS (
    SELECT parsed.*
    FROM parsed
    WHERE source_slug = 'walmart'
      AND source_external_id ~ '^[0-9]{5,20}$'
      AND source_url ~ ('^https://www[.]walmart[.]com/ip/.+/' || source_external_id || '$')
      AND content_hash ~ '^[0-9a-f]{64}$'
      AND ingredient_hash ~ '^[0-9a-f]{64}$'
      AND pet_type IN ('dog', 'cat')
      AND NULLIF(btrim(retailer_brand), '') IS NOT NULL
      AND NULLIF(btrim(formula_title), '') IS NOT NULL
      AND formula_identity_hash ~ '^[0-9a-f]{64}$'
      AND image_validation_status = 'exact_catalog_formula'
      AND evidence_method = 'exact_cross_retailer_formula_identity'
      AND front_image_url ~ '^https://image[.]chewy[.]com/'
      AND image_source_url ~ '^https://www[.]chewy[.]com/.+/dp/[0-9]+$'
      AND image_content_hash ~ '^[0-9a-f]{64}$'
      AND COALESCE((identity_resolution->>'score')::NUMERIC, 0) >= 0.88
      AND COALESCE((identity_resolution->>'recall')::NUMERIC, 0) >= 0.84
      AND COALESCE((identity_resolution->>'margin')::NUMERIC, 0) >= 0.12
      AND NULLIF(identity_resolution->>'matched_chewy_product_id', '') IS NOT NULL
  ), changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      retailer_brand = btrim(valid.retailer_brand),
      retailer_gtin = NULLIF(btrim(valid.retailer_gtin), ''),
      formula_title = btrim(valid.formula_title),
      life_stage = COALESCE(NULLIF(btrim(valid.life_stage), ''), 'unknown'),
      food_form = COALESCE(NULLIF(btrim(valid.food_form), ''), 'unknown'),
      flavor = COALESCE(btrim(valid.flavor), ''),
      diet_condition = COALESCE(btrim(valid.diet_condition), ''),
      formula_identity_hash = valid.formula_identity_hash,
      front_image_url = valid.front_image_url,
      image_title = valid.image_title,
      image_source_url = valid.image_source_url,
      image_observed_at = COALESCE(valid.image_observed_at, now()),
      image_content_hash = valid.image_content_hash,
      image_validation_status = 'exact_catalog_formula',
      linked_formula_id = NULL,
      linked_observation_id = NULL,
      promoted_cache_key = NULL,
      evidence_status = 'unmatched_catalog_sku',
      validation_reasons = array_remove(
        array_remove(evidence.validation_reasons, 'no_unique_exact_catalog_sku_identity'),
        'exact_formula_missing_front_image'
      ),
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'package_evidence_method', valid.evidence_method,
        'cross_retailer_image_source_url', valid.image_source_url,
        'cross_retailer_image_observed_at', COALESCE(valid.image_observed_at, now()),
        'cross_retailer_identity_resolution', valid.identity_resolution,
        'image_identity_scope', 'exact formula; package size remains an SKU child',
        'manufacturer_current_equivalence', false
      ),
      updated_at = now()
    FROM valid
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.source_slug = valid.source_slug
      AND evidence.source_external_id = valid.source_external_id
      AND evidence.source_url = valid.source_url
      AND evidence.content_hash = valid.content_hash
      AND evidence.ingredient_hash = valid.ingredient_hash
      AND evidence.pet_type = valid.pet_type
      AND evidence.evidence_status IN (
        'linked_missing_exact_image', 'unmatched_catalog_sku'
      )
      AND public.catalog_retailer_ingredient_is_serving_safe(evidence.ingredient_text)
    RETURNING evidence.id
  )
  SELECT count(*) INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated, GREATEST(v_input - v_updated, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_cross_retailer_web_formulas(
  p_import_run_id UUID,
  p_limit INTEGER DEFAULT 5000
)
RETURNS TABLE(
  selected_rows INTEGER,
  created_formula_rows INTEGER,
  promotable_rows INTEGER,
  remaining_rows INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_run_id BIGINT;
  v_selected INTEGER := 0;
  v_created INTEGER := 0;
  v_promotable INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id
  ) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status,
    started_at, finished_at, expected_count, observed_count,
    accepted_count, rejected_count, pagination_complete,
    source_content_hash, metadata
  ) VALUES (
    'cross-retailer-formula-image:' || p_import_run_id::TEXT,
    'walmart-ingredients+chewy-formula-images',
    'retailer', 'verification', 'completed', now(), now(),
    0, 0, 0, 0, true, p_import_run_id::TEXT,
    jsonb_build_object(
      'ingredient_source', 'exact Walmart item page',
      'image_source', 'exact Chewy formula page',
      'identity_policy', 'strict brand/species/form/life-stage/recipe/texture with score, recall, and margin gates',
      'formula_version_policy', 'dated retailer web version; no manufacturer-current equivalence asserted'
    )
  )
  ON CONFLICT (run_key) DO UPDATE SET
    finished_at = now(), pagination_complete = true, updated_at = now()
  RETURNING id INTO v_run_id;

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT evidence.id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.image_validation_status = 'exact_catalog_formula'
      AND evidence.raw_payload->>'package_evidence_method'
        = 'exact_cross_retailer_formula_identity'
      AND evidence.formula_identity_hash ~ '^[0-9a-f]{64}$'
      AND public.catalog_retailer_ingredient_is_serving_safe(evidence.ingredient_text)
    ORDER BY evidence.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) selected;

  v_selected := cardinality(v_ids);
  IF v_selected = 0 THEN
    SELECT count(*) INTO v_remaining
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.image_validation_status = 'exact_catalog_formula'
      AND evidence.raw_payload->>'package_evidence_method'
        = 'exact_cross_retailer_formula_identity';
    RETURN QUERY SELECT 0, 0, 0, v_remaining;
    RETURN;
  END IF;

  WITH representatives AS (
    SELECT DISTINCT ON (evidence.formula_identity_hash) evidence.*
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.id = ANY(v_ids)
    ORDER BY evidence.formula_identity_hash,
      evidence.fetched_at DESC NULLS LAST, evidence.id DESC
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
      'retailer-web:' || source_slug || ':' || formula_identity_hash,
      retailer_brand, retailer_brand, formula_title, formula_title,
      pet_type, life_stage, food_form, flavor, diet_condition,
      true,
      'Exact Walmart item page supplies the full ingredient version; a separate exact-formula Chewy page supplies the catalog photo under strict identity gates.',
      ingredient_text,
      public.catalog_split_ingredient_statement(ingredient_text),
      front_image_url, source_url, 'retailer_verified',
      'retailer_verified', 'retailer_verified',
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
      'verified', true,
      EXISTS (
        SELECT 1
        FROM public.catalog_major_brands major
        JOIN public.catalog_major_brand_registry_snapshots snapshot
          ON snapshot.id = major.snapshot_id
        WHERE major.inclusion_status = 'major'
          AND major.brand_key = public.catalog_normalize_retailer_title(retailer_brand)
          AND snapshot.id = (
            SELECT max(latest.id)
            FROM public.catalog_major_brand_registry_snapshots latest
          )
      ),
      COALESCE(fetched_at, now()), COALESCE(fetched_at, now()),
      formula_identity_hash, 'retailer_web_version',
      jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'dated_retailer_web_version',
        'identity_policy', 'exact Walmart item ingredients plus independently matched exact Chewy formula image',
        'retailer_sku', source_external_id,
        'source_url', source_url,
        'image_source_url', image_source_url,
        'captured_at', fetched_at,
        'cross_retailer_identity_resolution', raw_payload->'cross_retailer_identity_resolution'
      ), now()
    FROM representatives
    ON CONFLICT (formula_key) DO UPDATE SET
      last_observed_at = GREATEST(
        public.catalog_formulas.last_observed_at, EXCLUDED.last_observed_at
      ),
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM inserted;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET linked_formula_id = formula.id, updated_at = now()
  FROM public.catalog_formulas formula
  WHERE evidence.id = ANY(v_ids)
    AND formula.formula_key =
      'retailer-web:' || evidence.source_slug || ':' || evidence.formula_identity_hash;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, formula_evidence_tier, formula_version_provenance
  )
  SELECT
    v_run_id, evidence.linked_formula_id,
    'walmart-retailer-web-cross-image', evidence.source_external_id,
    evidence.source_url, 'retailer_verified', evidence.retailer_gtin,
    evidence.retailer_brand, evidence.retailer_brand,
    evidence.product_name, evidence.formula_title,
    evidence.pet_type, evidence.life_stage, evidence.food_form,
    evidence.flavor, evidence.diet_condition, evidence.package_size,
    evidence.ingredient_text, evidence.front_image_url, true, true,
    COALESCE(evidence.fetched_at, now()),
    evidence.content_hash || ':' || evidence.image_content_hash,
    'accepted', ARRAY[]::TEXT[],
    evidence.raw_payload || jsonb_build_object(
      'ingredient_hash', evidence.ingredient_hash,
      'image_content_hash', evidence.image_content_hash,
      'formula_identity_hash', evidence.formula_identity_hash
    ),
    'retailer_web_version',
    jsonb_build_object(
      'manufacturer_current_equivalence', false,
      'version_status', 'dated_retailer_web_version',
      'package_identifier', evidence.source_slug || ':' || evidence.source_external_id,
      'ingredient_text_hash', evidence.ingredient_hash,
      'image_content_hash', evidence.image_content_hash,
      'source_url', evidence.source_url,
      'image_source_url', evidence.image_source_url,
      'captured_at', evidence.fetched_at,
      'cross_retailer_identity_resolution',
        evidence.raw_payload->'cross_retailer_identity_resolution'
    )
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.linked_formula_id IS NOT NULL
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    front_image_url = EXCLUDED.front_image_url,
    validation_status = 'accepted',
    raw_payload = EXCLUDED.raw_payload,
    formula_version_provenance = EXCLUDED.formula_version_provenance;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    linked_observation_id = observation.id,
    evidence_status = 'promotable_exact_package',
    updated_at = now()
  FROM public.catalog_observations observation
  WHERE evidence.id = ANY(v_ids)
    AND observation.run_id = v_run_id
    AND observation.formula_id = evidence.linked_formula_id
    AND observation.source_slug = 'walmart-retailer-web-cross-image'
    AND observation.source_external_id = evidence.source_external_id
    AND observation.content_hash =
      evidence.content_hash || ':' || evidence.image_content_hash;

  SELECT count(*) INTO v_promotable
  FROM public.catalog_retailer_ingredient_evidence
  WHERE id = ANY(v_ids) AND evidence_status = 'promotable_exact_package';

  UPDATE public.catalog_source_runs
  SET expected_count = expected_count + v_selected,
      observed_count = observed_count + v_selected,
      accepted_count = accepted_count + v_promotable,
      rejected_count = rejected_count + (v_selected - v_promotable),
      finished_at = now(), updated_at = now()
  WHERE id = v_run_id;

  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.is_current
    AND evidence.evidence_status = 'unmatched_catalog_sku'
    AND evidence.image_validation_status = 'exact_catalog_formula'
    AND evidence.raw_payload->>'package_evidence_method'
      = 'exact_cross_retailer_formula_identity';

  RETURN QUERY SELECT v_selected, v_created, v_promotable, v_remaining;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_cross_retailer_formula_images(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_cross_retailer_web_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cross_retailer_formula_images(UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_cross_retailer_web_formulas(UUID, INTEGER)
  TO service_role;
