-- Link six exact Chewy package-version records to their current official
-- Eukanuba formulas. This is identity-only: the retailer ingredient versions
-- remain separate serving records and never overwrite manufacturer evidence.

CREATE TEMP TABLE catalog_eukanuba_version_alias_map (
  alias_formula_key TEXT PRIMARY KEY,
  retailer_title TEXT NOT NULL,
  retailer_source_url TEXT NOT NULL,
  canonical_cache_key TEXT UNIQUE NOT NULL
) ON COMMIT DROP;

INSERT INTO catalog_eukanuba_version_alias_map (
  alias_formula_key,
  retailer_title,
  retailer_source_url,
  canonical_cache_key
)
VALUES
  (
    'eukanuba|eukanuba|eukanuba adult small bites dry dog food|dog|adult|dry||',
    'Eukanuba Adult Small Bites Dry Dog Food',
    'https://www.chewy.com/eukanuba-adult-small-bites-dry-dog/dp/32466',
    'eukanuba:030111642158'
  ),
  (
    'eukanuba|eukanuba|eukanuba adult small breed dry dog food|dog|adult|dry||',
    'Eukanuba Adult Small Breed Dry Dog Food',
    'https://www.chewy.com/eukanuba-adult-small-breed-dry-dog/dp/308664',
    'eukanuba:030111804501'
  ),
  (
    'eukanuba|eukanuba|eukanuba puppy large breed dry dog food|dog|puppy|dry||',
    'Eukanuba Puppy Large Breed Dry Dog Food',
    'https://www.chewy.com/eukanuba-puppy-large-breed-dry-dog/dp/1106150',
    'eukanuba:030111639141'
  ),
  (
    'eukanuba|eukanuba|eukanuba puppy medium breed dry dog food|dog|puppy|dry||',
    'Eukanuba Puppy Medium Breed Dry Dog Food',
    'https://www.chewy.com/eukanuba-puppy-medium-breed-dry-dog/dp/308663',
    'eukanuba-current:030111704528:20260726'
  ),
  (
    'eukanuba|eukanuba|eukanuba puppy small breed dry dog food|dog|puppy|dry||',
    'Eukanuba Puppy Small Breed Dry Dog Food',
    'https://www.chewy.com/eukanuba-puppy-small-breed-dry-dog/dp/308665',
    'eukanuba:030111634146'
  ),
  (
    'eukanuba|eukanuba|eukanuba medium breed senior dry dog food chicken|dog|senior|dry|chicken|',
    'Eukanuba Senior Medium Breed Dry Dog Food',
    'https://www.chewy.com/eukanuba-senior-medium-breed-dry-dog/dp/4279446',
    'eukanuba:030111641144'
  );

DO $migration$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM catalog_eukanuba_version_alias_map mapping
  JOIN public.catalog_formulas retailer
    ON retailer.formula_key = mapping.alias_formula_key
  JOIN public.catalog_formulas canonical
    ON canonical.promoted_cache_key = mapping.canonical_cache_key
  JOIN public.catalog_verified_product_search_aliases search_alias
    ON search_alias.active
   AND search_alias.cache_key = mapping.canonical_cache_key
   AND search_alias.source_authority = 'manufacturer'
   AND search_alias.normalized_alias =
     public.normalize_verified_product_search_query(mapping.retailer_title)
  JOIN public.product_data serving
    ON serving.cache_key = mapping.canonical_cache_key
  WHERE lower(btrim(retailer.brand)) = 'eukanuba'
    AND lower(btrim(canonical.brand)) = 'eukanuba'
    AND lower(btrim(retailer.pet_type)) = 'dog'
    AND lower(btrim(canonical.pet_type)) = 'dog'
    AND lower(btrim(retailer.food_form)) = 'dry'
    AND lower(btrim(canonical.food_form)) = 'dry'
    AND lower(btrim(retailer.life_stage)) =
        lower(btrim(canonical.life_stage))
    AND serving.expires_at > now()
    AND serving.ingredient_count >= 5
    AND serving.is_complete_food
    AND serving.catalog_exclusion_reason IS NULL
    AND serving.source_quality = 'manufacturer'
    AND serving.ingredient_verification_status IN (
      'manufacturer', 'label_ocr_verified'
    )
    AND serving.image_verification_status = 'manufacturer'
    AND NULLIF(btrim(serving.source_url), '') IS NOT NULL
    AND NULLIF(btrim(serving.image_url), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.catalog_retailer_ingredient_evidence evidence
      WHERE evidence.import_run_id =
        '615c043f-c3da-4784-842e-0c766af51ab3'::UUID
        AND evidence.is_current
        AND evidence.evidence_status = 'promoted'
        AND evidence.linked_formula_id = retailer.id
        AND evidence.source_url = mapping.retailer_source_url
        AND evidence.formula_title = mapping.retailer_title
    );

  IF v_count <> 6 THEN
    RAISE EXCEPTION
      'Eukanuba formula-version preflight resolved % of 6 exact identities',
      v_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM catalog_eukanuba_version_alias_map mapping
    JOIN public.catalog_formula_aliases existing
      ON existing.alias_formula_key = mapping.alias_formula_key
    JOIN public.catalog_formulas canonical
      ON canonical.promoted_cache_key = mapping.canonical_cache_key
    WHERE existing.formula_id <> canonical.id
  ) THEN
    RAISE EXCEPTION
      'Eukanuba formula-version alias conflicts with an existing canonical identity';
  END IF;
END;
$migration$;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  mapping.alias_formula_key,
  canonical.id,
  retailer.identity_hash,
  'manual_review',
  mapping.retailer_source_url,
  jsonb_build_object(
    'source', 'coverage_92_eukanuba_formula_version_reconciliation_20260816',
    'reviewed_at', now(),
    'review_method', 'exact_retailer_title_to_active_manufacturer_identity',
    'retailer_title', mapping.retailer_title,
    'retailer_source_url', mapping.retailer_source_url,
    'official_source_url', serving.source_url,
    'official_cache_key', mapping.canonical_cache_key,
    'canonical_formula_key', canonical.formula_key,
    'species_boundary', 'dog',
    'food_form_boundary', 'dry',
    'life_stage_boundary', canonical.life_stage,
    'retailer_identity_only', true,
    'package_size_is_sku_only', true,
    'ingredient_or_image_rewrite', false,
    'current_manufacturer_preferred_for_unversioned_search', true
  )
FROM catalog_eukanuba_version_alias_map mapping
JOIN public.catalog_formulas retailer
  ON retailer.formula_key = mapping.alias_formula_key
JOIN public.catalog_formulas canonical
  ON canonical.promoted_cache_key = mapping.canonical_cache_key
JOIN public.product_data serving
  ON serving.cache_key = mapping.canonical_cache_key
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now()
WHERE public.catalog_formula_aliases.formula_id = EXCLUDED.formula_id;

DO $migration$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM catalog_eukanuba_version_alias_map mapping
  JOIN public.catalog_formula_aliases alias
    ON alias.alias_formula_key = mapping.alias_formula_key
  JOIN public.catalog_formulas canonical
    ON canonical.id = alias.formula_id
   AND canonical.promoted_cache_key = mapping.canonical_cache_key;

  IF v_count <> 6 THEN
    RAISE EXCEPTION
      'Eukanuba formula-version reconciliation committed % of 6 aliases',
      v_count;
  END IF;
END;
$migration$;
