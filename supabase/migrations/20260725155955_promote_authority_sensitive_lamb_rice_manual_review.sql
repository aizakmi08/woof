-- Complete the durable manual-review ledger with every exact package child.
UPDATE public.catalog_manual_evidence_reviews review
SET
  evidence_status = 'promoted',
  formula_id = formula.id,
  promoted_cache_key = formula.promoted_cache_key,
  resolved_identity = COALESCE(review.resolved_identity, '{}'::jsonb)
    || jsonb_build_object(
      'manufacturer', 'petsmart',
      'brand', 'authority',
      'product_line', 'sensitive stomach and skin',
      'pet_type', 'dog',
      'life_stage', 'adult',
      'food_form', 'dry',
      'flavor', 'lamb and rice',
      'diet_condition', 'sensitive stomach and skin',
      'package_variants', jsonb_build_array(
        jsonb_build_object(
          'sku_id', '5309277',
          'gtin', '0737257936355',
          'package_size', '6 lb'
        ),
        jsonb_build_object(
          'sku_id', '5309278',
          'gtin', '0737257936331',
          'package_size', '34 lb'
        ),
        jsonb_build_object(
          'sku_id', '5348620',
          'gtin', '0196481057739',
          'package_size', '18 lb'
        ),
        jsonb_build_object(
          'sku_id', '5360305',
          'gtin', '0196481089488',
          'package_size', '45 lb'
        )
      )
    ),
  review_notes = concat_ws(
    ' | ',
    NULLIF(review.review_notes, ''),
    'Promoted one canonical current formula with four exact PetSmart SKU children. Shared PDP Deboned Lamb copy was rejected in favor of each exact SKU-bound ingredient label, which starts with Lamb.'
  ),
  updated_at = now()
FROM public.catalog_formulas formula
WHERE review.review_key =
    'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
  AND formula.formula_key =
    'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
  AND formula.active
  AND formula.verification_status = 'verified';

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key =
    'manual-retailer:petsmart:authority-sensitive-lamb-rice-adult-dog:20260725'
    AND evidence_status = 'promoted'
    AND formula_id = (
      SELECT id
      FROM public.catalog_formulas
      WHERE formula_key =
        'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin'
    )
    AND promoted_cache_key = 'petsmart-authority:196481089488'
    AND jsonb_array_length(resolved_identity->'package_variants') = 4;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Authority manual review promotion failed: %',
      v_count;
  END IF;
END $$;
