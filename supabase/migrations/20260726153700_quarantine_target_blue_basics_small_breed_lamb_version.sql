-- Preserve an exact Target package-version lead without promoting incomplete
-- ingredient evidence. Target TCIN 76581570 / UPC 840243100088 identifies the
-- 11 lb BLUE Basics Small Breed Lamb & Potato dry dog food package, but its
-- published ingredient statement truncates "source of Vitamin C" to "source
-- of Vitamin". The statement also differs materially from manufacturer
-- current, so it must remain a quarantined source version.

DO $$
DECLARE
  v_formula_id BIGINT;
  v_current_id BIGINT;
  v_duplicate_id BIGINT;
  v_current_cache TEXT :=
    'blue-buffalo-general-mills:blue buffalo blue basics dry dog food small breed grain-free - lamb potato basics small-breed-grain-free-lamb-potato-recipe';
  v_url TEXT :=
    'https://www.target.com/p/blue-buffalo-basics-limited-ingredient-diet-grain-free-lamb-potato-recipe-small-breed-dry-dog-food/-/A-76581570';
  v_image TEXT :=
    'https://target.scene7.com/is/image/Target/GUEST_71badd8e-e239-4c84-9d14-c22aba34d7d8';
  v_ingredients TEXT :=
    'Deboned Lamb, Lamb Meal (Source of Glucosamine), Peas, Potatoes, Pea Starch, Pea Protein, Tapioca Starch, Canola Oil (Source of Omega 6 Fatty Acids), Pea Fiber, Natural Flavor, Fish Oil (Source of Omega 3 Fatty Acids), Salt, Direct Dehydrated Alfalfa Pellets, Choline Chloride, Pumpkin, Dried Chicory Root, DL-Methionine, Flaxseed, Alfalfa Nutrient Concentrate, Calcium Carbonate, Potassium Chloride, Vitamin E Supplement, Preserved with Mixed Tocopherols, L-Ascorbyl-2-Polyphosphate (Source of Vitamin ), Zinc Amino Acid Chelate, Zinc Sulfate, Vegetable Juice for Color, Ferrous Sulfate, Iron Amino Acid Chelate, Blueberries, Cranberries, Barley Grass, Parsley, Turmeric, Dried Kelp, Yucca Schidigera Extract, Niacin (Vitamin B3), Calcium Pantothenate (Vitamin B5), Copper Sulfate, L-Lysine, Biotin (Vitamin B7), Vitamin A Supplement, Copper Amino Acid Chelate, Dried Yeast, Manganese Sulfate, Dried Enterococcus Faecium Fermentation Product, Dried Lactobacillus Acidophilus Fermentation Product, Taurine, Manganese Amino Acid Chelate, Dried Aspergillus Niger Fermentation Extract, Dried Trichoderma Longibrachiatum Fermentation Extract, Dried Bacillus Subtilis Fermentation Extract, Thiamine Mononitrate (Vitamin B1), Riboflavin (Vitamin B2), Vitamin D3 Supplement, Vitamin B12 Supplement, Pyridoxine Hydrochloride (Vitamin B6), Calcium Iodate, Folic Acid (Vitamin B9), Sodium Selenite, Oil of Rosemary.';
  v_observed_at TIMESTAMPTZ := '2026-07-27T03:05:00Z';
BEGIN
  SELECT id INTO STRICT v_formula_id
  FROM public.catalog_formulas
  WHERE formula_key =
    'blue buffalo|blue buffalo|blue buffalo basics limited ingredient diet grain free lamb potato recipe small breed dry dog food|dog|unknown|dry||';

  SELECT id INTO STRICT v_current_id
  FROM public.catalog_formulas
  WHERE promoted_cache_key = v_current_cache
    AND verification_status = 'verified' AND active
    AND formula_evidence_tier = 'manufacturer_current_exact';

  SELECT formula_id INTO STRICT v_duplicate_id
  FROM public.catalog_skus
  WHERE gtin = '840243100088' AND active;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas current_formula
    JOIN public.catalog_formulas duplicate_formula
      ON duplicate_formula.id = v_duplicate_id
    WHERE current_formula.id = v_current_id
      AND duplicate_formula.pet_type = current_formula.pet_type
      AND duplicate_formula.life_stage = current_formula.life_stage
      AND duplicate_formula.food_form = current_formula.food_form
      AND encode(digest(public.catalog_normalize_ingredient_evidence(
        COALESCE(duplicate_formula.ingredient_text, '')
      ), 'sha256'), 'hex') =
          encode(digest(public.catalog_normalize_ingredient_evidence(
        COALESCE(current_formula.ingredient_text, '')
      ), 'sha256'), 'hex')
  ) THEN
    RAISE EXCEPTION 'Existing UPC formula is not manufacturer-current equivalent';
  END IF;

  UPDATE public.product_data
  SET is_complete_food = false,
      catalog_exclusion_reason = 'duplicate_alias_of_verified_formula',
      ingredient_verification_status = 'unverified',
      verified_at = NULL,
      updated_at = now()
  WHERE cache_key = 'petsmart-retail-catalog:840243100088';

  UPDATE public.catalog_skus
  SET formula_id = v_current_id, updated_at = now()
  WHERE gtin = '840243100088' AND formula_id = v_duplicate_id;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  )
  SELECT formula_key, v_current_id,
    encode(digest(formula_key, 'sha256'), 'hex'), 'manual_review',
    source_url,
    jsonb_build_object(
      'ingredient_hash_equality_verified', true,
      'package_sizes_are_sku_children', true,
      'reviewed_at', '2026-07-26'
    ), now()
  FROM public.catalog_formulas WHERE id = v_duplicate_id
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET formula_id = excluded.formula_id, identity_hash = excluded.identity_hash,
      match_reason = excluded.match_reason, source_url = excluded.source_url,
      metadata = excluded.metadata, updated_at = now();

  UPDATE public.catalog_formulas
  SET verification_status = 'quarantined', active = false,
      absent_since = COALESCE(absent_since, now()),
      promoted_cache_key = NULL, promoted_at = NULL, updated_at = now()
  WHERE id = v_duplicate_id;

  UPDATE public.catalog_formulas
  SET
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'lamb and potato',
    formula_evidence_tier = 'unverified',
    formula_version_provenance =
      COALESCE(formula_version_provenance, '{}'::JSONB) ||
      jsonb_build_object(
        'version_status', 'quarantined_incomplete_retailer_web_version',
        'source_url', v_url,
        'captured_at', v_observed_at,
        'package_gtin', '840243100088',
        'product_code', 'TCIN 76581570',
        'package_size', '11 lb',
        'front_image_url', v_image,
        'ingredient_text_hash', encode(digest(
          public.catalog_normalize_ingredient_evidence(v_ingredients),
          'sha256'
        ), 'hex'),
        'manufacturer_current_equivalence', false,
        'blocker', 'incomplete_target_transcription_source_of_vitamin',
        'promotion_allowed', false
      ),
    last_observed_at = v_observed_at,
    updated_at = now()
  WHERE id = v_formula_id
    AND verification_status <> 'verified';

  UPDATE public.catalog_observations
  SET
    formula_id = v_formula_id,
    gtin = '840243100088',
    manufacturer = 'blue buffalo',
    brand = 'blue buffalo',
    product_name =
      'Blue Buffalo Basics Skin & Stomach Care Grain Free Lamb & Potato Recipe Small Breed Dry Dog Food',
    product_line = 'BLUE Basics Skin & Stomach Care Small Breed',
    pet_type = 'dog',
    life_stage = 'adult',
    food_form = 'dry',
    flavor = 'lamb and potato',
    package_size = '11 lb',
    ingredient_text = v_ingredients,
    front_image_url = v_image,
    observed_at = v_observed_at,
    validation_status = 'quarantined',
    validation_reasons = ARRAY[
      'incomplete_ingredient_transcription',
      'distinct_from_manufacturer_current_formula',
      'requires_exact_readable_label_or_corrected_authoritative_text'
    ]::TEXT[],
    formula_evidence_tier = 'unverified',
    formula_version_provenance = jsonb_build_object(
      'version_status', 'quarantined_incomplete_retailer_web_version',
      'source_url', v_url,
      'captured_at', v_observed_at,
      'package_gtin', '840243100088',
      'product_code', 'TCIN 76581570',
      'package_size', '11 lb',
      'front_image_url', v_image,
      'ingredient_text_hash', encode(digest(
        public.catalog_normalize_ingredient_evidence(v_ingredients),
        'sha256'
      ), 'hex'),
      'manufacturer_current_equivalence', false,
      'blocker', 'incomplete_target_transcription_source_of_vitamin',
      'promotion_allowed', false
    ),
    raw_payload = COALESCE(raw_payload, '{}'::JSONB) ||
      jsonb_build_object(
        'target_tcin', '76581570',
        'target_upc', '840243100088',
        'exact_package_identity', true,
        'ingredient_statement_complete', false,
        'manual_reviewed_at', v_observed_at
      )
  WHERE source_url = v_url;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_observations
    WHERE source_url = v_url
      AND gtin = '840243100088'
      AND validation_status = 'quarantined'
      AND validation_reasons @> ARRAY[
        'incomplete_ingredient_transcription'
      ]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Target BLUE Basics quarantine record was not preserved';
  END IF;

  IF (
    SELECT cache_key
    FROM public.resolve_verified_product_by_gtin('840243100088', 8)
    LIMIT 1
  ) IS DISTINCT FROM v_current_cache THEN
    RAISE EXCEPTION 'Reused UPC must resolve manufacturer-current';
  END IF;
END
$$;
