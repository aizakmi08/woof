-- Collapse seven PetSmart observations that are exact copies of an existing
-- retailer_web_version. The package GTIN, full normalized ingredient hash,
-- front image, source URL, brand, species, life stage, form, and recipe were
-- reviewed. This never overwrites ingredients and does not merge a different
-- formula version.

CREATE TEMP TABLE reviewed_petsmart_equivalence_v177 ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset($reviewed$
[
  {
    "alias_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food turkey and sweet potato|dog|adult|frozen|turkey and sweet potato|",
    "identity_hash": "10dbf23ccd9b3aa0ef29afc3a1470d2fdca7aa2ffa639fc11f7fd3b6c5b3cd43",
    "source_url": "https://www.petsmart.com/dog/food/fresh-food/simply-nourish-fresh-market-adult-frozen-dog-food-turkey-and-sweet-potato-75868.html",
    "gtin": "196481013872",
    "expected_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food turkey and sweet potato|dog|all life stages|fresh|turkey and sweet potato|",
    "cache_key": "petsmart-retail-catalog:196481013872",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5332993",
    "ingredient_hash": "1dc1a09e148765c35ff68ae9c28d39288883c99163039a6cbde0b3c77ba10515"
  },
  {
    "alias_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food beef and barley|dog|adult|frozen|beef and barley|",
    "identity_hash": "13d5abe8621640f10bacb7b3061f941c8aa66b0062cc15dbcdbe66838a4a4e13",
    "source_url": "https://www.petsmart.com/dog/food/fresh-food/simply-nourish-fresh-market-adult-frozen-dog-food-beef-and-barley-75866.html",
    "gtin": "196481013889",
    "expected_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food beef and barley|dog|all life stages|fresh|beef and barley|",
    "cache_key": "petsmart-retail-catalog:196481013889",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5332988",
    "ingredient_hash": "e3e92cf5446d7a228b26792d78b7c73183591698621504e9ad90b60560c17112"
  },
  {
    "alias_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food chicken and vegetable|dog|adult|frozen|chicken and vegetable|",
    "identity_hash": "c6c6606f40481303ea32634be8484bbc0743d4a31975fd34e64b1b66ea391742",
    "source_url": "https://www.petsmart.com/dog/food/fresh-food/simply-nourish-fresh-market-adult-frozen-dog-food-chicken-and-vegetable-75867.html",
    "gtin": "196481013902",
    "expected_formula_key": "simply nourish|simply nourish|simply nourish fresh market adult frozen dog food chicken and vegetable|dog|all life stages|fresh|chicken and vegetable|",
    "cache_key": "petsmart-retail-catalog:196481013902",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5332990",
    "ingredient_hash": "55dc5e5b5bf174f82b32b200588b9cd4b5b6dd2a33e9a5c207bfc740b75269f5"
  },
  {
    "alias_formula_key": "authority|authority|authority sensitive stomach and skin large breed adult dog dry food salmon and rice|dog|adult|dry|salmon and rice|",
    "identity_hash": "5b6652fb63139be20c1756dbcab9f0fc525684b7f990a0cbd1b6a926c5a6aaee",
    "source_url": "https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-large-breed-adult-dog-dry-food---salmon-and-rice-73796.html",
    "gtin": "196481014640",
    "expected_formula_key": "authority|authority|authority sensitive stomach and skin large breed adult dog dry food salmon and rice|dog|all life stages|dry||",
    "cache_key": "petsmart-authority:196481014640",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5333997",
    "ingredient_hash": "2c53b077dc536c02df6725150566fcc035cd478d236521f4df893f2ef7b528bc"
  },
  {
    "alias_formula_key": "simply nourish|simply nourish|simply nourish dry puppy food salmon and brown rice|dog|puppy|dry|salmon and brown rice|",
    "identity_hash": "cc1f1f74ee0ffab935121aabf450f4d07ed8bd7b23fb582bfd1cfbd48a7d5310",
    "source_url": "https://www.petsmart.com/dog/food/dry-food/simply-nourish-dry-puppy-food---salmon-and-brown-rice-82445.html",
    "gtin": "196481057708",
    "expected_formula_key": "simply nourish|simply nourish|simply nourish dry puppy food salmon and brown rice|dog|adult|dry|salmon and brown rice|",
    "cache_key": "petsmart-simply-nourish:196481057708",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5348545",
    "ingredient_hash": "587755ef2973d92fb355ac20a0f6d27fb891de02059f73373029908fc4b18bb9"
  },
  {
    "alias_formula_key": "authority|authority|authority digestive support adult wet dog food chicken with pumpkin|dog|adult|wet|chicken and pumpkin|",
    "identity_hash": "269d1c1d6963f44e6143fd0f16429dd71e52dccb02cdb5994cb3d59a7a1127f3",
    "source_url": "https://www.petsmart.com/dog/food/canned-food/authority-digestive-support-adult-wet-dog-food-chicken-with-pumpkin-10-oz-80309.html",
    "gtin": "196481058194",
    "expected_formula_key": "authority|authority|authority digestive support adult wet dog food chicken with pumpkin|dog|all life stages|wet|chicken and pumpkin|",
    "cache_key": "petsmart-retail-catalog:196481058194",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5348621",
    "ingredient_hash": "68ed9e9a42a49b6076c426753bfd4bc7e3f0474bb04418573f6a985d7fb0d0e6"
  },
  {
    "alias_formula_key": "simply nourish|simply nourish|simply nourish original large breed adult dry dog food chicken and brown rice|dog|adult|dry|chicken and brown rice|",
    "identity_hash": "1c88005ff1414be521bcf15d9b297e930f0db0f174f80d9f73469c256f13870b",
    "source_url": "https://www.petsmart.com/dog/food/dry-food/simply-nourish-original-large-breed-adult-dry-dog-food---chicken-and-brown-rice-52837.html",
    "gtin": "737257968691",
    "expected_formula_key": "simply nourish|simply nourish|simply nourish original large breed adult dry dog food chicken and brown rice|dog|all life stages|dry|chicken and brown rice|",
    "cache_key": "petsmart-retail-catalog:737257968691",
    "image_url": "https://s7d2.scene7.com/is/image/PetSmart/5319721",
    "ingredient_hash": "a8c3f48cbd82e0011a4e2927be0ae401f8e523d70fd670c6158b29c17356201d"
  }
]
$reviewed$::jsonb)
AS row(
  alias_formula_key text,
  identity_hash text,
  source_url text,
  gtin text,
  expected_formula_key text,
  cache_key text,
  image_url text,
  ingredient_hash text
);

WITH resolved AS (
  SELECT DISTINCT
    reviewed.*,
    formula.id AS formula_id
  FROM reviewed_petsmart_equivalence_v177 reviewed
  JOIN public.catalog_skus sku
    ON sku.active
   AND ltrim(regexp_replace(coalesce(sku.gtin, ''), '[^0-9]', '', 'g'), '0')
     = ltrim(reviewed.gtin, '0')
  JOIN public.catalog_formulas formula
    ON formula.id = sku.formula_id
   AND formula.active
   AND formula.verification_status = 'verified'
   AND formula.formula_key = reviewed.expected_formula_key
   AND formula.formula_evidence_tier = 'retailer_web_version'
  JOIN public.product_data product
    ON product.cache_key = reviewed.cache_key
   AND product.formula_evidence_tier = 'retailer_web_version'
   AND product.ingredient_verification_status = 'retailer_verified'
   AND product.image_verification_status = 'retailer_verified'
   AND product.source_url = reviewed.source_url
   AND product.image_url = reviewed.image_url
   AND encode(
     digest(
       public.catalog_normalize_ingredient_evidence(product.ingredient_text),
       'sha256'
     ),
     'hex'
   ) = reviewed.ingredient_hash
  WHERE (
    SELECT count(DISTINCT conflicting_formula.id)
    FROM public.catalog_skus conflicting_sku
    JOIN public.catalog_formulas conflicting_formula
      ON conflicting_formula.id = conflicting_sku.formula_id
     AND conflicting_formula.active
     AND conflicting_formula.verification_status = 'verified'
    WHERE conflicting_sku.active
      AND ltrim(
        regexp_replace(coalesce(conflicting_sku.gtin, ''), '[^0-9]', '', 'g'),
        '0'
      ) = ltrim(reviewed.gtin, '0')
  ) = 1
)
INSERT INTO public.catalog_formula_aliases (
  alias_formula_key, formula_id, identity_hash, match_reason, source_url,
  metadata, created_at, updated_at
)
SELECT
  resolved.alias_formula_key,
  resolved.formula_id,
  resolved.identity_hash,
  'manual_review',
  resolved.source_url,
  jsonb_build_object(
    'reviewed_at', '2026-07-27',
    'review_wave', 'v177',
    'review_method', 'exact_retailer_package_version_review',
    'gtin', resolved.gtin,
    'cache_key', resolved.cache_key,
    'expected_formula_key', resolved.expected_formula_key,
    'image_url', resolved.image_url,
    'database_ingredient_hash', resolved.ingredient_hash,
    'evidence_artifact',
      'outputs/catalog-source-imports/petsmart-package-equivalence-v177/source-evidence.json',
    'formula_version_policy',
      'same exact retailer_web_version only; never overwrite ingredients or merge a different version',
    'sku_policy', 'package size and count remain SKU children'
  ),
  now(),
  now()
FROM resolved
ON CONFLICT (alias_formula_key) DO UPDATE
SET formula_id = excluded.formula_id,
    identity_hash = excluded.identity_hash,
    match_reason = excluded.match_reason,
    source_url = excluded.source_url,
    metadata = excluded.metadata,
    updated_at = now();

DO $$
DECLARE
  v_resolved integer;
BEGIN
  SELECT count(*)
  INTO v_resolved
  FROM public.catalog_formula_aliases alias
  WHERE alias.metadata->>'review_wave' = 'v177'
    AND alias.metadata->>'review_method'
      = 'exact_retailer_package_version_review';

  IF v_resolved <> 7 THEN
    RAISE EXCEPTION
      'Expected 7 exact PetSmart package equivalence aliases, found %',
      v_resolved;
  END IF;
END
$$;
