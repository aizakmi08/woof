-- Repair two Purina Pro Plan formula-ledger rows from the exact current serving
-- evidence promoted in reviewed Wave F. The Kitten 3.5 lb product also changed
-- GTIN and ingredient formula on the same official URL. Preserve the old GTIN as
-- an inactive SKU/evidence version, but do not leave its ingredients scorable.

DO $$
DECLARE
  repaired_formulas INTEGER := 0;
  retired_serving_rows INTEGER := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-pro-plan:038100026972'
      AND gtin = '038100026972'
      AND source_url = 'https://www.purina.com/cats/shop/pro-plan-complete-essentials-salmon-rice-sauce-wet-cat-food'
      AND md5(ingredient_text) = 'b1583aff0b2dd8a1b002455e1e87702f'
      AND pet_type = 'cat'
      AND food_form = 'wet'
      AND is_complete_food IS TRUE
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Current exact Purina Pro Plan Salmon & Rice serving evidence is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = 'nestle-purina-pro-plan:038100105806'
      AND gtin = '038100105806'
      AND package_size = '3.5 lb'
      AND source_url = 'https://www.purina.com/cats/shop/pro-plan-kitten-chicken-rice-dry-cat-food'
      AND md5(ingredient_text) = '9eb98b2bf933882bf3ac2fd204390d4d'
      AND pet_type = 'cat'
      AND life_stage = 'kitten'
      AND food_form = 'dry'
      AND is_complete_food IS TRUE
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Current exact Purina Pro Plan Kitten Chicken & Rice serving evidence is missing';
  END IF;

  UPDATE public.catalog_formulas AS formula
  SET
    product_name = serving.product_name,
    product_line = serving.product_line,
    pet_type = serving.pet_type,
    life_stage = COALESCE(NULLIF(serving.life_stage, ''), 'unknown'),
    food_form = serving.food_form,
    flavor = serving.flavor,
    is_complete_food = serving.is_complete_food,
    ingredient_text = serving.ingredient_text,
    ingredients = serving.ingredients,
    front_image_url = serving.image_url,
    source_url = serving.source_url,
    source_authority = serving.source_quality,
    ingredient_verification_status = serving.ingredient_verification_status,
    image_verification_status = serving.image_verification_status,
    verification_status = 'verified',
    active = TRUE,
    last_observed_at = GREATEST(
      COALESCE(formula.last_observed_at, serving.verified_at),
      serving.verified_at
    ),
    absent_since = NULL,
    promoted_cache_key = serving.cache_key,
    promoted_at = now(),
    updated_at = now()
  FROM public.product_data AS serving
  WHERE (
      formula.id = 6366
      AND formula.formula_key = 'purina pro plan|purina pro plan|pro plan complete essentials|cat|unknown|wet|salmon and rice entree|'
      AND serving.cache_key = 'nestle-purina-pro-plan:038100026972'
      AND md5(serving.ingredient_text) = 'b1583aff0b2dd8a1b002455e1e87702f'
    )
    OR (
      formula.id = 6258
      AND formula.formula_key = 'purina pro plan|purina pro plan|complete essentials|cat|kitten|dry|chicken and rice formula|'
      AND serving.cache_key = 'nestle-purina-pro-plan:038100105806'
      AND md5(serving.ingredient_text) = '9eb98b2bf933882bf3ac2fd204390d4d'
    );

  GET DIAGNOSTICS repaired_formulas = ROW_COUNT;
  IF repaired_formulas <> 2 THEN
    RAISE EXCEPTION 'Expected to repair 2 exact Purina Pro Plan formulas, repaired %', repaired_formulas;
  END IF;

  UPDATE public.product_data
  SET
    catalog_exclusion_reason = 'superseded_formula_version',
    expires_at = LEAST(COALESCE(expires_at, now()), now()),
    updated_at = now()
  WHERE cache_key = 'nestle-purina-pro-plan:038100131706'
    AND gtin = '038100131706'
    AND package_size = '3.5 lb'
    AND source_url = 'https://www.purina.com/cats/shop/pro-plan-kitten-chicken-rice-dry-cat-food'
    AND md5(ingredient_text) = 'a00607d8992b900a5d6ac8589d9157d0'
    AND catalog_exclusion_reason IS NULL;

  GET DIAGNOSTICS retired_serving_rows = ROW_COUNT;
  IF retired_serving_rows <> 1 THEN
    RAISE EXCEPTION 'Expected to retire 1 stale Purina Pro Plan Kitten serving row, retired %', retired_serving_rows;
  END IF;

  UPDATE public.catalog_product_evidence
  SET
    review_state = 'rejected',
    rejection_reason = 'superseded_by_newer_verified_formula_version',
    evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
      'superseded_at', now(),
      'superseded_by_cache_key', 'nestle-purina-pro-plan:038100105806',
      'superseded_by_gtin', '038100105806',
      'superseded_by_ingredient_md5', '9eb98b2bf933882bf3ac2fd204390d4d'
    ),
    updated_at = now()
  WHERE cache_key = 'nestle-purina-pro-plan:038100131706'
    AND gtin = '038100131706'
    AND review_state = 'promoted';

  UPDATE public.catalog_skus
  SET
    active = TRUE,
    last_observed_at = GREATEST(
      COALESCE(last_observed_at, '2026-07-24T06:27:33.335Z'::timestamptz),
      '2026-07-24T06:27:33.335Z'::timestamptz
    ),
    updated_at = now()
  WHERE formula_id = 6258
    AND gtin = '038100105806'
    AND package_size = '3.5 lb';

  INSERT INTO public.catalog_skus (
    formula_id,
    gtin,
    package_size,
    source_slug,
    source_external_id,
    source_url,
    active,
    first_observed_at,
    last_observed_at,
    created_at,
    updated_at
  )
  VALUES (
    6258,
    '038100131706',
    '3.5 lb',
    'nestle-purina-pro-plan',
    'nestle-purina-pro-plan:038100131706',
    'https://www.purina.com/cats/shop/pro-plan-kitten-chicken-rice-dry-cat-food',
    FALSE,
    '2026-06-22T03:49:24.900Z'::timestamptz,
    '2026-06-22T03:49:24.900Z'::timestamptz,
    now(),
    now()
  )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    source_url = EXCLUDED.source_url,
    active = FALSE,
    last_observed_at = EXCLUDED.last_observed_at,
    updated_at = now();

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 6366
      AND promoted_cache_key = 'nestle-purina-pro-plan:038100026972'
      AND md5(ingredient_text) = 'b1583aff0b2dd8a1b002455e1e87702f'
      AND active IS TRUE
      AND verification_status = 'verified'
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas
    WHERE id = 6258
      AND promoted_cache_key = 'nestle-purina-pro-plan:038100105806'
      AND md5(ingredient_text) = '9eb98b2bf933882bf3ac2fd204390d4d'
      AND active IS TRUE
      AND verification_status = 'verified'
  ) THEN
    RAISE EXCEPTION 'Purina Pro Plan formula ledger did not retain both exact current versions';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = 6258
      AND gtin = '038100105806'
      AND active IS TRUE
  ) OR NOT EXISTS (
    SELECT 1
    FROM public.catalog_skus
    WHERE formula_id = 6258
      AND gtin = '038100131706'
      AND active IS FALSE
  ) THEN
    RAISE EXCEPTION 'Purina Pro Plan Kitten current/retired GTIN state is inconsistent';
  END IF;
END
$$;
