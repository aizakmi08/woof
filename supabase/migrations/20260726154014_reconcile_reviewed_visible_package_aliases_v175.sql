-- Close three retailer census gaps only where the exact title and captured
-- package front identify one verified manufacturer-current formula. Older
-- retailer package designs remain identity evidence only: never overwrite
-- ingredients and make no retailer ingredient-version equivalence claim.

WITH reviewed_alias (
  alias_formula_key, identity_hash, source_url, source_product_name,
  source_image_url, source_image_sha256, source_observed_at,
  official_source_url, official_image_url, official_product_code,
  official_ingredient_hash, expected_formula_key, brand, pet_type,
  life_stage, food_form, flavor, protected_terms
) AS (
  VALUES
    (
      'blue buffalo|blue buffalo|blue buffalo life protection formula natural senior small breed dry dog food with chicken and brown rice|dog|senior|dry||',
      '97ba9ffa0d2d77ada1f48f22019ee899f6d36db6ffbb7dac256e3e89fdd07a5f',
      'https://www.target.com/p/blue-buffalo-life-protection-formula-natural-senior-small-breed-dry-dog-food-with-chicken-and-brown-rice/-/A-76596193',
      'Blue Buffalo Life Protection Formula Natural Senior Small Breed Dry Dog Food with Chicken and Brown Rice',
      'https://target.scene7.com/is/image/Target/GUEST_e48ffcf2-f5ee-4d8c-83c2-c6b76155992b',
      '3133ca16eea2bf2d1ecdd98af2f37315669fe0e8899f6edc2df3a05cdb420337',
      '2026-07-24T21:12:16.373Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/small-breed-senior-chicken-brown-rice-recipe/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_sbsrchicken.png',
      'small-breed-senior-chicken-brown-rice-recipe',
      '28e8e804dc6a942aa4f94a24882cd15d3fcbf37eddd848a996b94b49dfeef1b1',
      'general mills|blue buffalo|life protection formula small breed senior dry dog food chicken and brown rice|dog|senior|dry|chicken and brown rice|',
      'Blue Buffalo', 'dog', 'senior', 'dry', 'Chicken & Brown Rice',
      '["Blue Buffalo","Life Protection Formula","Small Breed","Senior","Chicken and Brown Rice"]'::jsonb
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo wilderness grain free indoor hairball weight control with chicken adult premium dry cat food|cat|adult|dry||',
      '8db826ddddb7aff9657ceea9e06bdf4d7ebbe74c188a9a1063dadba3af68e835',
      'https://www.target.com/p/blue-buffalo-wilderness-grain-free-indoor-hairball-weight-control-with-chicken-adult-premium-dry-cat-food/-/A-54563813',
      'Blue Buffalo Wilderness Grain Free Indoor Hairball Weight Control with Chicken Adult Premium Dry Cat Food',
      'https://target.scene7.com/is/image/Target/GUEST_5a4c8fce-6bf2-4139-8d8e-4395b014c00c',
      '70bd8d8c26222c69f2fc3570f6c94309db82db27518ceef871706d38627ffaaf',
      '2026-07-24T21:12:16.357Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-cat-food/wilderness/indoor-weight-control-hairball-chicken/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/wilderness/share-product-image/share_wilderness_cat_adult_indoor_hairballweightcontrol.png',
      'indoor-weight-control-hairball-chicken',
      'cc1cdee8ea2b60fc79870e28fe0cde3a64fdc0a40585fc83ec67c0409c70b726',
      'general mills|blue buffalo|blue wilderness dry cat food indoor hairball weight control chicken recipe|cat|adult|dry|blue wilderness indoor hairball weight control chicken recipe|',
      'Blue Buffalo', 'cat', 'adult', 'dry', 'Chicken',
      '["Blue Buffalo","Wilderness","Indoor Hairball","Weight Control","Chicken","Adult"]'::jsonb
    ),
    (
      'nutro|nutro|nutro wholesome essentials chicken and brown rice recipe indoor dry cat food|cat|unknown|dry||',
      '61ba75f0379388f8fd50ab53464263c7cee9a11f058dbc81498ab44f7575d41a',
      'https://www.chewy.com/nutro-wholesome-essentials-indoor/dp/114488',
      'Nutro Wholesome Essentials Chicken & Brown Rice Recipe Indoor Dry Cat Food',
      'https://image.chewy.com/catalog/general/images/moe/068dfc85-bd6d-7973-8000-d8016eef3a22._V1_.jpg',
      '8f49c5c36eef59d3f85b992c06a70dd376519ddc72b24b7ab52867c3da42140e',
      '2026-07-24T21:11:56.209Z'::timestamptz,
      'https://www.nutro.com/products/dry/adult-indoor-formula-chicken-brown-rice-recipe',
      'https://www.nutro.com/sites/g/files/fnmzdf2471/files/migrate-product-files/images/yptrtggsqaaf5a2imkt7.png',
      '079105117326',
      '12e004fa34e622857b3254a722cbbf48547da24eaa7e79d534ef79688a4c9bc3',
      'mars petcare|nutro|adult indoor formula with chicken and brown rice recipe|cat|adult|dry|chicken|',
      'Nutro', 'cat', 'adult', 'dry', 'Chicken & Brown Rice',
      '["Nutro","Wholesome Essentials","Indoor","Chicken and Brown Rice Recipe","Dry Cat Food"]'::jsonb
    )
),
verified AS (
  SELECT reviewed_alias.*, formula.id AS formula_id,
    formula.promoted_cache_key
  FROM reviewed_alias
  JOIN public.catalog_formulas formula
    ON formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'manufacturer_current_exact'
   AND formula.formula_key = reviewed_alias.expected_formula_key
   AND formula.source_url = reviewed_alias.official_source_url
   AND formula.front_image_url = reviewed_alias.official_image_url
   AND encode(digest(trim(regexp_replace(
         coalesce(formula.ingredient_text, ''),
         '\s+',
         ' ',
         'g'
       )), 'sha256'), 'hex') = reviewed_alias.official_ingredient_hash
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, created_at, updated_at
)
SELECT
  verified.alias_formula_key,
  verified.formula_id,
  verified.identity_hash,
  'manual_review',
  verified.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_wave', 'v175',
    'review_method', 'exact_official_identity_and_ingredient_hash_review',
    'source_product_name', verified.source_product_name,
    'source_image_url', verified.source_image_url,
    'source_image_sha256', verified.source_image_sha256,
    'source_observed_at', verified.source_observed_at,
    'official_source_url', verified.official_source_url,
    'official_image_url', verified.official_image_url,
    'official_product_code', verified.official_product_code,
    'official_ingredient_hash', verified.official_ingredient_hash,
    'expected_formula_key', verified.expected_formula_key,
    'protected_terms', verified.protected_terms,
    'source_version_policy',
      'select exact verified canonical formula; never overwrite ingredients; no retailer ingredient-version equivalence claimed',
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  now(),
  now()
FROM verified
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

WITH reviewed_alias (
  alias_formula_key, identity_hash, source_url, source_product_name,
  source_image_url, source_image_sha256, source_observed_at,
  official_source_url, official_image_url, official_product_code,
  official_ingredient_hash, expected_formula_key, brand, pet_type,
  life_stage, food_form, flavor
) AS (
  VALUES
    (
      'blue buffalo|blue buffalo|blue buffalo life protection formula natural senior small breed dry dog food with chicken and brown rice|dog|senior|dry||',
      '97ba9ffa0d2d77ada1f48f22019ee899f6d36db6ffbb7dac256e3e89fdd07a5f',
      'https://www.target.com/p/blue-buffalo-life-protection-formula-natural-senior-small-breed-dry-dog-food-with-chicken-and-brown-rice/-/A-76596193',
      'Blue Buffalo Life Protection Formula Natural Senior Small Breed Dry Dog Food with Chicken and Brown Rice',
      'https://target.scene7.com/is/image/Target/GUEST_e48ffcf2-f5ee-4d8c-83c2-c6b76155992b',
      '3133ca16eea2bf2d1ecdd98af2f37315669fe0e8899f6edc2df3a05cdb420337',
      '2026-07-24T21:12:16.373Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-dog-food/life-protection-formula/small-breed-senior-chicken-brown-rice-recipe/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/dog-dry-food/life-protection-formula/share-product-image/share_lpf_dry_dog_sbsrchicken.png',
      'small-breed-senior-chicken-brown-rice-recipe',
      '28e8e804dc6a942aa4f94a24882cd15d3fcbf37eddd848a996b94b49dfeef1b1',
      'general mills|blue buffalo|life protection formula small breed senior dry dog food chicken and brown rice|dog|senior|dry|chicken and brown rice|',
      'Blue Buffalo', 'dog', 'senior', 'dry', 'Chicken & Brown Rice'
    ),
    (
      'blue buffalo|blue buffalo|blue buffalo wilderness grain free indoor hairball weight control with chicken adult premium dry cat food|cat|adult|dry||',
      '8db826ddddb7aff9657ceea9e06bdf4d7ebbe74c188a9a1063dadba3af68e835',
      'https://www.target.com/p/blue-buffalo-wilderness-grain-free-indoor-hairball-weight-control-with-chicken-adult-premium-dry-cat-food/-/A-54563813',
      'Blue Buffalo Wilderness Grain Free Indoor Hairball Weight Control with Chicken Adult Premium Dry Cat Food',
      'https://target.scene7.com/is/image/Target/GUEST_5a4c8fce-6bf2-4139-8d8e-4395b014c00c',
      '70bd8d8c26222c69f2fc3570f6c94309db82db27518ceef871706d38627ffaaf',
      '2026-07-24T21:12:16.357Z'::timestamptz,
      'https://www.bluebuffalo.com/dry-cat-food/wilderness/indoor-weight-control-hairball-chicken/',
      'https://www.bluebuffalo.com/globalassets/product-detail-pages/cat-dry-food/wilderness/share-product-image/share_wilderness_cat_adult_indoor_hairballweightcontrol.png',
      'indoor-weight-control-hairball-chicken',
      'cc1cdee8ea2b60fc79870e28fe0cde3a64fdc0a40585fc83ec67c0409c70b726',
      'general mills|blue buffalo|blue wilderness dry cat food indoor hairball weight control chicken recipe|cat|adult|dry|blue wilderness indoor hairball weight control chicken recipe|',
      'Blue Buffalo', 'cat', 'adult', 'dry', 'Chicken'
    ),
    (
      'nutro|nutro|nutro wholesome essentials chicken and brown rice recipe indoor dry cat food|cat|unknown|dry||',
      '61ba75f0379388f8fd50ab53464263c7cee9a11f058dbc81498ab44f7575d41a',
      'https://www.chewy.com/nutro-wholesome-essentials-indoor/dp/114488',
      'Nutro Wholesome Essentials Chicken & Brown Rice Recipe Indoor Dry Cat Food',
      'https://image.chewy.com/catalog/general/images/moe/068dfc85-bd6d-7973-8000-d8016eef3a22._V1_.jpg',
      '8f49c5c36eef59d3f85b992c06a70dd376519ddc72b24b7ab52867c3da42140e',
      '2026-07-24T21:11:56.209Z'::timestamptz,
      'https://www.nutro.com/products/dry/adult-indoor-formula-chicken-brown-rice-recipe',
      'https://www.nutro.com/sites/g/files/fnmzdf2471/files/migrate-product-files/images/yptrtggsqaaf5a2imkt7.png',
      '079105117326',
      '12e004fa34e622857b3254a722cbbf48547da24eaa7e79d534ef79688a4c9bc3',
      'mars petcare|nutro|adult indoor formula with chicken and brown rice recipe|cat|adult|dry|chicken|',
      'Nutro', 'cat', 'adult', 'dry', 'Chicken & Brown Rice'
    )
),
verified AS (
  SELECT reviewed_alias.*, formula.id AS formula_id,
    formula.promoted_cache_key
  FROM reviewed_alias
  JOIN public.catalog_formulas formula
    ON formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_evidence_tier = 'manufacturer_current_exact'
   AND formula.formula_key = reviewed_alias.expected_formula_key
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
  'manual-visible-package-alias:v175:' || verified.identity_hash,
  verified.alias_formula_key,
  verified.expected_formula_key,
  verified.brand,
  verified.source_product_name,
  verified.source_product_name || ' exact package ingredients',
  jsonb_build_array(
    verified.source_url,
    verified.official_source_url,
    verified.source_image_url,
    verified.official_image_url
  ),
  verified.official_source_url,
  'manufacturer_page',
  jsonb_build_object(
    'brand', verified.brand,
    'pet_type', verified.pet_type,
    'life_stage', verified.life_stage,
    'food_form', verified.food_form,
    'flavor', verified.flavor
  ),
  jsonb_build_object(
    'formula_id', verified.formula_id,
    'source_product_code', verified.official_product_code,
    'source_front_image_sha256', verified.source_image_sha256,
    'ingredient_version_policy',
      'prefer_canonical_verified_version_without_package_version_claim'
  ),
  'promoted',
  NULL,
  encode(digest(
    verified.source_url || '|' || verified.source_image_sha256 || '|' ||
    verified.official_source_url || '|' || verified.official_ingredient_hash,
    'sha256'
  ), 'hex'),
  verified.official_ingredient_hash,
  encode(digest(verified.official_image_url, 'sha256'), 'hex'),
  verified.source_observed_at,
  verified.formula_id,
  verified.promoted_cache_key,
  1,
  'Reviewed exact title and package-front identity select one verified manufacturer-current formula. Older retailer package design is identity evidence only; no retailer ingredient-version equivalence is claimed.',
  verified.official_source_url,
  'source_text_exact',
  verified.official_ingredient_hash,
  '[]'::jsonb,
  now()
FROM verified
ON CONFLICT (review_key) DO UPDATE
SET corrected_formula_key = excluded.corrected_formula_key,
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
  SELECT count(*) INTO v_aliases
  FROM public.catalog_formula_aliases
  WHERE metadata->>'review_wave' = 'v175'
    AND metadata->>'review_method'
      = 'exact_official_identity_and_ingredient_hash_review';

  SELECT count(*) INTO v_reviews
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key LIKE 'manual-visible-package-alias:v175:%'
    AND evidence_status = 'promoted';

  IF v_aliases <> 3 OR v_reviews <> 3 THEN
    RAISE EXCEPTION
      'Visible-package alias v175 incomplete: aliases %, reviews %',
      v_aliases, v_reviews;
  END IF;
END
$$;
