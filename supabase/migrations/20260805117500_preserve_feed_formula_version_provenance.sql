-- The generic feed RPC historically accepted nutritional_info but not the
-- dedicated formula-version columns. Exact source-versioned retailer/package
-- evidence therefore reached the product trigger with its rich provenance
-- nested under nutritional_info and was reduced to generic retailer evidence.
-- Read that explicit nested contract before deriving the tier. This keeps the
-- existing RPC interface compatible while preserving package/version safety.

CREATE OR REPLACE FUNCTION public.catalog_sync_product_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tier TEXT;
  v_requested_tier TEXT;
  v_provenance JSONB;
  v_requested_provenance JSONB;
BEGIN
  v_requested_tier := COALESCE(
    NULLIF(btrim(NEW.nutritional_info->>'formula_evidence_tier'), ''),
    NULLIF(btrim(NEW.formula_evidence_tier), ''),
    'unverified'
  );
  v_requested_provenance :=
    COALESCE(NEW.formula_version_provenance, '{}'::JSONB)
    || CASE
      WHEN jsonb_typeof(
        NEW.nutritional_info->'formula_version_provenance'
      ) = 'object'
      THEN NEW.nutritional_info->'formula_version_provenance'
      ELSE '{}'::JSONB
    END;

  v_tier := CASE
    WHEN NEW.formula_evidence_tier = 'conflicted'
      THEN 'conflicted'
    -- An exact source-version request is accepted only with the full no-guess
    -- contract. A feed cannot self-promote arbitrary manufacturer-current
    -- evidence; all other tiers continue to be derived from evidence fields.
    WHEN v_requested_tier IN (
        'retailer_web_version', 'web_label_version'
      )
      AND NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality IN (
        'manufacturer', 'official', 'gdsn', 'retailer_verified'
      )
      AND NEW.ingredient_verification_status IN (
        'manufacturer', 'official', 'gdsn', 'retailer_verified',
        'label_ocr_verified'
      )
      AND NEW.image_verification_status IN (
        'manufacturer', 'official', 'retailer_verified'
      )
      AND NULLIF(btrim(COALESCE(NEW.ingredient_text, '')), '') IS NOT NULL
      AND NULLIF(btrim(COALESCE(NEW.image_url, '')), '') IS NOT NULL
      AND v_requested_provenance->>'manufacturer_current_equivalence' =
          'false'
      AND NULLIF(
        btrim(v_requested_provenance->>'version_status'),
        ''
      ) IS NOT NULL
      AND v_requested_provenance->>'gtin_resolution_policy' =
          'abstain_on_version_conflict'
      AND NULLIF(
        btrim(v_requested_provenance->>'package_identifier'),
        ''
      ) IS NOT NULL
      AND NULLIF(
        btrim(v_requested_provenance->>'ingredient_text_hash'),
        ''
      ) IS NOT NULL
      AND NULLIF(
        btrim(v_requested_provenance->>'front_image_url'),
        ''
      ) IS NOT NULL
      THEN v_requested_tier
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality IN ('manufacturer', 'official', 'gdsn')
      AND NEW.ingredient_verification_status IN (
        'manufacturer', 'official', 'gdsn'
      )
      AND NEW.image_verification_status IN ('manufacturer', 'official')
      THEN 'manufacturer_current_exact'
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality = 'retailer_verified'
      AND NEW.ingredient_verification_status = 'retailer_verified'
      AND NEW.image_verification_status = 'retailer_verified'
      THEN 'retailer_web_version'
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.ingredient_verification_status = 'label_ocr_verified'
      AND NEW.image_verification_status IN (
        'manufacturer', 'official', 'retailer_verified'
      )
      THEN 'web_label_version'
    ELSE 'unverified'
  END;

  v_provenance :=
    v_requested_provenance
    || jsonb_strip_nulls(jsonb_build_object(
      'source_url', NULLIF(trim(NEW.source_url), ''),
      'source', NEW.source,
      'captured_at', COALESCE(NEW.verified_at, NEW.scraped_at),
      'package_gtin', NULLIF(trim(NEW.gtin), ''),
      'package_size', NULLIF(trim(NEW.package_size), ''),
      'ingredient_text_hash', CASE
        WHEN COALESCE(NULLIF(trim(NEW.ingredient_text), ''), '') = ''
          THEN NULL
        ELSE encode(extensions.digest(
          public.catalog_normalize_ingredient_evidence(NEW.ingredient_text),
          'sha256'
        ), 'hex')
      END
    ));

  NEW.formula_evidence_tier := v_tier;
  NEW.formula_version_provenance := v_provenance;
  NEW.nutritional_info :=
    COALESCE(NEW.nutritional_info, '{}'::JSONB)
    || jsonb_build_object(
      'formula_evidence_tier', v_tier,
      'formula_version_provenance', v_provenance
    );
  RETURN NEW;
END;
$function$;
