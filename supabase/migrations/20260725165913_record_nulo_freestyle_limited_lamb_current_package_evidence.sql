DO $$
DECLARE
  v_formula BIGINT := 31694;
  v_run BIGINT;
  v_source TEXT := 'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs';
  v_pdf TEXT := 'https://images.salsify.com/image/upload/s--vMzYI8rx--/fll3wdifgyipdskukva1.pdf';
  v_ingredients TEXT;
BEGIN
  SELECT ingredient_text
  INTO STRICT v_ingredients
  FROM public.catalog_formulas
  WHERE id = v_formula;

  INSERT INTO public.catalog_source_runs (
    run_key, source_slug, source_type, coverage_role, status, started_at,
    finished_at, expected_count, observed_count, accepted_count,
    rejected_count, pagination_complete, source_content_hash, checkpoint,
    error_summary, metadata, updated_at
  ) VALUES (
    'manual-exact-evidence:nulo:freestyle-limited-lamb-current-packages:20260725',
    'nulo-manufacturer-current', 'manufacturer', 'verification', 'completed',
    now(), now(), 5, 5, 5, 0, true,
    encode(
      digest(
        v_source || '|51LL04|51LL05|51LL10|51LL22|51LL24',
        'sha256'
      ),
      'hex'
    ),
    '{}'::JSONB,
    NULL,
    jsonb_build_object(
      'official_package_skus',
        jsonb_build_array('51LL04', '51LL05', '51LL10', '51LL22', '51LL24'),
      'package_sizes',
        jsonb_build_array('4 lb', '5.5 lb', '10 lb', '22 lb', '24 lb'),
      'gtins_not_published', true,
      'ingredient_pdf', v_pdf
    ),
    now()
  )
  ON CONFLICT (run_key) DO UPDATE
  SET
    status = 'completed',
    finished_at = now(),
    expected_count = 5,
    observed_count = 5,
    accepted_count = 5,
    rejected_count = 0,
    pagination_complete = true,
    source_content_hash = excluded.source_content_hash,
    error_summary = NULL,
    metadata = excluded.metadata,
    updated_at = now()
  RETURNING id INTO v_run;

  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons, raw_payload
  )
  SELECT
    v_run,
    v_formula,
    'nulo-manufacturer-current',
    'sku:' || x.sku,
    x.url,
    'manufacturer',
    NULL,
    'nulo',
    'nulo',
    f.product_name,
    f.product_line,
    f.pet_type,
    f.life_stage,
    f.food_form,
    f.flavor,
    f.diet_condition,
    x.size,
    v_ingredients,
    x.image,
    true,
    true,
    now(),
    encode(
      digest(
        f.formula_key || '|' || x.sku || '|' || x.size || '|' ||
        v_ingredients || '|' || x.image,
        'sha256'
      ),
      'hex'
    ),
    'accepted',
    ARRAY[]::TEXT[],
    jsonb_build_object(
      'official_sku', x.sku,
      'ingredient_pdf', v_pdf,
      'gtin_status', 'not published by reviewed official page'
    )
  FROM public.catalog_formulas f
  CROSS JOIN (
    VALUES
      (
        '51LL04', '4 lb', v_source,
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/jejdg5lizihtphmv40qi.png?v=1776774851'
      ),
      (
        '51LL05', '5.5 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-5-5-lb',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/whspofhunmmh6ap88u1l.png?v=1776774871'
      ),
      (
        '51LL10', '10 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-10-lb',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/ntaftx6gh98ugqberb42.png?v=1776774900'
      ),
      (
        '51LL22', '22 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-22-lb',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/e7fvq3ybw9a48lkccpfk.png?v=1776774863'
      ),
      (
        '51LL24', '24 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-24-lb',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/an236ckkkp2iger2ll5i.png?v=1776774877'
      )
  ) AS x(sku, size, url, image)
  WHERE f.id = v_formula
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash) DO UPDATE
  SET
    formula_id = excluded.formula_id,
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = excluded.raw_payload,
    observed_at = now();

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    v_formula,
    NULL,
    x.field_name,
    to_jsonb(x.field_value),
    x.url,
    'manufacturer',
    true,
    now(),
    encode(
      digest(x.field_name || '|' || x.field_value || '|' || x.url, 'sha256'),
      'hex'
    )
  FROM (
    VALUES
      ('ingredient_text', v_ingredients, v_source),
      (
        'complete_food_evidence',
        'AAFCO all life stages except growth of large size dogs (70 lb or more as an adult).',
        v_source
      ),
      ('official_package_sku', '51LL04 — 4 lb', v_source),
      (
        'official_package_sku', '51LL05 — 5.5 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-5-5-lb'
      ),
      (
        'official_package_sku', '51LL10 — 10 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-10-lb'
      ),
      (
        'official_package_sku', '51LL22 — 22 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-22-lb'
      ),
      (
        'official_package_sku', '51LL24 — 24 lb',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-24-lb'
      ),
      (
        'front_image_url',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/jejdg5lizihtphmv40qi.png?v=1776774851',
        v_source
      ),
      (
        'front_image_url',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/whspofhunmmh6ap88u1l.png?v=1776774871',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-5-5-lb'
      ),
      (
        'front_image_url',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/ntaftx6gh98ugqberb42.png?v=1776774900',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-10-lb'
      ),
      (
        'front_image_url',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/e7fvq3ybw9a48lkccpfk.png?v=1776774863',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-22-lb'
      ),
      (
        'front_image_url',
        'https://cdn.shopify.com/s/files/1/0084/9664/4192/files/an236ckkkp2iger2ll5i.png?v=1776774877',
        'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-24-lb'
      )
  ) AS x(field_name, field_value, url)
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
    'manual-search:nulo:freestyle-limited-lamb-dog-current-packages:20260725',
    f.formula_key,
    f.formula_key,
    'Nulo',
    f.product_name,
    'Nulo FreeStyle Limited+ Lamb Recipe for Dogs ingredients',
    jsonb_build_array(
      v_source,
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-5-5-lb',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-10-lb',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-22-lb',
      'https://nulo.com/products/freestyle-limited-lamb-recipe-for-dogs-24-lb',
      v_pdf
    ),
    v_source,
    'manufacturer_page',
    jsonb_build_object(
      'brand', 'Nulo',
      'product_line', 'FreeStyle Limited+',
      'pet_type', 'dog',
      'life_stage', 'all life stages',
      'food_form', 'dry',
      'flavor', 'Lamb Recipe',
      'condition', 'excludes large breed growth'
    ),
    jsonb_build_object(
      'brand', f.brand,
      'product_line', f.product_line,
      'pet_type', f.pet_type,
      'life_stage', f.life_stage,
      'food_form', f.food_form,
      'flavor', f.flavor,
      'condition', f.diet_condition,
      'package_skus',
        jsonb_build_array('51LL04', '51LL05', '51LL10', '51LL22', '51LL24')
    ),
    'promoted',
    NULL,
    encode(digest(v_source || '|' || v_pdf || '|' || v_ingredients, 'sha256'), 'hex'),
    encode(digest(v_ingredients, 'sha256'), 'hex'),
    encode(digest(f.front_image_url, 'sha256'), 'hex'),
    now(),
    f.id,
    f.promoted_cache_key,
    1,
    'Official Nulo current pages prove one formula across five package sizes. Exact manufacturer and Chewy aliases were transactionally reconciled; no package GTIN was inferred because official pages publish SKUs but not GTINs.',
    v_source,
    'source_text_exact',
    encode(digest(v_ingredients, 'sha256'), 'hex'),
    '[]'::JSONB,
    now()
  FROM public.catalog_formulas f
  WHERE f.id = v_formula
  ON CONFLICT (review_key) DO UPDATE
  SET
    corrected_formula_key = excluded.corrected_formula_key,
    resolved_identity = excluded.resolved_identity,
    discovery_urls = excluded.discovery_urls,
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

  UPDATE public.catalog_acquisition_queue
  SET
    status = 'resolved',
    resolved_at = now(),
    resolution_reason =
      'Official Nulo formula, manufacturer duplicate, and two retailer aliases reconciled to one canonical identity.',
    acquisition_notes =
      'One exact verified formula now owns all observations, five current official package SKUs/sizes, and retailer aliases. Duplicate formulas are quarantined and the duplicate serving row is excluded. No unproven GTIN was added.',
    updated_at = now(),
    last_refreshed_at = now()
  WHERE gap_key =
    'identity_collision:nulo:freestyle-limited-lamb-recipe-for-dogs';

  IF (
    SELECT count(*)
    FROM public.catalog_observations
    WHERE run_id = v_run
      AND formula_id = v_formula
      AND validation_status = 'accepted'
  ) <> 5 THEN
    RAISE EXCEPTION 'Nulo package observations failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.catalog_acquisition_queue
    WHERE lower(brand) = 'nulo'
      AND status IN ('open', 'in_progress', 'blocked', 'imported')
  ) THEN
    RAISE EXCEPTION 'Nulo actionable queue gap remains';
  END IF;
END
$$;
