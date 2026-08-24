-- Independent US dog/cat food census and field-level catalog provenance.
-- These tables are service-owned staging infrastructure. They are deliberately
-- inaccessible to app clients and cannot weaken the verified serving contract.

CREATE TABLE public.catalog_source_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_key TEXT NOT NULL UNIQUE,
  source_slug TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (
    source_type IN ('manufacturer', 'retailer', 'gdsn', 'authorized_feed', 'gap_discovery')
  ),
  coverage_role TEXT NOT NULL CHECK (
    coverage_role IN ('denominator', 'verification', 'gap_discovery')
  ),
  status TEXT NOT NULL DEFAULT 'running' CHECK (
    status IN ('running', 'completed', 'quarantined', 'failed')
  ),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  expected_count INTEGER CHECK (expected_count IS NULL OR expected_count >= 0),
  observed_count INTEGER NOT NULL DEFAULT 0 CHECK (observed_count >= 0),
  accepted_count INTEGER NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  rejected_count INTEGER NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  pagination_complete BOOLEAN NOT NULL DEFAULT FALSE,
  source_content_hash TEXT,
  previous_run_id BIGINT REFERENCES public.catalog_source_runs(id) ON DELETE SET NULL,
  checkpoint JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    status <> 'completed'
    OR (
      finished_at IS NOT NULL
      AND pagination_complete
      AND error_summary IS NULL
    )
  )
);

CREATE INDEX catalog_source_runs_source_started_idx
  ON public.catalog_source_runs (source_slug, started_at DESC);
CREATE INDEX catalog_source_runs_completed_idx
  ON public.catalog_source_runs (source_slug, finished_at DESC)
  WHERE status = 'completed' AND pagination_complete;
CREATE INDEX catalog_source_runs_previous_run_idx
  ON public.catalog_source_runs (previous_run_id)
  WHERE previous_run_id IS NOT NULL;

CREATE TABLE public.catalog_formulas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formula_key TEXT NOT NULL UNIQUE,
  manufacturer TEXT NOT NULL,
  brand TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  pet_type TEXT NOT NULL CHECK (pet_type IN ('dog', 'cat')),
  life_stage TEXT NOT NULL DEFAULT 'unknown',
  food_form TEXT NOT NULL,
  flavor TEXT NOT NULL,
  diet_condition TEXT NOT NULL DEFAULT '',
  is_complete_food BOOLEAN NOT NULL DEFAULT TRUE,
  complete_food_evidence TEXT NOT NULL DEFAULT '',
  ingredient_text TEXT NOT NULL DEFAULT '',
  ingredients TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  front_image_url TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  source_authority TEXT NOT NULL DEFAULT 'unverified' CHECK (
    source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'unverified')
  ),
  ingredient_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    ingredient_verification_status IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified',
      'label_ocr_candidate', 'label_ocr_verified', 'unverified'
    )
  ),
  image_verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK (
    image_verification_status IN ('official', 'manufacturer', 'retailer_verified', 'unverified')
  ),
  protected_terms TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verification_status TEXT NOT NULL DEFAULT 'discovered' CHECK (
    verification_status IN ('discovered', 'validated', 'verified', 'quarantined', 'discontinued')
  ),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  is_popular_brand BOOLEAN NOT NULL DEFAULT FALSE,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  absent_since TIMESTAMPTZ,
  promoted_cache_key TEXT REFERENCES public.product_data(cache_key) ON DELETE SET NULL,
  promoted_at TIMESTAMPTZ,
  identity_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (active OR absent_since IS NOT NULL OR verification_status = 'discontinued')
);

CREATE INDEX catalog_formulas_brand_active_idx
  ON public.catalog_formulas (lower(brand), active, verification_status);
CREATE INDEX catalog_formulas_popular_gap_idx
  ON public.catalog_formulas (lower(brand), verification_status)
  WHERE active AND is_popular_brand;
CREATE INDEX catalog_formulas_promoted_cache_key_idx
  ON public.catalog_formulas (promoted_cache_key)
  WHERE promoted_cache_key IS NOT NULL;

CREATE TABLE public.catalog_skus (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formula_id BIGINT NOT NULL REFERENCES public.catalog_formulas(id) ON DELETE CASCADE,
  gtin TEXT,
  package_size TEXT NOT NULL DEFAULT '',
  package_count INTEGER CHECK (package_count IS NULL OR package_count > 0),
  source_slug TEXT NOT NULL,
  source_external_id TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (source_slug, source_external_id, gtin, package_size)
);

CREATE UNIQUE INDEX catalog_skus_active_gtin_idx
  ON public.catalog_skus (gtin)
  WHERE active AND gtin IS NOT NULL AND gtin <> '';
CREATE INDEX catalog_skus_formula_id_idx ON public.catalog_skus (formula_id);

CREATE TABLE public.catalog_observations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES public.catalog_source_runs(id) ON DELETE CASCADE,
  formula_id BIGINT REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  source_slug TEXT NOT NULL,
  source_external_id TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_authority TEXT NOT NULL CHECK (
    source_authority IN (
      'gdsn', 'official', 'manufacturer', 'retailer_verified',
      'retailer_listing', 'gap_discovery'
    )
  ),
  gtin TEXT,
  manufacturer TEXT NOT NULL DEFAULT '',
  brand TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL DEFAULT '',
  pet_type TEXT NOT NULL DEFAULT 'unknown',
  life_stage TEXT NOT NULL DEFAULT 'unknown',
  food_form TEXT NOT NULL DEFAULT '',
  flavor TEXT NOT NULL DEFAULT '',
  diet_condition TEXT NOT NULL DEFAULT '',
  package_size TEXT NOT NULL DEFAULT '',
  ingredient_text TEXT NOT NULL DEFAULT '',
  front_image_url TEXT NOT NULL DEFAULT '',
  is_complete_food BOOLEAN,
  available_in_us BOOLEAN NOT NULL DEFAULT TRUE,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT NOT NULL,
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    validation_status IN ('pending', 'accepted', 'rejected', 'quarantined')
  ),
  validation_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  raw_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, source_slug, source_external_id, content_hash)
);

CREATE INDEX catalog_observations_run_id_idx ON public.catalog_observations (run_id);
CREATE INDEX catalog_observations_formula_id_idx
  ON public.catalog_observations (formula_id)
  WHERE formula_id IS NOT NULL;
CREATE INDEX catalog_observations_source_observed_idx
  ON public.catalog_observations (source_slug, observed_at DESC);
CREATE INDEX catalog_observations_gtin_idx
  ON public.catalog_observations (gtin)
  WHERE gtin IS NOT NULL AND gtin <> '';
CREATE INDEX catalog_observations_accepted_idx
  ON public.catalog_observations (source_slug, formula_id)
  WHERE validation_status = 'accepted' AND available_in_us;

CREATE TABLE public.catalog_field_evidence (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  formula_id BIGINT NOT NULL REFERENCES public.catalog_formulas(id) ON DELETE CASCADE,
  observation_id BIGINT REFERENCES public.catalog_observations(id) ON DELETE SET NULL,
  field_name TEXT NOT NULL,
  field_value JSONB NOT NULL,
  source_url TEXT NOT NULL,
  source_authority TEXT NOT NULL CHECK (
    source_authority IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
  ),
  accepted BOOLEAN NOT NULL DEFAULT FALSE,
  observed_at TIMESTAMPTZ NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (formula_id, field_name, source_url, content_hash)
);

CREATE INDEX catalog_field_evidence_formula_id_idx
  ON public.catalog_field_evidence (formula_id);
CREATE INDEX catalog_field_evidence_accepted_idx
  ON public.catalog_field_evidence (formula_id, field_name)
  WHERE accepted;
CREATE INDEX catalog_field_evidence_observation_id_idx
  ON public.catalog_field_evidence (observation_id)
  WHERE observation_id IS NOT NULL;

CREATE TABLE public.catalog_coverage_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  snapshot_key TEXT NOT NULL UNIQUE,
  census_started_at TIMESTAMPTZ NOT NULL,
  census_completed_at TIMESTAMPTZ NOT NULL,
  source_panel TEXT[] NOT NULL,
  required_source_panel TEXT[] NOT NULL,
  completed_source_panel TEXT[] NOT NULL,
  denominator_formula_count INTEGER NOT NULL CHECK (denominator_formula_count >= 0),
  verified_formula_count INTEGER NOT NULL CHECK (verified_formula_count >= 0),
  verified_formula_percent NUMERIC(6, 2) NOT NULL CHECK (
    verified_formula_percent >= 0 AND verified_formula_percent <= 100
  ),
  popular_brand_count INTEGER NOT NULL CHECK (popular_brand_count >= 0),
  complete_popular_brand_count INTEGER NOT NULL CHECK (complete_popular_brand_count >= 0),
  popular_formula_gap_count INTEGER NOT NULL CHECK (popular_formula_gap_count >= 0),
  ingredient_verified_percent NUMERIC(6, 2) NOT NULL CHECK (
    ingredient_verified_percent >= 0 AND ingredient_verified_percent <= 100
  ),
  image_verified_percent NUMERIC(6, 2) NOT NULL CHECK (
    image_verified_percent >= 0 AND image_verified_percent <= 100
  ),
  independent_denominator BOOLEAN NOT NULL DEFAULT TRUE,
  passes_source_panel BOOLEAN NOT NULL DEFAULT FALSE,
  passes_total_coverage BOOLEAN NOT NULL DEFAULT FALSE,
  passes_popular_brands BOOLEAN NOT NULL DEFAULT FALSE,
  passes_release_gate BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (verified_formula_count <= denominator_formula_count),
  CHECK (complete_popular_brand_count <= popular_brand_count),
  CHECK (NOT passes_release_gate OR (
    independent_denominator
    AND passes_source_panel
    AND passes_total_coverage
    AND passes_popular_brands
    AND verified_formula_percent >= 90
    AND popular_formula_gap_count = 0
    AND ingredient_verified_percent = 100
    AND image_verified_percent >= 99
  ))
);

CREATE INDEX catalog_coverage_snapshots_created_idx
  ON public.catalog_coverage_snapshots (created_at DESC);
CREATE INDEX catalog_coverage_snapshots_release_idx
  ON public.catalog_coverage_snapshots (created_at DESC)
  WHERE passes_release_gate;

CREATE TABLE public.catalog_census_members (
  snapshot_id BIGINT NOT NULL REFERENCES public.catalog_coverage_snapshots(id) ON DELETE CASCADE,
  formula_id BIGINT NOT NULL REFERENCES public.catalog_formulas(id) ON DELETE CASCADE,
  denominator_sources TEXT[] NOT NULL,
  retailer_count INTEGER NOT NULL DEFAULT 0 CHECK (retailer_count >= 0),
  manufacturer_observed BOOLEAN NOT NULL DEFAULT FALSE,
  verified_scorable BOOLEAN NOT NULL DEFAULT FALSE,
  ingredient_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image_verified BOOLEAN NOT NULL DEFAULT FALSE,
  top_one_search_verified BOOLEAN NOT NULL DEFAULT FALSE,
  gap_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  PRIMARY KEY (snapshot_id, formula_id)
);

CREATE INDEX catalog_census_members_formula_id_idx
  ON public.catalog_census_members (formula_id);
CREATE INDEX catalog_census_members_snapshot_gaps_idx
  ON public.catalog_census_members (snapshot_id, verified_scorable)
  WHERE NOT verified_scorable;

ALTER TABLE public.catalog_source_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_field_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_coverage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_census_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_source_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_formulas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_skus FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_observations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_field_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_coverage_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_census_members FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_source_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_formulas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_skus TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_observations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_field_evidence TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_coverage_snapshots TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_census_members TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

CREATE OR REPLACE FUNCTION public.promote_catalog_formula(p_formula_id BIGINT)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  source_url TEXT
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_formula public.catalog_formulas%ROWTYPE;
  v_gtin TEXT;
  v_cache_key TEXT;
  v_payload JSONB;
BEGIN
  SELECT *
  INTO v_formula
  FROM public.catalog_formulas
  WHERE id = p_formula_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog formula % does not exist', p_formula_id;
  END IF;
  IF NOT v_formula.active OR v_formula.verification_status <> 'verified' THEN
    RAISE EXCEPTION 'Catalog formula % is not active and verified', p_formula_id;
  END IF;
  IF v_formula.pet_type NOT IN ('dog', 'cat')
     OR NOT v_formula.is_complete_food
     OR cardinality(v_formula.ingredients) < 5
     OR btrim(v_formula.ingredient_text) = ''
     OR btrim(v_formula.front_image_url) = ''
     OR btrim(v_formula.source_url) = ''
     OR v_formula.source_authority NOT IN ('gdsn', 'official', 'manufacturer', 'retailer_verified')
     OR v_formula.ingredient_verification_status NOT IN (
       'gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified'
     )
     OR v_formula.image_verification_status NOT IN (
       'official', 'manufacturer', 'retailer_verified'
     ) THEN
    RAISE EXCEPTION 'Catalog formula % does not satisfy serving evidence requirements', p_formula_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'ingredient_text'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_field_evidence evidence
    WHERE evidence.formula_id = p_formula_id
      AND evidence.accepted
      AND evidence.field_name = 'front_image_url'
  ) THEN
    RAISE EXCEPTION 'Catalog formula % lacks accepted field-level evidence', p_formula_id;
  END IF;

  SELECT sku.gtin
  INTO v_gtin
  FROM public.catalog_skus sku
  WHERE sku.formula_id = p_formula_id
    AND sku.active
    AND sku.gtin IS NOT NULL
    AND sku.gtin <> ''
  ORDER BY sku.last_observed_at DESC, sku.id
  LIMIT 1;

  v_cache_key := COALESCE(
    v_formula.promoted_cache_key,
    'census:' || md5(v_formula.formula_key || ':' || COALESCE(v_gtin, ''))
  );
  v_payload := jsonb_build_array(jsonb_build_object(
    'cache_key', v_cache_key,
    'product_name', v_formula.product_name,
    'brand', v_formula.brand,
    'gtin', v_gtin,
    'product_line', v_formula.product_line,
    'flavor', v_formula.flavor,
    'life_stage', v_formula.life_stage,
    'food_form', v_formula.food_form,
    'package_size', COALESCE((
      SELECT sku.package_size
      FROM public.catalog_skus sku
      WHERE sku.formula_id = p_formula_id AND sku.active
      ORDER BY sku.last_observed_at DESC, sku.id
      LIMIT 1
    ), ''),
    'pet_type', v_formula.pet_type,
    'ingredients', to_jsonb(v_formula.ingredients),
    'ingredient_text', v_formula.ingredient_text,
    'source', 'independent-census',
    'source_quality', v_formula.source_authority,
    'ingredient_verification_status', v_formula.ingredient_verification_status,
    'image_verification_status', v_formula.image_verification_status,
    'verified_at', NOW(),
    'source_url', v_formula.source_url,
    'scraped_at', NOW(),
    'expires_at', NOW() + INTERVAL '90 days',
    'image_url', v_formula.front_image_url,
    'is_complete_food', TRUE,
    'catalog_exclusion_reason', NULL,
    'updated_at', NOW()
  ));

  RETURN QUERY
  SELECT imported.cache_key, imported.product_name, imported.brand, imported.source_url
  FROM public.upsert_catalog_product_feed(v_payload) imported;

  UPDATE public.catalog_formulas
  SET promoted_cache_key = v_cache_key,
      promoted_at = NOW(),
      updated_at = NOW()
  WHERE id = p_formula_id;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM anon;
REVOKE ALL ON FUNCTION public.promote_catalog_formula(BIGINT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_catalog_formula(BIGINT) TO service_role;

CREATE VIEW public.catalog_current_coverage
WITH (security_invoker = true)
AS
SELECT snapshot.*
FROM public.catalog_coverage_snapshots snapshot
ORDER BY snapshot.created_at DESC
LIMIT 1;

REVOKE ALL ON TABLE public.catalog_current_coverage FROM PUBLIC;
REVOKE ALL ON TABLE public.catalog_current_coverage FROM anon;
REVOKE ALL ON TABLE public.catalog_current_coverage FROM authenticated;
GRANT SELECT ON TABLE public.catalog_current_coverage TO service_role;
