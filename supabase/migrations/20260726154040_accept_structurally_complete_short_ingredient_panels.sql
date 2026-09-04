-- Full ingredient panels for refrigerated/fresh foods can be materially
-- shorter than 500 characters. Replace the arbitrary length gate with a
-- structural completeness gate while preserving exact package identity,
-- complete-food, image, artifact, and barcode-conflict safeguards.

CREATE OR REPLACE FUNCTION public.catalog_retailer_ingredient_statement_is_complete(
  p_statement TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    length(btrim(COALESCE(p_statement, ''))) >= 120
    AND cardinality(
      public.catalog_split_ingredient_statement(
        btrim(COALESCE(p_statement, ''))
      )
    ) >= 8
    AND btrim(COALESCE(p_statement, '')) !~ '[,;:]$'
    AND NOT public.catalog_has_unbalanced_parentheses(
      btrim(COALESCE(p_statement, ''))
    )
    AND NOT public.catalog_has_ingredient_ocr_artifacts(
      btrim(COALESCE(p_statement, ''))
    );
$$;

REVOKE ALL ON FUNCTION
  public.catalog_retailer_ingredient_statement_is_complete(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.catalog_retailer_ingredient_statement_is_complete(TEXT)
  TO service_role;

-- Reusable availability-first promotion lane for a visually reviewed retailer
-- package batch. Exact package pages may represent:
--   1. a manufacturer-current equivalent package,
--   2. a distinct source-version with a new/version-safe GTIN, or
--   3. a distinct source-version whose GTIN was reused across formulas.
--
-- Equivalent packages link to the existing exact verified formula, whether its
-- evidence tier is manufacturer-current or a previously reviewed source
-- version. Distinct versions never overwrite current ingredients. Reused GTINs
-- remain in provenance but have no active deterministic barcode owner.

CREATE OR REPLACE FUNCTION public.promote_reviewed_retailer_package_batch(
  p_review_run_key TEXT,
  p_accepted_run_key TEXT,
  p_accepted_source_slug TEXT,
  p_expected_observation_count INTEGER,
  p_expected_formula_count INTEGER,
  p_review_evidence_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_review_run public.catalog_source_runs%ROWTYPE;
  v_payload JSONB;
  v_run JSONB;
  v_stage JSONB;
  v_formula RECORD;
  v_current_count INTEGER;
  v_safe_count INTEGER;
  v_conflict_count INTEGER;
  v_source_formula_count INTEGER;
  v_promoted_count INTEGER;
  v_promotion_debug JSONB;
BEGIN
  IF NULLIF(btrim(p_review_run_key), '') IS NULL
    OR NULLIF(btrim(p_accepted_run_key), '') IS NULL
    OR NULLIF(btrim(p_accepted_source_slug), '') IS NULL
    OR NULLIF(btrim(p_review_evidence_note), '') IS NULL
    OR p_expected_observation_count < 1
    OR p_expected_formula_count < 1
  THEN
    RAISE EXCEPTION 'Invalid reviewed retailer package batch arguments';
  END IF;

  SELECT *
  INTO STRICT v_review_run
  FROM public.catalog_source_runs
  WHERE run_key = p_review_run_key;

  IF v_review_run.status <> 'completed'
    OR NOT v_review_run.pagination_complete
  THEN
    RAISE EXCEPTION
      'Reviewed retailer source run is not complete: %',
      p_review_run_key;
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_review_run.id
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
      AND observation.source_authority = 'retailer_verified'
      AND observation.is_complete_food
      AND public.catalog_retailer_ingredient_statement_is_complete(
        observation.ingredient_text
      )
      AND btrim(observation.front_image_url) <> ''
      AND btrim(observation.gtin) <> ''
      AND NOT public.catalog_has_unbalanced_parentheses(
        observation.ingredient_text
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        observation.ingredient_text
      )
  ) <> p_expected_observation_count THEN
    RAISE EXCEPTION
      'Reviewed retailer package evidence changed or is incomplete';
  END IF;

  IF (
    SELECT count(DISTINCT
      lower(concat_ws(
        '|',
        observation.manufacturer,
        observation.brand,
        observation.product_line,
        observation.pet_type,
        observation.life_stage,
        observation.food_form,
        observation.flavor,
        observation.diet_condition,
        public.catalog_normalize_ingredient_evidence(
          observation.ingredient_text
        )
      ))
    )
    FROM public.catalog_observations observation
    WHERE observation.run_id = v_review_run.id
      AND observation.validation_status = 'quarantined'
      AND observation.validation_reasons =
        ARRAY['manual_exact_version_review_required']::TEXT[]
      AND observation.source_authority = 'retailer_verified'
      AND observation.is_complete_food
      AND public.catalog_retailer_ingredient_statement_is_complete(
        observation.ingredient_text
      )
      AND btrim(observation.front_image_url) <> ''
      AND btrim(observation.gtin) <> ''
      AND NOT public.catalog_has_unbalanced_parentheses(
        observation.ingredient_text
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        observation.ingredient_text
      )
  ) <> p_expected_formula_count THEN
    RAISE EXCEPTION
      'Reviewed retailer package formula count changed';
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp.reviewed_package_partition (
    observation_id BIGINT PRIMARY KEY,
    disposition TEXT NOT NULL,
    current_formula_id BIGINT,
    current_cache_key TEXT
  ) ON COMMIT DROP;

  DELETE FROM pg_temp.reviewed_package_partition;

  INSERT INTO pg_temp.reviewed_package_partition (
    observation_id,
    disposition,
    current_formula_id,
    current_cache_key
  )
  SELECT
    observation.id,
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.product_data serving
        WHERE regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
            observation.gtin
          AND NULLIF(btrim(serving.ingredient_text), '') IS NOT NULL
          AND serving.ingredient_verification_status IN (
            'gdsn', 'official', 'manufacturer', 'retailer_verified',
            'label_ocr_verified'
          )
          AND public.catalog_normalize_ingredient_evidence(
            serving.ingredient_text
          ) <> public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.catalog_skus existing_sku
        JOIN public.catalog_formulas existing_formula
          ON existing_formula.id = existing_sku.formula_id
         AND existing_formula.active
         AND existing_formula.verification_status = 'verified'
        WHERE existing_sku.active
          AND existing_sku.gtin = observation.gtin
          AND NULLIF(btrim(existing_formula.ingredient_text), '') IS NOT NULL
          AND public.catalog_normalize_ingredient_evidence(
            existing_formula.ingredient_text
          ) <> public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          )
      )
      OR (
        current_formula.id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.catalog_skus existing_sku
          JOIN public.catalog_formulas existing_formula
            ON existing_formula.id = existing_sku.formula_id
           AND existing_formula.active
           AND existing_formula.verification_status = 'verified'
          WHERE existing_sku.active
            AND existing_sku.gtin = observation.gtin
        )
      ) THEN 'source_version_gtin_conflict'
      WHEN current_formula.id IS NOT NULL THEN 'manufacturer_current_equal'
      ELSE 'source_version_safe'
    END,
    current_formula.id,
    current_formula.promoted_cache_key
  FROM public.catalog_observations observation
  LEFT JOIN LATERAL (
    SELECT
      formula.id,
      formula.promoted_cache_key
    FROM public.product_data serving
    JOIN public.catalog_formulas formula
      ON formula.promoted_cache_key = serving.cache_key
     AND formula.active
     AND formula.verification_status = 'verified'
    WHERE (
        regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
          observation.gtin
        OR EXISTS (
          SELECT 1
          FROM public.catalog_skus exact_sku
          WHERE exact_sku.formula_id = formula.id
            AND exact_sku.active
            AND exact_sku.gtin = observation.gtin
        )
      )
      AND public.catalog_normalize_ingredient_evidence(
        serving.ingredient_text
      ) = public.catalog_normalize_ingredient_evidence(
        observation.ingredient_text
      )
      AND lower(btrim(serving.brand)) =
        lower(btrim(observation.brand))
      AND lower(btrim(serving.pet_type)) =
        lower(btrim(observation.pet_type))
      AND (
        lower(btrim(COALESCE(serving.food_form, ''))) IN ('', 'unknown')
        OR lower(btrim(COALESCE(observation.food_form, ''))) IN ('', 'unknown')
        OR lower(btrim(serving.food_form)) =
          lower(btrim(observation.food_form))
      )
      AND (
        lower(btrim(COALESCE(serving.life_stage, ''))) IN ('', 'unknown')
        OR lower(btrim(COALESCE(observation.life_stage, ''))) IN ('', 'unknown')
        OR lower(btrim(serving.life_stage)) =
          lower(btrim(observation.life_stage))
      )
    ORDER BY
      CASE serving.formula_evidence_tier
        WHEN 'manufacturer_current_exact' THEN 0
        WHEN 'retailer_web_version' THEN 1
        ELSE 2
      END,
      serving.verified_at DESC NULLS LAST,
      serving.cache_key
    LIMIT 1
  ) current_formula ON true
  WHERE observation.run_id = v_review_run.id
    AND observation.validation_status = 'quarantined'
    AND observation.validation_reasons =
      ARRAY['manual_exact_version_review_required']::TEXT[]
    AND observation.source_authority = 'retailer_verified'
    AND observation.is_complete_food
    AND public.catalog_retailer_ingredient_statement_is_complete(
        observation.ingredient_text
      )
    AND btrim(observation.front_image_url) <> ''
    AND btrim(observation.gtin) <> ''
    AND NOT public.catalog_has_unbalanced_parentheses(
      observation.ingredient_text
    )
    AND NOT public.catalog_has_ingredient_ocr_artifacts(
      observation.ingredient_text
    );

  -- A differently named or historically reused package GTIN may fail direct
  -- equivalence even though another size in the same reviewed exact formula
  -- family proves manufacturer-current identity. Canonicalize that family
  -- without granting the conflicting GTIN deterministic ownership.
  UPDATE pg_temp.reviewed_package_partition target
  SET
    current_formula_id = canonical.current_formula_id,
    current_cache_key = canonical.current_cache_key
  FROM public.catalog_observations target_observation
  JOIN LATERAL (
    SELECT
      peer.current_formula_id,
      peer.current_cache_key
    FROM pg_temp.reviewed_package_partition peer
    JOIN public.catalog_observations peer_observation
      ON peer_observation.id = peer.observation_id
    WHERE peer.current_formula_id IS NOT NULL
      AND peer.disposition = 'manufacturer_current_equal'
      AND lower(concat_ws(
        '|',
        peer_observation.manufacturer,
        peer_observation.brand,
        peer_observation.product_line,
        peer_observation.pet_type,
        peer_observation.life_stage,
        peer_observation.food_form,
        peer_observation.flavor,
        peer_observation.diet_condition,
        public.catalog_normalize_ingredient_evidence(
          peer_observation.ingredient_text
        )
      )) = lower(concat_ws(
        '|',
        target_observation.manufacturer,
        target_observation.brand,
        target_observation.product_line,
        target_observation.pet_type,
        target_observation.life_stage,
        target_observation.food_form,
        target_observation.flavor,
        target_observation.diet_condition,
        public.catalog_normalize_ingredient_evidence(
          target_observation.ingredient_text
        )
      ))
    ORDER BY peer.observation_id
    LIMIT 1
  ) canonical ON true
  WHERE target.observation_id = target_observation.id
    AND target.current_formula_id IS NULL
    AND target.disposition = 'source_version_gtin_conflict';

  SELECT
    count(*) FILTER (
      WHERE current_formula_id IS NOT NULL
    ),
    count(*) FILTER (
      WHERE current_formula_id IS NULL
        AND disposition = 'source_version_safe'
    ),
    count(*) FILTER (
      WHERE current_formula_id IS NULL
        AND disposition = 'source_version_gtin_conflict'
    )
  INTO v_current_count, v_safe_count, v_conflict_count
  FROM pg_temp.reviewed_package_partition;

  SELECT count(DISTINCT
    lower(concat_ws(
      '|',
      observation.manufacturer,
      observation.brand,
      observation.product_line,
      observation.pet_type,
      observation.life_stage,
      observation.food_form,
      observation.flavor,
      observation.diet_condition,
      public.catalog_normalize_ingredient_evidence(
        observation.ingredient_text
      )
    ))
  )
  INTO v_source_formula_count
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.current_formula_id IS NULL;

  -- Exact current-equivalent packages become SKU evidence for the existing
  -- current formula. Deactivate duplicate formula ownership for that GTIN.
  UPDATE public.catalog_skus sku
  SET
    active = false,
    updated_at = now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.disposition = 'manufacturer_current_equal'
    AND sku.gtin = observation.gtin
    AND sku.formula_id <> partition.current_formula_id
    AND sku.active;

  -- A legacy retailer serving alias can still claim the same exact GTIN even
  -- after its duplicate SKU owner is disabled. When its normalized ingredient
  -- statement is identical, retain the package identifier in provenance and
  -- leave deterministic barcode ownership only on manufacturer current.
  UPDATE public.product_data serving
  SET
    gtin = NULL,
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'superseded_gtin', observation.gtin,
        'gtin_owner_cache_key', partition.current_cache_key,
        'gtin_resolution_policy', 'prefer_manufacturer_current',
        'ingredient_hash_equality_verified', true
      ),
    updated_at = now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.disposition = 'manufacturer_current_equal'
    AND regexp_replace(COALESCE(serving.gtin, ''), '\D', '', 'g') =
      observation.gtin
    AND serving.cache_key <> partition.current_cache_key
    AND public.catalog_normalize_ingredient_evidence(
      serving.ingredient_text
    ) = public.catalog_normalize_ingredient_evidence(
      observation.ingredient_text
    );

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    package_count,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at,
    updated_at
  )
  SELECT
    partition.current_formula_id,
    observation.gtin,
    observation.package_size,
    1,
    p_accepted_source_slug || '-current',
    observation.source_external_id,
    observation.source_url,
    true,
    observation.observed_at,
    observation.observed_at,
    now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.disposition = 'manufacturer_current_equal'
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = excluded.last_observed_at,
    updated_at = now();

  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'reviewed_equivalent_packages',
        COALESCE(
          serving.formula_version_provenance
            -> 'reviewed_equivalent_packages',
          '[]'::JSONB
        ) || jsonb_build_array(
          jsonb_build_object(
            'product_code', 'TCIN ' || observation.source_external_id,
            'package_gtin', observation.gtin,
            'package_size', observation.package_size,
            'source_url', observation.source_url,
            'front_image_url', observation.front_image_url,
            'captured_at', observation.observed_at,
            'ingredient_hash_equality_verified', true,
            'barcode_resolution_policy', CASE
              WHEN partition.disposition = 'manufacturer_current_equal'
                THEN 'prefer_existing_verified_formula'
              ELSE 'abstain_reused_gtin_formula_conflict'
            END
          )
        )
      ),
    updated_at = now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.current_formula_id IS NOT NULL
    AND serving.cache_key = partition.current_cache_key;

  UPDATE public.catalog_observations observation
  SET
    formula_id = partition.current_formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence', true,
        'package_gtin', observation.gtin,
        'product_code', 'TCIN ' || observation.source_external_id,
        'source_url', observation.source_url,
        'captured_at', observation.observed_at,
        'front_image_url', observation.front_image_url,
        'source_verbatim_ingredient_text', observation.ingredient_text,
        'source_verbatim_ingredient_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              observation.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'exact_package_identity', true,
        'review_evidence_note', p_review_evidence_note,
        'barcode_resolution_policy', CASE
          WHEN partition.disposition = 'manufacturer_current_equal'
            THEN 'prefer_manufacturer_current'
          ELSE 'abstain_reused_gtin_formula_conflict'
        END
      )
  FROM pg_temp.reviewed_package_partition partition
  WHERE observation.id = partition.observation_id
    AND partition.current_formula_id IS NOT NULL;

  INSERT INTO public.catalog_verified_product_search_aliases (
    cache_key,
    alias_text,
    normalized_alias,
    source_url,
    source_authority,
    evidence_observed_at,
    provenance,
    active,
    created_at,
    updated_at
  )
  SELECT DISTINCT ON (
    public.normalize_verified_product_search_query(
      observation.product_name
    )
  )
    partition.current_cache_key,
    observation.product_name,
    public.normalize_verified_product_search_query(
      observation.product_name
    ),
    serving.source_url,
    serving.source_quality,
    observation.observed_at,
    jsonb_build_object(
      'evidence_tier', 'manufacturer_current_exact',
      'target_product_code', 'TCIN ' || observation.source_external_id,
      'target_package_gtin', observation.gtin,
      'target_source_url', observation.source_url,
      'ingredient_hash_equality_verified', true,
      'barcode_resolution_policy', CASE
        WHEN partition.disposition = 'manufacturer_current_equal'
          THEN 'prefer_manufacturer_current'
        ELSE 'abstain_reused_gtin_formula_conflict'
      END
    ),
    true,
    now(),
    now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  JOIN public.product_data serving
    ON serving.cache_key = partition.current_cache_key
  WHERE partition.current_formula_id IS NOT NULL
  ORDER BY
    public.normalize_verified_product_search_query(
      observation.product_name
    ),
    observation.observed_at DESC,
    observation.id DESC
  ON CONFLICT (normalized_alias)
    WHERE active
  DO UPDATE SET
    cache_key = excluded.cache_key,
    alias_text = excluded.alias_text,
    source_url = excluded.source_url,
    source_authority = excluded.source_authority,
    evidence_observed_at = excluded.evidence_observed_at,
    provenance = excluded.provenance,
    active = true,
    updated_at = now();

  v_run := jsonb_build_object(
    'run_key', p_accepted_run_key,
    'source_slug', p_accepted_source_slug,
    'source_type', 'retailer',
    'coverage_role', 'verification',
    'status', 'completed',
    'started_at', v_review_run.started_at,
    'expected_count', v_safe_count + v_conflict_count,
    'pagination_complete', true,
    'truncated', false,
    'cap_reached', false,
    'source_content_hash', encode(
      digest(
        p_review_run_key || '|' || p_accepted_run_key || '|' ||
        v_source_formula_count::TEXT,
        'sha256'
      ),
      'hex'
    ),
    'checkpoint', jsonb_build_object(
      'review_source_run_id', v_review_run.id,
      'review_policy', p_review_evidence_note
    ),
    'metadata', jsonb_build_object(
      'formula_evidence_tier', 'retailer_web_version',
      'manufacturer_current_equivalence', false,
      'current_equivalent_package_count', v_current_count,
      'source_version_formula_count', v_source_formula_count,
      'source_version_safe_package_count', v_safe_count,
      'reused_barcode_conflict_count', v_conflict_count
    )
  );

  SELECT jsonb_agg(
    jsonb_build_object(
      'formula_key',
        'retailer-package-version:' ||
        encode(
          digest(
            lower(concat_ws(
              '|',
              observation.manufacturer,
              observation.brand,
              observation.product_line,
              observation.pet_type,
              observation.life_stage,
              observation.food_form,
              observation.flavor,
              observation.diet_condition,
              public.catalog_normalize_ingredient_evidence(
                observation.ingredient_text
              )
            )),
            'sha256'
          ),
          'hex'
        ),
      'identity_hash',
        encode(
          digest(
            lower(concat_ws(
              '|',
              observation.manufacturer,
              observation.brand,
              observation.product_line,
              observation.pet_type,
              observation.life_stage,
              observation.food_form,
              observation.flavor,
              observation.diet_condition,
              public.catalog_normalize_ingredient_evidence(
                observation.ingredient_text
              )
            )),
            'sha256'
          ),
          'hex'
        ),
      'manufacturer', observation.manufacturer,
      'brand', observation.brand,
      'product_name', observation.product_name,
      'product_line', observation.product_line,
      'pet_type', observation.pet_type,
      'life_stage', observation.life_stage,
      'food_form', observation.food_form,
      'flavor', observation.flavor,
      'diet_condition', observation.diet_condition,
      'source_slug', p_accepted_source_slug,
      'source_external_id', observation.source_external_id,
      'source_url', observation.source_url,
      'source_authority', 'retailer_verified',
      'gtin', CASE
        WHEN partition.disposition = 'source_version_gtin_conflict'
          THEN NULL
        ELSE observation.gtin
      END,
      'package_size', observation.package_size,
      'ingredient_text', observation.ingredient_text,
      'ingredients', to_jsonb(
        public.catalog_split_ingredient_statement(
          observation.ingredient_text
        )
      ),
      'front_image_url', observation.front_image_url,
      'is_complete_food', true,
      'available_in_us', true,
      'protected_terms', to_jsonb(ARRAY[
        observation.brand,
        observation.product_name,
        observation.flavor,
        observation.pet_type,
        observation.life_stage,
        observation.food_form
      ]),
      'observed_at', observation.observed_at,
      'content_hash', encode(
        digest(
          observation.source_url || '|' ||
          observation.gtin || '|' ||
          observation.front_image_url || '|' ||
          public.catalog_normalize_ingredient_evidence(
            observation.ingredient_text
          ),
          'sha256'
        ),
        'hex'
      ),
      'validation_status', 'accepted',
      'validation_reasons', '[]'::JSONB,
      'ingredient_verification_status', 'retailer_verified',
      'image_verification_status', 'retailer_verified',
      'coverage_tier', 'tier_1_us_retail',
      'raw_payload', COALESCE(observation.raw_payload, '{}'::JSONB) ||
        jsonb_build_object(
          'review_source_run_id', v_review_run.id,
          'target_tcin', observation.source_external_id,
          'target_upc', observation.gtin,
          'exact_package_identity', true,
          'ingredients_verbatim_from_exact_pdp', true,
          'matching_front_package_image', true,
          'manufacturer_current_equivalence', false,
          'formula_evidence_tier', 'retailer_web_version',
          'review_evidence_note', p_review_evidence_note,
          'barcode_resolution_policy', CASE
            WHEN partition.disposition = 'source_version_gtin_conflict'
              THEN 'abstain_reused_gtin_formula_conflict'
            ELSE 'exact_source_version'
          END
        )
    )
    ORDER BY observation.source_external_id
  )
  INTO v_payload
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.current_formula_id IS NULL;

  SELECT public.stage_catalog_census_batch(v_run, v_payload)
  INTO v_stage;

  -- When multiple package observations share one exact ingredient version,
  -- use a version-safe package as the serving representative. A reused GTIN
  -- conflict remains in package provenance but must not become the formula's
  -- primary source URL merely because row ordering happened to select it.
  WITH preferred AS (
    SELECT DISTINCT ON (observation.formula_id)
      observation.formula_id,
      observation.product_name,
      observation.source_url,
      observation.front_image_url
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
      AND observation.formula_id IS NOT NULL
    ORDER BY
      observation.formula_id,
      CASE observation.raw_payload->>'barcode_resolution_policy'
        WHEN 'exact_source_version' THEN 0
        WHEN 'abstain_reused_gtin_formula_conflict' THEN 1
        ELSE 2
      END,
      observation.source_external_id
  )
  UPDATE public.catalog_formulas formula
  SET
    product_name = preferred.product_name,
    source_url = preferred.source_url,
    front_image_url = preferred.front_image_url,
    updated_at = now()
  FROM preferred
  WHERE formula.id = preferred.formula_id;

  UPDATE public.catalog_formulas formula
  SET
    complete_food_evidence =
      'Exact reviewed retailer PDP supplies a full fortified ingredient '
      || 'statement, guaranteed analysis, matching front-package image, '
      || 'package identifier, and GTIN.',
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(formula.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'captured_at', formula.last_observed_at,
        'source_verbatim_ingredient_text', formula.ingredient_text,
        'source_verbatim_ingredient_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'verbatim_source_statement_preserved', true,
        'exact_package_identity', true,
        'review_source_run_id', v_review_run.id,
        'review_evidence_note', p_review_evidence_note
      ),
    updated_at = now()
  WHERE formula.id IN (
    SELECT DISTINCT observation.formula_id
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
  );

  UPDATE public.catalog_observations observation
  SET
    formula_evidence_tier = 'retailer_web_version',
    formula_version_provenance =
      COALESCE(observation.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'package_gtin', observation.raw_payload->>'target_upc',
        'product_code', 'TCIN ' || observation.source_external_id,
        'source_url', observation.source_url,
        'captured_at', observation.observed_at,
        'front_image_url', observation.front_image_url,
        'source_verbatim_ingredient_text', observation.ingredient_text,
        'source_verbatim_ingredient_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              observation.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'verbatim_source_statement_preserved', true,
        'exact_package_identity', true,
        'barcode_resolution_policy',
          observation.raw_payload->>'barcode_resolution_policy'
      )
  FROM public.catalog_source_runs source_run
  WHERE observation.run_id = source_run.id
    AND source_run.run_key = p_accepted_run_key;

  FOR v_formula IN
    SELECT DISTINCT formula.id
    FROM public.catalog_formulas formula
    JOIN public.catalog_observations observation
      ON observation.formula_id = formula.id
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
    ORDER BY formula.id
  LOOP
    PERFORM *
    FROM public.promote_catalog_formula(v_formula.id);
  END LOOP;

  UPDATE public.catalog_skus sku
  SET
    active = false,
    updated_at = now()
  FROM pg_temp.reviewed_package_partition partition
  JOIN public.catalog_observations observation
    ON observation.id = partition.observation_id
  WHERE partition.disposition = 'source_version_gtin_conflict'
    AND sku.gtin = observation.gtin
    AND sku.active;

  UPDATE public.product_data serving
  SET
    formula_version_provenance =
      COALESCE(serving.formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'source_versioned',
        'manufacturer_current_equivalence', false,
        'source_type', 'exact_retailer_package_page',
        'source_url', representative.source_url,
        'captured_at', representative.observed_at,
        'product_code',
          'TCIN ' || representative.source_external_id,
        'package_gtin',
          representative.raw_payload->>'target_upc',
        'front_image_url', representative.front_image_url,
        'source_verbatim_ingredient_text', formula.ingredient_text,
        'source_verbatim_ingredient_hash', encode(
          digest(
            public.catalog_normalize_ingredient_evidence(
              formula.ingredient_text
            ),
            'sha256'
          ),
          'hex'
        ),
        'verbatim_source_statement_preserved', true,
        'package_versions', packages.rows,
        'exact_package_identity', true
      ),
    updated_at = now()
  FROM public.catalog_formulas formula
  JOIN LATERAL (
    SELECT observation.*
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
      AND observation.formula_id = formula.id
    ORDER BY
      (observation.source_url = formula.source_url) DESC,
      observation.source_external_id
    LIMIT 1
  ) representative ON true
  JOIN LATERAL (
    SELECT jsonb_agg(
      jsonb_build_object(
        'product_code', 'TCIN ' || observation.source_external_id,
        'package_gtin', observation.raw_payload->>'target_upc',
        'package_size', observation.package_size,
        'source_url', observation.source_url,
        'barcode_resolution_policy',
          observation.raw_payload->>'barcode_resolution_policy'
      )
      ORDER BY observation.source_external_id
    ) AS rows
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
      AND observation.formula_id = formula.id
  ) packages ON true
  WHERE serving.cache_key = formula.promoted_cache_key
    AND formula.id IN (
      SELECT DISTINCT observation.formula_id
      FROM public.catalog_observations observation
      JOIN public.catalog_source_runs source_run
        ON source_run.id = observation.run_id
      WHERE source_run.run_key = p_accepted_run_key
    );

  UPDATE public.catalog_observations observation
  SET
    validation_reasons =
      ARRAY['superseded_by_accepted_review_run']::TEXT[],
    raw_payload = COALESCE(observation.raw_payload, '{}'::JSONB) ||
      jsonb_build_object('accepted_run_key', p_accepted_run_key)
  FROM pg_temp.reviewed_package_partition partition
  WHERE observation.id = partition.observation_id
    AND partition.current_formula_id IS NULL;

  SELECT count(*)
  INTO v_promoted_count
  FROM public.catalog_formulas formula
  WHERE formula.id IN (
    SELECT DISTINCT observation.formula_id
    FROM public.catalog_observations observation
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key
  )
    AND formula.verification_status = 'verified'
    AND formula.active
    AND formula.formula_evidence_tier = 'retailer_web_version'
    AND formula.promoted_cache_key IS NOT NULL;

  IF v_promoted_count <> v_source_formula_count THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'formula_id', formula.id,
        'formula_key', formula.formula_key,
        'verification_status', formula.verification_status,
        'formula_evidence_tier', formula.formula_evidence_tier,
        'promoted_cache_key', formula.promoted_cache_key,
        'observation_status', observation.validation_status,
        'observation_reasons', observation.validation_reasons
      )
      ORDER BY formula.id
    )
    INTO v_promotion_debug
    FROM public.catalog_formulas formula
    JOIN public.catalog_observations observation
      ON observation.formula_id = formula.id
    JOIN public.catalog_source_runs source_run
      ON source_run.id = observation.run_id
    WHERE source_run.run_key = p_accepted_run_key;

    RAISE EXCEPTION
      'Reviewed retailer source-version promotion count mismatch: promoted %, source formulas %, stage %, details %',
      v_promoted_count, v_source_formula_count, v_stage, v_promotion_debug;
  END IF;

  IF EXISTS (
    SELECT observation.gtin
    FROM pg_temp.reviewed_package_partition partition
    JOIN public.catalog_observations observation
      ON observation.id = partition.observation_id
    WHERE partition.disposition = 'source_version_gtin_conflict'
      AND EXISTS (
        SELECT 1
        FROM public.resolve_verified_product_by_gtin(observation.gtin, 8)
      )
  ) THEN
    RAISE EXCEPTION
      'A reused retailer GTIN resolved despite formula-version conflict';
  END IF;

  IF EXISTS (
    SELECT observation.gtin
    FROM pg_temp.reviewed_package_partition partition
    JOIN public.catalog_observations observation
      ON observation.id = partition.observation_id
    WHERE partition.disposition = 'source_version_safe'
      AND (
        SELECT count(*)
        FROM public.resolve_verified_product_by_gtin(observation.gtin, 8)
        WHERE nutritional_info->>'formula_evidence_tier' =
          'retailer_web_version'
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'A version-safe retailer GTIN did not resolve its exact source version';
  END IF;

  IF EXISTS (
    SELECT observation.gtin
    FROM pg_temp.reviewed_package_partition partition
    JOIN public.catalog_observations observation
      ON observation.id = partition.observation_id
    WHERE partition.disposition = 'manufacturer_current_equal'
      AND (
        SELECT count(*)
        FROM public.resolve_verified_product_by_gtin(observation.gtin, 8)
        WHERE cache_key = partition.current_cache_key
          AND nutritional_info->>'formula_evidence_tier' IN (
            'manufacturer_current_exact',
            'retailer_web_version',
            'web_label_version'
          )
      ) <> 1
  ) THEN
    RAISE EXCEPTION
      'An equivalent retailer GTIN did not prefer its existing verified formula';
  END IF;

  RETURN jsonb_build_object(
    'review_run_key', p_review_run_key,
    'accepted_run_key', p_accepted_run_key,
    'reviewed_observation_count', p_expected_observation_count,
    'reviewed_formula_count', p_expected_formula_count,
    'manufacturer_current_equal_package_count', v_current_count,
    'source_version_safe_package_count', v_safe_count,
    'source_version_gtin_conflict_package_count', v_conflict_count,
    'source_version_formula_count', v_source_formula_count,
    'promoted_source_version_formula_count', v_promoted_count
  );
END
$$;

REVOKE ALL ON FUNCTION public.promote_reviewed_retailer_package_batch(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_reviewed_retailer_package_batch(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.promote_reviewed_retailer_package_batch(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_reviewed_retailer_package_batch(
  TEXT, TEXT, TEXT, INTEGER, INTEGER, TEXT
) TO service_role;
