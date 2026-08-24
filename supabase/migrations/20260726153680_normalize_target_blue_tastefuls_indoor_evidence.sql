-- Normalize the existing Tastefuls Indoor Chicken & Brown Rice retailer
-- version to the clean exact Target 3 lb statement. The prior PetSmart text
-- lost whitespace at several HTML boundaries, but both statements already
-- normalized to the same ordered ingredient hash. This changes transcription
-- only, not formula identity or ingredient version.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_cache_key TEXT := 'petsmart-retail-catalog:859610000876';
  v_ingredients TEXT :=
    'deboned chicken, chicken meal, fish meal (source of omega 3 fatty acids), brown rice, barley, oatmeal, peas, pea protein, chicken fat (preserved with mixed tocopherols), dried egg product, potato starch, natural flavor, pea fiber, flaxseed (source of omega 6 fatty acids), miscanthus grass, calcium sulfate, choline chloride, direct dehydrated alfalfa pellets, dl-methionine, taurine, salt, potassium chloride, potatoes, l-threonine, dried chicory root, alfalfa nutrient concentrate, calcium chloride, calcium carbonate, preserved with mixed tocopherols, cranberries, dried sweet potatoes, carrots, vegetable juice for color, ferrous sulfate, niacin (vitamin b3), iron amino acid chelate, zinc amino acid chelate, zinc sulfate, vitamin e supplement, blueberries, barley grass, parsley, turmeric, dried kelp, yucca schidigera extract, copper sulfate, thiamine mononitrate (vitamin b1), copper amino acid chelate, l-ascorbyl-2-polyphosphate (vitamin c), l-lysine, biotin (vitamin b7), vitamin a supplement, manganese sulfate, manganese amino acid chelate, pyridoxine hydrochloride (vitamin b6), calcium pantothenate (vitamin b5), riboflavin (vitamin b2), vitamin d3 supplement, vitamin b12 supplement, folic acid (vitamin b9), calcium iodate, sodium selenite, oil of rosemary';
  v_hash TEXT;
BEGIN
  v_hash := encode(
    digest(
      public.catalog_normalize_ingredient_evidence(v_ingredients),
      'sha256'
    ),
    'hex'
  );

  IF v_hash <>
      'da946523cbd39fee6d1f881c6299e5d429d25684b49d2aacdce56ca84dd7549b'
  THEN
    RAISE EXCEPTION 'Target Tastefuls clean transcription changed';
  END IF;

  SELECT id
  INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_cache_key
    AND formula_evidence_tier = 'retailer_web_version'
    AND verification_status = 'verified'
    AND active
    AND encode(
      digest(
        public.catalog_normalize_ingredient_evidence(
          COALESCE(ingredient_text, '')
        ),
        'sha256'
      ),
      'hex'
    ) = v_hash;

  UPDATE public.catalog_formulas
  SET
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'transcription_normalized', true,
        'normalization_scope',
          'PetSmart HTML whitespace loss replaced by exact Target TCIN 89608511 statement',
        'normalized_source_url',
          'https://www.target.com/p/blue-buffalo-tastefuls-adult-indoor-dry-cat-food-with-chicken-38-brown-rice-3lbs/-/A-89608511',
        'ingredient_text_hash', v_hash,
        'normalized_at', '2026-07-27T01:45:00Z'
      ),
    updated_at = now()
  WHERE id = v_formula_id;

  UPDATE public.product_data
  SET
    ingredient_text = v_ingredients,
    ingredients = public.catalog_split_ingredient_statement(v_ingredients),
    ingredient_count =
      cardinality(public.catalog_split_ingredient_statement(v_ingredients)),
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'transcription_normalized', true,
        'normalization_scope',
          'PetSmart HTML whitespace loss replaced by exact Target TCIN 89608511 statement',
        'normalized_source_url',
          'https://www.target.com/p/blue-buffalo-tastefuls-adult-indoor-dry-cat-food-with-chicken-38-brown-rice-3lbs/-/A-89608511',
        'ingredient_text_hash', v_hash,
        'normalized_at', '2026-07-27T01:45:00Z'
      ),
    updated_at = now()
  WHERE cache_key = v_cache_key;
END;
$$;
