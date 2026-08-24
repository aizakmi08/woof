-- The current Purina page dropped "entree" from its URL and reformatted the
-- same Salmon & Rice ingredient statement (flattened mineral grouping and
-- "water sufficient for processing"). Refresh the active canonical serving
-- row from that current exact manufacturer page instead of treating the URL
-- change as a missing formula or a second product.

DO $$
DECLARE
  v_canonical CONSTANT TEXT :=
    'manufacturer-reviewed-wave-z-20260725:038100026972';
  v_current_evidence CONSTANT TEXT :=
    'nestle-purina-pro-plan:038100026972';
  v_current_url CONSTANT TEXT :=
    'https://www.purina.com/cats/shop/pro-plan-complete-essentials-salmon-rice-sauce-wet-cat-food';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data canonical
    JOIN public.product_data evidence
      ON evidence.cache_key = v_current_evidence
    WHERE canonical.cache_key = v_canonical
      AND canonical.gtin = '038100026972'
      AND evidence.gtin = canonical.gtin
      AND canonical.pet_type = 'cat'
      AND evidence.pet_type = canonical.pet_type
      AND canonical.food_form = 'wet'
      AND evidence.food_form = canonical.food_form
      AND canonical.product_name = evidence.product_name
      AND canonical.catalog_exclusion_reason IS NULL
      AND evidence.catalog_exclusion_reason = 'duplicate_exact_verified_catalog_row'
      AND evidence.source_url = v_current_url
      AND encode(digest(canonical.ingredient_text, 'sha256'), 'hex') =
          'ae4100ad97412622cfd9c3cb6339473789c6250521fa1b29aa291f984e8a72cb'
      AND encode(digest(evidence.ingredient_text, 'sha256'), 'hex') =
          'abb5803e488e56eb8f9b65dc1df50e71d48855ff6c1f486e5b701a162122ed79'
      AND cardinality(canonical.ingredients) = 28
      AND cardinality(evidence.ingredients) = 33
      AND evidence.ingredients @> ARRAY[
        'Water Sufficient for Processing',
        'Salmon',
        'Potassium Chloride',
        'Zinc Sulfate',
        'Ferrous Sulfate',
        'Manganese Sulfate',
        'Copper Sulfate',
        'Potassium Iodide',
        'Taurine'
      ]::TEXT[]
  ) THEN
    RAISE EXCEPTION 'Purina Salmon & Rice current-version precondition failed';
  END IF;

  UPDATE public.product_data canonical
  SET
    product_name = evidence.product_name,
    brand = evidence.brand,
    ingredients = evidence.ingredients,
    ingredient_text = evidence.ingredient_text,
    ingredient_count = evidence.ingredient_count,
    nutrient_panel = evidence.nutrient_panel,
    has_published_nutrients = evidence.has_published_nutrients,
    image_url = evidence.image_url,
    source = 'nestle-purina-pro-plan',
    source_quality = 'manufacturer',
    source_url = evidence.source_url,
    product_line = evidence.product_line,
    flavor = evidence.flavor,
    life_stage = 'adult',
    food_form = 'wet',
    pet_type = 'cat',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    formula_evidence_tier = 'manufacturer_current_exact',
    formula_version_provenance = jsonb_build_object(
      'source', 'nestle-purina-pro-plan',
      'source_url', evidence.source_url,
      'captured_at', '2026-08-03T06:22:48.591Z'::TIMESTAMPTZ,
      'package_gtin', canonical.gtin,
      'identity_reconciliation', 'official_url_and_formatting_refresh',
      'ingredient_text_hash', encode(digest(evidence.ingredient_text, 'sha256'), 'hex')
    ),
    is_complete_food = TRUE,
    catalog_exclusion_reason = NULL,
    verified_at = '2026-08-03T06:22:48.591Z'::TIMESTAMPTZ,
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '365 days',
    updated_at = NOW()
  FROM public.product_data evidence
  WHERE canonical.cache_key = v_canonical
    AND evidence.cache_key = v_current_evidence;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_canonical
      AND source_url = v_current_url
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND ingredient_count = 33
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Purina Salmon & Rice canonical current refresh failed';
  END IF;

  IF (
    SELECT cache_key
    FROM public.search_verified_products(
      'Purina Pro Plan Complete Essentials Salmon Rice Entree in Sauce Wet Cat Food',
      1
    )
  ) IS DISTINCT FROM v_canonical THEN
    RAISE EXCEPTION 'Purina Salmon & Rice exact search did not select current canonical formula';
  END IF;
END;
$$;
