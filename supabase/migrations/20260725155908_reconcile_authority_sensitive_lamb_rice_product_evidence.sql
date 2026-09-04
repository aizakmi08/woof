-- Bind serving evidence to the exact SKU package labels and demote duplicate
-- size-serving rows without discarding their package provenance.
UPDATE public.catalog_product_evidence
SET
  product_name =
    'Authority Sensitive Stomach & Skin Adult Dog Dry Food - Lamb & Rice',
  brand = 'Authority',
  pet_type = 'dog',
  source = 'petsmart-private-label-manual',
  source_quality = 'retailer_verified',
  source_url =
    'https://www.petsmart.com/dog/food/dry-food/authority-sensitive-stomach-and-skin-adult-dog-dry-food---lamb-and-rice-5360305.html',
  ingredient_source_url =
    'https://s7d2.scene7.com/is/image/PetSmart/5360305_alt6?fmt=png&wid=1800&hei=1800',
  image_source_url =
    'https://s7d2.scene7.com/is/image/PetSmart/5360305',
  ingredient_verification_status = 'label_ocr_verified',
  image_verification_status = 'retailer_verified',
  review_state = 'promoted',
  rejection_reason = NULL,
  evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
    'reconciled_at', now(),
    'reconciled_by',
      'reconcile_authority_sensitive_lamb_rice_product_evidence',
    'ingredient_evidence_mode', 'authoritative_label_transcription',
    'exact_package_variant_count', 4
  ),
  updated_at = now()
WHERE cache_key = 'petsmart-authority:196481089488';

UPDATE public.catalog_product_evidence
SET
  ingredient_source_url =
    'https://s7d2.scene7.com/is/image/PetSmart/5309277_alt6?fmt=png&wid=1800&hei=1800',
  image_source_url =
    'https://s7d2.scene7.com/is/image/PetSmart/5309277',
  ingredient_verification_status = 'label_ocr_verified',
  image_verification_status = 'retailer_verified',
  review_state = 'rejected',
  rejection_reason = 'duplicate_exact_verified_formula_size_variant',
  evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
    'reconciled_at', now(),
    'reconciled_by',
      'reconcile_authority_sensitive_lamb_rice_product_evidence',
    'canonical_cache_key', 'petsmart-authority:196481089488',
    'canonical_formula_key',
      'petsmart|authority|sensitive stomach and skin|dog|adult|dry|lamb and rice|sensitive stomach and skin',
    'ingredient_evidence_mode', 'authoritative_label_transcription',
    'exact_sku_id', '5309277'
  ),
  updated_at = now()
WHERE cache_key = 'petsmart-authority:0737257936355';

UPDATE public.catalog_product_evidence
SET
  review_state = 'rejected',
  rejection_reason = 'duplicate_exact_verified_formula_size_variant',
  evidence = COALESCE(evidence, '{}'::jsonb) || jsonb_build_object(
    'reconciled_at', now(),
    'reconciled_by',
      'reconcile_authority_sensitive_lamb_rice_product_evidence',
    'canonical_cache_key', 'petsmart-authority:196481089488'
  ),
  updated_at = now()
WHERE cache_key = 'petsmart-retail-catalog:196481089488';

DO $$
DECLARE
  v_canonical INTEGER;
  v_six INTEGER;
  v_retail INTEGER;
BEGIN
  SELECT count(*) INTO v_canonical
  FROM public.catalog_product_evidence
  WHERE cache_key = 'petsmart-authority:196481089488'
    AND review_state = 'promoted'
    AND ingredient_source_url =
      'https://s7d2.scene7.com/is/image/PetSmart/5360305_alt6?fmt=png&wid=1800&hei=1800'
    AND ingredient_verification_status = 'label_ocr_verified';

  SELECT count(*) INTO v_six
  FROM public.catalog_product_evidence
  WHERE cache_key = 'petsmart-authority:0737257936355'
    AND review_state = 'rejected'
    AND rejection_reason = 'duplicate_exact_verified_formula_size_variant'
    AND ingredient_source_url =
      'https://s7d2.scene7.com/is/image/PetSmart/5309277_alt6?fmt=png&wid=1800&hei=1800';

  SELECT count(*) INTO v_retail
  FROM public.catalog_product_evidence
  WHERE cache_key = 'petsmart-retail-catalog:196481089488'
    AND review_state = 'rejected'
    AND rejection_reason = 'duplicate_exact_verified_formula_size_variant';

  IF v_canonical <> 1 OR v_six <> 1 OR v_retail <> 1 THEN
    RAISE EXCEPTION
      'Authority product evidence failed: canonical %, six %, retail %',
      v_canonical,
      v_six,
      v_retail;
  END IF;
END $$;
