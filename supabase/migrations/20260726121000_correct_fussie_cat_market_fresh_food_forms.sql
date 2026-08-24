-- "Market Fresh" is a Fussie Cat product-line name, not a refrigerated/fresh
-- food form. Correct seven exact current serving rows from the contaminated
-- `fresh` category to the dry/wet form stated by their official titles/PDPs.
DO $$
DECLARE
  v_corrected_count INTEGER;
BEGIN
  CREATE TEMP TABLE fussie_cat_form_corrections(
    cache_key TEXT PRIMARY KEY,
    evidence_hash TEXT NOT NULL,
    corrected_food_form TEXT NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO fussie_cat_form_corrections VALUES
    ('fussie-cat:fussie cat market fresh chicken with goat milk kitten recipe', '9ce17823b943ca7b98dbcfef299738d3858e8a3565d2976d3b1fcfc3387fa3ff', 'dry'),
    ('fussie-cat:fussie cat market fresh dry food duck recipe', '8cbeeebaf4cfabe660a12d15c942e7e0ed9b7a0f8fab14493fe0e3aae2ee3627', 'dry'),
    ('fussie-cat:fussie cat market fresh dry food tuna recipe', 'e39199aaf764a0ebf2b22e997164b6914e90f935209799b96fa9b3ca6bac0c53', 'dry'),
    ('fussie-cat:fussie cat market fresh wet food turkey guineafowl recipe', 'bdcb43d2df49189edc654b4d415f7d9cb5527712e5aee559e5203030607e391a', 'wet'),
    ('fussie-cat:fussie cat market fresh wet food lamb pork recipe', 'ba7a47ab6f5651c019ca60a216dadf86ac1ad55fd670fdd2599e59a1e54bfe46', 'wet'),
    ('fussie-cat:fussie cat market fresh wet food trout salmon recipe', '5eada40bb80f73d53334f74b88bbc2cca7a1ba921f8674f2f27c9ffa228eda68', 'wet'),
    ('fussie-cat:fussie cat market fresh dry food turkey recipe', 'be003adbb0ff83285aecbb17079b181221223c3c06e9f52e6462a93428ce11e6', 'dry');

  IF (
    SELECT count(*)
    FROM public.product_data AS product
    JOIN fussie_cat_form_corrections AS correction
      ON correction.cache_key = product.cache_key
     AND correction.evidence_hash = encode(digest(concat_ws(
       '|', product.cache_key, product.product_name, COALESCE(product.gtin, ''),
       product.ingredient_text, product.image_url, product.source_url
     ), 'sha256'), 'hex')
    WHERE product.food_form = 'fresh'
      AND product.source = 'fussie-cat'
      AND product.pet_type = 'cat'
      AND product.source_quality = 'manufacturer'
      AND product.ingredient_verification_status = 'manufacturer'
      AND product.image_verification_status = 'manufacturer'
      AND product.is_complete_food
  ) <> 7 THEN
    RAISE EXCEPTION
      'Fussie Cat Market Fresh prior serving evidence drifted';
  END IF;

  INSERT INTO public.catalog_product_evidence (
    id, cache_key, gtin, product_name, brand, pet_type, source,
    source_quality, source_url, ingredient_source_url, image_source_url,
    ingredient_verification_status, image_verification_status, content_hash,
    extractor_version, review_state, rejection_reason, evidence,
    created_at, updated_at
  )
  SELECT
    gen_random_uuid(), product.cache_key, product.gtin, product.product_name,
    product.brand, product.pet_type, product.source, product.source_quality,
    product.source_url, product.source_url, product.source_url,
    product.ingredient_verification_status, product.image_verification_status,
    correction.evidence_hash, 'reviewed-market-fresh-form-boundary-v1',
    'rejected', 'superseded_market_fresh_line_as_food_form',
    jsonb_build_object(
      'prior_food_form', product.food_form,
      'corrected_food_form', correction.corrected_food_form,
      'official_identity_evidence',
        'Exact manufacturer title, PDP, ingredients, and package image',
      'market_fresh_is_product_line', TRUE
    ),
    now(), now()
  FROM public.product_data AS product
  JOIN fussie_cat_form_corrections AS correction
    ON correction.cache_key = product.cache_key
  WHERE product.food_form = 'fresh'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_product_evidence AS archived
      WHERE archived.cache_key = product.cache_key
        AND archived.rejection_reason =
            'superseded_market_fresh_line_as_food_form'
    );

  UPDATE public.product_data AS product
  SET
    food_form = correction.corrected_food_form,
    updated_at = now()
  FROM fussie_cat_form_corrections AS correction
  WHERE product.cache_key = correction.cache_key
    AND product.food_form = 'fresh';

  GET DIAGNOSTICS v_corrected_count = ROW_COUNT;

  IF v_corrected_count <> 7 OR EXISTS (
    SELECT 1
    FROM public.product_data AS product
    JOIN fussie_cat_form_corrections AS correction
      ON correction.cache_key = product.cache_key
    WHERE product.food_form IS DISTINCT FROM correction.corrected_food_form
  ) THEN
    RAISE EXCEPTION
      'Fussie Cat Market Fresh form correction incomplete: % rows',
      v_corrected_count;
  END IF;
END
$$;
