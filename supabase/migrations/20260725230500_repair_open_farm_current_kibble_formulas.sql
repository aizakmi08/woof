-- Reconcile eight current Open Farm kibble formulas against the official PDP,
-- official QR trace pages, official Shopify SKU/GTIN variants, and the current
-- official ingredient-card order. Package sizes remain SKU children.
CREATE TEMP TABLE open_farm_current_repairs (
  old_formula_key TEXT PRIMARY KEY,
  new_formula_key TEXT NOT NULL,
  primary_gtin TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_line TEXT NOT NULL,
  serving_product_line TEXT NOT NULL,
  flavor TEXT NOT NULL,
  serving_flavor TEXT NOT NULL,
  life_stage TEXT NOT NULL,
  source_url TEXT NOT NULL,
  old_ingredient_count INTEGER NOT NULL,
  current_ingredient_count INTEGER NOT NULL,
  expected_current_last TEXT NOT NULL,
  protected_terms TEXT[] NOT NULL
) ON COMMIT DROP;

INSERT INTO open_farm_current_repairs VALUES
(
  'open farm|open farm|goodbowl wild caught|cat|unknown|dry|salmon and brown rice|',
  'open farm|open farm|goodbowl wild caught|cat|adult|dry|salmon and brown rice|',
  '683547120075',
  'open-farm:683547120075',
  'Goodbowl Wild-Caught Salmon & Brown Rice Cat Kibble',
  'goodbowl wild caught',
  'Goodbowl Wild-Caught',
  'salmon and brown rice',
  'Salmon & Brown Rice',
  'adult',
  'https://openfarmpet.com/products/goodbowl-wild-caught-salmon-brown-rice-recipe-for-cats',
  36,
  36,
  'Milo',
  ARRAY['open farm','goodbowl','wild-caught','salmon','brown rice','cat','adult','dry']::TEXT[]
),
(
  'open farm|open farm|goodgut wild caught|dog|unknown|dry|salmon|',
  'open farm|open farm|goodgut wild caught|dog|all life stages|dry|salmon|',
  '683547120112',
  'open-farm:683547120112',
  'GoodGut Wild-Caught Salmon Dog Kibble',
  'goodgut wild caught',
  'GoodGut Wild-Caught',
  'salmon',
  'Wild-Caught Salmon',
  'all life stages',
  'https://openfarmpet.com/products/goodgut-wild-caught-salmon-dog-kibble',
  57,
  57,
  'L-Carnitine',
  ARRAY['open farm','goodgut','wild-caught','salmon','dog','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|new zealand|dog|unknown|dry|venison and ancient grains|',
  'open farm|open farm|new zealand|dog|all life stages|dry|venison and ancient grains|',
  '683547121034',
  'open-farm:683547121034',
  'New Zealand Venison & Ancient Grains Dog Kibble',
  'new zealand',
  'New Zealand',
  'venison and ancient grains',
  'Venison & Ancient Grains',
  'all life stages',
  'https://openfarmpet.com/products/new-zealand-venison-ancient-grains-dry-dog-food',
  42,
  42,
  'Milo',
  ARRAY['open farm','new zealand','venison','ancient grains','dog','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|pasture raised|cat|all life stages|dry|lamb|',
  'open farm|open farm|pasture raised|cat|all life stages|dry|lamb|',
  '683547122208',
  'open-farm:683547122208',
  'Pasture-Raised Lamb Grain-Free Cat Kibble',
  'pasture raised',
  'Pasture-Raised',
  'lamb',
  'Lamb',
  'all life stages',
  'https://openfarmpet.com/products/pasture-raised-lamb-dry-cat-food',
  40,
  40,
  'Flaxseed',
  ARRAY['open farm','pasture-raised','lamb','grain-free','cat','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|homestead|dog|unknown|dry|turkey and ancient grains|',
  'open farm|open farm|homestead|dog|all life stages|dry|turkey and ancient grains|',
  '683547125308',
  'open-farm:683547125308',
  'Homestead Turkey & Ancient Grains Dog Kibble',
  'homestead',
  'Homestead',
  'turkey and ancient grains',
  'Turkey & Ancient Grains',
  'all life stages',
  'https://openfarmpet.com/products/turkey-and-grain-dry-dog-food',
  39,
  39,
  'Rosemary Extract',
  ARRAY['open farm','homestead','turkey','ancient grains','dog','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|grass fed|dog|unknown|dry|beef and ancient grains|',
  'open farm|open farm|grass fed|dog|all life stages|dry|beef and ancient grains|',
  '683547125780',
  'open-farm:683547125780',
  'Grass-Fed Beef & Ancient Grains Dog Kibble',
  'grass fed',
  'Grass-Fed',
  'beef and ancient grains',
  'Beef & Ancient Grains',
  'all life stages',
  'https://openfarmpet.com/products/grass-fed-beef-ancient-grains-dry-dog-food',
  40,
  40,
  'DL-Methionine',
  ARRAY['open farm','grass-fed','beef','ancient grains','dog','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|whitefish grain free dog kibble|dog|unknown|dry|whitefish|',
  'open farm|open farm|whitefish grain free dog kibble|dog|all life stages|dry|whitefish|',
  '683547128408',
  'open-farm:683547128408',
  'Whitefish Grain-Free Dog Kibble',
  'whitefish grain free dog kibble',
  'Whitefish Grain-Free',
  'whitefish',
  'Whitefish',
  'all life stages',
  'https://openfarmpet.com/products/whitefish-dry-dog-food',
  42,
  42,
  'Chickpeas',
  ARRAY['open farm','whitefish','grain-free','dog','all life stages','dry']::TEXT[]
),
(
  'open farm|open farm|open farm rawmix with grain adult dry dog food prairie|dog|adult|dry||',
  'open farm|open farm|rawmix open prairie ancient grains|dog|all life stages|dry|chicken and turkey|',
  '683547129344',
  'open-farm:683547129344',
  'RawMix Open Prairie Ancient Grains Dog Kibble',
  'rawmix open prairie ancient grains',
  'RawMix Open Prairie Ancient Grains',
  'chicken and turkey',
  'Chicken & Turkey',
  'all life stages',
  'https://openfarmpet.com/products/open-prairie-ancient-grains-for-dogs',
  57,
  55,
  'Rosemary Extract',
  ARRAY['open farm','rawmix','open prairie','ancient grains','chicken','turkey','dog','all life stages','dry']::TEXT[]
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM open_farm_current_repairs repair
    JOIN public.catalog_formulas formula
      ON formula.formula_key = repair.old_formula_key
    JOIN public.catalog_skus sku
      ON sku.formula_id = formula.id
     AND sku.gtin = repair.primary_gtin
    WHERE formula.active
      AND formula.verification_status = 'verified'
      AND cardinality(formula.ingredients) = repair.old_ingredient_count
  ) <> 8 THEN
    RAISE EXCEPTION 'Open Farm repair precondition failed: expected eight exact verified source formulas';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM open_farm_current_repairs repair
    JOIN public.catalog_formulas source_formula
      ON source_formula.formula_key = repair.old_formula_key
    JOIN public.catalog_formulas target_formula
      ON target_formula.formula_key = repair.new_formula_key
     AND target_formula.id <> source_formula.id
  ) THEN
    RAISE EXCEPTION 'Open Farm corrected identity collides with another formula';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM open_farm_current_repairs repair
    JOIN public.catalog_formulas formula
      ON formula.formula_key = repair.old_formula_key
    WHERE repair.primary_gtin <> '683547129344'
      AND (
        cardinality(formula.ingredients) <> repair.current_ingredient_count
        OR formula.ingredients[cardinality(formula.ingredients)]
             IS DISTINCT FROM repair.expected_current_last
      )
  ) THEN
    RAISE EXCEPTION 'Open Farm official current ingredient-vector assertion failed';
  END IF;
END
$$;

-- The live official Open Prairie page changed from the older 57-item retailer
-- panel to this 55-item latest-lot list. "CH Turkey" is a Certified Humane
-- display prefix and is normalized to the ingredient identity "Turkey".
UPDATE public.catalog_formulas formula
SET
  ingredients = ARRAY[
    'Chicken',
    'Turkey',
    'Menhaden Fish Meal',
    'Barley',
    'Brown Rice',
    'Herring Meal',
    'Coconut Oil',
    'Pumpkin',
    'Natural Flavor (yeast)',
    'Sunflower Oil (Preserved with Mixed Tocopherols)',
    'Carrots',
    'Apples',
    'Cranberries',
    'Chicken Livers',
    'Potassium Chloride',
    'Chicken Necks',
    'Vitamin E Supplement',
    'Vitamin A Supplement',
    'Niacin Supplement',
    'Pantothenic Acid',
    'Riboflavin Supplement',
    'Vitamin D3 Supplement',
    'Thiamine Mononitrate',
    'Vitamin B12 Supplement',
    'Pyridoxine Hydrochloride',
    'Folic Acid',
    'Potatoes',
    'Tapioca',
    'Dried Chicory Root',
    'Zinc Proteinate',
    'Iron Proteinate',
    'Copper Proteinate',
    'Manganese Proteinate',
    'Selenium Yeast',
    'Calcium Iodate',
    'Salt',
    'Taurine',
    'Dried Kelp',
    'Organic Butternut Squash',
    'Magnesium Sulfate',
    'Organic Blueberries',
    'Turkey Gizzards',
    'Montmorillonite Clay',
    'Miscanthus Grass',
    'Chicken Bone Broth',
    'Flaxseed',
    'Cinnamon',
    'Turmeric',
    'Organic Spinach',
    'Dandelion Greens',
    'Organic Kale',
    'Organic Apple Cider Vinegar',
    'Organic Pumpkin Seeds',
    'Organic Sunflower Seeds',
    'Rosemary Extract'
  ]::TEXT[],
  ingredient_text = array_to_string(ARRAY[
    'Chicken',
    'Turkey',
    'Menhaden Fish Meal',
    'Barley',
    'Brown Rice',
    'Herring Meal',
    'Coconut Oil',
    'Pumpkin',
    'Natural Flavor (yeast)',
    'Sunflower Oil (Preserved with Mixed Tocopherols)',
    'Carrots',
    'Apples',
    'Cranberries',
    'Chicken Livers',
    'Potassium Chloride',
    'Chicken Necks',
    'Vitamin E Supplement',
    'Vitamin A Supplement',
    'Niacin Supplement',
    'Pantothenic Acid',
    'Riboflavin Supplement',
    'Vitamin D3 Supplement',
    'Thiamine Mononitrate',
    'Vitamin B12 Supplement',
    'Pyridoxine Hydrochloride',
    'Folic Acid',
    'Potatoes',
    'Tapioca',
    'Dried Chicory Root',
    'Zinc Proteinate',
    'Iron Proteinate',
    'Copper Proteinate',
    'Manganese Proteinate',
    'Selenium Yeast',
    'Calcium Iodate',
    'Salt',
    'Taurine',
    'Dried Kelp',
    'Organic Butternut Squash',
    'Magnesium Sulfate',
    'Organic Blueberries',
    'Turkey Gizzards',
    'Montmorillonite Clay',
    'Miscanthus Grass',
    'Chicken Bone Broth',
    'Flaxseed',
    'Cinnamon',
    'Turmeric',
    'Organic Spinach',
    'Dandelion Greens',
    'Organic Kale',
    'Organic Apple Cider Vinegar',
    'Organic Pumpkin Seeds',
    'Organic Sunflower Seeds',
    'Rosemary Extract'
  ]::TEXT[], ', '),
  updated_at = now()
FROM open_farm_current_repairs repair
WHERE formula.formula_key = repair.old_formula_key
  AND repair.primary_gtin = '683547129344';

UPDATE public.catalog_formulas formula
SET
  formula_key = repair.new_formula_key,
  identity_hash = encode(digest(repair.new_formula_key, 'sha256'), 'hex'),
  product_name = repair.product_name,
  product_line = repair.product_line,
  pet_type = CASE
    WHEN repair.primary_gtin IN ('683547120075', '683547122208') THEN 'cat'
    ELSE 'dog'
  END,
  life_stage = repair.life_stage,
  food_form = 'dry',
  flavor = repair.flavor,
  is_complete_food = true,
  complete_food_evidence = CASE
    WHEN repair.primary_gtin = '683547120075'
      THEN 'Current official Open Farm PDP and nutrition label state complete nutrition formulated for AAFCO adult maintenance.'
    ELSE 'Current official Open Farm PDP/QR trace page states complete and balanced nutrition for all life stages, with the stated large-breed-growth exception where applicable.'
  END,
  front_image_url = COALESCE(
    (
      SELECT serving.image_url
      FROM public.product_data serving
      WHERE serving.cache_key = repair.cache_key
      LIMIT 1
    ),
    formula.front_image_url
  ),
  source_url = repair.source_url,
  source_authority = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  protected_terms = repair.protected_terms,
  verification_status = 'verified',
  active = true,
  absent_since = NULL,
  promoted_cache_key = repair.cache_key,
  promoted_at = now(),
  last_observed_at = now(),
  updated_at = now()
FROM open_farm_current_repairs repair
WHERE formula.formula_key = repair.old_formula_key;

-- Two PetSmart size rows were previously modeled as separate adult formulas.
-- They are exact 22 lb SKU children of the current all-life-stages venison and
-- beef formulas, so move all durable evidence before quarantining the aliases.
CREATE TEMP TABLE open_farm_duplicate_formula_merge ON COMMIT DROP AS
SELECT
  legacy.id AS legacy_formula_id,
  canonical.id AS canonical_formula_id,
  legacy.formula_key AS legacy_formula_key,
  legacy.identity_hash AS legacy_identity_hash,
  canonical.source_url
FROM (
  VALUES
    (
      'open farm|open farm|open farm goodbowl with grain all life stages dry cat food ethically and sustainably sourced salmon|cat|all life stages|dry||',
      'open farm|open farm|goodbowl wild caught|cat|adult|dry|salmon and brown rice|'
    ),
    (
      'open farm|open farm|open farm with grain adult dry dog food humanely raised and sustainably sourced venison|dog|adult|dry||',
      'open farm|open farm|new zealand|dog|all life stages|dry|venison and ancient grains|'
    ),
    (
      'open farm|open farm|open farm with grain adult dry dog food humanely raised and sustainably sourced beef|dog|adult|dry||',
      'open farm|open farm|grass fed|dog|all life stages|dry|beef and ancient grains|'
    )
) exact(legacy_formula_key, canonical_formula_key)
JOIN public.catalog_formulas legacy
  ON legacy.formula_key = exact.legacy_formula_key
JOIN public.catalog_formulas canonical
  ON canonical.formula_key = exact.canonical_formula_key;

DO $$
BEGIN
  IF (SELECT count(*) FROM open_farm_duplicate_formula_merge) <> 3 THEN
    RAISE EXCEPTION 'Open Farm retailer size-formula merge did not resolve all three exact aliases';
  END IF;
END
$$;

UPDATE public.catalog_observations observation
SET formula_id = merge.canonical_formula_id
FROM open_farm_duplicate_formula_merge merge
WHERE observation.formula_id = merge.legacy_formula_id;

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash
)
SELECT
  merge.canonical_formula_id,
  evidence.observation_id,
  evidence.field_name,
  evidence.field_value,
  evidence.source_url,
  evidence.source_authority,
  evidence.accepted,
  evidence.observed_at,
  evidence.content_hash
FROM open_farm_duplicate_formula_merge merge
JOIN public.catalog_field_evidence evidence
  ON evidence.formula_id = merge.legacy_formula_id
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = public.catalog_field_evidence.accepted OR EXCLUDED.accepted,
  observed_at = GREATEST(public.catalog_field_evidence.observed_at, EXCLUDED.observed_at);

DELETE FROM public.catalog_field_evidence evidence
USING open_farm_duplicate_formula_merge merge
WHERE evidence.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_manual_evidence_reviews review
SET
  formula_id = merge.canonical_formula_id,
  corrected_formula_key = canonical.formula_key,
  updated_at = now()
FROM open_farm_duplicate_formula_merge merge
JOIN public.catalog_formulas canonical
  ON canonical.id = merge.canonical_formula_id
WHERE review.formula_id = merge.legacy_formula_id;

DELETE FROM public.catalog_census_formula_members legacy_member
USING open_farm_duplicate_formula_merge merge
WHERE legacy_member.formula_id = merge.legacy_formula_id
  AND EXISTS (
    SELECT 1
    FROM public.catalog_census_formula_members canonical_member
    WHERE canonical_member.snapshot_id = legacy_member.snapshot_id
      AND canonical_member.formula_id = merge.canonical_formula_id
  );

UPDATE public.catalog_census_formula_members member
SET formula_id = merge.canonical_formula_id
FROM open_farm_duplicate_formula_merge merge
WHERE member.formula_id = merge.legacy_formula_id;

UPDATE public.catalog_skus sku
SET
  formula_id = merge.canonical_formula_id,
  updated_at = now()
FROM open_farm_duplicate_formula_merge merge
WHERE sku.formula_id = merge.legacy_formula_id;

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  merge.legacy_formula_key,
  merge.canonical_formula_id,
  merge.legacy_identity_hash,
  'manual_review',
  merge.source_url,
  jsonb_build_object(
    'migration', '20260725230500_repair_open_farm_current_kibble_formulas',
    'reason', 'retailer_title_and_package_size_alias_of_exact_official_formula'
  )
FROM open_farm_duplicate_formula_merge merge
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

UPDATE public.catalog_formulas legacy
SET
  verification_status = 'quarantined',
  active = false,
  absent_since = now(),
  promoted_cache_key = NULL,
  updated_at = now()
FROM open_farm_duplicate_formula_merge merge
WHERE legacy.id = merge.legacy_formula_id;

UPDATE public.product_data serving
SET
  product_name = repair.product_name,
  brand = 'Open Farm',
  ingredients = formula.ingredients,
  ingredient_text = formula.ingredient_text,
  ingredient_count = cardinality(formula.ingredients),
  source = 'open-farm',
  source_url = repair.source_url,
  scraped_at = now(),
  expires_at = now() + interval '365 days',
  image_url = COALESCE(formula.front_image_url, serving.image_url),
  is_complete_food = true,
  catalog_exclusion_reason = NULL,
  pet_type = formula.pet_type,
  source_quality = 'manufacturer',
  ingredient_verification_status = 'manufacturer',
  image_verification_status = 'manufacturer',
  verified_at = now(),
  gtin = repair.primary_gtin,
  product_line = repair.serving_product_line,
  flavor = repair.serving_flavor,
  life_stage = repair.life_stage,
  food_form = 'dry',
  updated_at = now()
FROM open_farm_current_repairs repair
JOIN public.catalog_formulas formula
  ON formula.formula_key = repair.new_formula_key
WHERE serving.cache_key = repair.cache_key;

-- Retailer serving aliases remain evidence/SKU observations but cannot compete
-- with the exact current manufacturer serving row in search or barcode lookup.
UPDATE public.product_data alias
SET
  is_complete_food = false,
  catalog_exclusion_reason =
    'duplicate_formula_sku_alias_current_manufacturer_evidence',
  updated_at = now()
FROM public.catalog_skus sku
JOIN public.catalog_formulas formula
  ON formula.id = sku.formula_id
JOIN open_farm_current_repairs repair
  ON repair.new_formula_key = formula.formula_key
WHERE alias.gtin = sku.gtin
  AND alias.cache_key <> repair.cache_key;

-- Normalize existing SKU provenance to the official Open Farm catalog.
UPDATE public.catalog_skus sku
SET
  source_slug = 'open-farm',
  source_external_id = exact.official_sku,
  source_url = repair.source_url,
  package_size = exact.package_size,
  package_count = 1,
  active = true,
  last_observed_at = now(),
  updated_at = now()
FROM (
  VALUES
    ('683547120075','12007','3 lb'),
    ('683547120099','12009','7 lb'),
    ('683547120112','12011','3.5 lb'),
    ('683547120167','12016','19 lb'),
    ('683547121034','12103','4 lb'),
    ('683547121058','12105','22 lb'),
    ('683547122208','12220','2 lb'),
    ('628451123231','12323','4 lb'),
    ('628451123286','12328','8 lb'),
    ('683547125308','12530','4 lb'),
    ('683547125315','12531','11 lb'),
    ('683547125322','12532','22 lb'),
    ('683547125780','12578','4 lb'),
    ('683547125797','12579','11 lb'),
    ('683547125803','12580','22 lb'),
    ('683547128408','12840','4 lb'),
    ('683547128415','12841','11 lb'),
    ('683547128422','12842','22 lb'),
    ('683547129344','12934','3.5 lb'),
    ('683547129443','12944','20 lb')
) exact(gtin, official_sku, package_size),
public.catalog_formulas formula
JOIN open_farm_current_repairs repair
  ON repair.new_formula_key = formula.formula_key
WHERE formula.id = sku.formula_id
  AND sku.gtin = exact.gtin;

-- Add every additional official package GTIN published by the live Shopify
-- product variants. Formula identity remains independent of package size.
INSERT INTO public.catalog_skus (
  formula_id,
  gtin,
  package_size,
  package_count,
  source_slug,
  source_external_id,
  source_url,
  active,
  first_observed_at,
  last_observed_at,
  updated_at
)
SELECT
  formula.id,
  exact.gtin,
  exact.package_size,
  1,
  'open-farm',
  exact.official_sku,
  repair.source_url,
  true,
  now(),
  now(),
  now()
FROM (
  VALUES
    ('683547120075','12007','3 lb','683547120075'),
    ('683547120099','12009','7 lb','683547120075'),
    ('683547120112','12011','3.5 lb','683547120112'),
    ('683547120167','12016','19 lb','683547120112'),
    ('683547121034','12103','4 lb','683547121034'),
    ('683547121058','12105','22 lb','683547121034'),
    ('683547122208','12220','2 lb','683547122208'),
    ('628451123231','12323','4 lb','683547122208'),
    ('628451123286','12328','8 lb','683547122208'),
    ('683547125308','12530','4 lb','683547125308'),
    ('683547125315','12531','11 lb','683547125308'),
    ('683547125322','12532','22 lb','683547125308'),
    ('683547125780','12578','4 lb','683547125780'),
    ('683547125797','12579','11 lb','683547125780'),
    ('683547125803','12580','22 lb','683547125780'),
    ('683547128408','12840','4 lb','683547128408'),
    ('683547128415','12841','11 lb','683547128408'),
    ('683547128422','12842','22 lb','683547128408'),
    ('683547129344','12934','3.5 lb','683547129344'),
    ('683547129443','12944','20 lb','683547129344')
) exact(gtin, official_sku, package_size, primary_gtin)
JOIN open_farm_current_repairs repair
  ON repair.primary_gtin = exact.primary_gtin
JOIN public.catalog_formulas formula
  ON formula.formula_key = repair.new_formula_key
ON CONFLICT (source_slug, source_external_id, gtin, package_size)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  source_url = EXCLUDED.source_url,
  package_count = 1,
  active = true,
  last_observed_at = now(),
  updated_at = now();

INSERT INTO public.catalog_formula_aliases (
  alias_formula_key,
  formula_id,
  identity_hash,
  match_reason,
  source_url,
  metadata
)
SELECT
  repair.old_formula_key,
  formula.id,
  encode(digest(repair.old_formula_key, 'sha256'), 'hex'),
  'manual_review',
  repair.source_url,
  jsonb_build_object(
    'migration', '20260725230500_repair_open_farm_current_kibble_formulas',
    'reason', 'official_current_formula_and_life_stage_reconciliation'
  )
FROM open_farm_current_repairs repair
JOIN public.catalog_formulas formula
  ON formula.formula_key = repair.new_formula_key
WHERE repair.old_formula_key <> repair.new_formula_key
ON CONFLICT (alias_formula_key) DO UPDATE
SET
  formula_id = EXCLUDED.formula_id,
  identity_hash = EXCLUDED.identity_hash,
  match_reason = EXCLUDED.match_reason,
  source_url = EXCLUDED.source_url,
  metadata = public.catalog_formula_aliases.metadata || EXCLUDED.metadata,
  updated_at = now();

INSERT INTO public.catalog_field_evidence (
  formula_id,
  observation_id,
  field_name,
  field_value,
  source_url,
  source_authority,
  accepted,
  observed_at,
  content_hash
)
SELECT
  formula.id,
  NULL,
  evidence.field_name,
  to_jsonb(evidence.field_value),
  repair.source_url,
  'manufacturer',
  true,
  now(),
  encode(
    digest(
      formula.id::TEXT || '|' || evidence.field_name || '|' ||
      evidence.field_value || '|' || repair.source_url,
      'sha256'
    ),
    'hex'
  )
FROM open_farm_current_repairs repair
JOIN public.catalog_formulas formula
  ON formula.formula_key = repair.new_formula_key
CROSS JOIN LATERAL (
  VALUES
    ('ingredient_text', formula.ingredient_text),
    ('life_stage', formula.life_stage),
    ('formula_identity', formula.formula_key),
    ('complete_food_evidence', formula.complete_food_evidence),
    ('official_variant_gtins', (
      SELECT string_agg(sku.gtin, ',' ORDER BY sku.gtin)
      FROM public.catalog_skus sku
      WHERE sku.formula_id = formula.id
        AND sku.active
        AND sku.gtin IS NOT NULL
    ))
) evidence(field_name, field_value)
ON CONFLICT (formula_id, field_name, source_url, content_hash)
DO UPDATE SET
  accepted = true,
  observed_at = EXCLUDED.observed_at;

DO $$
DECLARE
  repair_row RECORD;
  sku_row RECORD;
  v_search_cache TEXT;
  v_barcode_cache TEXT;
  v_alias_offenders TEXT;
BEGIN
  FOR repair_row IN SELECT * FROM open_farm_current_repairs LOOP
    SELECT cache_key
    INTO v_search_cache
    FROM public.search_verified_products(repair_row.product_name, 5)
    LIMIT 1;

    IF v_search_cache IS DISTINCT FROM repair_row.cache_key THEN
      RAISE EXCEPTION
        'Open Farm exact search regression for %: expected %, received %',
        repair_row.product_name, repair_row.cache_key, v_search_cache;
    END IF;

    IF (
      SELECT count(*)
      FROM public.product_data serving
      WHERE serving.cache_key = repair_row.cache_key
        AND serving.ingredient_count = repair_row.current_ingredient_count
        AND serving.ingredients[cardinality(serving.ingredients)]
              = repair_row.expected_current_last
        AND serving.life_stage = repair_row.life_stage
        AND serving.is_complete_food
        AND serving.ingredient_verification_status = 'manufacturer'
        AND serving.image_verification_status = 'manufacturer'
    ) <> 1 THEN
      RAISE EXCEPTION 'Open Farm serving verification failed for %', repair_row.cache_key;
    END IF;

    FOR sku_row IN
      SELECT sku.gtin
      FROM public.catalog_skus sku
      JOIN public.catalog_formulas formula
        ON formula.id = sku.formula_id
      WHERE formula.formula_key = repair_row.new_formula_key
        AND sku.active
        AND sku.gtin IS NOT NULL
    LOOP
      SELECT cache_key
      INTO v_barcode_cache
      FROM public.resolve_verified_product_by_gtin(sku_row.gtin, 8)
      LIMIT 1;

      IF v_barcode_cache IS DISTINCT FROM repair_row.cache_key THEN
        RAISE EXCEPTION
          'Open Farm barcode regression for %: expected %, received %',
          sku_row.gtin, repair_row.cache_key, v_barcode_cache;
      END IF;
    END LOOP;
  END LOOP;

  SELECT string_agg(alias.gtin || ':' || alias.cache_key, ', ' ORDER BY alias.gtin, alias.cache_key)
  INTO v_alias_offenders
  FROM public.product_data alias
  JOIN public.catalog_skus sku
    ON sku.gtin = alias.gtin
   AND sku.active
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
  JOIN open_farm_current_repairs repair
    ON repair.new_formula_key = formula.formula_key
  WHERE alias.cache_key <> repair.cache_key
    AND alias.is_complete_food;

  IF v_alias_offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Open Farm duplicate serving aliases still compete with canonical rows: %',
      v_alias_offenders;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.product_data alias
    JOIN public.catalog_skus sku
      ON sku.gtin = alias.gtin
     AND sku.active
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
    JOIN open_farm_current_repairs repair
      ON repair.new_formula_key = formula.formula_key
    WHERE alias.cache_key <> repair.cache_key
      AND alias.is_complete_food
  ) THEN
    RAISE EXCEPTION 'Open Farm duplicate serving alias guard produced inconsistent results';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_skus sku
    JOIN public.catalog_formulas formula
      ON formula.id = sku.formula_id
    JOIN open_farm_current_repairs repair
      ON repair.new_formula_key = formula.formula_key
    WHERE sku.active
      AND sku.gtin IS NOT NULL
  ) <> 20 THEN
    RAISE EXCEPTION 'Open Farm official package GTIN set is incomplete';
  END IF;
END
$$;
