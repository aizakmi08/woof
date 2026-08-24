-- Make independent census ingestion idempotent at the source-identity level,
-- persist transparent market-coverage dimensions, and turn every genuine
-- lookup miss/census gap into a durable acquisition item.
--
-- This migration deliberately does not promote a formula or copy ingredients
-- between sibling products. Exact verified evidence remains mandatory.

CREATE TABLE IF NOT EXISTS public.catalog_formula_aliases (
  alias_formula_key TEXT PRIMARY KEY,
  formula_id BIGINT NOT NULL REFERENCES public.catalog_formulas(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  match_reason TEXT NOT NULL CHECK (
    match_reason IN ('same_source_identity', 'exact_gtin', 'manual_review')
  ),
  source_url TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS catalog_formula_aliases_formula_idx
  ON public.catalog_formula_aliases (formula_id);
CREATE INDEX IF NOT EXISTS catalog_formula_aliases_identity_idx
  ON public.catalog_formula_aliases (identity_hash);

CREATE TABLE IF NOT EXISTS public.catalog_formula_identity_conflicts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_hash TEXT NOT NULL,
  canonical_formula_id BIGINT REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  conflicting_formula_id BIGINT REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  incoming_formula_key TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  conflict_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  incoming_identity JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'reviewed', 'resolved', 'dismissed')
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (
    identity_hash,
    canonical_formula_id,
    conflicting_formula_id,
    incoming_formula_key
  )
);

CREATE INDEX IF NOT EXISTS catalog_formula_identity_conflicts_status_idx
  ON public.catalog_formula_identity_conflicts (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.catalog_census_unresolved_members (
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_coverage_snapshots(id) ON DELETE CASCADE,
  formula_key TEXT NOT NULL,
  identity_hash TEXT NOT NULL DEFAULT '',
  gap_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, formula_key)
);

CREATE INDEX IF NOT EXISTS catalog_census_unresolved_identity_idx
  ON public.catalog_census_unresolved_members (identity_hash)
  WHERE identity_hash <> '';

CREATE TABLE IF NOT EXISTS public.catalog_coverage_dimensions (
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_coverage_snapshots(id) ON DELETE CASCADE,
  dimension_type TEXT NOT NULL CHECK (
    dimension_type IN (
      'retailer',
      'brand',
      'pet_type',
      'food_form',
      'retailer_pet_type',
      'retailer_food_form'
    )
  ),
  dimension_key TEXT NOT NULL,
  dimension_label TEXT NOT NULL,
  formula_count INTEGER NOT NULL CHECK (formula_count >= 0),
  verified_formula_count INTEGER NOT NULL CHECK (verified_formula_count >= 0),
  ingredient_verified_count INTEGER NOT NULL CHECK (ingredient_verified_count >= 0),
  image_verified_count INTEGER NOT NULL CHECK (image_verified_count >= 0),
  gap_count INTEGER NOT NULL CHECK (gap_count >= 0),
  verified_formula_percent NUMERIC(6, 2) NOT NULL CHECK (
    verified_formula_percent >= 0 AND verified_formula_percent <= 100
  ),
  source_available BOOLEAN NOT NULL DEFAULT TRUE,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, dimension_type, dimension_key),
  CHECK (verified_formula_count <= formula_count),
  CHECK (ingredient_verified_count <= formula_count),
  CHECK (image_verified_count <= formula_count),
  CHECK (gap_count <= formula_count)
);

CREATE INDEX IF NOT EXISTS catalog_coverage_dimensions_type_gap_idx
  ON public.catalog_coverage_dimensions (
    snapshot_id,
    dimension_type,
    gap_count DESC
  );

ALTER TABLE public.catalog_formula_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_formula_identity_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_census_unresolved_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_coverage_dimensions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_formula_aliases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_formula_identity_conflicts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_census_unresolved_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_coverage_dimensions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_formula_aliases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_formula_identity_conflicts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_census_unresolved_members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_coverage_dimensions TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_formula_identity_conflicts_id_seq TO service_role;

-- The active catalog contained repeated rows created from the same exact raw
-- retailer title/source identity under both an older parsed key and a newer
-- canonical key. Consolidate only groups with the same normalized brand,
-- species, and full product title. Hard conflicts are preserved for review.
CREATE TEMP TABLE catalog_formula_duplicate_plan ON COMMIT DROP AS
WITH duplicate_groups AS (
  SELECT
    identity_hash,
    count(*) AS row_count,
    count(DISTINCT regexp_replace(lower(brand), '[^a-z0-9]+', '', 'g')) AS brand_count,
    count(DISTINCT pet_type) AS pet_count,
    count(DISTINCT regexp_replace(lower(product_name), '[^a-z0-9]+', '', 'g')) AS name_count
  FROM public.catalog_formulas
  WHERE active
    AND identity_hash <> ''
  GROUP BY identity_hash
  HAVING count(*) > 1
),
ranked AS (
  SELECT
    formula.id,
    formula.identity_hash,
    formula.formula_key,
    formula.source_url,
    duplicate_groups.brand_count = 1
      AND duplicate_groups.pet_count = 1
      AND duplicate_groups.name_count = 1 AS safely_mergeable,
    first_value(formula.id) OVER (
      PARTITION BY formula.identity_hash
      ORDER BY
        (formula.promoted_cache_key IS NOT NULL) DESC,
        CASE formula.verification_status
          WHEN 'verified' THEN 5
          WHEN 'validated' THEN 4
          WHEN 'discovered' THEN 3
          WHEN 'quarantined' THEN 1
          ELSE 0
        END DESC,
        CASE formula.source_authority
          WHEN 'gdsn' THEN 5
          WHEN 'official' THEN 4
          WHEN 'manufacturer' THEN 3
          WHEN 'retailer_verified' THEN 2
          ELSE 0
        END DESC,
        (formula.ingredient_text <> '') DESC,
        (formula.front_image_url <> '') DESC,
        cardinality(formula.protected_terms) DESC,
        formula.updated_at DESC,
        formula.id DESC
    ) AS canonical_formula_id
  FROM public.catalog_formulas formula
  JOIN duplicate_groups USING (identity_hash)
)
SELECT *
FROM ranked;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  duplicate.formula_key,
  duplicate.canonical_formula_id,
  duplicate.identity_hash,
  'same_source_identity',
  duplicate.source_url,
  jsonb_build_object(
    'consolidated_formula_id', duplicate.id,
    'migration', 'catalog_release_durability'
  )
FROM catalog_formula_duplicate_plan duplicate
WHERE duplicate.id <> duplicate.canonical_formula_id
  AND duplicate.safely_mergeable
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = NOW();

INSERT INTO public.catalog_formula_identity_conflicts (
  identity_hash,
  canonical_formula_id,
  conflicting_formula_id,
  incoming_formula_key,
  source_url,
  conflict_reasons,
  incoming_identity
)
SELECT
  duplicate.identity_hash,
  duplicate.canonical_formula_id,
  duplicate.id,
  duplicate.formula_key,
  duplicate.source_url,
  ARRAY['same_identity_hash_hard_identity_conflict']::TEXT[],
  jsonb_build_object(
    'formula_id', formula.id,
    'brand', formula.brand,
    'product_name', formula.product_name,
    'pet_type', formula.pet_type,
    'life_stage', formula.life_stage,
    'food_form', formula.food_form,
    'flavor', formula.flavor,
    'diet_condition', formula.diet_condition
  )
FROM catalog_formula_duplicate_plan duplicate
JOIN public.catalog_formulas formula ON formula.id = duplicate.id
WHERE duplicate.id <> duplicate.canonical_formula_id
  AND NOT duplicate.safely_mergeable
ON CONFLICT (
  identity_hash,
  canonical_formula_id,
  conflicting_formula_id,
  incoming_formula_key
) DO UPDATE
SET
  conflict_reasons = EXCLUDED.conflict_reasons,
  incoming_identity = EXCLUDED.incoming_identity,
  updated_at = NOW();

UPDATE public.catalog_observations observation
SET formula_id = duplicate.canonical_formula_id
FROM catalog_formula_duplicate_plan duplicate
WHERE duplicate.safely_mergeable
  AND duplicate.id <> duplicate.canonical_formula_id
  AND observation.formula_id = duplicate.id;

UPDATE public.catalog_skus sku
SET
  formula_id = duplicate.canonical_formula_id,
  updated_at = NOW()
FROM catalog_formula_duplicate_plan duplicate
WHERE duplicate.safely_mergeable
  AND duplicate.id <> duplicate.canonical_formula_id
  AND sku.formula_id = duplicate.id;

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash
)
SELECT
  duplicate.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM catalog_formula_duplicate_plan duplicate
JOIN public.catalog_field_evidence evidence ON evidence.formula_id = duplicate.id
WHERE duplicate.safely_mergeable
  AND duplicate.id <> duplicate.canonical_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
SET accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted;

DELETE FROM public.catalog_field_evidence evidence
USING catalog_formula_duplicate_plan duplicate
WHERE duplicate.safely_mergeable
  AND duplicate.id <> duplicate.canonical_formula_id
  AND evidence.formula_id = duplicate.id;

UPDATE public.catalog_formulas formula
SET
  active = FALSE,
  absent_since = COALESCE(formula.absent_since, NOW()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = NOW()
FROM catalog_formula_duplicate_plan duplicate
WHERE duplicate.id <> duplicate.canonical_formula_id
  AND duplicate.safely_mergeable
  AND formula.id = duplicate.id;

-- A hard-identity collision is not a duplicate. Keep that formula active and
-- give it a collision-safe staging hash so it remains visible for evidence
-- review without defeating the active identity uniqueness guard.
UPDATE public.catalog_formulas formula
SET
  identity_hash = formula.identity_hash || ':conflict:' || formula.id::TEXT,
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = NOW()
FROM catalog_formula_duplicate_plan duplicate
WHERE duplicate.id <> duplicate.canonical_formula_id
  AND NOT duplicate.safely_mergeable
  AND formula.id = duplicate.id;

CREATE UNIQUE INDEX IF NOT EXISTS catalog_formulas_active_identity_hash_idx
  ON public.catalog_formulas (identity_hash)
  WHERE active AND identity_hash <> '';

-- Preserve the original staging implementation behind a guarded wrapper.
ALTER FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  RENAME TO stage_catalog_census_batch_without_identity_resolution;

CREATE OR REPLACE FUNCTION public.stage_catalog_census_batch(
  p_run JSONB,
  p_observations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
  v_normalized JSONB := '[]'::JSONB;
  v_existing public.catalog_formulas%ROWTYPE;
  v_formula_key TEXT;
  v_identity_hash TEXT;
  v_compatible BOOLEAN;
  v_reasons JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_observations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_observations must be a JSON array';
  END IF;

  FOR v_item IN
    SELECT item.value
    FROM jsonb_array_elements(COALESCE(p_observations, '[]'::JSONB))
      WITH ORDINALITY item(value, ordinal)
    ORDER BY item.ordinal
  LOOP
    v_formula_key := COALESCE(v_item->>'formula_key', '');
    v_identity_hash := COALESCE(v_item->>'identity_hash', '');
    v_existing := NULL;

    IF v_identity_hash <> '' THEN
      SELECT formula.*
      INTO v_existing
      FROM public.catalog_formulas formula
      WHERE formula.active
        AND formula.identity_hash = v_identity_hash
      ORDER BY
        (formula.promoted_cache_key IS NOT NULL) DESC,
        (formula.verification_status = 'verified') DESC,
        formula.updated_at DESC,
        formula.id DESC
      LIMIT 1;
    END IF;

    IF v_existing.id IS NOT NULL
      AND v_existing.formula_key <> v_formula_key
    THEN
      v_compatible := (
        regexp_replace(lower(v_existing.brand), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(COALESCE(v_item->>'brand', '')), '[^a-z0-9]+', '', 'g')
        AND v_existing.pet_type = COALESCE(v_item->>'pet_type', '')
        AND regexp_replace(lower(v_existing.product_name), '[^a-z0-9]+', '', 'g')
          = regexp_replace(lower(COALESCE(v_item->>'product_name', '')), '[^a-z0-9]+', '', 'g')
      );

      IF v_compatible THEN
        INSERT INTO public.catalog_formula_aliases (
          alias_formula_key,
          formula_id,
          identity_hash,
          match_reason,
          source_url,
          metadata
        )
        VALUES (
          v_formula_key,
          v_existing.id,
          v_identity_hash,
          'same_source_identity',
          COALESCE(v_item->>'source_url', ''),
          jsonb_build_object(
            'source_slug', COALESCE(v_item->>'source_slug', ''),
            'resolved_at_stage', TRUE
          )
        )
        ON CONFLICT (alias_formula_key) DO UPDATE
        SET
          formula_id = EXCLUDED.formula_id,
          identity_hash = EXCLUDED.identity_hash,
          source_url = EXCLUDED.source_url,
          metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
          updated_at = NOW();

        v_item := jsonb_set(
          v_item,
          '{formula_key}',
          to_jsonb(v_existing.formula_key),
          TRUE
        );
      ELSE
        INSERT INTO public.catalog_formula_identity_conflicts (
          identity_hash,
          canonical_formula_id,
          incoming_formula_key,
          source_url,
          conflict_reasons,
          incoming_identity
        )
        VALUES (
          v_identity_hash,
          v_existing.id,
          v_formula_key,
          COALESCE(v_item->>'source_url', ''),
          ARRAY['same_identity_hash_hard_identity_conflict']::TEXT[],
          jsonb_build_object(
            'brand', COALESCE(v_item->>'brand', ''),
            'product_name', COALESCE(v_item->>'product_name', ''),
            'pet_type', COALESCE(v_item->>'pet_type', ''),
            'life_stage', COALESCE(v_item->>'life_stage', ''),
            'food_form', COALESCE(v_item->>'food_form', ''),
            'flavor', COALESCE(v_item->>'flavor', ''),
            'diet_condition', COALESCE(v_item->>'diet_condition', '')
          )
        )
        ON CONFLICT (
          identity_hash,
          canonical_formula_id,
          conflicting_formula_id,
          incoming_formula_key
        ) DO UPDATE
        SET
          source_url = EXCLUDED.source_url,
          conflict_reasons = EXCLUDED.conflict_reasons,
          incoming_identity = EXCLUDED.incoming_identity,
          updated_at = NOW();

        v_reasons := COALESCE(v_item->'validation_reasons', '[]'::JSONB);
        IF jsonb_typeof(v_reasons) <> 'array' THEN
          v_reasons := '[]'::JSONB;
        END IF;
        v_item := v_item || jsonb_build_object(
          'formula_key', '',
          'validation_status', 'quarantined',
          'validation_reasons',
          v_reasons || jsonb_build_array('identity_hash_hard_conflict')
        );
      END IF;
    END IF;

    v_normalized := v_normalized || jsonb_build_array(v_item);
  END LOOP;

  RETURN public.stage_catalog_census_batch_without_identity_resolution(
    p_run,
    v_normalized
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.stage_catalog_census_batch_without_identity_resolution(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.stage_catalog_census_batch_without_identity_resolution(JSONB, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_batch(JSONB, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.stage_catalog_census_members(
  p_snapshot_key TEXT,
  p_members JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_member_count INTEGER := 0;
  v_unresolved_count INTEGER := 0;
  v_queued_count INTEGER := 0;
BEGIN
  IF jsonb_typeof(COALESCE(p_members, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'p_members must be a JSON array';
  END IF;

  SELECT snapshot.id
  INTO v_snapshot_id
  FROM public.catalog_coverage_snapshots snapshot
  WHERE snapshot.snapshot_key = p_snapshot_key;

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Coverage snapshot % does not exist', p_snapshot_key;
  END IF;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_members, '[]'::JSONB)) AS member(
      formula_key TEXT,
      identity_hash TEXT,
      brand TEXT,
      product_name TEXT,
      pet_type TEXT,
      source_url TEXT,
      sources JSONB,
      retailer_sources JSONB,
      retailer_count INTEGER,
      gtins JSONB,
      verified_scorable BOOLEAN,
      verified_cache_key TEXT,
      ingredient_verified BOOLEAN,
      image_verified BOOLEAN,
      top_one_search_verified BOOLEAN,
      is_popular_brand BOOLEAN,
      gap_reasons JSONB
    )
  ),
  resolved AS (
    SELECT
      incoming.*,
      COALESCE(alias_formula.id, formula.id) AS formula_id
    FROM incoming
    LEFT JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.formula_key
      AND formula.active
    LEFT JOIN public.catalog_formula_aliases alias
      ON alias.alias_formula_key = incoming.formula_key
    LEFT JOIN public.catalog_formulas alias_formula
      ON alias_formula.id = alias.formula_id
  ),
  upserted AS (
    INSERT INTO public.catalog_census_members (
      snapshot_id,
      formula_id,
      denominator_sources,
      retailer_count,
      manufacturer_observed,
      verified_scorable,
      ingredient_verified,
      image_verified,
      top_one_search_verified,
      gap_reasons
    )
    SELECT
      v_snapshot_id,
      resolved.formula_id,
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(COALESCE(resolved.sources, '[]'::JSONB))
          source(value)
      ),
      GREATEST(COALESCE(resolved.retailer_count, 0), 0),
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(resolved.sources, '[]'::JSONB))
          source(value)
        WHERE value !~* '(retail|sitemap|petsmart|petco|chewy|walmart|target|amazon)'
      ),
      COALESCE(resolved.verified_scorable, FALSE),
      COALESCE(resolved.ingredient_verified, FALSE),
      COALESCE(resolved.image_verified, FALSE),
      COALESCE(resolved.top_one_search_verified, FALSE),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(COALESCE(resolved.gap_reasons, '[]'::JSONB))
          reason(value)
      )
    FROM resolved
    WHERE resolved.formula_id IS NOT NULL
    ON CONFLICT (snapshot_id, formula_id) DO UPDATE
    SET
      denominator_sources = EXCLUDED.denominator_sources,
      retailer_count = EXCLUDED.retailer_count,
      manufacturer_observed = EXCLUDED.manufacturer_observed,
      verified_scorable = EXCLUDED.verified_scorable,
      ingredient_verified = EXCLUDED.ingredient_verified,
      image_verified = EXCLUDED.image_verified,
      top_one_search_verified = EXCLUDED.top_one_search_verified,
      gap_reasons = EXCLUDED.gap_reasons
    RETURNING formula_id
  )
  SELECT count(*)::INTEGER INTO v_member_count FROM upserted;

  WITH incoming AS (
    SELECT member
    FROM jsonb_array_elements(COALESCE(p_members, '[]'::JSONB)) member
  ),
  unresolved AS (
    SELECT incoming.member
    FROM incoming
    LEFT JOIN public.catalog_formulas formula
      ON formula.formula_key = incoming.member->>'formula_key'
      AND formula.active
    LEFT JOIN public.catalog_formula_aliases alias
      ON alias.alias_formula_key = incoming.member->>'formula_key'
    WHERE formula.id IS NULL
      AND alias.formula_id IS NULL
  ),
  upserted AS (
    INSERT INTO public.catalog_census_unresolved_members (
      snapshot_id,
      formula_key,
      identity_hash,
      gap_reasons,
      payload,
      updated_at
    )
    SELECT
      v_snapshot_id,
      unresolved.member->>'formula_key',
      COALESCE(unresolved.member->>'identity_hash', ''),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(
          COALESCE(unresolved.member->'gap_reasons', '[]'::JSONB)
        ) reason(value)
      ),
      unresolved.member,
      NOW()
    FROM unresolved
    WHERE COALESCE(unresolved.member->>'formula_key', '') <> ''
    ON CONFLICT (snapshot_id, formula_key) DO UPDATE
    SET
      identity_hash = EXCLUDED.identity_hash,
      gap_reasons = EXCLUDED.gap_reasons,
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING formula_key
  )
  SELECT count(*)::INTEGER INTO v_unresolved_count FROM upserted;

  WITH incoming AS (
    SELECT *
    FROM jsonb_to_recordset(COALESCE(p_members, '[]'::JSONB)) AS member(
      formula_key TEXT,
      identity_hash TEXT,
      brand TEXT,
      product_name TEXT,
      pet_type TEXT,
      source_url TEXT,
      sources JSONB,
      retailer_sources JSONB,
      retailer_count INTEGER,
      gtins JSONB,
      verified_scorable BOOLEAN,
      verified_cache_key TEXT,
      ingredient_verified BOOLEAN,
      image_verified BOOLEAN,
      top_one_search_verified BOOLEAN,
      is_popular_brand BOOLEAN,
      gap_reasons JSONB
    )
  ),
  queued AS (
    INSERT INTO public.catalog_acquisition_queue (
      gap_key,
      gap_type,
      status,
      priority_score,
      brand,
      product_name,
      cache_key,
      normalized_query,
      pet_type,
      product_source,
      source_quality,
      source_url,
      needs_product_record,
      needs_verified_ingredients,
      needs_verified_image,
      needs_pet_type,
      ready_rows,
      affected_product_count,
      demand_events,
      sample_metadata,
      last_refreshed_at,
      updated_at
    )
    SELECT
      'census:' || md5(COALESCE(NULLIF(incoming.identity_hash, ''), incoming.formula_key)),
      'product',
      CASE WHEN COALESCE(incoming.is_popular_brand, FALSE) THEN 'open' ELSE 'deferred' END,
      (
        CASE WHEN COALESCE(incoming.is_popular_brand, FALSE) THEN 40 ELSE 10 END
        + LEAST(GREATEST(COALESCE(incoming.retailer_count, 0), 0), 6) * 5
        + CASE WHEN NOT COALESCE(incoming.ingredient_verified, FALSE) THEN 8 ELSE 0 END
        + CASE WHEN NOT COALESCE(incoming.image_verified, FALSE) THEN 5 ELSE 0 END
        + CASE WHEN NOT COALESCE(incoming.top_one_search_verified, FALSE) THEN 3 ELSE 0 END
      )::INTEGER,
      NULLIF(incoming.brand, ''),
      NULLIF(incoming.product_name, ''),
      NULLIF(incoming.verified_cache_key, ''),
      lower(trim(concat_ws(' ', incoming.brand, incoming.product_name))),
      NULLIF(incoming.pet_type, ''),
      'independent_census',
      'gap_discovery',
      NULLIF(incoming.source_url, ''),
      TRUE,
      NOT COALESCE(incoming.ingredient_verified, FALSE),
      NOT COALESCE(incoming.image_verified, FALSE),
      COALESCE(incoming.pet_type NOT IN ('dog', 'cat'), TRUE),
      0,
      1,
      0,
      jsonb_build_object(
        'snapshot_key', p_snapshot_key,
        'formula_key', incoming.formula_key,
        'identity_hash', incoming.identity_hash,
        'sources', COALESCE(incoming.sources, '[]'::JSONB),
        'retailer_sources', COALESCE(incoming.retailer_sources, '[]'::JSONB),
        'retailer_count', COALESCE(incoming.retailer_count, 0),
        'gtins', COALESCE(incoming.gtins, '[]'::JSONB),
        'gap_reasons', COALESCE(incoming.gap_reasons, '[]'::JSONB),
        'is_popular_brand', COALESCE(incoming.is_popular_brand, FALSE),
        'independent_census', TRUE
      ),
      NOW(),
      NOW()
    FROM incoming
    WHERE NOT COALESCE(incoming.verified_scorable, FALSE)
      AND COALESCE(NULLIF(incoming.identity_hash, ''), incoming.formula_key) IS NOT NULL
    ON CONFLICT (gap_key) DO UPDATE
    SET
      status = CASE
        WHEN public.catalog_acquisition_queue.status IN ('blocked', 'in_progress')
          THEN public.catalog_acquisition_queue.status
        WHEN EXCLUDED.status = 'open' THEN 'open'
        ELSE 'deferred'
      END,
      priority_score = GREATEST(
        public.catalog_acquisition_queue.priority_score,
        EXCLUDED.priority_score
      ),
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      cache_key = EXCLUDED.cache_key,
      normalized_query = EXCLUDED.normalized_query,
      pet_type = EXCLUDED.pet_type,
      product_source = EXCLUDED.product_source,
      source_quality = EXCLUDED.source_quality,
      source_url = EXCLUDED.source_url,
      needs_product_record = EXCLUDED.needs_product_record,
      needs_verified_ingredients = EXCLUDED.needs_verified_ingredients,
      needs_verified_image = EXCLUDED.needs_verified_image,
      needs_pet_type = EXCLUDED.needs_pet_type,
      affected_product_count = EXCLUDED.affected_product_count,
      sample_metadata = public.catalog_acquisition_queue.sample_metadata || EXCLUDED.sample_metadata,
      last_refreshed_at = NOW(),
      updated_at = NOW()
    RETURNING gap_key
  )
  SELECT count(*)::INTEGER INTO v_queued_count FROM queued;

  RETURN jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'staged_members', v_member_count,
    'unresolved_members', v_unresolved_count,
    'queued_gaps', v_queued_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_catalog_census_members(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_members(TEXT, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_catalog_coverage_breakdown(
  p_snapshot_key TEXT,
  p_breakdown JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_rows INTEGER := 0;
BEGIN
  SELECT snapshot.id
  INTO v_snapshot_id
  FROM public.catalog_coverage_snapshots snapshot
  WHERE snapshot.snapshot_key = p_snapshot_key;

  IF v_snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Coverage snapshot % does not exist', p_snapshot_key;
  END IF;

  WITH dimensions AS (
    SELECT 'retailer'::TEXT AS dimension_type, value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_retailer', '[]'::JSONB))
    UNION ALL
    SELECT 'brand', value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_brand', '[]'::JSONB))
    UNION ALL
    SELECT 'pet_type', value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_pet_type', '[]'::JSONB))
    UNION ALL
    SELECT 'food_form', value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_food_form', '[]'::JSONB))
    UNION ALL
    SELECT 'retailer_pet_type', value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_retailer_pet_type', '[]'::JSONB))
    UNION ALL
    SELECT 'retailer_food_form', value
    FROM jsonb_array_elements(COALESCE(p_breakdown->'by_retailer_food_form', '[]'::JSONB))
  ),
  upserted AS (
    INSERT INTO public.catalog_coverage_dimensions (
      snapshot_id,
      dimension_type,
      dimension_key,
      dimension_label,
      formula_count,
      verified_formula_count,
      ingredient_verified_count,
      image_verified_count,
      gap_count,
      verified_formula_percent,
      source_available,
      details,
      updated_at
    )
    SELECT
      v_snapshot_id,
      dimensions.dimension_type,
      dimensions.value->>'key',
      COALESCE(NULLIF(dimensions.value->>'label', ''), dimensions.value->>'key'),
      COALESCE((dimensions.value->>'formula_count')::INTEGER, 0),
      COALESCE((dimensions.value->>'verified_formula_count')::INTEGER, 0),
      COALESCE((dimensions.value->>'ingredient_verified_count')::INTEGER, 0),
      COALESCE((dimensions.value->>'image_verified_count')::INTEGER, 0),
      COALESCE((dimensions.value->>'gap_count')::INTEGER, 0),
      COALESCE((dimensions.value->>'verified_formula_percent')::NUMERIC, 0),
      COALESCE((dimensions.value->>'source_available')::BOOLEAN, TRUE),
      dimensions.value,
      NOW()
    FROM dimensions
    WHERE COALESCE(dimensions.value->>'key', '') <> ''
    ON CONFLICT (snapshot_id, dimension_type, dimension_key) DO UPDATE
    SET
      dimension_label = EXCLUDED.dimension_label,
      formula_count = EXCLUDED.formula_count,
      verified_formula_count = EXCLUDED.verified_formula_count,
      ingredient_verified_count = EXCLUDED.ingredient_verified_count,
      image_verified_count = EXCLUDED.image_verified_count,
      gap_count = EXCLUDED.gap_count,
      verified_formula_percent = EXCLUDED.verified_formula_percent,
      source_available = EXCLUDED.source_available,
      details = EXCLUDED.details,
      updated_at = NOW()
    RETURNING dimension_key
  )
  SELECT count(*)::INTEGER INTO v_rows FROM upserted;

  RETURN jsonb_build_object(
    'snapshot_id', v_snapshot_id,
    'dimension_rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_coverage_breakdown(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_coverage_breakdown(TEXT, JSONB)
  TO service_role;

-- Queue genuine catalog misses immediately. Provider/network failures remain
-- telemetry only; they are not evidence that a formula is missing.
CREATE OR REPLACE FUNCTION public.enqueue_catalog_lookup_miss()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT;
  v_gap_key TEXT;
  v_priority INTEGER;
BEGIN
  IF NEW.event_name <> 'catalog_lookup_miss' THEN
    RETURN NEW;
  END IF;

  v_query := lower(trim(left(COALESCE(NEW.metadata->>'normalized_query', ''), 140)));
  IF v_query = '' OR v_query = '[blank]' THEN
    RETURN NEW;
  END IF;

  v_gap_key := 'lookup:' || md5(v_query);
  v_priority := 30
    + CASE
        WHEN COALESCE(NEW.metadata->>'source', '') LIKE 'label_scan%' THEN 10
        ELSE 0
      END
    + CASE
        WHEN COALESCE(NEW.metadata->>'resolution_decision', '') IN (
          'recognizers_disagree', 'no_exact_variant', 'ambiguous_same_line'
        ) THEN 10
        ELSE 0
      END;

  INSERT INTO public.catalog_acquisition_queue (
    gap_key,
    gap_type,
    status,
    priority_score,
    brand,
    product_name,
    cache_key,
    normalized_query,
    pet_type,
    product_source,
    source_quality,
    needs_product_record,
    needs_verified_ingredients,
    needs_verified_image,
    needs_pet_type,
    ready_rows,
    affected_product_count,
    demand_events,
    last_event_at,
    sample_metadata,
    last_refreshed_at,
    updated_at
  )
  VALUES (
    v_gap_key,
    'lookup',
    'open',
    v_priority,
    NULLIF(NEW.metadata->>'top_brand', ''),
    NULLIF(NEW.metadata->>'top_product_name', ''),
    NULLIF(NEW.metadata->>'top_cache_key', ''),
    v_query,
    NULLIF(COALESCE(NEW.metadata->>'label_pet_type', NEW.metadata->>'top_pet_type'), ''),
    'runtime_lookup_miss',
    NULLIF(NEW.metadata->>'top_source_quality', ''),
    COALESCE((NEW.metadata->>'result_count')::INTEGER, 0) = 0
      OR COALESCE(NEW.metadata->>'resolution_decision', '') IN (
        'recognizers_disagree', 'no_exact_variant', 'ambiguous_same_line'
      ),
    COALESCE((NEW.metadata->>'needs_verified_ingredient_count')::INTEGER, 0) > 0,
    COALESCE((NEW.metadata->>'needs_verified_image_count')::INTEGER, 0) > 0,
    COALESCE((NEW.metadata->>'unknown_pet_type_count')::INTEGER, 0) > 0,
    0,
    GREATEST(COALESCE((NEW.metadata->>'product_gap_count')::INTEGER, 0), 1),
    1,
    NEW.created_at,
    jsonb_build_object(
      'event_id', NEW.id,
      'miss_reason', NEW.metadata->>'miss_reason',
      'resolution_decision', NEW.metadata->>'resolution_decision',
      'resolver_status', NEW.metadata->>'resolver_status',
      'recognition_path', NEW.metadata->>'recognition_path',
      'reason_codes', COALESCE(NEW.metadata->'reason_codes', '[]'::JSONB),
      'verification_gaps', COALESCE(NEW.metadata->'verification_gaps', '[]'::JSONB),
      'last_runtime_miss_at', NEW.created_at
    ),
    NOW(),
    NOW()
  )
  ON CONFLICT (gap_key) DO UPDATE
  SET
    status = CASE
      WHEN public.catalog_acquisition_queue.status IN ('blocked', 'in_progress')
        THEN public.catalog_acquisition_queue.status
      ELSE 'open'
    END,
    priority_score = GREATEST(
      public.catalog_acquisition_queue.priority_score,
      EXCLUDED.priority_score
    ) + 10,
    brand = COALESCE(EXCLUDED.brand, public.catalog_acquisition_queue.brand),
    product_name = COALESCE(
      EXCLUDED.product_name,
      public.catalog_acquisition_queue.product_name
    ),
    cache_key = COALESCE(EXCLUDED.cache_key, public.catalog_acquisition_queue.cache_key),
    pet_type = COALESCE(EXCLUDED.pet_type, public.catalog_acquisition_queue.pet_type),
    product_source = EXCLUDED.product_source,
    source_quality = COALESCE(
      EXCLUDED.source_quality,
      public.catalog_acquisition_queue.source_quality
    ),
    needs_product_record = (
      public.catalog_acquisition_queue.needs_product_record
      OR EXCLUDED.needs_product_record
    ),
    needs_verified_ingredients = (
      public.catalog_acquisition_queue.needs_verified_ingredients
      OR EXCLUDED.needs_verified_ingredients
    ),
    needs_verified_image = (
      public.catalog_acquisition_queue.needs_verified_image
      OR EXCLUDED.needs_verified_image
    ),
    needs_pet_type = (
      public.catalog_acquisition_queue.needs_pet_type
      OR EXCLUDED.needs_pet_type
    ),
    affected_product_count = GREATEST(
      public.catalog_acquisition_queue.affected_product_count,
      EXCLUDED.affected_product_count
    ),
    demand_events = public.catalog_acquisition_queue.demand_events + 1,
    last_event_at = GREATEST(
      public.catalog_acquisition_queue.last_event_at,
      EXCLUDED.last_event_at
    ),
    sample_metadata = public.catalog_acquisition_queue.sample_metadata
      || EXCLUDED.sample_metadata,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_catalog_lookup_miss_trigger
  ON public.product_events;
CREATE TRIGGER enqueue_catalog_lookup_miss_trigger
AFTER INSERT ON public.product_events
FOR EACH ROW
WHEN (NEW.event_name = 'catalog_lookup_miss')
EXECUTE FUNCTION public.enqueue_catalog_lookup_miss();

REVOKE ALL ON FUNCTION public.enqueue_catalog_lookup_miss()
  FROM PUBLIC, anon, authenticated;
