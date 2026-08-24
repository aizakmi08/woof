-- Lawful multi-path acquisition tracking plus explicit user consent for
-- first-party ingredient evidence. User evidence remains manual-review-only.

CREATE TABLE IF NOT EXISTS public.catalog_source_health (
  source_key TEXT PRIMARY KEY,
  source_owner TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'manufacturer',
      'retailer',
      'gdsn',
      'barcode_identity',
      'user_evidence'
    )
  ),
  access_mode TEXT NOT NULL CHECK (
    access_mode IN (
      'public_official',
      'public_structured',
      'authorized_api',
      'licensed_feed',
      'manual_export',
      'consented_submission',
      'discovery_only'
    )
  ),
  health_status TEXT NOT NULL CHECK (
    health_status IN (
      'healthy',
      'degraded',
      'stale',
      'blocked_external_access',
      'credentials_required',
      'manual_authorization_required',
      'untested'
    )
  ),
  source_url TEXT,
  evidence_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  fallback_order TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  authorization_required BOOLEAN NOT NULL DEFAULT FALSE,
  authorization_requirements JSONB NOT NULL DEFAULT '{}'::JSONB,
  blocker_code TEXT,
  freshness_days INTEGER CHECK (freshness_days IS NULL OR freshness_days >= 0),
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  observed_formula_count INTEGER NOT NULL DEFAULT 0 CHECK (observed_formula_count >= 0),
  verified_formula_count INTEGER NOT NULL DEFAULT 0 CHECK (
    verified_formula_count >= 0
    AND verified_formula_count <= observed_formula_count
  ),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.catalog_brand_source_routes (
  brand_key TEXT NOT NULL,
  source_key TEXT NOT NULL
    REFERENCES public.catalog_source_health(source_key) ON DELETE CASCADE,
  route_rank INTEGER NOT NULL CHECK (route_rank > 0),
  route_status TEXT NOT NULL CHECK (
    route_status IN (
      'ready',
      'degraded',
      'blocked',
      'credentials_required',
      'manual_review_only'
    )
  ),
  evidence_roles TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  open_formula_gaps INTEGER NOT NULL DEFAULT 0 CHECK (open_formula_gaps >= 0),
  rationale TEXT NOT NULL DEFAULT '',
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (brand_key, source_key),
  UNIQUE (brand_key, route_rank)
);

CREATE TABLE IF NOT EXISTS public.catalog_release_stage_targets (
  stage_key TEXT PRIMARY KEY,
  stage_order INTEGER NOT NULL UNIQUE CHECK (stage_order > 0),
  label TEXT NOT NULL,
  minimum_verified_formula_percent NUMERIC(5,2) NOT NULL CHECK (
    minimum_verified_formula_percent BETWEEN 0 AND 100
  ),
  required_retailer_segments TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  required_safety_gates JSONB NOT NULL DEFAULT '{}'::JSONB,
  permits_external_production BOOLEAN NOT NULL DEFAULT FALSE,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.catalog_release_stage_targets (
  stage_key,
  stage_order,
  label,
  minimum_verified_formula_percent,
  required_retailer_segments,
  required_safety_gates,
  permits_external_production,
  details
)
VALUES
  (
    'internal_verified_beta',
    1,
    'Internal verified beta',
    65,
    ARRAY['official_manufacturers', 'petsmart'],
    jsonb_build_object(
      'false_exact_match_rate_max', 0.001,
      'cross_species_matches_max', 0,
      'cross_brand_line_matches_max', 0,
      'eric_automated_regressions_required', TRUE,
      'physical_device_gate_required', FALSE,
      'no_guess_promotion_required', TRUE
    ),
    FALSE,
    jsonb_build_object('purpose', 'Internal catalog and resolver validation only')
  ),
  (
    'core_retail_release_candidate',
    2,
    'Core US retail release candidate',
    75,
    ARRAY['official_manufacturers', 'petsmart', 'chewy', 'walmart', 'target'],
    jsonb_build_object(
      'false_exact_match_rate_max', 0.001,
      'cross_species_matches_max', 0,
      'cross_brand_line_matches_max', 0,
      'eric_automated_regressions_required', TRUE,
      'physical_device_gate_required', TRUE,
      'two_censuses_seven_days_apart_required', TRUE,
      'no_guess_promotion_required', TRUE
    ),
    FALSE,
    jsonb_build_object('purpose', 'Release-candidate evaluation; not production approval')
  ),
  (
    'broad_market_production',
    3,
    'Broad US market production',
    90,
    ARRAY['official_manufacturers', 'petsmart', 'petco', 'chewy', 'amazon', 'walmart', 'target'],
    jsonb_build_object(
      'false_exact_match_rate_max', 0.001,
      'cross_species_matches_max', 0,
      'cross_brand_line_matches_max', 0,
      'popular_brand_verified_percent_min', 100,
      'eric_automated_regressions_required', TRUE,
      'physical_device_gate_required', TRUE,
      'two_censuses_seven_days_apart_required', TRUE,
      'no_guess_promotion_required', TRUE
    ),
    TRUE,
    jsonb_build_object('purpose', 'Production eligibility; all safety and evidence gates remain mandatory')
  )
ON CONFLICT (stage_key) DO UPDATE
SET stage_order = EXCLUDED.stage_order,
    label = EXCLUDED.label,
    minimum_verified_formula_percent = EXCLUDED.minimum_verified_formula_percent,
    required_retailer_segments = EXCLUDED.required_retailer_segments,
    required_safety_gates = EXCLUDED.required_safety_gates,
    permits_external_production = EXCLUDED.permits_external_production,
    details = EXCLUDED.details,
    updated_at = NOW();

ALTER TABLE public.catalog_source_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_brand_source_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_release_stage_targets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_source_health FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_brand_source_routes FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.catalog_release_stage_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_source_health TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_brand_source_routes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.catalog_release_stage_targets TO service_role;

DO $$
BEGIN
  IF to_regprocedure(
    'public.submit_catalog_ingredient_capture_without_explicit_consent(text,text,text,text,text,text,text,jsonb,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.submit_catalog_ingredient_capture(
      TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
    ) RENAME TO submit_catalog_ingredient_capture_without_explicit_consent;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_ingredient_capture_without_explicit_consent(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated, service_role;

-- Compatibility endpoint for old clients: no evidence is stored without an
-- explicit consent argument.
CREATE OR REPLACE FUNCTION public.submit_catalog_ingredient_capture(
  p_product_name TEXT,
  p_brand TEXT DEFAULT NULL,
  p_pet_type TEXT DEFAULT NULL,
  p_normalized_query TEXT DEFAULT NULL,
  p_cache_key TEXT DEFAULT NULL,
  p_gtin TEXT DEFAULT NULL,
  p_ingredient_text TEXT DEFAULT NULL,
  p_ingredients JSONB DEFAULT '[]'::JSONB,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'submitted', FALSE,
    'reason', 'explicit_consent_required',
    'review_state', 'not_submitted'
  );
$$;

CREATE OR REPLACE FUNCTION public.submit_catalog_ingredient_capture(
  p_product_name TEXT,
  p_brand TEXT,
  p_pet_type TEXT,
  p_normalized_query TEXT,
  p_cache_key TEXT,
  p_gtin TEXT,
  p_ingredient_text TEXT,
  p_ingredients JSONB,
  p_metadata JSONB,
  p_user_consent BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_metadata JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '28000';
  END IF;

  IF p_user_consent IS DISTINCT FROM TRUE THEN
    RETURN jsonb_build_object(
      'submitted', FALSE,
      'reason', 'explicit_consent_required',
      'review_state', 'not_submitted'
    );
  END IF;

  v_metadata := CASE
    WHEN jsonb_typeof(COALESCE(p_metadata, '{}'::JSONB)) = 'object'
      THEN COALESCE(p_metadata, '{}'::JSONB)
    ELSE '{}'::JSONB
  END || jsonb_build_object(
    'explicit_user_consent', TRUE,
    'consent_version', 'catalog_evidence_v1',
    'consented_at', NOW()
  );

  RETURN public.submit_catalog_ingredient_capture_without_explicit_consent(
    p_product_name,
    p_brand,
    p_pet_type,
    p_normalized_query,
    p_cache_key,
    p_gtin,
    p_ingredient_text,
    p_ingredients,
    v_metadata
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_catalog_ingredient_capture(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, JSONB, BOOLEAN
) TO authenticated, service_role;
