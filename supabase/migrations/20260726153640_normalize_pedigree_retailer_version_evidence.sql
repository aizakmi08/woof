-- Normalize a transcription-only spacing difference in the Pedigree Choice
-- Cuts Beef 22 oz retailer version. Target's exact UPC page confirms
-- "thiamine mononitrate"; the older PetSmart copy stored the same label token
-- as "ThiamineMononitrate". No ingredient is added, removed, or reordered.

DO $$
DECLARE
  v_cache_key TEXT := 'petsmart-retail-catalog:023100015309';
  v_formula_id BIGINT;
  v_ingredients TEXT :=
    'water, chicken, meat by-products, wheat flour, wheat gluten, beef, added color, salt, minerals (potassium chloride, magnesium sulfate, zinc sulfate, copper proteinate, potassium iodide, manganese sulfate, sodium selenite, copper sulfate), guar gum, sodium tripolyphosphate, natural hickory smoke flavor, vitamins (choline chloride, vitamin e supplement, thiamine mononitrate, calcium pantothenate, biotin, riboflavin, vitamin a supplement, vitamin d3 supplement, vitamin b12 supplement), xanthan gum';
  v_hash TEXT;
BEGIN
  v_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_ingredients),
      'sha256'
    ),
    'hex'
  );

  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_cache_key
    AND formula_evidence_tier = 'retailer_web_version'
    AND active
    AND verification_status = 'verified';

  IF v_hash <>
    'a7967a93306deddee61994a153c342eee200b33a7ebc04bbaa23f6802af00b47'
  THEN
    RAISE EXCEPTION
      'Pedigree Choice Cuts retailer version normalized hash changed';
  END IF;

  UPDATE public.product_data
  SET
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_count =
      cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'ingredient_text_hash', v_hash,
        'transcription_normalization',
          'ThiamineMononitrate -> thiamine mononitrate',
        'normalization_evidence_url',
          'https://www.target.com/p/pedigree-choice-cuts-in-gravy-with-beef-adult-wet-dog-food-22oz/-/A-14972529',
        'normalized_at', '2026-07-26T23:59:00Z'
      ),
    updated_at = now()
  WHERE cache_key = v_cache_key;

  UPDATE public.catalog_formulas
  SET
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'ingredient_text_hash', v_hash,
        'transcription_normalization',
          'ThiamineMononitrate -> thiamine mononitrate',
        'normalization_evidence_url',
          'https://www.target.com/p/pedigree-choice-cuts-in-gravy-with-beef-adult-wet-dog-food-22oz/-/A-14972529',
        'normalized_at', '2026-07-26T23:59:00Z'
      ),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.catalog_observations
  SET
    ingredient_text = v_ingredients,
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'ingredient_text_hash', v_hash,
        'transcription_normalization',
          'ThiamineMononitrate -> thiamine mononitrate',
        'normalized_at', '2026-07-26T23:59:00Z'
      )
  WHERE formula_id = v_formula_id
    AND gtin = '023100015309';

  IF (
    SELECT count(*)
    FROM public.resolve_verified_product_by_gtin('023100015309', 8)
    WHERE cache_key = v_cache_key
      AND nutritional_info->>'formula_evidence_tier' =
        'retailer_web_version'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Normalized Pedigree retailer UPC no longer resolves exactly';
  END IF;
END;
$$;
