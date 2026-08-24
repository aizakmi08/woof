-- Preserve every independently observed formula identity, including identities
-- that resolve to the same canonical formula or do not yet exist in staging.
-- This keeps the reported denominator reproducible without inflating the
-- canonical catalog or discarding unresolved source evidence.

CREATE TABLE public.catalog_census_formula_members (
  snapshot_id BIGINT NOT NULL
    REFERENCES public.catalog_coverage_snapshots(id) ON DELETE CASCADE,
  formula_key TEXT NOT NULL,
  identity_hash TEXT NOT NULL DEFAULT '',
  formula_id BIGINT REFERENCES public.catalog_formulas(id) ON DELETE SET NULL,
  brand TEXT NOT NULL DEFAULT '',
  product_name TEXT NOT NULL DEFAULT '',
  pet_type TEXT NOT NULL DEFAULT 'unknown',
  denominator_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  retailer_sources TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  retailer_count INTEGER NOT NULL DEFAULT 0 CHECK (retailer_count >= 0),
  gtins TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  verified_scorable BOOLEAN NOT NULL DEFAULT FALSE,
  verified_cache_key TEXT NOT NULL DEFAULT '',
  ingredient_verified BOOLEAN NOT NULL DEFAULT FALSE,
  image_verified BOOLEAN NOT NULL DEFAULT FALSE,
  top_one_search_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_popular_brand BOOLEAN NOT NULL DEFAULT FALSE,
  gap_reasons TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, formula_key)
);

CREATE INDEX catalog_census_formula_members_formula_idx
  ON public.catalog_census_formula_members (snapshot_id, formula_id)
  WHERE formula_id IS NOT NULL;
CREATE INDEX catalog_census_formula_members_gap_idx
  ON public.catalog_census_formula_members (
    snapshot_id,
    is_popular_brand,
    verified_scorable
  )
  WHERE NOT verified_scorable;

ALTER TABLE public.catalog_census_formula_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.catalog_census_formula_members
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.catalog_census_formula_members TO service_role;

ALTER FUNCTION public.stage_catalog_census_members(TEXT, JSONB)
  RENAME TO stage_catalog_census_members_without_formula_ledger;

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
  v_ledger_count INTEGER := 0;
  v_result JSONB;
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
    SELECT member.*
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
      COALESCE(alias_formula.id, formula.id) AS resolved_formula_id
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
    INSERT INTO public.catalog_census_formula_members (
      snapshot_id,
      formula_key,
      identity_hash,
      formula_id,
      brand,
      product_name,
      pet_type,
      denominator_sources,
      retailer_sources,
      retailer_count,
      gtins,
      verified_scorable,
      verified_cache_key,
      ingredient_verified,
      image_verified,
      top_one_search_verified,
      is_popular_brand,
      gap_reasons,
      payload,
      updated_at
    )
    SELECT
      v_snapshot_id,
      incoming.formula_key,
      COALESCE(incoming.identity_hash, ''),
      incoming.resolved_formula_id,
      COALESCE(incoming.brand, ''),
      COALESCE(incoming.product_name, ''),
      COALESCE(NULLIF(incoming.pet_type, ''), 'unknown'),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(COALESCE(incoming.sources, '[]'::JSONB))
          source(value)
      ),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(
          COALESCE(incoming.retailer_sources, '[]'::JSONB)
        ) source(value)
      ),
      GREATEST(COALESCE(incoming.retailer_count, 0), 0),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(COALESCE(incoming.gtins, '[]'::JSONB))
          gtin(value)
      ),
      COALESCE(incoming.verified_scorable, FALSE),
      COALESCE(incoming.verified_cache_key, ''),
      COALESCE(incoming.ingredient_verified, FALSE),
      COALESCE(incoming.image_verified, FALSE),
      COALESCE(incoming.top_one_search_verified, FALSE),
      COALESCE(incoming.is_popular_brand, FALSE),
      ARRAY(
        SELECT value
        FROM jsonb_array_elements_text(
          COALESCE(incoming.gap_reasons, '[]'::JSONB)
        ) reason(value)
      ),
      to_jsonb(incoming),
      NOW()
    FROM resolved incoming
    WHERE NULLIF(incoming.formula_key, '') IS NOT NULL
    ON CONFLICT (snapshot_id, formula_key) DO UPDATE
    SET
      identity_hash = EXCLUDED.identity_hash,
      formula_id = EXCLUDED.formula_id,
      brand = EXCLUDED.brand,
      product_name = EXCLUDED.product_name,
      pet_type = EXCLUDED.pet_type,
      denominator_sources = EXCLUDED.denominator_sources,
      retailer_sources = EXCLUDED.retailer_sources,
      retailer_count = EXCLUDED.retailer_count,
      gtins = EXCLUDED.gtins,
      verified_scorable = EXCLUDED.verified_scorable,
      verified_cache_key = EXCLUDED.verified_cache_key,
      ingredient_verified = EXCLUDED.ingredient_verified,
      image_verified = EXCLUDED.image_verified,
      top_one_search_verified = EXCLUDED.top_one_search_verified,
      is_popular_brand = EXCLUDED.is_popular_brand,
      gap_reasons = EXCLUDED.gap_reasons,
      payload = EXCLUDED.payload,
      updated_at = NOW()
    RETURNING formula_key
  )
  SELECT count(*)::INTEGER INTO v_ledger_count FROM upserted;

  v_result := public.stage_catalog_census_members_without_formula_ledger(
    p_snapshot_key,
    p_members
  );

  RETURN v_result || jsonb_build_object('formula_ledger_members', v_ledger_count);
END;
$$;

REVOKE ALL ON FUNCTION
  public.stage_catalog_census_members_without_formula_ledger(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.stage_catalog_census_members_without_formula_ledger(TEXT, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION public.stage_catalog_census_members(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stage_catalog_census_members(TEXT, JSONB)
  TO service_role;
