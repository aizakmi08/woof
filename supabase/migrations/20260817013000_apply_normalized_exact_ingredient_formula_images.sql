-- Recover source-versioned retailer packages whose complete ingredient text
-- differs from a verified formula only by case, punctuation, accents, or
-- trademark marks. Identity, source URL, image, species, and protected
-- formula boundaries remain mandatory and are independently rechecked.

CREATE OR REPLACE FUNCTION public.catalog_normalize_exact_ingredient_identity(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, extensions
AS $function$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        lower(extensions.unaccent(COALESCE(p_value, ''))),
        '\\((r|tm|c)\\)|®|™|©', '', 'gi'
      ),
      '[^a-z0-9[:space:]]', ' ', 'g'
    ),
    '[[:space:]]+', ' ', 'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.apply_normalized_exact_ingredient_formula_images(
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
    RAISE EXCEPTION 'Normalized ingredient image payload must be a JSON array';
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
      retailer_ingredient_normalized_hash TEXT,
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
      matched_source_cache_key TEXT,
      matched_source_ingredient_normalized_hash TEXT,
      identity_resolution JSONB
    )
  ), valid AS (
    SELECT parsed.*
    FROM parsed
    JOIN public.product_data source_formula
      ON source_formula.cache_key = parsed.matched_source_cache_key
     AND encode(digest(
       public.catalog_normalize_exact_ingredient_identity(
         source_formula.ingredient_text
       ),
       'sha256'
     ), 'hex') = parsed.matched_source_ingredient_normalized_hash
     AND source_formula.image_url = parsed.front_image_url
     AND source_formula.source_url = parsed.image_source_url
     AND source_formula.pet_type = parsed.pet_type
    WHERE parsed.source_slug = 'walmart'
      AND parsed.source_external_id ~ '^[0-9]{5,20}$'
      AND parsed.source_url ~ (
        '^https://www[.]walmart[.]com/ip/.+/' || parsed.source_external_id || '$'
      )
      AND parsed.content_hash ~ '^[0-9a-f]{64}$'
      AND parsed.ingredient_hash ~ '^[0-9a-f]{64}$'
      AND parsed.retailer_ingredient_normalized_hash ~ '^[0-9a-f]{64}$'
      AND parsed.matched_source_ingredient_normalized_hash
        = parsed.retailer_ingredient_normalized_hash
      AND parsed.pet_type IN ('dog', 'cat')
      AND NULLIF(btrim(parsed.retailer_brand), '') IS NOT NULL
      AND NULLIF(btrim(parsed.formula_title), '') IS NOT NULL
      AND parsed.formula_identity_hash ~ '^[0-9a-f]{64}$'
      AND parsed.image_validation_status = 'exact_catalog_formula'
      AND parsed.evidence_method = 'exact_cross_source_ingredient_identity_v2'
      AND parsed.identity_boundary_version = 'protected-boundaries-v3'
      AND parsed.front_image_url ~ '^https://'
      AND parsed.image_source_url ~ '^https://'
      AND NULLIF(btrim(parsed.image_title), '') IS NOT NULL
      AND parsed.image_content_hash ~ '^[0-9a-f]{64}$'
      AND parsed.identity_resolution->>'deterministic_evidence'
        = 'exact_normalized_full_ingredient_text_brand_species_and_protected_identity'
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
        'matched_source_cache_key', valid.matched_source_cache_key,
        'matched_source_ingredient_normalized_hash',
          valid.matched_source_ingredient_normalized_hash,
        'cross_source_image_source_slug', valid.image_source_slug,
        'cross_source_image_source_authority', valid.image_source_authority,
        'cross_retailer_image_source_url', valid.image_source_url,
        'cross_retailer_image_observed_at',
          COALESCE(valid.image_observed_at, now()),
        'cross_retailer_identity_resolution', valid.identity_resolution,
        'image_identity_scope',
          'normalized exact ingredient formula; package size remains an SKU child',
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
      AND encode(digest(
        public.catalog_normalize_exact_ingredient_identity(evidence.ingredient_text),
        'sha256'
      ), 'hex') = valid.retailer_ingredient_normalized_hash
      AND evidence.evidence_status IN (
        'linked_missing_exact_image', 'unmatched_catalog_sku'
      )
      AND public.catalog_retailer_ingredient_is_serving_safe(
        evidence.ingredient_text
      )
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
    $$'exact_cross_source_ingredient_identity_v1')$$,
    $$'exact_cross_source_ingredient_identity_v1',
          'exact_cross_source_ingredient_identity_v2')$$
  );
  IF v_patched = v_definition
    OR position('exact_cross_source_ingredient_identity_v2' IN v_patched) = 0
  THEN
    RAISE EXCEPTION 'normalized ingredient materialization marker not found';
  END IF;
  EXECUTE v_patched;
END;
$migration$;

REVOKE ALL ON FUNCTION public.catalog_normalize_exact_ingredient_identity(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_normalize_exact_ingredient_identity(TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_normalized_exact_ingredient_formula_images(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_normalized_exact_ingredient_formula_images(UUID, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.materialize_cross_retailer_web_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_cross_retailer_web_formulas(UUID, INTEGER)
  TO service_role;
