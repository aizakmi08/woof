-- The current official Wellness PDP proves the product identity, species,
-- wet form, front image, and complete-food classification, but its extracted
-- payload does not contain a full ingredient statement. Keep this formula in
-- the private evidence queue instead of borrowing ingredients from a sibling.
--
-- The Protein Bowls Beef & Lamb Value Pack from the same inventory is not
-- queued as one formula: it is a multi-formula parent and is explicitly
-- excluded in scripts/catalog-formula-exclusions.json.

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
  observed_at,
  attempt_count,
  review_notes
)
VALUES (
  'official-gap:wellness:core-digestive-health-chicken-beef:20260726',
  'wellness pet company|wellness|wellness core digestive health chicken and beef|dog|unknown|wet|chicken and beef|',
  '',
  'Wellness',
  'Wellness CORE Digestive Health Chicken & Beef',
  'Wellness CORE Digestive Health Chicken Beef ingredients official',
  jsonb_build_array(
    'https://www.wellnesspetfood.com/product-catalog/wellness-core-digestive-health-chicken-beef/',
    'https://images.salsify.com/image/upload/s--2wFWFJZm--/w_500/uyfwpa5gmynoai4wdurq.jpg'
  ),
  'https://www.wellnesspetfood.com/product-catalog/wellness-core-digestive-health-chicken-beef/',
  'manufacturer_page',
  jsonb_build_object(
    'manufacturer', 'Wellness Pet Company',
    'brand', 'Wellness',
    'product_line', 'CORE Digestive Health',
    'product_name', 'Wellness CORE Digestive Health Chicken & Beef',
    'pet_type', 'dog',
    'life_stage', 'unknown',
    'food_form', 'wet',
    'flavor', 'Chicken & Beef',
    'diet_condition', 'digestive health'
  ),
  jsonb_build_object(
    'identity_source', 'official manufacturer PDP',
    'front_image_verified', true,
    'complete_food_claim_captured', true,
    'ingredient_statement_captured', false
  ),
  'quarantined',
  'missing_current_full_ingredient_evidence',
  '2026-07-26T09:40:08.932Z'::timestamptz,
  1,
  'Do not promote until this exact current PDP, an official label/PDF, or an unambiguous current package label supplies the full ingredient statement. No sibling ingredients are permitted.'
)
ON CONFLICT (review_key) DO UPDATE SET
  target_formula_key = EXCLUDED.target_formula_key,
  product_name = EXCLUDED.product_name,
  search_query = EXCLUDED.search_query,
  discovery_urls = EXCLUDED.discovery_urls,
  authoritative_source_url = EXCLUDED.authoritative_source_url,
  authoritative_source_type = EXCLUDED.authoritative_source_type,
  expected_identity = EXCLUDED.expected_identity,
  resolved_identity = EXCLUDED.resolved_identity,
  evidence_status = EXCLUDED.evidence_status,
  quarantine_reason = EXCLUDED.quarantine_reason,
  observed_at = EXCLUDED.observed_at,
  attempt_count = public.catalog_manual_evidence_reviews.attempt_count + 1,
  review_notes = EXCLUDED.review_notes,
  updated_at = now();

DO $$
DECLARE
  queued_count INTEGER;
BEGIN
  SELECT count(*)
  INTO queued_count
  FROM public.catalog_manual_evidence_reviews
  WHERE review_key =
    'official-gap:wellness:core-digestive-health-chicken-beef:20260726'
    AND evidence_status = 'quarantined'
    AND quarantine_reason = 'missing_current_full_ingredient_evidence'
    AND authoritative_source_type = 'manufacturer_page';

  IF queued_count <> 1 THEN
    RAISE EXCEPTION
      'Wellness CORE Digestive Health evidence gap was not durably quarantined';
  END IF;
END $$;
