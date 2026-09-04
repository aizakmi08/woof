DO $$
DECLARE
  v_canonical BIGINT := 31694;
  v_source_formula BIGINT := 6467;
  v_retail_formula BIGINT := 19248;
  v_legacy_formula BIGINT := 12407;
  v_cache TEXT := 'census:edd470b62284fc0c45a4f5441ccf3326';
  v_source TEXT := 'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs';
  v_front TEXT := 'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/jejdg5lizihtphmv40qi.png?v=1776774851';
BEGIN
  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE id IN (v_canonical, v_source_formula, v_retail_formula, v_legacy_formula)
  ) <> 4 THEN
    RAISE EXCEPTION 'Nulo identity graph precondition failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.catalog_formulas canonical
    JOIN public.catalog_formulas duplicate ON duplicate.id = v_source_formula
    WHERE canonical.id = v_canonical
      AND canonical.source_url = duplicate.source_url
      AND regexp_replace(lower(canonical.ingredient_text), '[^a-z0-9]+', '', 'g') =
          regexp_replace(lower(duplicate.ingredient_text), '[^a-z0-9]+', '', 'g')
      AND split_part(canonical.front_image_url, '?', 1) =
          split_part(duplicate.front_image_url, '?', 1)
  ) THEN
    RAISE EXCEPTION
      'Nulo manufacturer duplicate does not have exact current evidence equality';
  END IF;

  UPDATE public.product_data
  SET
    product_name = 'FreeStyle Limited+ Lamb Recipe for Dogs',
    product_line = 'FreeStyle Limited+',
    flavor = 'Lamb Recipe',
    pet_type = 'dog',
    life_stage = 'all life stages',
    food_form = 'dry',
    source = 'nulo-manufacturer-current',
    source_quality = 'manufacturer',
    source_url = v_source,
    image_url = v_front,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    is_complete_food = true,
    catalog_exclusion_reason = NULL,
    verified_at = now(),
    scraped_at = now(),
    expires_at = now() + interval '365 days',
    updated_at = now()
  WHERE cache_key = v_cache;

  UPDATE public.product_data
  SET
    is_complete_food = false,
    catalog_exclusion_reason = 'duplicate_exact_verified_formula_alias',
    ingredient_verification_status = 'unverified',
    image_verification_status = 'unverified',
    updated_at = now()
  WHERE cache_key =
    'nulo:nulo freestyle high-protein kibble limited lamb recipe';

  UPDATE public.catalog_observations
  SET formula_id = v_canonical
  WHERE formula_id IN (v_source_formula, v_retail_formula);

  UPDATE public.catalog_field_evidence
  SET formula_id = v_canonical
  WHERE formula_id = v_source_formula;

  UPDATE public.catalog_skus
  SET formula_id = v_canonical, updated_at = now()
  WHERE formula_id IN (v_source_formula, v_retail_formula);

  DELETE FROM public.catalog_census_members duplicate
  USING public.catalog_census_members canonical
  WHERE duplicate.formula_id = v_retail_formula
    AND canonical.formula_id = v_canonical
    AND canonical.snapshot_id = duplicate.snapshot_id;

  UPDATE public.catalog_census_members
  SET formula_id = v_canonical
  WHERE formula_id = v_retail_formula;

  UPDATE public.catalog_census_formula_members
  SET formula_id = v_canonical
  WHERE formula_id = v_retail_formula;

  INSERT INTO public.catalog_formula_aliases (
    alias_formula_key, formula_id, identity_hash, match_reason, source_url,
    metadata, updated_at
  )
  SELECT
    f.formula_key,
    v_canonical,
    f.identity_hash,
    'manual_review',
    f.source_url,
    jsonb_build_object(
      'reason',
      'exact same Nulo current formula reconciled to one canonical identity',
      'reconciled_at',
      now()
    ),
    now()
  FROM public.catalog_formulas f
  WHERE f.id IN (v_source_formula, v_retail_formula, v_legacy_formula)
  ON CONFLICT (alias_formula_key) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = 'manual_review',
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = false,
    absent_since = coalesce(absent_since, now()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Superseded duplicate identity; exact evidence is attached to canonical formula 31694.',
    updated_at = now()
  WHERE id IN (v_source_formula, v_retail_formula, v_legacy_formula);

  UPDATE public.catalog_formulas
  SET
    product_name = 'FreeStyle Limited+ Lamb Recipe for Dogs',
    product_line = 'freestyle limited+',
    pet_type = 'dog',
    life_stage = 'all life stages',
    food_form = 'dry',
    flavor = 'lamb recipe',
    diet_condition = 'excludes large breed growth',
    complete_food_evidence =
      'Official Nulo: AAFCO all life stages except growth of large size dogs (70 lb or more as an adult).',
    front_image_url = v_front,
    source_url = v_source,
    source_authority = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    protected_terms = ARRAY[
      'nulo', 'freestyle', 'limited+', 'limited ingredient',
      'lamb', 'dog', 'dry', 'all life stages'
    ]::TEXT[],
    verification_status = 'verified',
    active = true,
    promoted_cache_key = v_cache,
    promoted_at = now(),
    last_observed_at = now(),
    updated_at = now()
  WHERE id = v_canonical;

  INSERT INTO public.catalog_skus (
    formula_id, gtin, package_size, package_count, source_slug,
    source_external_id, source_url, active, first_observed_at,
    last_observed_at, updated_at
  ) VALUES
    (
      v_canonical, NULL, '4 lb', 1, 'nulo-manufacturer-current',
      'sku:51LL04', v_source, true, now(), now(), now()
    ),
    (
      v_canonical, NULL, '5.5 lb', 1, 'nulo-manufacturer-current',
      'sku:51LL05',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-5-5-lb',
      true, now(), now(), now()
    ),
    (
      v_canonical, NULL, '10 lb', 1, 'nulo-manufacturer-current',
      'sku:51LL10',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-10-lb',
      true, now(), now(), now()
    ),
    (
      v_canonical, NULL, '22 lb', 1, 'nulo-manufacturer-current',
      'sku:51LL22',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-22-lb',
      true, now(), now(), now()
    ),
    (
      v_canonical, NULL, '24 lb', 1, 'nulo-manufacturer-current',
      'sku:51LL24',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-24-lb',
      true, now(), now(), now()
    )
  ON CONFLICT (source_slug, source_external_id, gtin, package_size) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    source_url = excluded.source_url,
    active = true,
    last_observed_at = now(),
    updated_at = now();

  UPDATE public.catalog_product_evidence
  SET
    cache_key = v_cache,
    product_name = 'FreeStyle Limited+ Lamb Recipe for Dogs',
    source = 'nulo-manufacturer-current',
    source_quality = 'manufacturer',
    source_url = v_source,
    ingredient_source_url = v_source,
    image_source_url = v_source,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = evidence || jsonb_build_object(
      'canonical_formula_id', v_canonical,
      'duplicate_serving_row_retired', true,
      'verified_package_skus',
        jsonb_build_array('51LL04', '51LL05', '51LL10', '51LL22', '51LL24')
    ),
    updated_at = now()
  WHERE cache_key =
    'nulo:nulo freestyle high-protein kibble limited lamb recipe';

  IF (
    SELECT count(*)
    FROM public.catalog_formulas
    WHERE active AND source_url = v_source
  ) <> 1 THEN
    RAISE EXCEPTION 'Nulo exact official source still maps to multiple active formulas';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus
    WHERE formula_id = v_canonical
      AND active
      AND source_slug = 'nulo-manufacturer-current'
  ) <> 5 THEN
    RAISE EXCEPTION 'Nulo five current package variants were not preserved';
  END IF;
END
$$;
