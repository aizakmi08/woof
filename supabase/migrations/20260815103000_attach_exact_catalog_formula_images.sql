-- A retailer package may reuse a verified canonical front image only when the
-- retailer row is already linked to that exact formula and its full ingredient
-- statement is identical. Record the distinct evidence tier explicitly; do
-- not mislabel the image as retailer-page evidence.

ALTER TABLE public.catalog_retailer_ingredient_evidence
  DROP CONSTRAINT IF EXISTS catalog_retailer_image_status_check,
  ADD CONSTRAINT catalog_retailer_image_status_check CHECK (
    image_validation_status IN (
      'missing',
      'unresolved',
      'exact_retailer_sku',
      'exact_catalog_formula'
    )
  );

CREATE OR REPLACE FUNCTION public.attach_exact_catalog_formula_images(
  p_import_run_id UUID,
  p_source_slug TEXT DEFAULT 'walmart'
)
RETURNS TABLE(updated_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF p_source_slug NOT IN ('chewy', 'walmart') THEN
    RAISE EXCEPTION 'Unsupported retailer source %', p_source_slug;
  END IF;

  WITH changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      front_image_url = formula.front_image_url,
      image_title = formula.product_name,
      image_source_url = formula.source_url,
      image_observed_at = formula.updated_at,
      image_content_hash = encode(extensions.digest(
        formula.id::TEXT || E'\n' || formula.front_image_url || E'\n' || formula.product_name,
        'sha256'
      ), 'hex'),
      image_validation_status = 'exact_catalog_formula',
      evidence_status = 'promotable_exact_package',
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'package_evidence_method', 'verified_exact_catalog_formula_image',
        'package_image_source_url', formula.source_url,
        'package_image_observed_at', formula.updated_at,
        'catalog_formula_id', formula.id,
        'identity_requirement', 'prelinked exact formula plus identical full ingredient statement'
      ),
      validation_reasons = array_remove(
        evidence.validation_reasons,
        'exact_formula_missing_front_image'
      ),
      updated_at = now()
    FROM public.catalog_formulas formula
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.source_slug = p_source_slug
      AND evidence.evidence_status = 'linked_missing_exact_image'
      AND formula.id = evidence.linked_formula_id
      AND formula.active
      AND formula.is_complete_food
      AND formula.pet_type = evidence.pet_type
      AND formula.image_verification_status IN ('manufacturer', 'retailer_verified')
      AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
      AND regexp_replace(lower(btrim(formula.ingredient_text)), '\s+', ' ', 'g')
        = regexp_replace(lower(btrim(evidence.ingredient_text)), '\s+', ' ', 'g')
    RETURNING evidence.linked_observation_id,evidence.front_image_url
  ), observation_update AS (
    UPDATE public.catalog_observations observation
    SET front_image_url = changed.front_image_url
    FROM changed
    WHERE observation.id = changed.linked_observation_id
    RETURNING observation.id
  )
  SELECT count(*) INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  TO service_role;
