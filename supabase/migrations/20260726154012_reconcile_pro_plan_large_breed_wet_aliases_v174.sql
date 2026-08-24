-- Repair two exact manufacturer serving identities and bind their reviewed
-- Chewy package fronts to the same current formula. The Chewy pages are
-- identity evidence only; manufacturer ingredients remain the selected
-- version and are never overwritten.

WITH repair (
  cache_key,
  formula_id,
  flavor,
  direct_image_url,
  ingredient_hash
) AS (
  VALUES
    (
      'nestle-purina-pro-plan:038100026774',
      6309::bigint,
      'Beef & Rice Entrée',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-beef-rice-wet-dog-food-13-oz-can.png',
      'b5d43c6f6df28d9bdadb1bfa1bc154f5193eef232453b44626266262a8d532a8'
    ),
    (
      'nestle-purina-pro-plan:038100026781',
      6310::bigint,
      'Chicken & Rice Entrée',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-chicken-rice-wet-dog-food-13-oz-can.png',
      'b056ed1ead5d9240b7b06b9278ea1d15894d09ea80e637cc563c7d76f44b0164'
    )
)
UPDATE public.product_data serving
SET
  product_line = 'Pro Plan Adult Large Breed',
  flavor = repair.flavor,
  life_stage = 'adult',
  food_form = 'wet',
  image_url = repair.direct_image_url,
  formula_version_provenance =
    coalesce(serving.formula_version_provenance, '{}'::jsonb)
    || jsonb_build_object(
      'identity_repair', jsonb_build_object(
        'reviewed_at', '2026-07-27',
        'reason',
          'Exact official adult large-breed entrée title and package front',
        'formula_id', repair.formula_id,
        'ingredient_hash_equality_verified', true
      )
    ),
  updated_at = now()
FROM repair
WHERE serving.cache_key = repair.cache_key
  AND serving.formula_evidence_tier = 'manufacturer_current_exact'
  AND serving.ingredient_verification_status = 'manufacturer'
  AND encode(digest(trim(regexp_replace(
        coalesce(serving.ingredient_text, ''),
        '\s+',
        ' ',
        'g'
      )), 'sha256'), 'hex') = repair.ingredient_hash;

WITH repair (cache_key, formula_id, direct_image_url) AS (
  VALUES
    (
      'nestle-purina-pro-plan:038100026774',
      6309::bigint,
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-beef-rice-wet-dog-food-13-oz-can.png'
    ),
    (
      'nestle-purina-pro-plan:038100026781',
      6310::bigint,
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-chicken-rice-wet-dog-food-13-oz-can.png'
    )
)
UPDATE public.catalog_formulas formula
SET
  promoted_cache_key = repair.cache_key,
  front_image_url = repair.direct_image_url,
  updated_at = now()
FROM repair
WHERE formula.id = repair.formula_id
  AND formula.active
  AND formula.verification_status = 'verified'
  AND formula.formula_evidence_tier = 'manufacturer_current_exact';

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
  flavor,
  protected_terms
) AS (
  VALUES
    (
      'purina pro plan|purina pro plan|purina pro plan specialized adult large breed beef and rice entree canned dog food|dog|adult|wet||',
      '0fe0cb14e1f5c10062c46f9ba8f6cfed8361795d1eeae304331fefcbb7bbe84e',
      6309::bigint,
      'https://www.chewy.com/purina-pro-plan-specialized-adult/dp/52385',
      'Purina Pro Plan Specialized Adult Large Breed Beef & Rice Entree Canned Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/067630ad-3b3a-7df4-8000-de7795942e25._V1_.jpg',
      'ee7a49e4cb55a06c1027d11aa37b71c2a1ac8dbefd12e1708f34c5887b150079',
      '2026-07-24T21:12:06.822Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-large-breed-beef-rice-gravy-wet-dog-food',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-beef-rice-wet-dog-food-13-oz-can.png',
      '038100026774',
      'b5d43c6f6df28d9bdadb1bfa1bc154f5193eef232453b44626266262a8d532a8',
      'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|beef and rice entree|',
      'Beef & Rice Entrée',
      '["Pro Plan","Adult","Large Breed","Beef & Rice Entrée"]'::jsonb
    ),
    (
      'purina pro plan|purina pro plan|purina pro plan specialized adult large breed chicken and rice entree canned dog food|dog|adult|wet||',
      '12e97952a1b02bd404054af255d837b64046f57fc0d1a620db92fe7bf52d467c',
      6310::bigint,
      'https://www.chewy.com/purina-pro-plan-specialized-adult/dp/3998926',
      'Purina Pro Plan Specialized Adult Large Breed Chicken & Rice Entree Canned Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/067630aa-fa22-7cf7-8000-2a5ba06f82c6._V1_.jpg',
      'bf563649f8f5bfbb5d99e0ac4a20315ac7162f881a7cd8b8f65fbfc550056d44',
      '2026-07-24T21:12:04.418Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-large-breed-chicken-rice-gravy-wet-dog-food',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-chicken-rice-wet-dog-food-13-oz-can.png',
      '038100026781',
      'b056ed1ead5d9240b7b06b9278ea1d15894d09ea80e637cc563c7d76f44b0164',
      'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|chicken and rice entree|',
      'Chicken & Rice Entrée',
      '["Pro Plan","Adult","Large Breed","Chicken & Rice Entrée"]'::jsonb
    )
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, created_at, updated_at
)
SELECT
  reviewed_alias.alias_formula_key,
  reviewed_alias.formula_id,
  reviewed_alias.identity_hash,
  'manual_review',
  reviewed_alias.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_wave', 'v174',
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
  alias_formula_key, identity_hash, formula_id, source_url,
  source_product_name, source_image_url, source_image_sha256,
  source_observed_at, official_source_url, official_image_url,
  official_product_code, official_ingredient_hash, expected_formula_key,
  flavor
) AS (
  VALUES
    (
      'purina pro plan|purina pro plan|purina pro plan specialized adult large breed beef and rice entree canned dog food|dog|adult|wet||',
      '0fe0cb14e1f5c10062c46f9ba8f6cfed8361795d1eeae304331fefcbb7bbe84e',
      6309::bigint,
      'https://www.chewy.com/purina-pro-plan-specialized-adult/dp/52385',
      'Purina Pro Plan Specialized Adult Large Breed Beef & Rice Entree Canned Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/067630ad-3b3a-7df4-8000-de7795942e25._V1_.jpg',
      'ee7a49e4cb55a06c1027d11aa37b71c2a1ac8dbefd12e1708f34c5887b150079',
      '2026-07-24T21:12:06.822Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-large-breed-beef-rice-gravy-wet-dog-food',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-beef-rice-wet-dog-food-13-oz-can.png',
      '038100026774',
      'b5d43c6f6df28d9bdadb1bfa1bc154f5193eef232453b44626266262a8d532a8',
      'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|beef and rice entree|',
      'Beef & Rice Entrée'
    ),
    (
      'purina pro plan|purina pro plan|purina pro plan specialized adult large breed chicken and rice entree canned dog food|dog|adult|wet||',
      '12e97952a1b02bd404054af255d837b64046f57fc0d1a620db92fe7bf52d467c',
      6310::bigint,
      'https://www.chewy.com/purina-pro-plan-specialized-adult/dp/3998926',
      'Purina Pro Plan Specialized Adult Large Breed Chicken & Rice Entree Canned Dog Food',
      'https://image.chewy.com/catalog/general/images/moe/067630aa-fa22-7cf7-8000-2a5ba06f82c6._V1_.jpg',
      'bf563649f8f5bfbb5d99e0ac4a20315ac7162f881a7cd8b8f65fbfc550056d44',
      '2026-07-24T21:12:04.418Z'::timestamptz,
      'https://www.purina.com/dogs/shop/pro-plan-large-breed-chicken-rice-gravy-wet-dog-food',
      'https://www.purina.com/sites/default/files/products/2025-01/1pro-plan-large-breed-chicken-rice-wet-dog-food-13-oz-can.png',
      '038100026781',
      'b056ed1ead5d9240b7b06b9278ea1d15894d09ea80e637cc563c7d76f44b0164',
      'purina pro plan|purina pro plan|pro plan adult large breed|dog|adult|wet|chicken and rice entree|',
      'Chicken & Rice Entrée'
    )
)
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
  'manual-visible-package-alias:v174:' || reviewed_alias.identity_hash,
  reviewed_alias.alias_formula_key,
  reviewed_alias.expected_formula_key,
  'Purina Pro Plan',
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
    'brand', 'Purina Pro Plan',
    'pet_type', 'dog',
    'life_stage', 'adult',
    'food_form', 'wet',
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
  'Exact Chewy package front selects one repaired manufacturer-current adult large-breed entrée formula. No retailer ingredient-version equivalence is claimed.',
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
  v_serving integer;
  v_aliases integer;
  v_reviews integer;
BEGIN
  SELECT count(*) INTO v_serving
  FROM public.product_data
  WHERE cache_key IN (
    'nestle-purina-pro-plan:038100026774',
    'nestle-purina-pro-plan:038100026781'
  )
    AND life_stage = 'adult'
    AND food_form = 'wet'
    AND flavor IN ('Beef & Rice Entrée', 'Chicken & Rice Entrée');

  SELECT count(*) INTO v_aliases
  FROM public.catalog_formula_aliases
  WHERE metadata->>'review_wave' = 'v174'
    AND metadata->>'ingredient_version_policy'
      = 'prefer_canonical_verified_version_without_package_version_claim';

  SELECT count(*) INTO v_reviews
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key LIKE 'manual-visible-package-alias:v174:%'
    AND evidence_status = 'promoted';

  IF v_serving <> 2 OR v_aliases <> 2 OR v_reviews <> 2 THEN
    RAISE EXCEPTION
      'Pro Plan large-breed wet v174 incomplete: serving %, aliases %, reviews %',
      v_serving, v_aliases, v_reviews;
  END IF;
END
$$;
