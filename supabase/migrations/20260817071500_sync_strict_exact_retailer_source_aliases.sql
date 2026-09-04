-- Repair the durable exact-PDP alias backlog created by the earlier
-- uppercase-before-lowercase brand comparison. This lane never creates a
-- formula or changes ingredients/images: it exposes an already-promoted exact
-- retailer package only when the serving row is byte-for-byte tied to the same
-- source URL, image URL, normalized full ingredients, and protected identity.

CREATE OR REPLACE FUNCTION public.catalog_canonical_retailer_brand_boundary(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT CASE public.catalog_normalize_retailer_boundary(p_value)
    WHEN 'bluebuffalobasics' THEN 'bluebuffalo'
    WHEN 'bluebuffalolifeprotection' THEN 'bluebuffalo'
    WHEN 'bluebuffalonaturalveterinarydiet' THEN 'bluebuffalo'
    WHEN 'bluebuffalowilderness' THEN 'bluebuffalo'
    WHEN 'dogchow' THEN 'purinadogchow'
    WHEN 'nutrish' THEN 'nutrish'
    WHEN 'proplanveterinarydiet' THEN 'purinaproplanveterinarydiets'
    WHEN 'proplanveterinarydiets' THEN 'purinaproplanveterinarydiets'
    WHEN 'purinaproplanveterinarydiet' THEN 'purinaproplanveterinarydiets'
    WHEN 'rachaelraynutrish' THEN 'nutrish'
    WHEN 'royalcaninveterinarydiet' THEN 'royalcanin'
    WHEN 'stellachewys' THEN 'stellaandchewys'
    WHEN 'weruvawxphosfocused' THEN 'weruva'
    ELSE public.catalog_normalize_retailer_boundary(p_value)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.catalog_retailer_formula_hard_boundaries_match(
  p_evidence_brand TEXT,
  p_evidence_pet_type TEXT,
  p_evidence_life_stage TEXT,
  p_evidence_food_form TEXT,
  p_evidence_flavor TEXT,
  p_evidence_diet_condition TEXT,
  p_formula_brand TEXT,
  p_formula_pet_type TEXT,
  p_formula_life_stage TEXT,
  p_formula_food_form TEXT,
  p_formula_flavor TEXT,
  p_formula_diet_condition TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  WITH normalized AS (
    SELECT
      public.catalog_canonical_retailer_brand_boundary(p_evidence_brand) eb,
      public.catalog_canonical_retailer_brand_boundary(p_formula_brand) fb,
      public.catalog_normalize_retailer_boundary(p_evidence_pet_type) ep,
      public.catalog_normalize_retailer_boundary(p_formula_pet_type) fp,
      public.catalog_normalize_retailer_boundary(p_evidence_life_stage) es,
      public.catalog_normalize_retailer_boundary(p_formula_life_stage) fs,
      public.catalog_normalize_retailer_boundary(p_evidence_food_form) ef,
      public.catalog_normalize_retailer_boundary(p_formula_food_form) ff,
      public.catalog_normalize_retailer_boundary(p_evidence_flavor) ev,
      public.catalog_normalize_retailer_boundary(p_formula_flavor) fv,
      public.catalog_normalize_retailer_boundary(p_evidence_diet_condition) ed,
      public.catalog_normalize_retailer_boundary(p_formula_diet_condition) fd
  )
  SELECT
    ep IN ('dog', 'cat')
    AND ep = fp
    AND eb <> ''
    AND fb <> ''
    AND eb = fb
    AND (
      ef IN ('', 'unknown', 'other')
      OR ff IN ('', 'unknown', 'other')
      OR ef = ff
    )
    AND (
      es IN ('', 'unknown', 'other')
      OR fs IN ('', 'unknown', 'other')
      OR es = fs
      OR (es = 'adult' AND fs IN ('adultmature', 'adultmaturesenior'))
      OR (es = 'senior' AND fs IN ('adultmature', 'adultmaturesenior'))
    )
    AND (ev = '' OR fv = '' OR ev = fv)
    AND (ed = '' OR fd = '' OR ed = fd)
  FROM normalized;
$function$;

CREATE OR REPLACE FUNCTION public.sync_strict_exact_retailer_source_aliases(
  p_limit INTEGER DEFAULT 250
)
RETURNS TABLE(selected_rows INTEGER, upserted_rows INTEGER, remaining_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_upserted INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 1000';
  END IF;

  SELECT COALESCE(array_agg(eligible.id ORDER BY eligible.id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT evidence.id
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.product_data product
      ON product.cache_key = evidence.promoted_cache_key
    WHERE evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.image_validation_status = 'exact_retailer_sku'
      AND evidence.source_url ~ '^https://'
      AND evidence.source_url = product.source_url
      AND evidence.front_image_url = product.image_url
      AND product.pet_type IN ('dog', 'cat')
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
      AND product.ingredient_count >= 5
      AND product.source_quality IN (
        'manufacturer', 'official', 'retailer_verified', 'gdsn'
      )
      AND product.ingredient_verification_status IN (
        'manufacturer', 'official', 'retailer_verified', 'gdsn',
        'label_ocr_verified'
      )
      AND product.image_verification_status IN (
        'manufacturer', 'official', 'retailer_verified'
      )
      AND (product.expires_at IS NULL OR product.expires_at > now())
      AND public.catalog_normalize_ingredient_evidence(product.ingredient_text)
        = public.catalog_normalize_ingredient_evidence(COALESCE(
          NULLIF(evidence.serving_ingredient_text, ''),
          evidence.ingredient_text
        ))
      AND public.catalog_retailer_formula_hard_boundaries_match(
        evidence.retailer_brand,
        evidence.pet_type,
        evidence.life_stage,
        evidence.food_form,
        evidence.flavor,
        evidence.diet_condition,
        product.brand,
        product.pet_type,
        product.life_stage,
        product.food_form,
        product.flavor,
        product.nutritional_info->>'diet_condition'
      )
      AND public.catalog_acquisition_identity_match(
        evidence.formula_title,
        evidence.pet_type,
        concat_ws(' ', product.brand, product.product_line,
          product.product_name, product.flavor, product.life_stage,
          product.food_form, product.nutritional_info->>'diet_condition'),
        product.pet_type
      )
      AND public.catalog_acquisition_protected_line_terms_match(
        evidence.formula_title,
        concat_ws(' ', product.brand, product.product_line,
          product.product_name, product.flavor, product.life_stage,
          product.food_form, product.nutritional_info->>'diet_condition')
      )
      AND public.catalog_acquisition_life_stage_terms_match(
        evidence.formula_title,
        concat_ws(' ', product.brand, product.product_line,
          product.product_name, product.flavor, product.life_stage,
          product.food_form)
      )
      AND public.catalog_acquisition_food_form_terms_match(
        evidence.formula_title,
        concat_ws(' ', product.brand, product.product_line,
          product.product_name, product.flavor, product.life_stage,
          product.food_form)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.catalog_verified_product_source_aliases existing
        WHERE existing.source_url = evidence.source_url
          AND existing.active
      )
    ORDER BY evidence.id
    LIMIT p_limit
    FOR UPDATE OF evidence SKIP LOCKED
  ) eligible;

  WITH upserted AS (
    INSERT INTO public.catalog_verified_product_source_aliases (
      source_url, cache_key, alias_text, source_authority,
      evidence_observed_at, provenance, active, updated_at
    )
    SELECT
      evidence.source_url,
      evidence.promoted_cache_key,
      evidence.formula_title,
      'retailer_verified',
      GREATEST(
        COALESCE(evidence.fetched_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(product.verified_at, '-infinity'::TIMESTAMPTZ),
        COALESCE(evidence.updated_at, '-infinity'::TIMESTAMPTZ)
      ),
      jsonb_build_object(
        'source', 'strict_exact_promoted_retailer_pdp_v2',
        'evidence_id', evidence.id,
        'source_slug', evidence.source_slug,
        'formula_id', evidence.linked_formula_id,
        'ingredient_hash', evidence.ingredient_hash,
        'image_content_hash', evidence.image_content_hash,
        'same_source_url', true,
        'same_image_url', true,
        'same_normalized_full_ingredients', true,
        'protected_identity_gates', true,
        'package_size_is_sku_only', true
      ),
      true,
      now()
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.product_data product
      ON product.cache_key = evidence.promoted_cache_key
    WHERE evidence.id = ANY(v_ids)
    ON CONFLICT (source_url) DO UPDATE SET
      cache_key = EXCLUDED.cache_key,
      alias_text = EXCLUDED.alias_text,
      source_authority = EXCLUDED.source_authority,
      evidence_observed_at = EXCLUDED.evidence_observed_at,
      provenance = EXCLUDED.provenance,
      active = true,
      updated_at = now()
    WHERE NOT public.catalog_verified_product_source_aliases.active
       OR public.catalog_verified_product_source_aliases.cache_key
          = EXCLUDED.cache_key
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_upserted FROM upserted;

  SELECT count(*)::INTEGER INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence evidence
  JOIN public.product_data product
    ON product.cache_key = evidence.promoted_cache_key
  WHERE evidence.is_current
    AND evidence.evidence_status = 'promoted'
    AND evidence.image_validation_status = 'exact_retailer_sku'
    AND evidence.source_url = product.source_url
    AND evidence.front_image_url = product.image_url
    AND product.expires_at > now()
    AND product.catalog_exclusion_reason IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_verified_product_source_aliases existing
      WHERE existing.source_url = evidence.source_url AND existing.active
    );

  RETURN QUERY SELECT cardinality(v_ids), v_upserted, v_remaining;
END;
$function$;

DO $migration$
BEGIN
  IF public.catalog_canonical_retailer_brand_boundary(
      'Royal Canin Veterinary Diet'
    ) <> 'royalcanin'
    OR public.catalog_canonical_retailer_brand_boundary(
      'Blue Buffalo Wilderness'
    ) <> 'bluebuffalo'
    OR public.catalog_canonical_retailer_brand_boundary('Cat Person')
      = public.catalog_canonical_retailer_brand_boundary('Weruva')
  THEN
    RAISE EXCEPTION 'canonical retailer brand boundary contract failed';
  END IF;
END;
$migration$;

REVOKE ALL ON FUNCTION public.catalog_canonical_retailer_brand_boundary(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_retailer_formula_hard_boundaries_match(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_strict_exact_retailer_source_aliases(INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_canonical_retailer_brand_boundary(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_retailer_formula_hard_boundaries_match(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_strict_exact_retailer_source_aliases(INTEGER)
  TO service_role;
