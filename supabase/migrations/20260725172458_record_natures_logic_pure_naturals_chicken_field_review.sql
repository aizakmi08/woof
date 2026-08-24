DO $$
DECLARE
  v_formula_id BIGINT;
  v_corrected TEXT;
  v_original TEXT := 'Chicken (Source of Methionine-cycstine, Chicken Meal, Tapioca Starch, Chicken Fat (preserved with Mixed Tocopherols), Yeast Culture, Pumpkin Seed Flour, Turkey Meal, Duck Meal, Spray Dried Chicken Liver, Montmorillonite Clay, Dried Kale, Spray Dried Porcine Plasma, Dried Kelp, Dehydrated Salmon (Source of Taurine), Dried Tomato, Dried Chicory Root, Dried Carrot, Dried Apple, Dried Pumpkin, Dried Apricot, Dried Blueberry, Dried Broccoli, Dried Spinach, Dried Parsley, Dried Cranberry, Dried Artichoke, Dried Mushrooms, Dried Lactobacillus acidophilus Fermentation Product, Dried Lactobacillus casei Fermentation Product, Dried Bifidobacterium bifidum Fermentation Product, Dried Enterococcus faecium Fermentation Product, Dried Bacillus coagulans Fermentation Product, Dried Aspergillus niger Fermentation Extract, Dried Aspergillus oryzae Fermentation Extract, Dried Trichoderma longibrachiatum Fermentation Extract, Rosemary Extract';
  v_source_url TEXT := 'https://natureslogic.com/dog-products/pure-naturals-grain-free-chicken-recipe/';
  v_back_label TEXT := 'https://natureslogic.com/wp-content/uploads/2025/09/5_BACK_12-24lb-3.png';
  v_front_image TEXT := 'https://natureslogic.com/wp-content/uploads/2025/09/1_FRONT_24lb-3.png';
BEGIN
  SELECT id, ingredient_text
  INTO STRICT v_formula_id, v_corrected
  FROM public.catalog_formulas
  WHERE formula_key = 'mid america pet food|nature''s logic|pure naturals|dog|all life stages|dry|grain free chicken recipe|';

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula_id, NULL, x.field_name, to_jsonb(x.field_value), x.source_url,
    'manufacturer', true, now(),
    encode(digest(x.field_name || '|' || x.field_value || '|' || x.source_url, 'sha256'), 'hex')
  FROM (
    VALUES
      ('ingredient_text', v_corrected, v_back_label),
      ('ingredient_original_pdp_text', v_original, v_source_url),
      ('front_image_url', v_front_image, v_source_url),
      ('back_label_url', v_back_label, v_source_url),
      (
        'complete_food_evidence',
        'Complete and balanced nutrition for all life stages; comparable in nutritional adequacy to a product substantiated using AAFCO feeding tests.',
        v_back_label
      ),
      ('package_gtin', '850013992768', v_back_label)
  ) AS x(field_name, field_value, source_url)
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = true, observed_at = excluded.observed_at;

  INSERT INTO public.catalog_manual_evidence_reviews (
    review_key, target_formula_key, corrected_formula_key, brand, product_name,
    search_query, discovery_urls, authoritative_source_url,
    authoritative_source_type, expected_identity, resolved_identity,
    evidence_status, quarantine_reason, authoritative_content_hash,
    ingredient_text_hash, front_image_url_hash, observed_at, formula_id,
    promoted_cache_key, attempt_count, review_notes, ingredient_evidence_url,
    ingredient_evidence_mode, ingredient_original_text_hash,
    ingredient_corrections, updated_at
  )
  SELECT
    'manual-search:natures-logic:pure-naturals-grain-free-chicken-dog:20260725',
    f.formula_key,
    f.formula_key,
    'Nature''s Logic',
    f.product_name,
    'Nature''s Logic PURE NATURALS Grain-Free Chicken Recipe ingredients',
    jsonb_build_array(v_source_url, v_front_image, v_back_label),
    v_source_url,
    'manufacturer_label',
    jsonb_build_object(
      'brand', 'Nature''s Logic',
      'product_line', 'PURE NATURALS',
      'pet_type', 'dog',
      'life_stage', 'all life stages',
      'food_form', 'dry',
      'flavor', 'Grain-Free Chicken Recipe'
    ),
    jsonb_build_object(
      'manufacturer', f.manufacturer,
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'package_gtin', '850013992768',
      'package_size', '24 lb bag'
    ),
    'promoted',
    NULL,
    encode(digest(v_source_url || '|' || v_back_label || '|' || v_front_image, 'sha256'), 'hex'),
    encode(digest(v_corrected, 'sha256'), 'hex'),
    encode(digest(v_front_image, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Official current PDP plus exact current front/back package images reviewed. The old serving row merged Distinction and PURE NATURALS titles and mislabeled the dry formula as wet. Exact package evidence repairs line, species, form, all-life-stages adequacy, ingredients, image, and 24 lb GTIN. PDP cycstine typo and omitted close were not copied; no sibling formula supplied any ingredient.',
    v_back_label,
    'authoritative_label_transcription',
    encode(digest(v_original, 'sha256'), 'hex'),
    jsonb_build_array(
      jsonb_build_object(
        'from', 'Methionine-cycstine',
        'to', 'Methionine-cystine',
        'reason', 'exact current manufacturer package label spelling'
      ),
      jsonb_build_object(
        'from', 'Methionine-cystine, Chicken Meal',
        'to', 'Methionine-cystine), Chicken Meal',
        'reason', 'exact current manufacturer package label closes the parenthetical source declaration'
      )
    ),
    now()
  FROM public.catalog_formulas f
  WHERE f.id = v_formula_id
  ON CONFLICT (review_key) DO UPDATE
  SET
    target_formula_key = excluded.target_formula_key,
    corrected_formula_key = excluded.corrected_formula_key,
    product_name = excluded.product_name,
    authoritative_source_url = excluded.authoritative_source_url,
    authoritative_source_type = excluded.authoritative_source_type,
    expected_identity = excluded.expected_identity,
    resolved_identity = excluded.resolved_identity,
    evidence_status = 'promoted',
    quarantine_reason = NULL,
    authoritative_content_hash = excluded.authoritative_content_hash,
    ingredient_text_hash = excluded.ingredient_text_hash,
    front_image_url_hash = excluded.front_image_url_hash,
    observed_at = excluded.observed_at,
    formula_id = excluded.formula_id,
    promoted_cache_key = excluded.promoted_cache_key,
    attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
    review_notes = excluded.review_notes,
    ingredient_evidence_url = excluded.ingredient_evidence_url,
    ingredient_evidence_mode = excluded.ingredient_evidence_mode,
    ingredient_original_text_hash = excluded.ingredient_original_text_hash,
    ingredient_corrections = excluded.ingredient_corrections,
    updated_at = now();

  IF (
    SELECT count(*)
    FROM public.catalog_field_evidence
    WHERE formula_id = v_formula_id
      AND accepted
      AND source_authority = 'manufacturer'
  ) < 6 THEN
    RAISE EXCEPTION 'Nature''s Logic field evidence recording failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_manual_evidence_reviews
    WHERE review_key = 'manual-search:natures-logic:pure-naturals-grain-free-chicken-dog:20260725'
      AND evidence_status = 'promoted'
      AND ingredient_evidence_mode = 'authoritative_label_transcription'
      AND jsonb_array_length(ingredient_corrections) = 2
  ) <> 1 THEN
    RAISE EXCEPTION 'Nature''s Logic manual evidence review recording failed';
  END IF;
END
$$;
