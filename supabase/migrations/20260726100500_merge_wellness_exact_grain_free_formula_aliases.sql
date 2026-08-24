-- The complete Wellness official inventory proved that 29 current CORE/Complete
-- Health PDPs are explicitly Grain Free. Earlier ledger identities omitted
-- that formula-version term and created duplicate canonical rows on later
-- crawls. Consolidate only rows that share the exact official PDP, product
-- title, full ingredient statement, front image, species, and compatible
-- life-stage/form evidence. Historical census membership remains immutable.

CREATE TEMP TABLE wellness_grain_free_formula_merges (
  canonical_formula_id BIGINT NOT NULL,
  legacy_formula_id BIGINT PRIMARY KEY,
  canonical_formula_key TEXT NOT NULL,
  legacy_formula_key TEXT NOT NULL,
  source_url TEXT NOT NULL
) ON COMMIT DROP;

WITH canonical AS (
  SELECT DISTINCT ON (formula.source_url)
    formula.id,
    formula.source_url,
    formula.formula_key,
    formula.product_name,
    formula.pet_type,
    formula.life_stage,
    formula.food_form,
    formula.ingredient_text,
    formula.front_image_url
  FROM public.catalog_formulas formula
  WHERE formula.manufacturer = 'Wellness Pet Company'
    AND formula.brand = 'Wellness'
    AND formula.product_line ILIKE '%Grain Free%'
    AND formula.source_url LIKE
      'https://www.wellnesspetfood.com/product-catalog/%'
    AND formula.promoted_cache_key IS NOT NULL
    AND formula.verification_status = 'verified'
    AND formula.active
  ORDER BY formula.source_url, formula.updated_at DESC, formula.id DESC
)
INSERT INTO wellness_grain_free_formula_merges (
  canonical_formula_id,
  legacy_formula_id,
  canonical_formula_key,
  legacy_formula_key,
  source_url
)
SELECT
  canonical.id,
  legacy.id,
  canonical.formula_key,
  legacy.formula_key,
  canonical.source_url
FROM canonical
JOIN public.catalog_formulas legacy
  ON legacy.source_url = canonical.source_url
 AND legacy.id <> canonical.id
 AND legacy.active
WHERE regexp_replace(
        lower(canonical.product_name),
        '[^a-z0-9]',
        '',
        'g'
      ) = regexp_replace(
        lower(legacy.product_name),
        '[^a-z0-9]',
        '',
        'g'
      )
  AND regexp_replace(
        lower(canonical.ingredient_text),
        '[^a-z0-9]',
        '',
        'g'
      ) = regexp_replace(
        lower(legacy.ingredient_text),
        '[^a-z0-9]',
        '',
        'g'
      )
  AND canonical.front_image_url = legacy.front_image_url
  AND canonical.pet_type = legacy.pet_type
  AND (
    COALESCE(canonical.food_form, 'unknown') =
      COALESCE(legacy.food_form, 'unknown')
    OR COALESCE(canonical.food_form, 'unknown') = 'unknown'
    OR COALESCE(legacy.food_form, 'unknown') = 'unknown'
  )
  AND (
    COALESCE(canonical.life_stage, 'unknown') =
      COALESCE(legacy.life_stage, 'unknown')
    OR COALESCE(canonical.life_stage, 'unknown') = 'unknown'
    OR COALESCE(legacy.life_stage, 'unknown') = 'unknown'
  );

DO $$
DECLARE
  merge_count INTEGER;
  source_count INTEGER;
BEGIN
  SELECT count(*), count(DISTINCT source_url)
  INTO merge_count, source_count
  FROM wellness_grain_free_formula_merges;

  IF merge_count <> 43 OR source_count <> 29 THEN
    RAISE EXCEPTION
      'Wellness exact Grain Free merge precondition failed: merge rows %, PDPs %',
      merge_count,
      source_count;
  END IF;
END $$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  merge.legacy_formula_key,
  merge.canonical_formula_id,
  legacy.identity_hash,
  'manual_review',
  merge.source_url,
  jsonb_build_object(
    'consolidated_formula_id', merge.legacy_formula_id,
    'migration',
      '20260726100500_merge_wellness_exact_grain_free_formula_aliases',
    'identity_evidence',
      'exact official PDP, title, ingredients, image, species, and compatible form/life-stage',
    'formula_version', 'grain free'
  )
FROM wellness_grain_free_formula_merges merge
JOIN public.catalog_formulas legacy
  ON legacy.id = merge.legacy_formula_id
ON CONFLICT (alias_formula_key) DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

UPDATE public.catalog_observations observation
SET formula_id = merge.canonical_formula_id
FROM wellness_grain_free_formula_merges merge
WHERE observation.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_skus sku
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM wellness_grain_free_formula_merges merge
WHERE sku.formula_id = merge.legacy_formula_id;

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
  merge.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM wellness_grain_free_formula_merges merge
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = merge.legacy_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted;

DELETE FROM public.catalog_field_evidence evidence
USING wellness_grain_free_formula_merges merge
WHERE evidence.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = merge.canonical_formula_id,
  corrected_formula_key = merge.canonical_formula_key,
  updated_at = now()
FROM wellness_grain_free_formula_merges merge
WHERE review.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_formulas legacy
SET
  active = FALSE,
  absent_since = COALESCE(legacy.absent_since, now()),
  verification_status = 'quarantined',
  promoted_cache_key = NULL,
  promoted_at = NULL,
  updated_at = now()
FROM wellness_grain_free_formula_merges merge
WHERE legacy.id = merge.legacy_formula_id;

DO $$
DECLARE
  canonical_pdp_count INTEGER;
  active_duplicate_count INTEGER;
  alias_count INTEGER;
BEGIN
  SELECT count(DISTINCT merge.source_url)
  INTO canonical_pdp_count
  FROM wellness_grain_free_formula_merges merge
  JOIN public.catalog_formulas canonical
    ON canonical.id = merge.canonical_formula_id
  WHERE canonical.active
    AND canonical.verification_status = 'verified'
    AND canonical.promoted_cache_key IS NOT NULL
    AND canonical.product_line ILIKE '%Grain Free%';

  SELECT count(*)
  INTO active_duplicate_count
  FROM wellness_grain_free_formula_merges merge
  JOIN public.catalog_formulas legacy
    ON legacy.id = merge.legacy_formula_id
  WHERE legacy.active;

  SELECT count(*)
  INTO alias_count
  FROM wellness_grain_free_formula_merges merge
  JOIN public.catalog_formula_aliases alias
    ON alias.alias_formula_key = merge.legacy_formula_key
   AND alias.formula_id = merge.canonical_formula_id;

  IF canonical_pdp_count <> 29
      OR active_duplicate_count <> 0
      OR alias_count <> 43 THEN
    RAISE EXCEPTION
      'Wellness exact Grain Free consolidation failed: canonical PDPs %, active duplicates %, aliases %',
      canonical_pdp_count,
      active_duplicate_count,
      alias_count;
  END IF;
END $$;
