DO $$
BEGIN
  UPDATE public.catalog_product_evidence e
  SET
    product_name = p.product_name,
    source = 'applaws-manufacturer-manual',
    source_quality = 'manufacturer',
    source_url = p.source_url,
    ingredient_source_url = p.source_url,
    image_source_url = p.source_url,
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    content_hash = encode(digest(p.ingredient_text || '|' || p.image_url, 'sha256'), 'hex'),
    extractor_version = '2026-07-25-manual-exact-evidence-v1',
    review_state = 'promoted',
    rejection_reason = NULL,
    evidence = jsonb_build_object(
      'has_image', true,
      'verified_at', now(),
      'has_source_url', true,
      'ingredient_count', p.ingredient_count,
      'official_product_url', p.source_url,
      'official_front_image_url', p.image_url
    ),
    updated_at = now()
  FROM public.product_data p
  WHERE e.cache_key = p.cache_key
    AND e.cache_key IN (
      'petsmart-retail-catalog:886817005267',
      'petsmart-retail-catalog:886817014375'
    );

  INSERT INTO public.catalog_field_evidence (
    formula_id, observation_id, field_name, field_value, source_url,
    source_authority, accepted, observed_at, content_hash
  )
  SELECT
    f.id, NULL, x.field_name, to_jsonb(x.field_value), x.source_url,
    'manufacturer', true, now(),
    encode(digest(x.field_name || '|' || x.field_value || '|' || x.source_url, 'sha256'), 'hex')
  FROM public.catalog_formulas f
  CROSS JOIN LATERAL (
    VALUES
      ('ingredient_text', f.ingredient_text, f.source_url),
      ('front_image_url', f.front_image_url, f.source_url)
  ) AS x(field_name, field_value, source_url)
  WHERE f.promoted_cache_key IN (
    'petsmart-retail-catalog:886817005267',
    'petsmart-retail-catalog:886817014375'
  )
  ON CONFLICT (formula_id, field_name, source_url, content_hash) DO UPDATE
  SET accepted = true, observed_at = excluded.observed_at;

  IF (
    SELECT count(*)
    FROM public.catalog_product_evidence
    WHERE cache_key IN (
      'petsmart-retail-catalog:886817005267',
      'petsmart-retail-catalog:886817014375'
    )
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND review_state = 'promoted'
  ) <> 2 THEN
    RAISE EXCEPTION 'Applaws product evidence provenance failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.catalog_field_evidence fe
    JOIN public.catalog_formulas f ON f.id = fe.formula_id
    WHERE f.promoted_cache_key IN (
      'petsmart-retail-catalog:886817005267',
      'petsmart-retail-catalog:886817014375'
    )
      AND fe.accepted
      AND fe.source_authority = 'manufacturer'
      AND fe.field_name IN ('ingredient_text', 'front_image_url')
  ) < 4 THEN
    RAISE EXCEPTION 'Applaws field evidence provenance failed';
  END IF;
END
$$;
