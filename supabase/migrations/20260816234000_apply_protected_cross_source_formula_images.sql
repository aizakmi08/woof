-- Accept formula-level catalog photos from independently enumerated official
-- and retailer panels only after the client artifact passes protected identity
-- boundaries and bounded score/recall/margin gates. Ingredient provenance
-- remains the exact Walmart item page; the image is identity evidence only.

CREATE OR REPLACE FUNCTION public.apply_cross_source_formula_images(
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
    RAISE EXCEPTION 'Cross-source image payload must be a JSON array';
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
      image_source_slug TEXT,
      image_source_authority TEXT,
      identity_boundary_version TEXT,
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
      AND evidence_method = 'exact_cross_source_protected_identity_v2'
      AND identity_boundary_version = 'protected-boundaries-v2'
      AND front_image_url ~ '^https://'
      AND image_source_url ~ '^https://'
      AND NULLIF(btrim(image_title), '') IS NOT NULL
      AND NULLIF(btrim(image_source_slug), '') IS NOT NULL
      AND image_source_authority IN (
        'manufacturer', 'retailer_verified', 'gap_discovery'
      )
      AND image_content_hash ~ '^[0-9a-f]{64}$'
      AND COALESCE((identity_resolution->>'score')::NUMERIC, 0)
        BETWEEN 0.82 AND 1
      AND COALESCE((identity_resolution->>'recall')::NUMERIC, 0)
        BETWEEN 0.80 AND 1
      AND COALESCE((identity_resolution->>'margin')::NUMERIC, 0)
        BETWEEN 0.25 AND 1
      AND NULLIF(identity_resolution->>'matched_source_product_id', '')
        IS NOT NULL
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
        'identity_boundary_version', valid.identity_boundary_version,
        'cross_source_image_source_slug', valid.image_source_slug,
        'cross_source_image_source_authority', valid.image_source_authority,
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

DO $migration$
DECLARE
  v_definition TEXT;
  v_patched TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.materialize_cross_retailer_web_formulas(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_patched := replace(
    v_definition,
    $$= 'exact_cross_retailer_formula_identity'$$,
    $$IN ('exact_cross_retailer_formula_identity',
          'exact_cross_source_protected_identity_v2')$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'cross-source materialization evidence marker not found';
  END IF;

  v_definition := v_patched;
  v_patched := replace(
    v_definition,
    $$    ON CONFLICT (formula_key) DO UPDATE SET
      last_observed_at = GREATEST(
        public.catalog_formulas.last_observed_at, EXCLUDED.last_observed_at
      ),
      updated_at = now()
    RETURNING id$$,
    $$    ON CONFLICT (formula_key) DO UPDATE SET
      last_observed_at = GREATEST(
        public.catalog_formulas.last_observed_at, EXCLUDED.last_observed_at
      ),
      front_image_url = EXCLUDED.front_image_url,
      source_url = EXCLUDED.source_url,
      source_authority = EXCLUDED.source_authority,
      ingredient_verification_status = 'retailer_verified',
      image_verification_status = 'retailer_verified',
      verification_status = 'verified',
      active = true,
      formula_evidence_tier = 'retailer_web_version',
      formula_version_provenance = EXCLUDED.formula_version_provenance,
      updated_at = now()
    RETURNING id$$
  );
  IF v_patched = v_definition THEN
    RAISE EXCEPTION 'cross-source formula reactivation marker not found';
  END IF;

  EXECUTE v_patched;
END;
$migration$;

REVOKE ALL ON FUNCTION public.apply_cross_source_formula_images(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cross_source_formula_images(UUID, JSONB)
  TO service_role;
