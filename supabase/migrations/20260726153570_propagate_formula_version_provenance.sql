-- Keep source-version evidence durable through future catalog ingestion and
-- expose it through the existing nutritional_info payload returned by lookup
-- RPCs. Different ingredient versions remain separate serving rows/formulas.

CREATE OR REPLACE FUNCTION public.catalog_sync_product_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_tier TEXT;
  v_provenance JSONB;
BEGIN
  v_tier := CASE
    WHEN NEW.formula_evidence_tier = 'conflicted'
      THEN 'conflicted'
    WHEN NEW.is_complete_food
      AND NEW.catalog_exclusion_reason IS NULL
      AND NEW.source_quality IN ('manufacturer', 'official', 'gdsn')
      AND NEW.ingredient_verification_status IN (
        'manufacturer',
        'official',
        'gdsn'
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
        'manufacturer',
        'official',
        'retailer_verified'
      )
      THEN 'web_label_version'
    ELSE 'unverified'
  END;

  v_provenance :=
    COALESCE(NEW.formula_version_provenance, '{}'::JSONB) ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'source_url', NULLIF(trim(NEW.source_url), ''),
        'source', NEW.source,
        'captured_at', COALESCE(NEW.verified_at, NEW.scraped_at),
        'package_gtin', NULLIF(trim(NEW.gtin), ''),
        'package_size', NULLIF(trim(NEW.package_size), ''),
        'ingredient_text_hash',
          CASE
            WHEN COALESCE(NULLIF(trim(NEW.ingredient_text), ''), '') = ''
              THEN NULL
            ELSE encode(
              digest(
                public.catalog_normalize_ingredient_evidence(
                  NEW.ingredient_text
                ),
                'sha256'
              ),
              'hex'
            )
          END
      )
    );

  NEW.formula_evidence_tier := v_tier;
  NEW.formula_version_provenance := v_provenance;
  NEW.nutritional_info :=
    COALESCE(NEW.nutritional_info, '{}'::JSONB) ||
    jsonb_build_object(
      'formula_evidence_tier', v_tier,
      'formula_version_provenance', v_provenance
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  product_data_sync_formula_version_trigger
ON public.product_data;
CREATE TRIGGER product_data_sync_formula_version_trigger
BEFORE INSERT OR UPDATE OF
  source,
  source_quality,
  source_url,
  verified_at,
  scraped_at,
  gtin,
  package_size,
  ingredient_text,
  ingredient_verification_status,
  image_verification_status,
  is_complete_food,
  catalog_exclusion_reason,
  formula_evidence_tier,
  formula_version_provenance
ON public.product_data
FOR EACH ROW
EXECUTE FUNCTION public.catalog_sync_product_formula_version();

CREATE OR REPLACE FUNCTION public.catalog_sync_formula_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_conflicted BOOLEAN;
BEGIN
  v_conflicted :=
    NEW.verification_status = 'quarantined'
    AND (
      lower(COALESCE(NEW.complete_food_evidence, '')) LIKE '%conflict%'
      OR lower(COALESCE(NEW.product_line, '')) LIKE '%conflict%'
      OR NEW.formula_evidence_tier = 'conflicted'
    );

  NEW.formula_evidence_tier :=
    public.catalog_classify_formula_evidence_tier(
      NEW.verification_status,
      NEW.source_authority,
      NEW.ingredient_verification_status,
      NEW.image_verification_status,
      NEW.is_complete_food,
      v_conflicted
    );
  NEW.formula_version_provenance :=
    COALESCE(NEW.formula_version_provenance, '{}'::JSONB) ||
    jsonb_strip_nulls(
      jsonb_build_object(
        'source_url', NULLIF(trim(NEW.source_url), ''),
        'source_authority', NEW.source_authority,
        'captured_at', NEW.last_observed_at,
        'ingredient_verification_status',
          NEW.ingredient_verification_status,
        'image_verification_status',
          NEW.image_verification_status,
        'version_identity_hash',
          encode(
            digest(
              NEW.formula_key || '|' ||
              COALESCE(NEW.ingredient_text, '') || '|' ||
              COALESCE(NEW.front_image_url, ''),
              'sha256'
            ),
            'hex'
          )
      )
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS
  catalog_formulas_sync_formula_version_trigger
ON public.catalog_formulas;
CREATE TRIGGER catalog_formulas_sync_formula_version_trigger
BEFORE INSERT OR UPDATE OF
  formula_key,
  source_authority,
  source_url,
  last_observed_at,
  ingredient_text,
  front_image_url,
  ingredient_verification_status,
  image_verification_status,
  verification_status,
  is_complete_food,
  complete_food_evidence,
  formula_evidence_tier,
  formula_version_provenance
ON public.catalog_formulas
FOR EACH ROW
EXECUTE FUNCTION public.catalog_sync_formula_version();

CREATE OR REPLACE FUNCTION public.catalog_backfill_product_formula_version_payload(
  p_after_id UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 1000);
  v_rows INTEGER := 0;
  v_next_id UUID := COALESCE(
    p_after_id,
    '00000000-0000-0000-0000-000000000000'::UUID
  );
BEGIN
  WITH batch AS (
    SELECT product.id
    FROM public.product_data product
    WHERE product.id > COALESCE(
        p_after_id,
        '00000000-0000-0000-0000-000000000000'::UUID
      )
      AND product.is_complete_food
      AND product.catalog_exclusion_reason IS NULL
      AND product.formula_evidence_tier IN (
        'manufacturer_current_exact',
        'retailer_web_version',
        'web_label_version',
        'conflicted'
      )
    ORDER BY product.id
    LIMIT v_limit
  ),
  updated AS (
    UPDATE public.product_data product
    SET
      nutritional_info =
        COALESCE(product.nutritional_info, '{}'::JSONB) ||
        jsonb_build_object(
          'formula_evidence_tier', product.formula_evidence_tier,
          'formula_version_provenance',
            product.formula_version_provenance
        ),
      updated_at = now()
    FROM batch
    WHERE product.id = batch.id
    RETURNING product.id
  )
  SELECT count(*), COALESCE(max(id::TEXT)::UUID, v_next_id)
  INTO v_rows, v_next_id
  FROM updated;

  RETURN jsonb_build_object(
    'rows_updated', v_rows,
    'next_id', v_next_id,
    'done', v_rows < v_limit
  );
END;
$$;

REVOKE ALL
  ON FUNCTION public.catalog_sync_product_formula_version()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL
  ON FUNCTION public.catalog_sync_formula_version()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL
  ON FUNCTION public.catalog_backfill_product_formula_version_payload(
    UUID,
    INTEGER
  )
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.catalog_backfill_product_formula_version_payload(
    UUID,
    INTEGER
  )
  TO service_role;

COMMENT ON FUNCTION
  public.catalog_backfill_product_formula_version_payload(UUID, INTEGER)
IS
  'Resumably mirrors evidence tier and source-version provenance into the existing lookup payload.';

DO $$
DECLARE
  v_trigger_count INTEGER;
BEGIN
  SELECT count(*)
  INTO v_trigger_count
  FROM pg_trigger trigger_row
  WHERE trigger_row.tgname IN (
    'product_data_sync_formula_version_trigger',
    'catalog_formulas_sync_formula_version_trigger'
  )
    AND NOT trigger_row.tgisinternal;

  IF v_trigger_count <> 2 THEN
    RAISE EXCEPTION
      'formula-version evidence triggers missing: %',
      v_trigger_count;
  END IF;
END;
$$;
