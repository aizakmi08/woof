-- Close retailer census gaps only where a reviewed package front and title
-- identify one exact formula whose current manufacturer evidence is already
-- verified. These aliases select that verified formula but do not claim that
-- the retailer page supplied or proved an ingredient version.

WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  formula_id,
  source_url,
  source_product_name,
  source_image_url,
  source_image_sha256,
  source_observed_at,
  official_source_url,
  official_image_url,
  official_product_code,
  official_ingredient_hash,
  expected_formula_key,
  brand,
  pet_type,
  life_stage,
  food_form,
  flavor,
  protected_terms
) AS (
  VALUES
    (
      'purina pro plan|purina pro plan|purina pro plan adult large breed shredded blend chicken and rice formula dry dog food|dog|adult|dry||',
      '363632d3c3554cbcd9aac312c5076dfcfdf70b5e91f51ebbd1a237f3ef9efc98',
      35223::bigint,
      'https://www.chewy.com/purina-pro-plan-adult-large-breed/dp/52455',
      'Purina Pro Plan Adult Large Breed Shredded Blend Chicken & Rice Formula Dry Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/0673798a-bf40-71f6-8000-b760e4dcb9e1._V1_.jpg',
      '6c09cd7d908cefd41dfdd98492d6be53383366d9b0ecdb70d8fd27b773940613',
      '2026-07-24T21:12:15.518Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-specialized-shredded-blend-large-breed-probiotics-dry-dog-food',
      'https://www.purina.com/sites/default/files/products/2024-10/pro_plan_large_breed_shredded_blend_chicken_rice_dry_dog_food_34lb.png',
      '038100140340',
      '3e6211516715e39640daef8b83cea91597e92e98ea3dd9d349d974522717e192',
      'nestle purina petcare|purina pro plan|pro plan adult large breed shredded blend chicken and rice formula dry dog food|dog|adult|dry|chicken and rice formula|',
      'Purina Pro Plan',
      'dog',
      'adult',
      'dry',
      'Chicken & Rice Formula',
      '["Pro Plan","Adult","Large Breed","Shredded Blend","Chicken & Rice Formula"]'::jsonb
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo life protection formula small breed adult chicken and brown rice recipe dry dog food|dog|adult|dry||',
      'fce767de08306823463bd62b8bd19ca99e58df644791f9abe807b851bf0d6075',
      33078::bigint,
      'https://www.chewy.com/blue-buffalo-life-protection-formula/dp/32054',
      'Blue Buffalo Life Protection Formula Small Breed Adult Chicken & Brown Rice Recipe Dry Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/06982544-099d-756a-8000-71079f2ad7a9._V1_.jpg',
      'c67d856609431c8abe64808a783cc314052f0deb8c460c22468faf8cd3108ee6',
      '2026-07-24T21:12:18.773Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/small-breed-chicken-brown-rice-recipe/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/blue_lpf_adultdog_sb_cr_dry_share.png',
      'small-breed-chicken-brown-rice-recipe',
      'bdb059bc228a28a7f78aafdc379b9b58523502166e459661c6b5cfb6fe759465',
      'general mills|blue buffalo|life protection formula small breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|',
      'Blue Buffalo',
      'dog',
      'adult',
      'dry',
      'Chicken & Brown Rice',
      '["Blue Buffalo","Life Protection Formula","Small Breed","Adult","Chicken & Brown Rice Recipe"]'::jsonb
    )
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata,
  created_at,
  updated_at
)
SELECT
  reviewed_alias.alias_formula_key,
  reviewed_alias.formula_id,
  reviewed_alias.identity_hash,
  'manual_review',
  reviewed_alias.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_method',
      'exact_official_identity_and_ingredient_hash_review',
    'source_product_name', reviewed_alias.source_product_name,
    'source_image_url', reviewed_alias.source_image_url,
    'source_image_sha256', reviewed_alias.source_image_sha256,
    'source_observed_at', reviewed_alias.source_observed_at,
    'official_source_url', reviewed_alias.official_source_url,
    'official_image_url', reviewed_alias.official_image_url,
    'official_product_code', reviewed_alias.official_product_code,
    'official_ingredient_hash', reviewed_alias.official_ingredient_hash,
    'expected_formula_key', reviewed_alias.expected_formula_key,
    'protected_terms', reviewed_alias.protected_terms,
    'source_version_policy',
      'select exact verified canonical formula; never overwrite ingredients; no retailer ingredient-version equivalence claimed',
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  now(),
  now()
FROM reviewed_alias
JOIN public.catalog_formulas formula
  ON formula.id = reviewed_alias.formula_id
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_key = reviewed_alias.expected_formula_key
 AND formula.source_url = reviewed_alias.official_source_url
 AND formula.front_image_url = reviewed_alias.official_image_url
 AND encode(digest(trim(regexp_replace(
       coalesce(formula.ingredient_text, ''),
       '\s+',
       ' ',
       'g'
     )), 'sha256'), 'hex') = reviewed_alias.official_ingredient_hash
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = excluded.formula_id,
  identity_hash = excluded.identity_hash,
  match_reason = excluded.match_reason,
  source_url = excluded.source_url,
  metadata = excluded.metadata,
  updated_at = now();

WITH reviewed_alias (
  alias_formula_key,
  identity_hash,
  formula_id,
  source_url,
  source_product_name,
  source_image_url,
  source_image_sha256,
  source_observed_at,
  official_source_url,
  official_image_url,
  official_product_code,
  official_ingredient_hash,
  expected_formula_key,
  brand,
  pet_type,
  life_stage,
  food_form,
  flavor
) AS (
  VALUES
    (
      'purina pro plan|purina pro plan|purina pro plan adult large breed shredded blend chicken and rice formula dry dog food|dog|adult|dry||',
      '363632d3c3554cbcd9aac312c5076dfcfdf70b5e91f51ebbd1a237f3ef9efc98',
      35223::bigint,
      'https://www.chewy.com/purina-pro-plan-adult-large-breed/dp/52455',
      'Purina Pro Plan Adult Large Breed Shredded Blend Chicken & Rice Formula Dry Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/0673798a-bf40-71f6-8000-b760e4dcb9e1._V1_.jpg',
      '6c09cd7d908cefd41dfdd98492d6be53383366d9b0ecdb70d8fd27b773940613',
      '2026-07-24T21:12:15.518Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-specialized-shredded-blend-large-breed-probiotics-dry-dog-food',
      'https://www.purina.com/sites/default/files/products/2024-10/pro_plan_large_breed_shredded_blend_chicken_rice_dry_dog_food_34lb.png',
      '038100140340',
      '3e6211516715e39640daef8b83cea91597e92e98ea3dd9d349d974522717e192',
      'nestle purina petcare|purina pro plan|pro plan adult large breed shredded blend chicken and rice formula dry dog food|dog|adult|dry|chicken and rice formula|',
      'Purina Pro Plan',
      'dog',
      'adult',
      'dry',
      'Chicken & Rice Formula'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo life protection formula small breed adult chicken and brown rice recipe dry dog food|dog|adult|dry||',
      'fce767de08306823463bd62b8bd19ca99e58df644791f9abe807b851bf0d6075',
      33078::bigint,
      'https://www.chewy.com/blue-buffalo-life-protection-formula/dp/32054',
      'Blue Buffalo Life Protection Formula Small Breed Adult Chicken & Brown Rice Recipe Dry Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/06982544-099d-756a-8000-71079f2ad7a9._V1_.jpg',
      'c67d856609431c8abe64808a783cc314052f0deb8c460c22468faf8cd3108ee6',
      '2026-07-24T21:12:18.773Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/small-breed-chicken-brown-rice-recipe/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/blue_lpf_adultdog_sb_cr_dry_share.png',
      'small-breed-chicken-brown-rice-recipe',
      'bdb059bc228a28a7f78aafdc379b9b58523502166e459661c6b5cfb6fe759465',
      'general mills|blue buffalo|life protection formula small breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|',
      'Blue Buffalo',
      'dog',
      'adult',
      'dry',
      'Chicken & Brown Rice'
    )
)
INSERT INTO public.catalog_manual_evidence_reviews (
  review_key,
  target_formula_key,
  corrected_formula_key,
  brand,
  product_name,
  search_query,
  discovery_urls,
  authoritative_source_url,
  authoritative_source_type,
  expected_identity,
  resolved_identity,
  evidence_status,
  quarantine_reason,
  authoritative_content_hash,
  ingredient_text_hash,
  front_image_url_hash,
  observed_at,
  formula_id,
  promoted_cache_key,
  attempt_count,
  review_notes,
  ingredient_evidence_url,
  ingredient_evidence_mode,
  ingredient_original_text_hash,
  ingredient_corrections,
  updated_at
)
SELECT
  'manual-visible-package-alias:v173:' || reviewed_alias.identity_hash,
  reviewed_alias.alias_formula_key,
  reviewed_alias.expected_formula_key,
  reviewed_alias.brand,
  reviewed_alias.source_product_name,
  reviewed_alias.source_product_name || ' exact package ingredients',
  jsonb_build_array(
    reviewed_alias.source_url,
    reviewed_alias.official_source_url,
    reviewed_alias.source_image_url,
    reviewed_alias.official_image_url
  ),
  reviewed_alias.official_source_url,
  'manufacturer_page',
  jsonb_build_object(
    'brand', reviewed_alias.brand,
    'pet_type', reviewed_alias.pet_type,
    'life_stage', reviewed_alias.life_stage,
    'food_form', reviewed_alias.food_form,
    'flavor', reviewed_alias.flavor
  ),
  jsonb_build_object(
    'formula_id', reviewed_alias.formula_id,
    'source_product_code', reviewed_alias.official_product_code,
    'source_front_image_sha256', reviewed_alias.source_image_sha256,
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  'promoted',
  NULL,
  encode(digest(
    reviewed_alias.source_url || '|' ||
    reviewed_alias.source_image_sha256 || '|' ||
    reviewed_alias.official_source_url || '|' ||
    reviewed_alias.official_ingredient_hash,
    'sha256'
  ), 'hex'),
  reviewed_alias.official_ingredient_hash,
  encode(digest(reviewed_alias.official_image_url, 'sha256'), 'hex'),
  reviewed_alias.source_observed_at,
  reviewed_alias.formula_id,
  formula.promoted_cache_key,
  1,
  'Reviewed exact package title and front-label identity select one verified canonical formula. Package size remains a SKU; no retailer ingredient-version equivalence is claimed.',
  reviewed_alias.official_source_url,
  'source_text_exact',
  reviewed_alias.official_ingredient_hash,
  '[]'::jsonb,
  now()
FROM reviewed_alias
JOIN public.catalog_formulas formula
  ON formula.id = reviewed_alias.formula_id
 AND formula.active
 AND formula.verification_status = 'verified'
 AND formula.formula_key = reviewed_alias.expected_formula_key
ON CONFLICT (review_key) DO UPDATE
SET
  corrected_formula_key = excluded.corrected_formula_key,
  discovery_urls = excluded.discovery_urls,
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

DO $$
DECLARE
  v_aliases integer;
  v_reviews integer;
BEGIN
  SELECT count(*)
  INTO v_aliases
  FROM public.catalog_formula_aliases
  WHERE metadata->>'review_method'
    = 'exact_official_identity_and_ingredient_hash_review'
    AND metadata->>'reviewed_at' = '2026-07-27'
    AND metadata->>'ingredient_version_policy'
      = 'prefer_canonical_verified_version_without_package_version_claim';

  SELECT count(*)
  INTO v_reviews
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key LIKE 'manual-visible-package-alias:v173:%'
    AND evidence_status = 'promoted';

  IF v_aliases <> 2 OR v_reviews <> 2 THEN
    RAISE EXCEPTION
      'Visible-package alias v173 incomplete: aliases %, reviews %',
      v_aliases,
      v_reviews;
  END IF;
END
$$;
