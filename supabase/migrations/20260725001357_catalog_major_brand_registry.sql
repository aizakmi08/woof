CREATE TABLE public.catalog_major_brand_registry_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key TEXT NOT NULL UNIQUE,
  methodology_version TEXT NOT NULL,
  market_scope TEXT NOT NULL DEFAULT 'US' CHECK (market_scope = 'US'),
  coverage_status TEXT NOT NULL DEFAULT 'blocked' CHECK (
    coverage_status IN ('blocked', 'ready')
  ),
  candidate_brand_count INTEGER NOT NULL CHECK (candidate_brand_count > 0),
  major_brand_count INTEGER NOT NULL CHECK (
    major_brand_count > 0 AND major_brand_count <= candidate_brand_count
  ),
  formula_count INTEGER NOT NULL DEFAULT 0 CHECK (formula_count >= 0),
  verified_formula_count INTEGER NOT NULL DEFAULT 0 CHECK (
    verified_formula_count BETWEEN 0 AND formula_count
  ),
  open_evidence_gap_count INTEGER NOT NULL DEFAULT 0 CHECK (
    open_evidence_gap_count >= 0
    AND open_evidence_gap_count = formula_count - verified_formula_count
  ),
  required_retailers TEXT[] NOT NULL,
  completed_retailers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  missing_retailers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  definition JSONB NOT NULL,
  release_gate JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (cardinality(required_retailers) > 0),
  CHECK (completed_retailers <@ required_retailers),
  CHECK (missing_retailers <@ required_retailers),
  CHECK (jsonb_typeof(definition) = 'object'),
  CHECK (jsonb_typeof(release_gate) = 'object'),
  CHECK (
    coverage_status = 'blocked'
    OR (
      cardinality(missing_retailers) = 0
      AND open_evidence_gap_count = 0
      AND COALESCE((release_gate->>'release_ready')::BOOLEAN, FALSE)
    )
  )
);

CREATE TABLE public.catalog_major_brands (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_major_brand_registry_snapshots(id) ON DELETE CASCADE,
  brand_key TEXT NOT NULL CHECK (NULLIF(btrim(brand_key), '') IS NOT NULL),
  brand TEXT NOT NULL CHECK (NULLIF(btrim(brand), '') IS NOT NULL),
  manufacturer TEXT NOT NULL DEFAULT '',
  inclusion_status TEXT NOT NULL CHECK (
    inclusion_status IN ('major', 'candidate')
  ),
  inclusion_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  species TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[] CHECK (
    species <@ ARRAY['dog', 'cat']::TEXT[]
  ),
  food_forms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  market_segments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  retailer_presence TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  retailer_count INTEGER NOT NULL DEFAULT 0 CHECK (
    retailer_count = cardinality(retailer_presence)
  ),
  official_source_present BOOLEAN NOT NULL DEFAULT FALSE,
  formula_count INTEGER NOT NULL DEFAULT 0 CHECK (formula_count >= 0),
  verified_formula_count INTEGER NOT NULL DEFAULT 0 CHECK (
    verified_formula_count BETWEEN 0 AND formula_count
  ),
  ingredient_verified_count INTEGER NOT NULL DEFAULT 0 CHECK (
    ingredient_verified_count BETWEEN 0 AND formula_count
  ),
  image_verified_count INTEGER NOT NULL DEFAULT 0 CHECK (
    image_verified_count BETWEEN 0 AND formula_count
  ),
  open_evidence_gap_count INTEGER NOT NULL DEFAULT 0 CHECK (
    open_evidence_gap_count >= 0
    AND open_evidence_gap_count = formula_count - verified_formula_count
  ),
  latest_observed_at TIMESTAMPTZ,
  freshness_status TEXT NOT NULL CHECK (
    freshness_status IN ('current', 'stale', 'missing')
  ),
  priority_score INTEGER NOT NULL DEFAULT 0 CHECK (priority_score >= 0),
  priority_tier TEXT NOT NULL CHECK (
    priority_tier IN ('acquire', 'monitor', 'watch')
  ),
  acquisition_wave INTEGER CHECK (acquisition_wave >= 3),
  source_target_slugs TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  source_target_url TEXT NOT NULL DEFAULT '',
  blockers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, brand_key),
  CHECK (
    (inclusion_status = 'major' AND cardinality(inclusion_reasons) > 0)
    OR inclusion_status = 'candidate'
  ),
  CHECK (
    (priority_tier = 'acquire' AND acquisition_wave IS NOT NULL)
    OR priority_tier <> 'acquire'
  ),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE TABLE public.catalog_major_brand_acquisition_waves (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_major_brand_registry_snapshots(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  wave_number INTEGER NOT NULL CHECK (wave_number > 0),
  item_type TEXT NOT NULL CHECK (
    item_type IN ('retailer_panel', 'brand_evidence', 'physical_validation')
  ),
  item_key TEXT NOT NULL CHECK (NULLIF(btrim(item_key), '') IS NOT NULL),
  brand_key TEXT,
  label TEXT NOT NULL CHECK (NULLIF(btrim(label), '') IS NOT NULL),
  formula_count INTEGER NOT NULL DEFAULT 0 CHECK (formula_count >= 0),
  gap_count INTEGER NOT NULL DEFAULT 0 CHECK (
    gap_count >= 0 AND gap_count <= formula_count
  ),
  priority_score INTEGER NOT NULL DEFAULT 0 CHECK (priority_score >= 0),
  status TEXT NOT NULL CHECK (
    status IN (
      'pending',
      'in_progress',
      'needs_source',
      'blocked_external_access',
      'completed'
    )
  ),
  required_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  dependencies TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rationale TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, sequence),
  UNIQUE (snapshot_id, item_key),
  CHECK (
    (item_type = 'brand_evidence' AND brand_key IS NOT NULL)
    OR (item_type <> 'brand_evidence' AND brand_key IS NULL)
  ),
  CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX catalog_major_brands_priority_idx
  ON public.catalog_major_brands (
    snapshot_id,
    inclusion_status,
    priority_tier,
    acquisition_wave,
    priority_score DESC
  );

CREATE INDEX catalog_major_brands_retailer_presence_idx
  ON public.catalog_major_brands USING GIN (retailer_presence);

CREATE INDEX catalog_major_brands_market_segments_idx
  ON public.catalog_major_brands USING GIN (market_segments);

CREATE INDEX catalog_major_brand_waves_status_idx
  ON public.catalog_major_brand_acquisition_waves (
    snapshot_id,
    status,
    wave_number,
    sequence
  );

ALTER TABLE public.catalog_major_brand_registry_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_major_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_major_brand_acquisition_waves ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_major_brand_registry_snapshots
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_major_brands
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_major_brand_acquisition_waves
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_major_brand_registry_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_major_brands TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_major_brand_acquisition_waves TO service_role;

GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_major_brand_registry_snapshots_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_major_brands_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_major_brand_acquisition_waves_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.record_catalog_major_brand_registry(
  p_snapshot JSONB,
  p_brands JSONB,
  p_waves JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_brand_count INTEGER;
  v_major_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_snapshot, '{}'::JSONB)) <> 'object'
    OR jsonb_typeof(COALESCE(p_brands, '[]'::JSONB)) <> 'array'
    OR jsonb_typeof(COALESCE(p_waves, '[]'::JSONB)) <> 'array'
  THEN
    RAISE EXCEPTION 'Major-brand registry payload types are invalid';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE row.inclusion_status = 'major')
  INTO v_brand_count, v_major_count
  FROM jsonb_to_recordset(p_brands) AS row(
    brand_key TEXT,
    inclusion_status TEXT
  );

  IF v_brand_count <> (p_snapshot->>'candidate_brand_count')::INTEGER
    OR v_major_count <> (p_snapshot->>'major_brand_count')::INTEGER
  THEN
    RAISE EXCEPTION 'Major-brand snapshot counts do not match registry rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_brands) AS row(
      brand_key TEXT,
      inclusion_status TEXT
    )
    WHERE row.brand_key = 'open farm'
      AND row.inclusion_status = 'major'
  ) THEN
    RAISE EXCEPTION 'Open Farm must remain in the major-brand registry';
  END IF;

  INSERT INTO public.catalog_major_brand_registry_snapshots (
    snapshot_key,
    methodology_version,
    market_scope,
    coverage_status,
    candidate_brand_count,
    major_brand_count,
    formula_count,
    verified_formula_count,
    open_evidence_gap_count,
    required_retailers,
    completed_retailers,
    missing_retailers,
    definition,
    release_gate,
    generated_at,
    metadata
  )
  VALUES (
    p_snapshot->>'snapshot_key',
    p_snapshot->>'methodology_version',
    'US',
    p_snapshot->>'coverage_status',
    (p_snapshot->>'candidate_brand_count')::INTEGER,
    (p_snapshot->>'major_brand_count')::INTEGER,
    (p_snapshot->>'formula_count')::INTEGER,
    (p_snapshot->>'verified_formula_count')::INTEGER,
    (p_snapshot->>'open_evidence_gap_count')::INTEGER,
    ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'required_retailers')),
    ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'completed_retailers')),
    ARRAY(SELECT jsonb_array_elements_text(p_snapshot->'missing_retailers')),
    p_snapshot->'definition',
    p_snapshot->'release_gate',
    (p_snapshot->>'generated_at')::TIMESTAMPTZ,
    COALESCE(p_snapshot->'metadata', '{}'::JSONB)
  )
  ON CONFLICT (snapshot_key) DO UPDATE SET
    methodology_version = EXCLUDED.methodology_version,
    coverage_status = EXCLUDED.coverage_status,
    candidate_brand_count = EXCLUDED.candidate_brand_count,
    major_brand_count = EXCLUDED.major_brand_count,
    formula_count = EXCLUDED.formula_count,
    verified_formula_count = EXCLUDED.verified_formula_count,
    open_evidence_gap_count = EXCLUDED.open_evidence_gap_count,
    required_retailers = EXCLUDED.required_retailers,
    completed_retailers = EXCLUDED.completed_retailers,
    missing_retailers = EXCLUDED.missing_retailers,
    definition = EXCLUDED.definition,
    release_gate = EXCLUDED.release_gate,
    generated_at = EXCLUDED.generated_at,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.catalog_major_brand_acquisition_waves
  WHERE snapshot_id = v_snapshot_id;
  DELETE FROM public.catalog_major_brands
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO public.catalog_major_brands (
    snapshot_id,
    brand_key,
    brand,
    manufacturer,
    inclusion_status,
    inclusion_reasons,
    species,
    food_forms,
    market_segments,
    retailer_presence,
    retailer_count,
    official_source_present,
    formula_count,
    verified_formula_count,
    ingredient_verified_count,
    image_verified_count,
    open_evidence_gap_count,
    latest_observed_at,
    freshness_status,
    priority_score,
    priority_tier,
    acquisition_wave,
    source_target_slugs,
    source_target_url,
    blockers,
    details
  )
  SELECT
    v_snapshot_id,
    row.brand_key,
    row.brand,
    COALESCE(row.manufacturer, ''),
    row.inclusion_status,
    COALESCE(row.inclusion_reasons, ARRAY[]::TEXT[]),
    COALESCE(row.species, ARRAY[]::TEXT[]),
    COALESCE(row.food_forms, ARRAY[]::TEXT[]),
    COALESCE(row.market_segments, ARRAY[]::TEXT[]),
    COALESCE(row.retailer_presence, ARRAY[]::TEXT[]),
    row.retailer_count,
    row.official_source_present,
    row.formula_count,
    row.verified_formula_count,
    row.ingredient_verified_count,
    row.image_verified_count,
    row.open_evidence_gap_count,
    row.latest_observed_at,
    row.freshness_status,
    row.priority_score,
    row.priority_tier,
    row.acquisition_wave,
    COALESCE(row.source_target_slugs, ARRAY[]::TEXT[]),
    COALESCE(row.source_target_url, ''),
    COALESCE(row.blockers, ARRAY[]::TEXT[]),
    COALESCE(row.details, '{}'::JSONB)
  FROM jsonb_to_recordset(p_brands) AS row(
    brand_key TEXT,
    brand TEXT,
    manufacturer TEXT,
    inclusion_status TEXT,
    inclusion_reasons TEXT[],
    species TEXT[],
    food_forms TEXT[],
    market_segments TEXT[],
    retailer_presence TEXT[],
    retailer_count INTEGER,
    official_source_present BOOLEAN,
    formula_count INTEGER,
    verified_formula_count INTEGER,
    ingredient_verified_count INTEGER,
    image_verified_count INTEGER,
    open_evidence_gap_count INTEGER,
    latest_observed_at TIMESTAMPTZ,
    freshness_status TEXT,
    priority_score INTEGER,
    priority_tier TEXT,
    acquisition_wave INTEGER,
    source_target_slugs TEXT[],
    source_target_url TEXT,
    blockers TEXT[],
    details JSONB
  );

  INSERT INTO public.catalog_major_brand_acquisition_waves (
    snapshot_id,
    sequence,
    wave_number,
    item_type,
    item_key,
    brand_key,
    label,
    formula_count,
    gap_count,
    priority_score,
    status,
    required_sources,
    dependencies,
    rationale,
    details
  )
  SELECT
    v_snapshot_id,
    row.sequence,
    row.wave_number,
    row.item_type,
    row.item_key,
    row.brand_key,
    row.label,
    row.formula_count,
    row.gap_count,
    row.priority_score,
    row.status,
    COALESCE(row.required_sources, ARRAY[]::TEXT[]),
    COALESCE(row.dependencies, ARRAY[]::TEXT[]),
    COALESCE(row.rationale, ''),
    COALESCE(row.details, '{}'::JSONB)
  FROM jsonb_to_recordset(p_waves) AS row(
    sequence INTEGER,
    wave_number INTEGER,
    item_type TEXT,
    item_key TEXT,
    brand_key TEXT,
    label TEXT,
    formula_count INTEGER,
    gap_count INTEGER,
    priority_score INTEGER,
    status TEXT,
    required_sources TEXT[],
    dependencies TEXT[],
    rationale TEXT,
    details JSONB
  );

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_major_brand_registry(
  JSONB,
  JSONB,
  JSONB
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_catalog_major_brand_registry(
  JSONB,
  JSONB,
  JSONB
) TO service_role;
