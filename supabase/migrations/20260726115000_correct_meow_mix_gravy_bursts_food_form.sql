-- Meow Mix Gravy Bursts are dry kibble with gravy-filled pieces. Two serving
-- rows inherited a wet-food category even though their exact manufacturer
-- titles, PDPs, package images, ingredients, and GTINs identify dry food.
DO $$
DECLARE
  v_corrected_count INTEGER;
BEGIN
  IF (
    SELECT count(*)
    FROM public.product_data
    WHERE (
      cache_key = 'meow-mix:00829274414951'
      AND gtin = '00829274414951'
      AND product_name =
          'Gravy Bursts Salmon Flavor Mix with Gravy Filled Pieces'
      AND source_url =
          'https://www.meowmix.com/cat-food/gravy-bursts/gravy-bursts-salmon'
      AND encode(digest(concat_ws(
        '|', cache_key, product_name, COALESCE(gtin, ''),
        ingredient_text, image_url, source_url
      ), 'sha256'), 'hex') =
          'c110cc72d88ef3122046a304bc1581228a5f2741b35d41b01d852228ff16ab75'
    )
    OR (
      cache_key = 'meow-mix:00829274827386'
      AND gtin = '00829274827386'
      AND product_name =
          'Gravy Bursts Chicken Flavor Mix with Gravy Filled Pieces'
      AND source_url =
          'https://www.meowmix.com/cat-food/gravy-bursts/gravy-bursts-chicken'
      AND encode(digest(concat_ws(
        '|', cache_key, product_name, COALESCE(gtin, ''),
        ingredient_text, image_url, source_url
      ), 'sha256'), 'hex') =
          'a39971facf81b5ab291f42c5d8ea443a2a0df4333afb5978ea2abb26028f59fc'
    )
  ) <> 2 THEN
    RAISE EXCEPTION
      'Meow Mix Gravy Bursts prior serving evidence drifted; refusing correction';
  END IF;

  INSERT INTO public.catalog_product_evidence (
    id,
    cache_key,
    gtin,
    product_name,
    brand,
    pet_type,
    source,
    source_quality,
    source_url,
    ingredient_source_url,
    image_source_url,
    ingredient_verification_status,
    image_verification_status,
    content_hash,
    extractor_version,
    review_state,
    rejection_reason,
    evidence,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    product.cache_key,
    product.gtin,
    product.product_name,
    product.brand,
    product.pet_type,
    product.source,
    product.source_quality,
    product.source_url,
    product.source_url,
    product.source_url,
    product.ingredient_verification_status,
    product.image_verification_status,
    encode(digest(concat_ws(
      '|', product.cache_key, product.product_name,
      COALESCE(product.gtin, ''), product.ingredient_text,
      product.image_url, product.source_url
    ), 'sha256'), 'hex'),
    'reviewed-food-form-boundary-v1',
    'rejected',
    'superseded_incorrect_wet_food_form',
    jsonb_build_object(
      'prior_food_form', product.food_form,
      'corrected_food_form', 'dry',
      'official_identity_evidence',
        'Exact manufacturer title, PDP path, package image, ingredients, and GTIN',
      'formula_boundary_preserved', TRUE
    ),
    now(),
    now()
  FROM public.product_data AS product
  WHERE product.cache_key IN (
    'meow-mix:00829274414951',
    'meow-mix:00829274827386'
  )
    AND product.food_form = 'wet'
    AND NOT EXISTS (
      SELECT 1
      FROM public.catalog_product_evidence AS archived
      WHERE archived.cache_key = product.cache_key
        AND archived.rejection_reason = 'superseded_incorrect_wet_food_form'
    );

  UPDATE public.product_data
  SET
    food_form = 'dry',
    updated_at = now()
  WHERE cache_key IN (
    'meow-mix:00829274414951',
    'meow-mix:00829274827386'
  )
    AND food_form = 'wet';

  GET DIAGNOSTICS v_corrected_count = ROW_COUNT;

  IF v_corrected_count <> 2 OR EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key IN (
      'meow-mix:00829274414951',
      'meow-mix:00829274827386'
    )
      AND (
        food_form IS DISTINCT FROM 'dry'
        OR pet_type IS DISTINCT FROM 'cat'
        OR source_quality IS DISTINCT FROM 'manufacturer'
        OR ingredient_verification_status IS DISTINCT FROM 'manufacturer'
        OR image_verification_status IS DISTINCT FROM 'manufacturer'
        OR NOT is_complete_food
      )
  ) THEN
    RAISE EXCEPTION
      'Meow Mix Gravy Bursts correction incomplete: % rows updated',
      v_corrected_count;
  END IF;
END
$$;
