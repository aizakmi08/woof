-- Exact manufacturer-title aliases for the newly promoted gap formulas.
-- These aliases are formula-version specific and prevent an older Wellness
-- version or the Indoor sibling from winning an exact current-title query.

WITH exact_targets AS (
  SELECT
    formula.formula_key,
    formula.promoted_cache_key AS cache_key,
    formula.source_url,
    formula.brand,
    formula.product_name,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.flavor
  FROM public.catalog_formulas formula
  JOIN public.catalog_gap_evidence_extractions evidence
    ON evidence.promoted_formula_id = formula.id
  JOIN public.catalog_gap_evidence_extraction_runs extraction_run
    ON extraction_run.id = evidence.run_id
  WHERE extraction_run.run_key = 'major95-official-overlap-20260728'
    AND evidence.promoted_at IS NOT NULL
    AND formula.formula_evidence_tier = 'manufacturer_current_exact'
    AND formula.promoted_cache_key IS NOT NULL
),
aliases AS (
  SELECT *
  FROM (
    VALUES
      (
        'firstmate|firstmate|firstmate senior weight control formula dry dog food|dog|senior|dry||',
        'Senior Weight Control Formula'
      ),
      (
        'firstmate|firstmate|firstmate senior weight control formula dry dog food|dog|senior|dry||',
        'FirstMate Senior Weight Control Formula'
      ),
      (
        'firstmate|firstmate|firstmate senior weight control formula dry dog food|dog|senior|dry||',
        'FirstMate Senior Weight Control Formula Dry Dog Food'
      ),
      (
        'fussie cat|fussie cat|fussie cat tuna with chicken in gravy wet cat food|cat|unknown|wet||',
        'Fussie Cat Tuna With Chicken Formula in Gravy Recipe'
      ),
      (
        'wellness pet company|wellness|wellness complete health adult whitefish and sweet potato dry dog food|dog|adult|dry||',
        'Wellness Complete Health + Whitefish & Sweet Potato'
      ),
      (
        'wellness pet company|wellness|wellness complete health adult whitefish and sweet potato dry dog food|dog|adult|dry||',
        'Wellness Complete Health+ Adult Whitefish & Sweet Potato Dry Dog Food'
      ),
      (
        'wellness pet company|wellness|wellness complete health adult whitefish and sweet potato dry dog food|dog|adult|dry||',
        'Wellness Complete Health Adult Whitefish & Sweet Potato Dry Dog Food'
      ),
      (
        'wellness pet company|wellness|wellness complete health natural grain free deboned chicken and chicken meal dry cat food|cat|unknown|dry||',
        'Wellness Complete Health Deboned Chicken & Chicken Meal Grain Free'
      ),
      (
        'wellness pet company|wellness|wellness complete health natural grain free deboned chicken and chicken meal dry cat food|cat|unknown|dry||',
        'Wellness Complete Health Natural Grain-Free Deboned Chicken & Chicken Meal Dry Cat Food'
      )
  ) AS value(formula_key, alias_text)
),
normalized_aliases AS (
  SELECT DISTINCT ON (
    public.normalize_verified_product_search_query(alias.alias_text)
  )
    alias.formula_key,
    alias.alias_text,
    public.normalize_verified_product_search_query(alias.alias_text)
      AS normalized_alias
  FROM aliases alias
  ORDER BY
    public.normalize_verified_product_search_query(alias.alias_text),
    length(alias.alias_text) DESC,
    alias.alias_text
)
INSERT INTO public.catalog_verified_product_search_aliases (
  cache_key,
  alias_text,
  normalized_alias,
  source_url,
  source_authority,
  evidence_observed_at,
  provenance
)
SELECT
  target.cache_key,
  alias.alias_text,
  alias.normalized_alias,
  target.source_url,
  'manufacturer',
  NOW(),
  jsonb_build_object(
    'exact_formula_identity', TRUE,
    'formula_evidence_tier', 'manufacturer_current_exact',
    'formula_key', target.formula_key,
    'species_boundary', target.pet_type,
    'life_stage_boundary', target.life_stage,
    'food_form_boundary', target.food_form,
    'recipe_boundary', target.flavor,
    'source_run_key', 'major95-official-gap-promotion-20260728',
    'reviewed_at', '2026-07-28'
  )
FROM normalized_aliases alias
JOIN exact_targets target
  ON target.formula_key = alias.formula_key
ON CONFLICT (normalized_alias) WHERE active DO UPDATE
SET
  cache_key = EXCLUDED.cache_key,
  alias_text = EXCLUDED.alias_text,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  evidence_observed_at = EXCLUDED.evidence_observed_at,
  provenance = EXCLUDED.provenance,
  updated_at = NOW();
