CREATE TABLE public.catalog_brand_ranking_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key TEXT NOT NULL UNIQUE,
  methodology_version TEXT NOT NULL,
  ranking_status TEXT NOT NULL CHECK (
    ranking_status IN ('provisional', 'verified')
  ),
  market_scope TEXT NOT NULL DEFAULT 'US' CHECK (market_scope = 'US'),
  brand_count INTEGER NOT NULL CHECK (brand_count = 50),
  score_weights JSONB NOT NULL,
  source_panel JSONB NOT NULL DEFAULT '[]'::JSONB,
  missing_required_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  passes_sales_source BOOLEAN NOT NULL DEFAULT FALSE,
  passes_retail_panel BOOLEAN NOT NULL DEFAULT FALSE,
  passes_top_50 BOOLEAN NOT NULL DEFAULT FALSE,
  generated_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    jsonb_typeof(score_weights) = 'object'
    AND COALESCE((score_weights->>'sales')::NUMERIC, 0) = 0.60
    AND COALESCE((score_weights->>'distribution')::NUMERIC, 0) = 0.25
    AND COALESCE((score_weights->>'demand')::NUMERIC, 0) = 0.15
  ),
  CHECK (jsonb_typeof(source_panel) = 'array'),
  CHECK (
    ranking_status = 'provisional'
    OR (
      passes_sales_source
      AND passes_retail_panel
      AND passes_top_50
      AND cardinality(missing_required_sources) = 0
    )
  )
);

CREATE TABLE public.catalog_brand_rankings (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_brand_ranking_snapshots(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 50),
  brand TEXT NOT NULL CHECK (NULLIF(btrim(brand), '') IS NOT NULL),
  manufacturer TEXT NOT NULL DEFAULT '',
  species TEXT[] NOT NULL CHECK (
    cardinality(species) > 0
    AND species <@ ARRAY['dog', 'cat']::TEXT[]
  ),
  sales_score NUMERIC(7, 4) CHECK (
    sales_score IS NULL OR sales_score BETWEEN 0 AND 100
  ),
  distribution_score NUMERIC(7, 4) NOT NULL CHECK (
    distribution_score BETWEEN 0 AND 100
  ),
  demand_score NUMERIC(7, 4) NOT NULL CHECK (
    demand_score BETWEEN 0 AND 100
  ),
  composite_score NUMERIC(7, 4) NOT NULL CHECK (
    composite_score BETWEEN 0 AND 100
  ),
  sales_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  distribution_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  demand_evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_target_slug TEXT NOT NULL DEFAULT '',
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
  gtin_count INTEGER NOT NULL DEFAULT 0 CHECK (gtin_count >= 0),
  coverage_status TEXT NOT NULL DEFAULT 'incomplete' CHECK (
    coverage_status IN ('complete', 'incomplete', 'blocked_external_access')
  ),
  blockers TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_id, rank)
);

CREATE UNIQUE INDEX catalog_brand_rankings_snapshot_brand_idx
  ON public.catalog_brand_rankings (snapshot_id, lower(brand));

CREATE INDEX catalog_brand_rankings_snapshot_coverage_idx
  ON public.catalog_brand_rankings (snapshot_id, coverage_status, rank);

CREATE TABLE public.catalog_brand_batch_status (
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_brand_ranking_snapshots(id) ON DELETE CASCADE,
  batch_number INTEGER NOT NULL CHECK (batch_number BETWEEN 1 AND 10),
  rank_start INTEGER NOT NULL,
  rank_end INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'blocked', 'completed')
  ),
  blocker_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, batch_number),
  CHECK (rank_start = ((batch_number - 1) * 5) + 1),
  CHECK (rank_end = batch_number * 5),
  CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR status <> 'completed'
  )
);

ALTER TABLE public.catalog_brand_ranking_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brand_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brand_batch_status ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_brand_ranking_snapshots
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_brand_rankings
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_brand_batch_status
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_brand_ranking_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_brand_rankings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_brand_batch_status TO service_role;

GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_brand_ranking_snapshots_id_seq TO service_role;
GRANT USAGE, SELECT
  ON SEQUENCE public.catalog_brand_rankings_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.record_catalog_brand_ranking_snapshot(
  p_snapshot JSONB,
  p_rankings JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_snapshot_id BIGINT;
  v_ranking_count INTEGER;
  v_distinct_brand_count INTEGER;
  v_min_rank INTEGER;
  v_max_rank INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_snapshot, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Ranking snapshot payload must be an object';
  END IF;
  IF jsonb_typeof(COALESCE(p_rankings, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Ranking rows payload must be an array';
  END IF;

  SELECT
    count(*),
    count(DISTINCT lower(btrim(row.brand))),
    min(row.rank),
    max(row.rank)
  INTO
    v_ranking_count,
    v_distinct_brand_count,
    v_min_rank,
    v_max_rank
  FROM jsonb_to_recordset(p_rankings) AS row(rank INTEGER, brand TEXT);

  IF v_ranking_count <> 50
    OR v_distinct_brand_count <> 50
    OR v_min_rank <> 1
    OR v_max_rank <> 50
  THEN
    RAISE EXCEPTION
      'Ranking must contain exactly 50 unique brands with ranks 1 through 50';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM generate_series(1, 50) expected(rank)
    LEFT JOIN jsonb_to_recordset(p_rankings) AS row(rank INTEGER)
      ON row.rank = expected.rank
    WHERE row.rank IS NULL
  ) THEN
    RAISE EXCEPTION 'Ranking contains a missing rank';
  END IF;

  INSERT INTO public.catalog_brand_ranking_snapshots (
    snapshot_key,
    methodology_version,
    ranking_status,
    market_scope,
    brand_count,
    score_weights,
    source_panel,
    missing_required_sources,
    passes_sales_source,
    passes_retail_panel,
    passes_top_50,
    generated_at,
    metadata
  )
  VALUES (
    p_snapshot->>'snapshot_key',
    p_snapshot->>'methodology_version',
    COALESCE(p_snapshot->>'ranking_status', 'provisional'),
    'US',
    50,
    p_snapshot->'score_weights',
    COALESCE(p_snapshot->'source_panel', '[]'::JSONB),
    ARRAY(
      SELECT jsonb_array_elements_text(
        COALESCE(p_snapshot->'missing_required_sources', '[]'::JSONB)
      )
    ),
    COALESCE((p_snapshot->>'passes_sales_source')::BOOLEAN, FALSE),
    COALESCE((p_snapshot->>'passes_retail_panel')::BOOLEAN, FALSE),
    TRUE,
    (p_snapshot->>'generated_at')::TIMESTAMPTZ,
    COALESCE(p_snapshot->'metadata', '{}'::JSONB)
  )
  ON CONFLICT (snapshot_key) DO UPDATE SET
    methodology_version = EXCLUDED.methodology_version,
    ranking_status = EXCLUDED.ranking_status,
    score_weights = EXCLUDED.score_weights,
    source_panel = EXCLUDED.source_panel,
    missing_required_sources = EXCLUDED.missing_required_sources,
    passes_sales_source = EXCLUDED.passes_sales_source,
    passes_retail_panel = EXCLUDED.passes_retail_panel,
    passes_top_50 = EXCLUDED.passes_top_50,
    generated_at = EXCLUDED.generated_at,
    metadata = EXCLUDED.metadata
  RETURNING id INTO v_snapshot_id;

  DELETE FROM public.catalog_brand_rankings
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO public.catalog_brand_rankings (
    snapshot_id,
    rank,
    brand,
    manufacturer,
    species,
    sales_score,
    distribution_score,
    demand_score,
    composite_score,
    sales_evidence,
    distribution_evidence,
    demand_evidence,
    source_target_slug,
    formula_count,
    verified_formula_count,
    ingredient_verified_count,
    image_verified_count,
    gtin_count,
    coverage_status,
    blockers
  )
  SELECT
    v_snapshot_id,
    row.rank,
    row.brand,
    COALESCE(row.manufacturer, ''),
    COALESCE(row.species, ARRAY[]::TEXT[]),
    row.sales_score,
    row.distribution_score,
    row.demand_score,
    row.composite_score,
    COALESCE(row.sales_evidence, '{}'::JSONB),
    COALESCE(row.distribution_evidence, '{}'::JSONB),
    COALESCE(row.demand_evidence, '{}'::JSONB),
    COALESCE(row.source_target_slug, ''),
    COALESCE(row.formula_count, 0),
    COALESCE(row.verified_formula_count, 0),
    COALESCE(row.ingredient_verified_count, 0),
    COALESCE(row.image_verified_count, 0),
    COALESCE(row.gtin_count, 0),
    COALESCE(row.coverage_status, 'incomplete'),
    COALESCE(row.blockers, ARRAY[]::TEXT[])
  FROM jsonb_to_recordset(p_rankings) AS row(
    rank INTEGER,
    brand TEXT,
    manufacturer TEXT,
    species TEXT[],
    sales_score NUMERIC,
    distribution_score NUMERIC,
    demand_score NUMERIC,
    composite_score NUMERIC,
    sales_evidence JSONB,
    distribution_evidence JSONB,
    demand_evidence JSONB,
    source_target_slug TEXT,
    formula_count INTEGER,
    verified_formula_count INTEGER,
    ingredient_verified_count INTEGER,
    image_verified_count INTEGER,
    gtin_count INTEGER,
    coverage_status TEXT,
    blockers TEXT[]
  );

  DELETE FROM public.catalog_brand_batch_status
  WHERE snapshot_id = v_snapshot_id;

  INSERT INTO public.catalog_brand_batch_status (
    snapshot_id,
    batch_number,
    rank_start,
    rank_end,
    status
  )
  SELECT
    v_snapshot_id,
    batch_number,
    ((batch_number - 1) * 5) + 1,
    batch_number * 5,
    'pending'
  FROM generate_series(1, 10) batch_number;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_catalog_brand_ranking_snapshot(JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_catalog_brand_ranking_snapshot(JSONB, JSONB)
  TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_catalog_brand_batch_status(
  p_snapshot_id BIGINT,
  p_batch_number INTEGER
)
RETURNS public.catalog_brand_batch_status
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_result public.catalog_brand_batch_status;
  v_incomplete_brands TEXT[];
  v_blocked_brands TEXT[];
BEGIN
  IF p_batch_number NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Batch number must be between 1 and 10';
  END IF;

  SELECT
    ARRAY_AGG(brand ORDER BY rank) FILTER (
      WHERE coverage_status <> 'complete'
    ),
    ARRAY_AGG(brand ORDER BY rank) FILTER (
      WHERE coverage_status = 'blocked_external_access'
    )
  INTO v_incomplete_brands, v_blocked_brands
  FROM public.catalog_brand_rankings
  WHERE snapshot_id = p_snapshot_id
    AND rank BETWEEN ((p_batch_number - 1) * 5) + 1
      AND p_batch_number * 5;

  UPDATE public.catalog_brand_batch_status
  SET
    status = CASE
      WHEN cardinality(COALESCE(v_incomplete_brands, ARRAY[]::TEXT[])) = 0
        THEN 'completed'
      WHEN cardinality(COALESCE(v_blocked_brands, ARRAY[]::TEXT[])) > 0
        THEN 'blocked'
      ELSE 'in_progress'
    END,
    blocker_reasons = COALESCE(v_blocked_brands, ARRAY[]::TEXT[]),
    started_at = COALESCE(started_at, NOW()),
    completed_at = CASE
      WHEN cardinality(COALESCE(v_incomplete_brands, ARRAY[]::TEXT[])) = 0
        THEN NOW()
      ELSE NULL
    END,
    updated_at = NOW()
  WHERE snapshot_id = p_snapshot_id
    AND batch_number = p_batch_number
  RETURNING * INTO v_result;

  IF v_result.snapshot_id IS NULL THEN
    RAISE EXCEPTION 'Ranking snapshot or batch does not exist';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_catalog_brand_batch_status(BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_catalog_brand_batch_status(BIGINT, INTEGER)
  TO service_role;
