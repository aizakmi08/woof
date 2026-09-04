-- Turn exact Chewy/Walmart ingredient-page evidence into source-versioned
-- formulas even when the product was not already present in the canonical
-- ledger. Exact retailer SKU/page identity, a matching retailer image, and
-- the existing ingredient safety contract remain mandatory.

ALTER TABLE public.catalog_retailer_ingredient_evidence
  ADD COLUMN IF NOT EXISTS retailer_brand TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS retailer_gtin TEXT,
  ADD COLUMN IF NOT EXISTS life_stage TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS food_form TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS flavor TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS diet_condition TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS front_image_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_source_url TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_content_hash TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_validation_status TEXT NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS formula_identity_hash TEXT NOT NULL DEFAULT '';

ALTER TABLE public.catalog_retailer_ingredient_evidence
  DROP CONSTRAINT IF EXISTS catalog_retailer_ingredient_gtin_check,
  ADD CONSTRAINT catalog_retailer_ingredient_gtin_check CHECK (
    retailer_gtin IS NULL OR retailer_gtin ~ '^[0-9]{8,14}$'
  ),
  DROP CONSTRAINT IF EXISTS catalog_retailer_image_status_check,
  ADD CONSTRAINT catalog_retailer_image_status_check CHECK (
    image_validation_status IN ('missing', 'unresolved', 'exact_retailer_sku')
  ),
  DROP CONSTRAINT IF EXISTS catalog_retailer_formula_hash_check,
  ADD CONSTRAINT catalog_retailer_formula_hash_check CHECK (
    formula_identity_hash = '' OR formula_identity_hash ~ '^[0-9a-f]{64}$'
  );

CREATE INDEX IF NOT EXISTS catalog_retailer_evidence_materialize_idx
  ON public.catalog_retailer_ingredient_evidence (
    import_run_id,
    evidence_status,
    image_validation_status,
    id
  )
  WHERE is_current;

CREATE INDEX IF NOT EXISTS catalog_retailer_evidence_formula_hash_idx
  ON public.catalog_retailer_ingredient_evidence (formula_identity_hash)
  WHERE is_current AND formula_identity_hash <> '';

CREATE OR REPLACE FUNCTION public.enrich_retailer_package_evidence(
  p_import_run_id UUID,
  p_payload JSONB
)
RETURNS TABLE(updated_rows INTEGER, rejected_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated INTEGER := 0;
  v_input INTEGER := 0;
BEGIN
  IF p_import_run_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id
  ) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;
  IF jsonb_typeof(COALESCE(p_payload, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Retailer package evidence payload must be a JSON array';
  END IF;

  SELECT jsonb_array_length(COALESCE(p_payload, '[]'::JSONB)) INTO v_input;

  WITH parsed AS (
    SELECT row.*
    FROM jsonb_to_recordset(COALESCE(p_payload, '[]'::JSONB)) AS row(
      source_slug TEXT,
      source_external_id TEXT,
      source_url TEXT,
      page_product_name TEXT,
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
      evidence_method TEXT
    )
  ), valid AS (
    SELECT parsed.*
    FROM parsed
    WHERE source_slug IN ('chewy', 'walmart')
      AND NULLIF(btrim(source_external_id), '') IS NOT NULL
      AND NULLIF(btrim(source_url), '') IS NOT NULL
      AND NULLIF(btrim(retailer_brand), '') IS NOT NULL
      AND NULLIF(btrim(formula_title), '') IS NOT NULL
      AND formula_identity_hash ~ '^[0-9a-f]{64}$'
      AND image_validation_status = 'exact_retailer_sku'
      AND NULLIF(btrim(image_title), '') IS NOT NULL
      AND NULLIF(btrim(image_source_url), '') IS NOT NULL
      AND NULLIF(btrim(image_content_hash), '') IS NOT NULL
      AND (
        (source_slug = 'chewy' AND front_image_url ~ '^https://image[.]chewy[.]com/')
        OR
        (source_slug = 'walmart' AND front_image_url ~ '^https://i5[.]walmartimages[.]com/')
      )
      AND (retailer_gtin IS NULL OR retailer_gtin ~ '^[0-9]{8,14}$')
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
      image_validation_status = 'exact_retailer_sku',
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'package_page_product_name', valid.page_product_name,
        'package_evidence_method', valid.evidence_method,
        'package_image_source_url', valid.image_source_url,
        'package_image_observed_at', COALESCE(valid.image_observed_at, now()),
        'retailer_gtin', NULLIF(btrim(valid.retailer_gtin), '')
      ),
      evidence_status = CASE
        WHEN evidence.evidence_status = 'linked_missing_exact_image'
          AND evidence.linked_formula_id IS NOT NULL
          AND evidence.linked_observation_id IS NOT NULL
          THEN 'promotable_exact_package'
        ELSE evidence.evidence_status
      END,
      updated_at = now()
    FROM valid
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.source_slug = valid.source_slug
      AND evidence.source_external_id = valid.source_external_id
      AND evidence.source_url = valid.source_url
    RETURNING evidence.id, evidence.linked_observation_id, evidence.front_image_url,
      evidence.retailer_brand, evidence.retailer_gtin
  ), observation_update AS (
    UPDATE public.catalog_observations observation
    SET
      front_image_url = changed.front_image_url,
      brand = CASE
        WHEN NULLIF(btrim(observation.brand), '') IS NULL THEN changed.retailer_brand
        ELSE observation.brand
      END,
      gtin = COALESCE(observation.gtin, changed.retailer_gtin),
      validation_status = CASE
        WHEN observation.validation_status = 'pending' THEN 'accepted'
        ELSE observation.validation_status
      END
    FROM changed
    WHERE observation.id = changed.linked_observation_id
    RETURNING observation.id
  )
  SELECT count(*) INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated, GREATEST(v_input - v_updated, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_retailer_web_formulas(
  p_import_run_id UUID,
  p_limit INTEGER DEFAULT 5000
)
RETURNS TABLE(
  selected_rows INTEGER,
  linked_existing_rows INTEGER,
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
  v_linked_existing INTEGER := 0;
  v_created INTEGER := 0;
  v_promotable INTEGER := 0;
  v_remaining INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.catalog_import_runs WHERE id = p_import_run_id) THEN
    RAISE EXCEPTION 'Unknown catalog import run %', p_import_run_id;
  END IF;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status,
    started_at, finished_at, expected_count, observed_count,
    accepted_count, rejected_count, pagination_complete,
    source_content_hash, metadata
  )
  VALUES (
    'retailer-web-materialize:' || p_import_run_id::TEXT,
    'chewy+walmart-retailer-web',
    'retailer',
    'verification',
    'completed',
    now(),
    now(),
    0,
    0,
    0,
    0,
    true,
    p_import_run_id::TEXT,
    jsonb_build_object(
      'import_run_id', p_import_run_id,
      'evidence_policy', 'exact retailer SKU/page ingredients plus exact retailer SKU image',
      'identity_policy', 'exact GTIN, exact normalized formula title, otherwise source-versioned formula'
    )
  )
  ON CONFLICT (run_key) DO UPDATE SET
    finished_at = now(),
    pagination_complete = true,
    updated_at = now()
  RETURNING id INTO v_run_id;

  SELECT COALESCE(array_agg(selected.id ORDER BY selected.id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM (
    SELECT evidence.id
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.image_validation_status = 'exact_retailer_sku'
      AND NULLIF(btrim(evidence.front_image_url), '') IS NOT NULL
      AND NULLIF(btrim(evidence.retailer_brand), '') IS NOT NULL
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
      AND evidence.image_validation_status = 'exact_retailer_sku';
    RETURN QUERY SELECT 0, 0, 0, 0, v_remaining;
    RETURN;
  END IF;

  -- A published GTIN is deterministic identity evidence. Species conflicts
  -- quarantine the retailer row instead of moving an existing SKU.
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    evidence_status = 'quarantined_validation',
    validation_reasons = CASE
      WHEN 'retailer_gtin_species_conflict' = ANY(evidence.validation_reasons)
        THEN evidence.validation_reasons
      ELSE array_append(evidence.validation_reasons, 'retailer_gtin_species_conflict')
    END,
    updated_at = now()
  FROM public.catalog_skus sku
  JOIN public.catalog_formulas formula ON formula.id = sku.formula_id
  WHERE evidence.id = ANY(v_ids)
    AND evidence.retailer_gtin IS NOT NULL
    AND sku.active
    AND sku.gtin = evidence.retailer_gtin
    AND formula.pet_type <> evidence.pet_type;

  WITH gtin_match AS (
    SELECT DISTINCT ON (evidence.id)
      evidence.id AS evidence_id,
      formula.id AS formula_id
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_skus sku
      ON sku.active AND sku.gtin = evidence.retailer_gtin
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
     AND formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
    WHERE evidence.id = ANY(v_ids)
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.retailer_gtin IS NOT NULL
    ORDER BY evidence.id, formula.last_observed_at DESC, formula.id
  )
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET linked_formula_id = gtin_match.formula_id, updated_at = now()
  FROM gtin_match
  WHERE evidence.id = gtin_match.evidence_id;

  -- Without a GTIN, reuse an existing formula only when one and only one
  -- active same-species formula has the exact normalized size-free title.
  WITH title_candidates AS (
    SELECT
      evidence.id AS evidence_id,
      formula.id AS formula_id,
      count(*) OVER (PARTITION BY evidence.id) AS candidate_count
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
     AND (
       public.catalog_normalize_retailer_title(formula.product_name)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
       OR public.catalog_normalize_retailer_title(formula.product_line)
         = public.catalog_normalize_retailer_title(evidence.formula_title)
     )
    WHERE evidence.id = ANY(v_ids)
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.linked_formula_id IS NULL
  ), unique_title AS (
    SELECT evidence_id, min(formula_id) AS formula_id
    FROM title_candidates
    WHERE candidate_count = 1
    GROUP BY evidence_id
  )
  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET linked_formula_id = unique_title.formula_id, updated_at = now()
  FROM unique_title
  WHERE evidence.id = unique_title.evidence_id;

  SELECT count(*) INTO v_linked_existing
  FROM public.catalog_retailer_ingredient_evidence
  WHERE id = ANY(v_ids) AND linked_formula_id IS NOT NULL;

  WITH new_formula_rows AS (
    SELECT DISTINCT ON (evidence.formula_identity_hash)
      evidence.*
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.id = ANY(v_ids)
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND evidence.linked_formula_id IS NULL
    ORDER BY evidence.formula_identity_hash,
      evidence.fetched_at DESC NULLS LAST,
      evidence.id DESC
  ), inserted AS (
    INSERT INTO public.catalog_formulas (
      formula_key,
      manufacturer,
      brand,
      product_name,
      product_line,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      is_complete_food,
      complete_food_evidence,
      ingredient_text,
      ingredients,
      front_image_url,
      source_url,
      source_authority,
      ingredient_verification_status,
      image_verification_status,
      protected_terms,
      verification_status,
      active,
      is_popular_brand,
      first_observed_at,
      last_observed_at,
      identity_hash,
      formula_evidence_tier,
      formula_version_provenance,
      updated_at
    )
    SELECT
      'retailer-web:' || source_slug || ':' || formula_identity_hash,
      retailer_brand,
      retailer_brand,
      formula_title,
      formula_title,
      pet_type,
      life_stage,
      food_form,
      flavor,
      diet_condition,
      true,
      'Exact retailer SKU page supplies a complete-food identity and full ingredient statement; exact retailer SKU image is independently paired to the same page.',
      ingredient_text,
      public.catalog_split_ingredient_statement(ingredient_text),
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
        JOIN public.catalog_major_brand_registry_snapshots snapshot
          ON snapshot.id = major.snapshot_id
        WHERE major.inclusion_status = 'major'
          AND major.brand_key = public.catalog_normalize_retailer_title(retailer_brand)
          AND snapshot.id = (
            SELECT max(latest.id) FROM public.catalog_major_brand_registry_snapshots latest
          )
      ),
      COALESCE(fetched_at, now()),
      COALESCE(fetched_at, now()),
      formula_identity_hash,
      'retailer_web_version',
      jsonb_build_object(
        'manufacturer_current_equivalence', false,
        'version_status', 'dated_retailer_web_version',
        'identity_policy', 'exact retailer SKU and size-free title; formula versions separated by ingredient hash',
        'source', source_slug,
        'retailer_sku', source_external_id,
        'retailer_gtin', retailer_gtin,
        'source_url', source_url,
        'front_image_url', front_image_url,
        'image_source_url', image_source_url,
        'captured_at', fetched_at
      ),
      now()
    FROM new_formula_rows
    ON CONFLICT (formula_key) DO UPDATE SET
      last_observed_at = GREATEST(public.catalog_formulas.last_observed_at, EXCLUDED.last_observed_at),
      front_image_url = CASE
        WHEN public.catalog_formulas.front_image_url = '' THEN EXCLUDED.front_image_url
        ELSE public.catalog_formulas.front_image_url
      END,
      updated_at = now()
    RETURNING id
  )
  SELECT count(*) INTO v_created FROM inserted;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET linked_formula_id = formula.id, updated_at = now()
  FROM public.catalog_formulas formula
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'unmatched_catalog_sku'
    AND evidence.linked_formula_id IS NULL
    AND formula.formula_key =
      'retailer-web:' || evidence.source_slug || ':' || evidence.formula_identity_hash;

  INSERT INTO public.catalog_observations (
    run_id,
    formula_id,
    source_slug,
    source_external_id,
    source_url,
    source_authority,
    gtin,
    manufacturer,
    brand,
    product_name,
    product_line,
    pet_type,
    life_stage,
    food_form,
    flavor,
    diet_condition,
    package_size,
    ingredient_text,
    front_image_url,
    is_complete_food,
    available_in_us,
    observed_at,
    content_hash,
    validation_status,
    validation_reasons,
    raw_payload,
    formula_evidence_tier,
    formula_version_provenance
  )
  SELECT
    v_run_id,
    evidence.linked_formula_id,
    evidence.source_slug || '-retailer-web',
    evidence.source_external_id,
    evidence.source_url,
    'retailer_verified',
    evidence.retailer_gtin,
    evidence.retailer_brand,
    evidence.retailer_brand,
    evidence.product_name,
    evidence.formula_title,
    evidence.pet_type,
    evidence.life_stage,
    evidence.food_form,
    evidence.flavor,
    evidence.diet_condition,
    evidence.package_size,
    evidence.ingredient_text,
    evidence.front_image_url,
    true,
    true,
    COALESCE(evidence.fetched_at, now()),
    evidence.content_hash || ':' || evidence.image_content_hash,
    'accepted',
    ARRAY[]::TEXT[],
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
      'retailer_gtin', evidence.retailer_gtin,
      'ingredient_text_hash', evidence.ingredient_hash,
      'image_content_hash', evidence.image_content_hash,
      'source_url', evidence.source_url,
      'image_source_url', evidence.image_source_url,
      'captured_at', evidence.fetched_at
    )
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.id = ANY(v_ids)
    AND evidence.evidence_status = 'unmatched_catalog_sku'
    AND evidence.linked_formula_id IS NOT NULL
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    gtin = EXCLUDED.gtin,
    brand = EXCLUDED.brand,
    product_name = EXCLUDED.product_name,
    product_line = EXCLUDED.product_line,
    ingredient_text = EXCLUDED.ingredient_text,
    front_image_url = EXCLUDED.front_image_url,
    validation_status = 'accepted',
    raw_payload = EXCLUDED.raw_payload,
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance = EXCLUDED.formula_version_provenance;

  UPDATE public.catalog_retailer_ingredient_evidence evidence
  SET
    linked_observation_id = observation.id,
    evidence_status = 'promotable_exact_package',
    validation_reasons = array_remove(
      evidence.validation_reasons,
      'no_unique_exact_catalog_sku_identity'
    ),
    updated_at = now()
  FROM public.catalog_observations observation
  WHERE evidence.id = ANY(v_ids)
    AND observation.run_id = v_run_id
    AND observation.formula_id = evidence.linked_formula_id
    AND observation.source_slug = evidence.source_slug || '-retailer-web'
    AND observation.source_external_id = evidence.source_external_id
    AND observation.content_hash = evidence.content_hash || ':' || evidence.image_content_hash;

  SELECT count(*) INTO v_promotable
  FROM public.catalog_retailer_ingredient_evidence
  WHERE id = ANY(v_ids) AND evidence_status = 'promotable_exact_package';

  UPDATE public.catalog_source_runs
  SET
    expected_count = (
      SELECT count(*) FROM public.catalog_retailer_ingredient_evidence
      WHERE import_run_id = p_import_run_id
        AND is_current
        AND image_validation_status = 'exact_retailer_sku'
    ),
    observed_count = observed_count + v_selected,
    accepted_count = accepted_count + v_promotable,
    rejected_count = rejected_count + (v_selected - v_promotable),
    finished_at = now(),
    updated_at = now()
  WHERE id = v_run_id;

  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.is_current
    AND evidence.evidence_status = 'unmatched_catalog_sku'
    AND evidence.image_validation_status = 'exact_retailer_sku';

  RETURN QUERY SELECT v_selected, v_linked_existing, v_created, v_promotable, v_remaining;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_retailer_formula_promotions(
  p_import_run_id UUID
)
RETURNS TABLE(updated_formulas INTEGER, upserted_gtins INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_formulas INTEGER := 0;
  v_gtins INTEGER := 0;
BEGIN
  WITH representative AS (
    SELECT DISTINCT ON (evidence.linked_formula_id)
      evidence.linked_formula_id,
      evidence.promoted_cache_key,
      evidence.fetched_at
    FROM public.catalog_retailer_ingredient_evidence evidence
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND evidence.linked_formula_id IS NOT NULL
      AND evidence.promoted_cache_key IS NOT NULL
    ORDER BY evidence.linked_formula_id,
      evidence.fetched_at DESC NULLS LAST,
      evidence.id DESC
  ), changed AS (
    UPDATE public.catalog_formulas formula
    SET
      promoted_cache_key = representative.promoted_cache_key,
      promoted_at = COALESCE(representative.fetched_at, now()),
      verification_status = 'verified',
      formula_evidence_tier = CASE
        WHEN formula.formula_evidence_tier = 'unverified' THEN 'retailer_web_version'
        ELSE formula.formula_evidence_tier
      END,
      updated_at = now()
    FROM representative
    WHERE formula.id = representative.linked_formula_id
    RETURNING formula.id
  )
  SELECT count(*) INTO v_formulas FROM changed;

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
    evidence.retailer_gtin,
    COALESCE(NULLIF(evidence.package_size, ''), 'unknown'),
    evidence.source_slug || '-retailer-web',
    evidence.source_external_id,
    evidence.source_url,
    true,
    COALESCE(evidence.fetched_at, now()),
    COALESCE(evidence.fetched_at, now())
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.is_current
    AND evidence.evidence_status = 'promoted'
    AND evidence.linked_formula_id IS NOT NULL
    AND evidence.retailer_gtin IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.catalog_skus existing
      WHERE existing.active AND existing.gtin = evidence.retailer_gtin
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = true,
    last_observed_at = GREATEST(public.catalog_skus.last_observed_at, EXCLUDED.last_observed_at);

  GET DIAGNOSTICS v_gtins = ROW_COUNT;

  UPDATE public.catalog_observations observation
  SET gtin = evidence.retailer_gtin
  FROM public.catalog_retailer_ingredient_evidence evidence
  WHERE evidence.import_run_id = p_import_run_id
    AND evidence.is_current
    AND evidence.evidence_status = 'promoted'
    AND evidence.linked_observation_id = observation.id
    AND evidence.retailer_gtin IS NOT NULL
    AND observation.gtin IS DISTINCT FROM evidence.retailer_gtin;

  RETURN QUERY SELECT v_formulas, v_gtins;
END;
$function$;

REVOKE ALL ON FUNCTION public.enrich_retailer_package_evidence(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.materialize_retailer_web_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enrich_retailer_package_evidence(UUID, JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.materialize_retailer_web_formulas(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_retailer_formula_promotions(UUID)
  TO service_role;
