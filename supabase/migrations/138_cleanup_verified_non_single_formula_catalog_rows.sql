-- Remove verified source-backed rows that are not a single complete product
-- formula. These rows are usually variety packs, bundles, starter kits, or
-- ambiguous multipacks, so they cannot safely represent one exact ingredient
-- panel in search or scan results.
delete from public.product_data
where source is not null
  and coalesce(source_quality, 'unknown') in (
    'manufacturer',
    'official',
    'gdsn',
    'retailer_verified'
  )
  and coalesce(ingredient_verification_status, 'unverified') in (
    'gdsn',
    'official',
    'manufacturer',
    'retailer_verified',
    'label_ocr_verified'
  )
  and coalesce(image_verification_status, 'unverified') in (
    'official',
    'manufacturer',
    'retailer_verified'
  )
  and public.is_likely_non_product_catalog_row(product_name, brand);
