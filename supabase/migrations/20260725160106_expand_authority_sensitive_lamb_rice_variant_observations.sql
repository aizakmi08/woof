-- Expand the exact-evidence run from one formula observation to all four
-- package variants exposed by PetSmart's authoritative variant map.
UPDATE public.catalog_observations observation
SET
  source_external_id = '5360305',
  package_size = '45 lb',
  raw_payload = COALESCE(observation.raw_payload, '{}'::jsonb)
    || jsonb_build_object(
      'sku_id', '5360305',
      'package_size', '45 lb',
      'front_image_url',
        'https://s7d2.scene7.com/is/image/PetSmart/5360305',
      'ingredient_label_url',
        'https://s7d2.scene7.com/is/image/PetSmart/5360305_alt6?fmt=png&wid=1800&hei=1800',
      'variant_map_verified', TRUE
    )
WHERE observation.run_id = (
    SELECT run.id
    FROM public.catalog_source_runs run
    WHERE run.metadata->>'review_key' =
      'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
    ORDER BY run.id DESC
    LIMIT 1
  )
  AND observation.gtin = '0196481089488';

WITH run AS (
  SELECT id
  FROM public.catalog_source_runs
  WHERE metadata->>'review_key' =
    'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
  ORDER BY id DESC
  LIMIT 1
),
canonical AS (
  SELECT *
  FROM public.catalog_formulas
  WHERE formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
),
variants(
  source_external_id,
  gtin,
  package_size,
  source_url,
  front_image_url,
  ingredient_label_url
) AS (
  VALUES
    (
      '5309277',
      '0737257936355',
      '6 lb',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5309277.html',
      'https://s7d2.scene7.com/is/image/PetSmart/5309277',
      'https://s7d2.scene7.com/is/image/PetSmart/5309277_alt6?fmt=png&wid=1800&hei=1800'
    ),
    (
      '5309278',
      '0737257936331',
      '34 lb',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5309278.html',
      'https://s7d2.scene7.com/is/image/PetSmart/5309278',
      'https://s7d2.scene7.com/is/image/PetSmart/5309278_alt6?fmt=png&wid=1800&hei=1800'
    ),
    (
      '5348620',
      '0196481057739',
      '18 lb',
      'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5348620.html',
      'https://s7d2.scene7.com/is/image/PetSmart/5348620',
      'https://s7d2.scene7.com/is/image/PetSmart/5348620_alt6?fmt=png&wid=1800&hei=1800'
    )
)
INSERT INTO public.catalog_observations (
  run_id,
  formula_id,
  source_slug,
  source_external_id,
  source_url,
  source_authority,
  gtin,
  manufacturer,
  brand,
  product_name,
  product_line,
  pet_type,
  life_stage,
  food_form,
  flavor,
  diet_condition,
  package_size,
  ingredient_text,
  front_image_url,
  is_complete_food,
  available_in_us,
  observed_at,
  content_hash,
  validation_status,
  validation_reasons,
  raw_payload
)
SELECT
  run.id,
  canonical.id,
  'petsmart-private-label-manual',
  variants.source_external_id,
  variants.source_url,
  'retailer_verified',
  variants.gtin,
  canonical.manufacturer,
  canonical.brand,
  canonical.product_name,
  canonical.product_line,
  canonical.pet_type,
  canonical.life_stage,
  canonical.food_form,
  canonical.flavor,
  canonical.diet_condition,
  variants.package_size,
  canonical.ingredient_text,
  variants.front_image_url,
  TRUE,
  TRUE,
  now(),
  encode(
    digest(
      concat_ws(
        '|',
        variants.source_external_id,
        variants.gtin,
        variants.package_size,
        variants.source_url,
        variants.front_image_url,
        variants.ingredient_label_url,
        canonical.ingredient_text
      ),
      'sha256'
    ),
    'hex'
  ),
  'accepted',
  ARRAY[]::TEXT[],
  jsonb_build_object(
    'manual_evidence_review_key',
      'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725',
    'sku_id', variants.source_external_id,
    'package_size', variants.package_size,
    'front_image_url', variants.front_image_url,
    'ingredient_label_url', variants.ingredient_label_url,
    'ingredient_evidence_mode', 'authoritative_label_transcription',
    'variant_map_verified', TRUE,
    'search_results_are_discovery_only', TRUE
  )
FROM run
CROSS JOIN canonical
CROSS JOIN variants
ON CONFLICT (
  run_id,
  source_slug,
  source_external_id,
  content_hash
)
DO UPDATE SET
  formula_id = EXCLUDED.formula_id,
  source_url = EXCLUDED.source_url,
  source_authority = EXCLUDED.source_authority,
  gtin = EXCLUDED.gtin,
  package_size = EXCLUDED.package_size,
  ingredient_text = EXCLUDED.ingredient_text,
  front_image_url = EXCLUDED.front_image_url,
  validation_status = 'accepted',
  validation_reasons = ARRAY[]::TEXT[],
  raw_payload = EXCLUDED.raw_payload;

UPDATE public.catalog_source_runs
SET
  expected_count = 4,
  observed_count = 4,
  accepted_count = 4,
  rejected_count = 0,
  pagination_complete = TRUE,
  metadata = COALESCE(metadata, '{}'::jsonb)
    || jsonb_build_object(
      'exact_package_variant_count', 4,
      'variant_evidence_expanded_at', now(),
      'variant_identity_source', 'PetSmart authoritative PDP variant map',
      'ingredient_identity_source', 'exact SKU-bound PetSmart Scene7 labels'
    ),
  updated_at = now()
WHERE id = (
  SELECT id
  FROM public.catalog_source_runs
  WHERE metadata->>'review_key' =
    'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
  ORDER BY id DESC
  LIMIT 1
);

DO $$
DECLARE
  v_count INTEGER;
  v_run_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.catalog_observations observation
  WHERE observation.run_id = (
      SELECT run.id
      FROM public.catalog_source_runs run
      WHERE run.metadata->>'review_key' =
        'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
      ORDER BY run.id DESC
      LIMIT 1
    )
    AND observation.validation_status = 'accepted'
    AND observation.source_external_id IN (
      '5309277',
      '5309278',
      '5348620',
      '5360305'
    );

  SELECT count(*) INTO v_run_count
  FROM public.catalog_source_runs
  WHERE metadata->>'review_key' =
      'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
    AND expected_count = 4
    AND observed_count = 4
    AND accepted_count = 4
    AND rejected_count = 0
    AND pagination_complete;

  IF v_count <> 4 OR v_run_count <> 1 THEN
    RAISE EXCEPTION
      'Authority variant observations failed: observations %, runs %',
      v_count,
      v_run_count;
  END IF;
END $$;
