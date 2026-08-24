-- Refresh the serving cache from the exact current manufacturer PDP,
-- label deck, front image, and GTIN before canonical formula staging.
-- The prior serving version is retained as rejected historical evidence;
-- no sibling title, image, or ingredients are borrowed.
CREATE TEMP TABLE catalog_current_serving_evidence ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(convert_from(decode('W3siY2FjaGVfa2V5IjoibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyIsImd0aW4iOiIiLCJwcm9kdWN0X25hbWUiOiJNZWRhbFNlcmllcyBTaWduYXR1cmUgU3Rld3MgQ2hpY2tlbiwgRHVjayAmIFB1bXBraW4gUmVjaXBlIGZvciBDYXRzIiwicHJvZHVjdF9saW5lIjoiTWVkYWxTZXJpZXMgU2lnbmF0dXJlIFN0ZXdzIiwicGV0X3R5cGUiOiJjYXQiLCJsaWZlX3N0YWdlIjoiYWxsIGxpZmUgc3RhZ2VzIiwiZm9vZF9mb3JtIjoid2V0IiwiZmxhdm9yIjoiQ2hpY2tlbiwgRHVjayAmIFB1bXBraW4gUmVjaXBlIiwicGFja2FnZV9zaXplIjoiIiwiaW5ncmVkaWVudF90ZXh0IjoiQ2hpY2tlbiwgQ2hpY2tlbiBCcm90aCwgRHVjaywgRHVjayBCcm90aCwgUHVtcGtpbiwgQ29jb251dCBPaWwsIFRyaWNhbGNpdW0gUGhvc3BoYXRlLCBQb3Rhc3NpdW0gQ2hsb3JpZGUsIFhhbnRoYW4gR3VtLCBTYWx0LCBJbnVsaW4sIEd1YXIgR3VtLCBDaG9saW5lIENobG9yaWRlLCBUYXVyaW5lLCBNYWduZXNpdW0gU3VsZmF0ZSwgU2FsbW9uIE9pbCwgUGFyc2xleSwgSXJvbiBBbWlubyBBY2lkIENoZWxhdGUsIFppbmMgQW1pbm8gQWNpZCBDaGVsYXRlLCBWaXRhbWluIEUgU3VwcGxlbWVudCwgTC1Bc2NvcmJ5bC0yLVBvbHlwaG9zcGhhdGUsIFRoaWFtaW5lIE1vbm9uaXRyYXRlLCBWaXRhbWluIEEgU3VwcGxlbWVudCwgTmljb3RpbmljIEFjaWQsIE1hbmdhbmVzZSBBbWlubyBBY2lkIENoZWxhdGUsIENhbGNpdW0gSW9kYXRlLCBDb3BwZXIgQW1pbm8gQWNpZCBDaGVsYXRlLCBDYWxjaXVtIFBhbnRvdGhlbmF0ZSwgUmlib2ZsYXZpbiBTdXBwbGVtZW50LCBTb2RpdW0gU2VsZW5pdGUsIFZpdGFtaW4gQjEyIFN1cHBsZW1lbnQsIFB5cmlkb3hpbmUgSHlkcm9jaGxvcmlkZSwgRm9saWMgQWNpZCwgQ2hvbGVjYWxjaWZlcm9sLCBCaW90aW4sIE1lbmFkaW9uZSBTb2RpdW0gQmlzdWxmaXRlIENvbXBsZXguIiwiaW5ncmVkaWVudHMiOlsiQ2hpY2tlbiIsIkNoaWNrZW4gQnJvdGgiLCJEdWNrIiwiRHVjayBCcm90aCIsIlB1bXBraW4iLCJDb2NvbnV0IE9pbCIsIlRyaWNhbGNpdW0gUGhvc3BoYXRlIiwiUG90YXNzaXVtIENobG9yaWRlIiwiWGFudGhhbiBHdW0iLCJTYWx0IiwiSW51bGluIiwiR3VhciBHdW0iLCJDaG9saW5lIENobG9yaWRlIiwiVGF1cmluZSIsIk1hZ25lc2l1bSBTdWxmYXRlIiwiU2FsbW9uIE9pbCIsIlBhcnNsZXkiLCJJcm9uIEFtaW5vIEFjaWQgQ2hlbGF0ZSIsIlppbmMgQW1pbm8gQWNpZCBDaGVsYXRlIiwiVml0YW1pbiBFIFN1cHBsZW1lbnQiLCJMLUFzY29yYnlsLTItUG9seXBob3NwaGF0ZSIsIlRoaWFtaW5lIE1vbm9uaXRyYXRlIiwiVml0YW1pbiBBIFN1cHBsZW1lbnQiLCJOaWNvdGluaWMgQWNpZCIsIk1hbmdhbmVzZSBBbWlubyBBY2lkIENoZWxhdGUiLCJDYWxjaXVtIElvZGF0ZSIsIkNvcHBlciBBbWlubyBBY2lkIENoZWxhdGUiLCJDYWxjaXVtIFBhbnRvdGhlbmF0ZSIsIlJpYm9mbGF2aW4gU3VwcGxlbWVudCIsIlNvZGl1bSBTZWxlbml0ZSIsIlZpdGFtaW4gQjEyIFN1cHBsZW1lbnQiLCJQeXJpZG94aW5lIEh5ZHJvY2hsb3JpZGUiLCJGb2xpYyBBY2lkIiwiQ2hvbGVjYWxjaWZlcm9sIiwiQmlvdGluIiwiTWVuYWRpb25lIFNvZGl1bSBCaXN1bGZpdGUgQ29tcGxleCJdLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL2Nkbi5zaG9waWZ5LmNvbS9zL2ZpbGVzLzEvMDA4NC85NjY0LzQxOTIvZmlsZXMvbzg2amZnZnhmcm8wa291eGpjYWMucG5nP3Y9MTc3Njc3NDgzMSIsInNvdXJjZV91cmwiOiJodHRwczovL251bG8uY29tL3Byb2R1Y3RzL21lZGFsc2VyaWVzLXNpZ25hdHVyZS1zdGV3cy1jaGlja2VuLWR1Y2stcHVtcGtpbi1yZWNpcGUtZm9yLWNhdHMiLCJpbmdyZWRpZW50X3NvdXJjZV91cmwiOiJodHRwczovL251bG8uY29tL3Byb2R1Y3RzL21lZGFsc2VyaWVzLXNpZ25hdHVyZS1zdGV3cy1jaGlja2VuLWR1Y2stcHVtcGtpbi1yZWNpcGUtZm9yLWNhdHMiLCJpbWFnZV9zb3VyY2VfdXJsIjoiaHR0cHM6Ly9udWxvLmNvbS9wcm9kdWN0cy9tZWRhbHNlcmllcy1zaWduYXR1cmUtc3Rld3MtY2hpY2tlbi1kdWNrLXB1bXBraW4tcmVjaXBlLWZvci1jYXRzIiwiY29udGVudF9oYXNoIjoiNTgyNzYyNGM5ZWUyMGZmMDkwMTQzYzc0Njg1MjRlNDAwZTJmM2ExMjkwMzc3N2EzZjliMzcxOTZhYmFjMGNlYSJ9XQ==', 'base64'), 'UTF8')::jsonb) AS m(
  cache_key TEXT,
  gtin TEXT,
  product_name TEXT,
  product_line TEXT,
  pet_type TEXT,
  life_stage TEXT,
  food_form TEXT,
  flavor TEXT,
  package_size TEXT,
  ingredient_text TEXT,
  ingredients JSONB,
  front_image_url TEXT,
  source_url TEXT,
  ingredient_source_url TEXT,
  image_source_url TEXT,
  content_hash TEXT
);

-- Explicitly reviewed identity transitions are bound to a hash of the
-- complete prior serving state. Any title, GTIN, ingredients, image, PDP,
-- or cache-key drift after review makes the transition fail closed.
CREATE TEMP TABLE catalog_reviewed_serving_identities ON COMMIT DROP AS
SELECT *
FROM jsonb_to_recordset(convert_from(decode('W3siY2FjaGVfa2V5IjoibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyIsInByZXZpb3VzX2V2aWRlbmNlX2hhc2giOiI0NjY4NzZkYzNmODc5ODY5MGVkYzhiY2Y2NWM4YmRhMjA1YWNmNWFlMGQyNjQwYzRmMmJhMDQwYmEyODgyMWVjIn1d', 'base64'), 'UTF8')::jsonb) AS r(
  cache_key TEXT,
  previous_evidence_hash TEXT
);

DO $$
DECLARE
  v_expected INTEGER;
  v_exact INTEGER;
BEGIN
  SELECT count(*) INTO v_expected FROM catalog_current_serving_evidence;
  SELECT count(*) INTO v_exact
  FROM catalog_current_serving_evidence m
  JOIN public.product_data p ON p.cache_key = m.cache_key
  WHERE p.source_url = m.source_url
    AND public.catalog_acquisition_identity_normalize(p.brand)
        = public.catalog_acquisition_identity_normalize('Nulo')
    AND (
      (
        p.gtin = m.gtin
        AND public.catalog_acquisition_identity_normalize(p.product_name)
            = public.catalog_acquisition_identity_normalize(m.product_name)
      )
      OR (
        NULLIF(btrim(m.gtin), '') IS NULL
        AND NULLIF(btrim(p.gtin), '') IS NULL
        AND p.cache_key = m.cache_key
        AND public.catalog_acquisition_identity_normalize(p.product_name)
            = public.catalog_acquisition_identity_normalize(m.product_name)
      )
      OR EXISTS (
        SELECT 1
        FROM catalog_reviewed_serving_identities reviewed
        WHERE reviewed.cache_key = m.cache_key
          AND reviewed.previous_evidence_hash = encode(digest(concat_ws(
            '|', p.cache_key, p.product_name, COALESCE(p.gtin, ''),
            p.ingredient_text, p.image_url, p.source_url
          ), 'sha256'), 'hex')
      )
    )
    AND lower(btrim(COALESCE(p.pet_type, '')))
        = lower(btrim(COALESCE(m.pet_type, '')))
    AND public.catalog_acquisition_food_form_terms_match(
      COALESCE(NULLIF(btrim(p.food_form), ''), 'unknown'),
      COALESCE(NULLIF(btrim(m.food_form), ''), 'unknown')
    )
    AND p.source_quality IN ('gdsn','official','manufacturer','retailer_verified')
    AND p.ingredient_verification_status IN ('gdsn','official','manufacturer','retailer_verified','label_ocr_verified')
    AND p.image_verification_status IN ('official','manufacturer','retailer_verified')
    AND p.is_complete_food = TRUE
    AND COALESCE(p.catalog_exclusion_reason, '') = '';
  IF v_expected <> 1 OR v_exact <> v_expected THEN
    RAISE EXCEPTION
      'Current exact serving evidence incomplete: % exact of % expected',
      v_exact, v_expected;
  END IF;
END $$;

INSERT INTO public.catalog_product_evidence (
  id, cache_key, gtin, product_name, brand, pet_type, source,
  source_quality, source_url, ingredient_source_url, image_source_url,
  ingredient_verification_status, image_verification_status,
  content_hash, extractor_version, review_state, rejection_reason,
  evidence, created_at, updated_at
)
SELECT
  gen_random_uuid(), p.cache_key, p.gtin, p.product_name, p.brand,
  p.pet_type, p.source, p.source_quality, p.source_url,
  m.ingredient_source_url, m.image_source_url,
  p.ingredient_verification_status, p.image_verification_status,
  encode(digest(concat_ws('|', p.cache_key, p.ingredient_text, p.image_url), 'sha256'), 'hex'),
  'historical-serving-snapshot-v1', 'rejected',
  'superseded_by_current_official_formula_version',
  jsonb_build_object(
    'superseded_at', now(),
    'superseded_by_content_hash', m.content_hash,
    'ingredient_text', p.ingredient_text,
    'ingredients', to_jsonb(p.ingredients),
    'front_image_url', p.image_url,
    'product_line', p.product_line,
    'life_stage', p.life_stage,
    'food_form', p.food_form,
    'flavor', p.flavor,
    'package_size', p.package_size,
    'formula_version_boundary_preserved', TRUE
  ),
  now(), now()
FROM catalog_current_serving_evidence m
JOIN public.product_data p ON p.cache_key = m.cache_key
WHERE (
  lower(regexp_replace(btrim(p.ingredient_text), '\s+', ' ', 'g'))
    IS DISTINCT FROM lower(regexp_replace(btrim(m.ingredient_text), '\s+', ' ', 'g'))
  OR p.image_url IS DISTINCT FROM m.front_image_url
  OR COALESCE(p.product_line, '') IS DISTINCT FROM COALESCE(m.product_line, '')
  OR COALESCE(p.life_stage, '') IS DISTINCT FROM COALESCE(m.life_stage, '')
  OR COALESCE(p.flavor, '') IS DISTINCT FROM COALESCE(m.flavor, '')
)
AND NOT EXISTS (
  SELECT 1
  FROM public.catalog_product_evidence archived
  WHERE archived.cache_key = p.cache_key
    AND archived.rejection_reason = 'superseded_by_current_official_formula_version'
    AND archived.content_hash = encode(digest(
      concat_ws('|', p.cache_key, p.ingredient_text, p.image_url),
      'sha256'
    ), 'hex')
);

WITH updated AS (
  UPDATE public.product_data p
  SET
    product_name = m.product_name,
    brand = 'Nulo',
    source = 'nulo',
    gtin = m.gtin,
    product_line = m.product_line,
    flavor = NULLIF(m.flavor, ''),
    life_stage = NULLIF(m.life_stage, 'unknown'),
    food_form = m.food_form,
    package_size = NULLIF(m.package_size, ''),
    pet_type = m.pet_type,
    ingredients = ARRAY(
      SELECT value
      FROM jsonb_array_elements_text(COALESCE(m.ingredients, '[]'::JSONB))
        WITH ORDINALITY ingredient(value, ordinal)
      ORDER BY ordinal
    ),
    ingredient_text = m.ingredient_text,
    ingredient_count = jsonb_array_length(COALESCE(m.ingredients, '[]'::JSONB)),
    image_url = m.front_image_url,
    source_quality = 'manufacturer',
    ingredient_verification_status = 'manufacturer',
    image_verification_status = 'manufacturer',
    verified_at = '2026-08-04T00:09:19.161Z'::TIMESTAMPTZ,
    scraped_at = now(),
    expires_at = now() + INTERVAL '365 days',
    is_complete_food = TRUE,
    catalog_exclusion_reason = NULL,
    updated_at = now()
  FROM catalog_current_serving_evidence m
  WHERE p.cache_key = m.cache_key
  RETURNING p.cache_key
)
SELECT count(*) AS refreshed_current_serving_rows FROM updated;

DO $$
DECLARE
  v_exact INTEGER;
BEGIN
  SELECT count(*) INTO v_exact
  FROM catalog_current_serving_evidence m
  JOIN public.product_data p ON p.cache_key = m.cache_key
  WHERE p.gtin = m.gtin
    AND p.source_url = m.source_url
    AND public.catalog_acquisition_identity_normalize(p.product_name)
        = public.catalog_acquisition_identity_normalize(m.product_name)
    AND lower(regexp_replace(btrim(p.ingredient_text), '\s+', ' ', 'g'))
        = lower(regexp_replace(btrim(m.ingredient_text), '\s+', ' ', 'g'))
    AND p.image_url = m.front_image_url
    AND p.is_complete_food = TRUE
    AND COALESCE(p.catalog_exclusion_reason, '') = '';
  IF v_exact <> 1 THEN
    RAISE EXCEPTION
      'Current serving refresh postcondition failed: % of % exact',
      v_exact, 1;
  END IF;
END $$;

SELECT public.stage_catalog_census_batch(
  convert_from(decode('eyJydW5fa2V5IjoibnVsbzpib3VuZGVkLWV4YWN0LWV2aWRlbmNlOjE5OTdiODRhNmI3NTIwZGFmNGI3YjAyMSIsInNvdXJjZV9zbHVnIjoibnVsbyIsInNvdXJjZV90eXBlIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2Vfcm9sZSI6InZlcmlmaWNhdGlvbiIsInN0YXR1cyI6ImNvbXBsZXRlZCIsInN0YXJ0ZWRfYXQiOiIyMDI2LTA4LTA0VDAwOjA5OjE5LjE2MVoiLCJleHBlY3RlZF9jb3VudCI6MSwicGFnaW5hdGlvbl9jb21wbGV0ZSI6ZmFsc2UsInRydW5jYXRlZCI6ZmFsc2UsImNhcF9yZWFjaGVkIjpmYWxzZSwic291cmNlX2NvbnRlbnRfaGFzaCI6IjE5OTdiODRhNmI3NTIwZGFmNGI3YjAyMTQ1NjVmODU2ZDdiMWI2OWNhNzI0NzJiMjFmMmNiYjc3NDMxM2I5ODMiLCJjaGVja3BvaW50Ijp7ImZlZWRfcm93X2NvdW50IjoxLCJhY2NlcHRlZF9vYnNlcnZhdGlvbl9jb3VudCI6MSwiY2Fub25pY2FsX2Zvcm11bGFfY291bnQiOjF9LCJtZXRhZGF0YSI6eyJicmFuZCI6Ik51bG8iLCJtYW51ZmFjdHVyZXIiOiJOdWxvIiwic291cmNlX2F1dGhvcml0eSI6Im1hbnVmYWN0dXJlciIsImV4YWN0X2Zvcm11bGFfZXZpZGVuY2UiOnRydWUsInBhY2thZ2Vfc2l6ZV9pc19za3Vfb25seSI6dHJ1ZSwicXVhcmFudGluZWRfY291bnQiOjAsInNjb3BlX2V4Y2x1ZGVkX25vbl9jb21wbGV0ZV9jb3VudCI6MCwic291cmNlX2ZlZWRfcm93X2NvdW50IjoxLCJicmFuZF9zY29wZWRfZmVlZF9yb3dfY291bnQiOjEsInNvdXJjZV9mZWVkX291dF9vZl9zY29wZV9jb3VudCI6MCwic291cmNlX2ZlZWRfb3V0X29mX3Njb3BlX2JyYW5kcyI6W10sInNlcnZpbmdfZXZpZGVuY2VfaW5jbHVkZV9jb3VudCI6MCwic2VydmluZ19ldmlkZW5jZV9wcmVmbGlnaHRfZXhjbHVkZWRfY291bnQiOjAsInNlcnZpbmdfZXZpZGVuY2VfcHJlZmxpZ2h0X2V4Y2x1ZGVkX2NhY2hlX2tleXMiOltdLCJza3Vfb25seV9vYnNlcnZhdGlvbl9jb3VudCI6MCwic2t1X29ubHlfb2JzZXJ2YXRpb25fY2FjaGVfa2V5cyI6W10sInJldmlld2VkX3NlcnZpbmdfaWRlbnRpdHlfY291bnQiOjEsInJldmlld2VkX3NlcnZpbmdfaWRlbnRpdHlfY2FjaGVfa2V5cyI6WyJudWxvOm51bG8gbWVkYWxzZXJpZXMgY2F0IGtpdHRlbiBjaGlja2VuIGR1Y2sgcHVtcGtpbiBzdGV3Il0sInNlcnZpbmdfY2FjaGVfa2V5X21hcHBpbmdfY291bnQiOjEsInNlcnZpbmdfY2FjaGVfa2V5X21vZGUiOiJicmFuZC10aXRsZS11cmwiLCJvZmZpY2lhbF9pbnZlbnRvcnlfZnVsbCI6ZmFsc2UsImJvdW5kZWRfZXhhY3RfZXZpZGVuY2UiOnRydWUsImN1cnJlbnRfb2ZmaWNpYWxfc2t1X2NhY2hlX2tleXMiOlsibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyJdLCJjdXJyZW50X3NlcnZpbmdfY2FjaGVfa2V5cyI6WyJudWxvOm51bG8gbWVkYWxzZXJpZXMgY2F0IGtpdHRlbiBjaGlja2VuIGR1Y2sgcHVtcGtpbiBzdGV3Il19fQ==', 'base64'), 'UTF8')::jsonb,
  convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJudWxvfG51bG98bWVkYWxzZXJpZXMgc2lnbmF0dXJlIHN0ZXdzfGNhdHxhbGwgbGlmZSBzdGFnZXN8d2V0fGNoaWNrZW4gZHVjayBhbmQgcHVtcGtpbiByZWNpcGV8IiwiaWRlbnRpdHlfaGFzaCI6ImE2NDY4M2ZiN2M1YzkxODRjZTI5NmE3YjM4ZTU1NGU3NTRhN2ViZDY0OWZkN2ZkZmEyMWQwYTM1YjlmMWQ2ZmYiLCJtYW51ZmFjdHVyZXIiOiJOdWxvIiwiYnJhbmQiOiJOdWxvIiwicHJvZHVjdF9uYW1lIjoiTWVkYWxTZXJpZXMgU2lnbmF0dXJlIFN0ZXdzIENoaWNrZW4sIER1Y2sgJiBQdW1wa2luIFJlY2lwZSBmb3IgQ2F0cyIsInByb2R1Y3RfbGluZSI6Ik1lZGFsU2VyaWVzIFNpZ25hdHVyZSBTdGV3cyIsInBldF90eXBlIjoiY2F0IiwibGlmZV9zdGFnZSI6ImFsbCBsaWZlIHN0YWdlcyIsImZvb2RfZm9ybSI6IndldCIsImZsYXZvciI6IkNoaWNrZW4sIER1Y2sgJiBQdW1wa2luIFJlY2lwZSIsImRpZXRfY29uZGl0aW9uIjoiIiwic291cmNlX3NsdWciOiJudWxvIiwic291cmNlX2V4dGVybmFsX2lkIjoibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyIsInNvdXJjZV91cmwiOiJodHRwczovL251bG8uY29tL3Byb2R1Y3RzL21lZGFsc2VyaWVzLXNpZ25hdHVyZS1zdGV3cy1jaGlja2VuLWR1Y2stcHVtcGtpbi1yZWNpcGUtZm9yLWNhdHMiLCJzb3VyY2VfYXV0aG9yaXR5IjoibWFudWZhY3R1cmVyIiwiZ3RpbiI6IiIsInBhY2thZ2Vfc2l6ZSI6IiIsImluZ3JlZGllbnRfdGV4dCI6IkNoaWNrZW4sIENoaWNrZW4gQnJvdGgsIER1Y2ssIER1Y2sgQnJvdGgsIFB1bXBraW4sIENvY29udXQgT2lsLCBUcmljYWxjaXVtIFBob3NwaGF0ZSwgUG90YXNzaXVtIENobG9yaWRlLCBYYW50aGFuIEd1bSwgU2FsdCwgSW51bGluLCBHdWFyIEd1bSwgQ2hvbGluZSBDaGxvcmlkZSwgVGF1cmluZSwgTWFnbmVzaXVtIFN1bGZhdGUsIFNhbG1vbiBPaWwsIFBhcnNsZXksIElyb24gQW1pbm8gQWNpZCBDaGVsYXRlLCBaaW5jIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgVml0YW1pbiBFIFN1cHBsZW1lbnQsIEwtQXNjb3JieWwtMi1Qb2x5cGhvc3BoYXRlLCBUaGlhbWluZSBNb25vbml0cmF0ZSwgVml0YW1pbiBBIFN1cHBsZW1lbnQsIE5pY290aW5pYyBBY2lkLCBNYW5nYW5lc2UgQW1pbm8gQWNpZCBDaGVsYXRlLCBDYWxjaXVtIElvZGF0ZSwgQ29wcGVyIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgQ2FsY2l1bSBQYW50b3RoZW5hdGUsIFJpYm9mbGF2aW4gU3VwcGxlbWVudCwgU29kaXVtIFNlbGVuaXRlLCBWaXRhbWluIEIxMiBTdXBwbGVtZW50LCBQeXJpZG94aW5lIEh5ZHJvY2hsb3JpZGUsIEZvbGljIEFjaWQsIENob2xlY2FsY2lmZXJvbCwgQmlvdGluLCBNZW5hZGlvbmUgU29kaXVtIEJpc3VsZml0ZSBDb21wbGV4LiIsImluZ3JlZGllbnRzIjpbIkNoaWNrZW4iLCJDaGlja2VuIEJyb3RoIiwiRHVjayIsIkR1Y2sgQnJvdGgiLCJQdW1wa2luIiwiQ29jb251dCBPaWwiLCJUcmljYWxjaXVtIFBob3NwaGF0ZSIsIlBvdGFzc2l1bSBDaGxvcmlkZSIsIlhhbnRoYW4gR3VtIiwiU2FsdCIsIkludWxpbiIsIkd1YXIgR3VtIiwiQ2hvbGluZSBDaGxvcmlkZSIsIlRhdXJpbmUiLCJNYWduZXNpdW0gU3VsZmF0ZSIsIlNhbG1vbiBPaWwiLCJQYXJzbGV5IiwiSXJvbiBBbWlubyBBY2lkIENoZWxhdGUiLCJaaW5jIEFtaW5vIEFjaWQgQ2hlbGF0ZSIsIlZpdGFtaW4gRSBTdXBwbGVtZW50IiwiTC1Bc2NvcmJ5bC0yLVBvbHlwaG9zcGhhdGUiLCJUaGlhbWluZSBNb25vbml0cmF0ZSIsIlZpdGFtaW4gQSBTdXBwbGVtZW50IiwiTmljb3RpbmljIEFjaWQiLCJNYW5nYW5lc2UgQW1pbm8gQWNpZCBDaGVsYXRlIiwiQ2FsY2l1bSBJb2RhdGUiLCJDb3BwZXIgQW1pbm8gQWNpZCBDaGVsYXRlIiwiQ2FsY2l1bSBQYW50b3RoZW5hdGUiLCJSaWJvZmxhdmluIFN1cHBsZW1lbnQiLCJTb2RpdW0gU2VsZW5pdGUiLCJWaXRhbWluIEIxMiBTdXBwbGVtZW50IiwiUHlyaWRveGluZSBIeWRyb2NobG9yaWRlIiwiRm9saWMgQWNpZCIsIkNob2xlY2FsY2lmZXJvbCIsIkJpb3RpbiIsIk1lbmFkaW9uZSBTb2RpdW0gQmlzdWxmaXRlIENvbXBsZXgiXSwiZnJvbnRfaW1hZ2VfdXJsIjoiaHR0cHM6Ly9jZG4uc2hvcGlmeS5jb20vcy9maWxlcy8xLzAwODQvOTY2NC80MTkyL2ZpbGVzL284NmpmZ2Z4ZnJvMGtvdXhqY2FjLnBuZz92PTE3NzY3NzQ4MzEiLCJpc19jb21wbGV0ZV9mb29kIjp0cnVlLCJhdmFpbGFibGVfaW5fdXMiOnRydWUsInByb3RlY3RlZF90ZXJtcyI6WyJOdWxvIiwiTWVkYWxTZXJpZXMgU2lnbmF0dXJlIFN0ZXdzIiwiQ2hpY2tlbiwgRHVjayAmIFB1bXBraW4gUmVjaXBlIiwiY2F0IiwiYWxsIGxpZmUgc3RhZ2VzIiwid2V0Il0sIm9ic2VydmVkX2F0IjoiMjAyNi0wOC0wNFQwMDowOToxOS4xNjFaIiwiY29udGVudF9oYXNoIjoiNTgyNzYyNGM5ZWUyMGZmMDkwMTQzYzc0Njg1MjRlNDAwZTJmM2ExMjkwMzc3N2EzZjliMzcxOTZhYmFjMGNlYSIsInZhbGlkYXRpb25fc3RhdHVzIjoiYWNjZXB0ZWQiLCJ2YWxpZGF0aW9uX3JlYXNvbnMiOltdLCJpbmdyZWRpZW50X3ZlcmlmaWNhdGlvbl9zdGF0dXMiOiJtYW51ZmFjdHVyZXIiLCJpbWFnZV92ZXJpZmljYXRpb25fc3RhdHVzIjoibWFudWZhY3R1cmVyIiwiY292ZXJhZ2VfdGllciI6InRpZXJfMV91c19yZXRhaWwiLCJyYXdfcGF5bG9hZCI6eyJjYWNoZV9rZXkiOiJudWxvOm51bG8gbWVkYWxzZXJpZXMgY2F0IGtpdHRlbiBjaGlja2VuIGR1Y2sgcHVtcGtpbiBzdGV3IiwiaW5ncmVkaWVudF9zb3VyY2VfdXJsIjoiaHR0cHM6Ly9udWxvLmNvbS9wcm9kdWN0cy9tZWRhbHNlcmllcy1zaWduYXR1cmUtc3Rld3MtY2hpY2tlbi1kdWNrLXB1bXBraW4tcmVjaXBlLWZvci1jYXRzIiwiaW1hZ2Vfc291cmNlX3VybCI6Imh0dHBzOi8vbnVsby5jb20vcHJvZHVjdHMvbWVkYWxzZXJpZXMtc2lnbmF0dXJlLXN0ZXdzLWNoaWNrZW4tZHVjay1wdW1wa2luLXJlY2lwZS1mb3ItY2F0cyIsImNhbm9uaWNhbF9mb3JtdWxhX2lkZW50aXR5Ijp7Im1hbnVmYWN0dXJlciI6Im51bG8iLCJicmFuZCI6Im51bG8iLCJwcm9kdWN0X2xpbmUiOiJtZWRhbHNlcmllcyBzaWduYXR1cmUgc3Rld3MiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJhbGwgbGlmZSBzdGFnZXMiLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJjaGlja2VuIGR1Y2sgYW5kIHB1bXBraW4gcmVjaXBlIiwiZGlldF9jb25kaXRpb24iOiIifSwiZXhhY3RfZm9ybXVsYV9ldmlkZW5jZSI6dHJ1ZSwicGFja2FnZV9zaXplX2lzX3NrdV9vbmx5Ijp0cnVlfX1d', 'base64'), 'UTF8')::jsonb
) AS stage_result;

-- Refresh stale serving metadata only when an exact official PDP URL,
-- exact product-local title, and complete ingredient statement prove the
-- same current formula. Known food-form conflicts still abstain; only
-- unknown forms are upgraded. A current official package image may
-- replace an older image for that exact proven formula.
WITH mappings AS (
  SELECT *
  FROM jsonb_to_recordset(convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJudWxvfG51bG98bWVkYWxzZXJpZXMgc2lnbmF0dXJlIHN0ZXdzfGNhdHxhbGwgbGlmZSBzdGFnZXN8d2V0fGNoaWNrZW4gZHVjayBhbmQgcHVtcGtpbiByZWNpcGV8IiwiZXhwZWN0ZWRfY2FjaGVfa2V5IjoibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyIsImd0aW4iOiIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBDaGlja2VuIEJyb3RoLCBEdWNrLCBEdWNrIEJyb3RoLCBQdW1wa2luLCBDb2NvbnV0IE9pbCwgVHJpY2FsY2l1bSBQaG9zcGhhdGUsIFBvdGFzc2l1bSBDaGxvcmlkZSwgWGFudGhhbiBHdW0sIFNhbHQsIEludWxpbiwgR3VhciBHdW0sIENob2xpbmUgQ2hsb3JpZGUsIFRhdXJpbmUsIE1hZ25lc2l1bSBTdWxmYXRlLCBTYWxtb24gT2lsLCBQYXJzbGV5LCBJcm9uIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgWmluYyBBbWlubyBBY2lkIENoZWxhdGUsIFZpdGFtaW4gRSBTdXBwbGVtZW50LCBMLUFzY29yYnlsLTItUG9seXBob3NwaGF0ZSwgVGhpYW1pbmUgTW9ub25pdHJhdGUsIFZpdGFtaW4gQSBTdXBwbGVtZW50LCBOaWNvdGluaWMgQWNpZCwgTWFuZ2FuZXNlIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgQ2FsY2l1bSBJb2RhdGUsIENvcHBlciBBbWlubyBBY2lkIENoZWxhdGUsIENhbGNpdW0gUGFudG90aGVuYXRlLCBSaWJvZmxhdmluIFN1cHBsZW1lbnQsIFNvZGl1bSBTZWxlbml0ZSwgVml0YW1pbiBCMTIgU3VwcGxlbWVudCwgUHlyaWRveGluZSBIeWRyb2NobG9yaWRlLCBGb2xpYyBBY2lkLCBDaG9sZWNhbGNpZmVyb2wsIEJpb3RpbiwgTWVuYWRpb25lIFNvZGl1bSBCaXN1bGZpdGUgQ29tcGxleC4iLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL2Nkbi5zaG9waWZ5LmNvbS9zL2ZpbGVzLzEvMDA4NC85NjY0LzQxOTIvZmlsZXMvbzg2amZnZnhmcm8wa291eGpjYWMucG5nP3Y9MTc3Njc3NDgzMSIsInByb2R1Y3RfbmFtZSI6Ik1lZGFsU2VyaWVzIFNpZ25hdHVyZSBTdGV3cyBDaGlja2VuLCBEdWNrICYgUHVtcGtpbiBSZWNpcGUgZm9yIENhdHMiLCJwcm9kdWN0X2xpbmUiOiJNZWRhbFNlcmllcyBTaWduYXR1cmUgU3Rld3MiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJhbGwgbGlmZSBzdGFnZXMiLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJDaGlja2VuLCBEdWNrICYgUHVtcGtpbiBSZWNpcGUiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly9udWxvLmNvbS9wcm9kdWN0cy9tZWRhbHNlcmllcy1zaWduYXR1cmUtc3Rld3MtY2hpY2tlbi1kdWNrLXB1bXBraW4tcmVjaXBlLWZvci1jYXRzIn1d', 'base64'), 'UTF8')::jsonb) AS m(
    formula_key TEXT,
    expected_cache_key TEXT,
    gtin TEXT,
    ingredient_text TEXT,
    front_image_url TEXT,
    product_name TEXT,
    product_line TEXT,
    pet_type TEXT,
    life_stage TEXT,
    food_form TEXT,
    flavor TEXT,
    source_url TEXT
  )
)
UPDATE public.product_data p
SET
  pet_type = m.pet_type,
  food_form = CASE
    WHEN lower(COALESCE(NULLIF(btrim(p.food_form), ''), 'unknown'))
         IN ('unknown', 'other')
      AND lower(COALESCE(NULLIF(btrim(m.food_form), ''), 'unknown'))
         NOT IN ('unknown', 'other')
      THEN m.food_form
    ELSE p.food_form
  END,
  image_url = m.front_image_url,
  updated_at = NOW()
FROM mappings m
WHERE NULLIF(btrim(m.source_url), '') IS NOT NULL
  AND p.source_url = m.source_url
  AND public.catalog_acquisition_identity_normalize(p.brand)
      = public.catalog_acquisition_identity_normalize('Nulo')
  AND public.catalog_acquisition_identity_normalize(p.product_name)
      = public.catalog_acquisition_identity_normalize(m.product_name)
  AND lower(regexp_replace(btrim(p.ingredient_text), '\s+', ' ', 'g'))
      = lower(regexp_replace(btrim(m.ingredient_text), '\s+', ' ', 'g'))
  AND p.is_complete_food = TRUE
  AND COALESCE(p.catalog_exclusion_reason, '') = ''
  AND (p.expires_at IS NULL OR p.expires_at > NOW())
  AND p.source_quality IN ('gdsn','official','manufacturer','retailer_verified')
  AND p.ingredient_verification_status IN ('gdsn','official','manufacturer','retailer_verified','label_ocr_verified')
  AND p.image_verification_status IN ('official','manufacturer','retailer_verified')
  AND NULLIF(btrim(p.ingredient_text), '') IS NOT NULL
  AND NULLIF(btrim(m.front_image_url), '') IS NOT NULL
  AND (
    lower(btrim(COALESCE(p.pet_type, '')))
      IS DISTINCT FROM lower(btrim(COALESCE(m.pet_type, '')))
    OR (
      lower(COALESCE(NULLIF(btrim(p.food_form), ''), 'unknown'))
        IN ('unknown', 'other')
      AND lower(COALESCE(NULLIF(btrim(m.food_form), ''), 'unknown'))
        NOT IN ('unknown', 'other')
    )
    OR p.image_url IS DISTINCT FROM m.front_image_url
  );

-- An exact official serving cache key or unique official PDP URL, plus
-- complete ingredient statement, matching package image, brand, species,
-- and food form proves
-- that this is the same formula version. Product naming, line, life-stage,
-- and flavor metadata may be stale on the serving row; normalize those
-- fields from the current accepted official observation only after every
-- immutable evidence gate below passes.
CREATE TEMP TABLE catalog_exact_serving_candidates ON COMMIT DROP AS
WITH mappings AS (
  SELECT *
  FROM jsonb_to_recordset(convert_from(decode('W3siZm9ybXVsYV9rZXkiOiJudWxvfG51bG98bWVkYWxzZXJpZXMgc2lnbmF0dXJlIHN0ZXdzfGNhdHxhbGwgbGlmZSBzdGFnZXN8d2V0fGNoaWNrZW4gZHVjayBhbmQgcHVtcGtpbiByZWNpcGV8IiwiZXhwZWN0ZWRfY2FjaGVfa2V5IjoibnVsbzpudWxvIG1lZGFsc2VyaWVzIGNhdCBraXR0ZW4gY2hpY2tlbiBkdWNrIHB1bXBraW4gc3RldyIsImd0aW4iOiIiLCJpbmdyZWRpZW50X3RleHQiOiJDaGlja2VuLCBDaGlja2VuIEJyb3RoLCBEdWNrLCBEdWNrIEJyb3RoLCBQdW1wa2luLCBDb2NvbnV0IE9pbCwgVHJpY2FsY2l1bSBQaG9zcGhhdGUsIFBvdGFzc2l1bSBDaGxvcmlkZSwgWGFudGhhbiBHdW0sIFNhbHQsIEludWxpbiwgR3VhciBHdW0sIENob2xpbmUgQ2hsb3JpZGUsIFRhdXJpbmUsIE1hZ25lc2l1bSBTdWxmYXRlLCBTYWxtb24gT2lsLCBQYXJzbGV5LCBJcm9uIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgWmluYyBBbWlubyBBY2lkIENoZWxhdGUsIFZpdGFtaW4gRSBTdXBwbGVtZW50LCBMLUFzY29yYnlsLTItUG9seXBob3NwaGF0ZSwgVGhpYW1pbmUgTW9ub25pdHJhdGUsIFZpdGFtaW4gQSBTdXBwbGVtZW50LCBOaWNvdGluaWMgQWNpZCwgTWFuZ2FuZXNlIEFtaW5vIEFjaWQgQ2hlbGF0ZSwgQ2FsY2l1bSBJb2RhdGUsIENvcHBlciBBbWlubyBBY2lkIENoZWxhdGUsIENhbGNpdW0gUGFudG90aGVuYXRlLCBSaWJvZmxhdmluIFN1cHBsZW1lbnQsIFNvZGl1bSBTZWxlbml0ZSwgVml0YW1pbiBCMTIgU3VwcGxlbWVudCwgUHlyaWRveGluZSBIeWRyb2NobG9yaWRlLCBGb2xpYyBBY2lkLCBDaG9sZWNhbGNpZmVyb2wsIEJpb3RpbiwgTWVuYWRpb25lIFNvZGl1bSBCaXN1bGZpdGUgQ29tcGxleC4iLCJmcm9udF9pbWFnZV91cmwiOiJodHRwczovL2Nkbi5zaG9waWZ5LmNvbS9zL2ZpbGVzLzEvMDA4NC85NjY0LzQxOTIvZmlsZXMvbzg2amZnZnhmcm8wa291eGpjYWMucG5nP3Y9MTc3Njc3NDgzMSIsInByb2R1Y3RfbmFtZSI6Ik1lZGFsU2VyaWVzIFNpZ25hdHVyZSBTdGV3cyBDaGlja2VuLCBEdWNrICYgUHVtcGtpbiBSZWNpcGUgZm9yIENhdHMiLCJwcm9kdWN0X2xpbmUiOiJNZWRhbFNlcmllcyBTaWduYXR1cmUgU3Rld3MiLCJwZXRfdHlwZSI6ImNhdCIsImxpZmVfc3RhZ2UiOiJhbGwgbGlmZSBzdGFnZXMiLCJmb29kX2Zvcm0iOiJ3ZXQiLCJmbGF2b3IiOiJDaGlja2VuLCBEdWNrICYgUHVtcGtpbiBSZWNpcGUiLCJzb3VyY2VfdXJsIjoiaHR0cHM6Ly9udWxvLmNvbS9wcm9kdWN0cy9tZWRhbHNlcmllcy1zaWduYXR1cmUtc3Rld3MtY2hpY2tlbi1kdWNrLXB1bXBraW4tcmVjaXBlLWZvci1jYXRzIn1d', 'base64'), 'UTF8')::jsonb) AS m(
    formula_key TEXT,
    expected_cache_key TEXT,
    gtin TEXT,
    ingredient_text TEXT,
    front_image_url TEXT,
    product_name TEXT,
    product_line TEXT,
    pet_type TEXT,
    life_stage TEXT,
    food_form TEXT,
    flavor TEXT,
    source_url TEXT
  )
)
SELECT DISTINCT ON (m.formula_key, m.expected_cache_key)
  m.formula_key,
  m.expected_cache_key,
  m.gtin,
  m.product_name,
  m.product_line,
  m.pet_type,
  m.life_stage,
  m.food_form,
  m.flavor,
  m.source_url,
  m.ingredient_text,
  m.front_image_url,
  p.cache_key
FROM mappings m
JOIN public.product_data p
  ON (
   p.cache_key = m.expected_cache_key
   OR (
     NULLIF(btrim(m.source_url), '') IS NOT NULL
     AND p.source_url = m.source_url
   )
 )
 AND public.catalog_acquisition_identity_normalize(p.brand)
     = public.catalog_acquisition_identity_normalize('Nulo')
 AND (
   p.source = 'nulo'
   OR (
     NULLIF(btrim(m.source_url), '') IS NOT NULL
     AND p.source_url = m.source_url
   )
 )
 AND (
   (NULLIF(btrim(m.gtin), '') IS NOT NULL AND p.gtin = m.gtin)
   OR (
     NULLIF(btrim(m.gtin), '') IS NULL
     AND NULLIF(btrim(m.source_url), '') IS NOT NULL
     AND p.source_url = m.source_url
   )
 )
 AND lower(btrim(COALESCE(p.pet_type, ''))) = lower(btrim(COALESCE(m.pet_type, '')))
 AND (
   public.catalog_acquisition_food_form_terms_match(
     COALESCE(NULLIF(btrim(p.food_form), ''), 'unknown'),
     COALESCE(NULLIF(btrim(m.food_form), ''), 'unknown')
   )
   OR (
     lower(COALESCE(NULLIF(btrim(p.food_form), ''), 'unknown'))
       IN ('unknown', 'other')
     AND NULLIF(btrim(m.source_url), '') IS NOT NULL
     AND p.source_url = m.source_url
     AND lower(COALESCE(NULLIF(btrim(m.food_form), ''), 'unknown'))
       NOT IN ('unknown', 'other')
   )
 )
 AND lower(regexp_replace(btrim(p.ingredient_text), '\s+', ' ', 'g'))
     = lower(regexp_replace(btrim(m.ingredient_text), '\s+', ' ', 'g'))
 AND p.image_url = m.front_image_url
 AND p.is_complete_food = TRUE
 AND COALESCE(p.catalog_exclusion_reason, '') = ''
 AND (p.expires_at IS NULL OR p.expires_at > NOW())
 AND p.ingredient_verification_status IN ('gdsn','official','manufacturer','retailer_verified','label_ocr_verified')
 AND p.image_verification_status IN ('official','manufacturer','retailer_verified')
 AND NULLIF(btrim(p.ingredient_text), '') IS NOT NULL
 AND NULLIF(btrim(p.image_url), '') IS NOT NULL
ORDER BY
  m.formula_key,
  m.expected_cache_key,
  CASE WHEN p.cache_key = m.expected_cache_key THEN 0 ELSE 1 END,
  CASE WHEN p.source = 'nulo' THEN 0 ELSE 1 END,
  CASE WHEN NULLIF(btrim(p.gtin), '') IS NOT NULL THEN 0 ELSE 1 END,
  p.updated_at DESC,
  p.cache_key;

DO $$
DECLARE
  v_match_count INTEGER;
  v_formula_count INTEGER;
  v_cache_count INTEGER;
BEGIN
  SELECT count(*), count(DISTINCT formula_key), count(DISTINCT cache_key)
  INTO v_match_count, v_formula_count, v_cache_count
  FROM catalog_exact_serving_candidates;
  IF v_match_count <> 1
     OR v_formula_count <> 1
     OR v_cache_count <> 1 THEN
    RAISE EXCEPTION 'Exact serving evidence incomplete or colliding: % matches / % formulas / % serving rows, expected 1 / 1 / 1', v_match_count, v_formula_count, v_cache_count;
  END IF;
END $$;

UPDATE public.product_data p
SET
  product_name = c.product_name,
  product_line = c.product_line,
  pet_type = c.pet_type,
  life_stage = COALESCE(NULLIF(btrim(c.life_stage), ''), 'unknown'),
  food_form = CASE
    WHEN lower(btrim(COALESCE(c.food_form, 'unknown'))) IN ('', 'unknown')
      THEN p.food_form
    ELSE c.food_form
  END,
  flavor = COALESCE(c.flavor, ''),
  source_url = c.source_url,
  updated_at = NOW()
FROM catalog_exact_serving_candidates c
WHERE p.cache_key = c.cache_key
  AND (
    p.product_name IS DISTINCT FROM c.product_name
    OR COALESCE(p.product_line, '') IS DISTINCT FROM COALESCE(c.product_line, '')
    OR COALESCE(p.pet_type, '') IS DISTINCT FROM COALESCE(c.pet_type, '')
    OR COALESCE(NULLIF(btrim(p.life_stage), ''), 'unknown')
       IS DISTINCT FROM COALESCE(NULLIF(btrim(c.life_stage), ''), 'unknown')
    OR COALESCE(p.food_form, '') IS DISTINCT FROM COALESCE(c.food_form, '')
    OR COALESCE(p.flavor, '') IS DISTINCT FROM COALESCE(c.flavor, '')
    OR COALESCE(p.source_url, '') IS DISTINCT FROM COALESCE(c.source_url, '')
  );

CREATE TEMP TABLE catalog_exact_serving_links ON COMMIT DROP AS
SELECT formula_key, expected_cache_key, gtin, cache_key
FROM catalog_exact_serving_candidates;

-- GTIN-backed SKUs are rekeyed by the census RPC. Exact official rows
-- without a published GTIN still need the same canonical SKU-child
-- relationship after the cache-key/PDP/artifact gates above pass.
UPDATE public.catalog_skus sku
SET
  formula_id = formula.id,
  updated_at = NOW()
FROM catalog_exact_serving_links link
JOIN public.catalog_formulas formula
  ON formula.formula_key = link.formula_key
JOIN catalog_exact_serving_candidates candidate
  ON candidate.formula_key = link.formula_key
 AND candidate.expected_cache_key = link.expected_cache_key
WHERE NULLIF(btrim(link.gtin), '') IS NULL
  AND sku.source_slug = 'nulo'
  AND sku.source_external_id = link.expected_cache_key
  AND sku.source_url = candidate.source_url
  AND sku.formula_id IS DISTINCT FROM formula.id;

CREATE TEMP TABLE catalog_formula_serving_links ON COMMIT DROP AS
SELECT DISTINCT ON (formula_key)
  formula_key, cache_key
FROM catalog_exact_serving_links
ORDER BY
  formula_key,
  CASE WHEN NULLIF(btrim(gtin), '') IS NOT NULL THEN 0 ELSE 1 END,
  cache_key;

UPDATE public.catalog_formulas f
SET
  brand = 'Nulo',
  product_name = c.product_name,
  product_line = c.product_line,
  pet_type = c.pet_type,
  life_stage = COALESCE(NULLIF(btrim(c.life_stage), ''), 'unknown'),
  food_form = CASE
    WHEN lower(btrim(COALESCE(c.food_form, 'unknown'))) IN ('', 'unknown')
      THEN f.food_form
    ELSE c.food_form
  END,
  flavor = COALESCE(c.flavor, ''),
  is_complete_food = TRUE,
  ingredient_text = p.ingredient_text,
  ingredients = p.ingredients,
  front_image_url = p.image_url,
  source_url = c.source_url,
  source_authority = p.source_quality,
  ingredient_verification_status = p.ingredient_verification_status,
  image_verification_status = p.image_verification_status,
  verification_status = 'verified',
  active = TRUE,
  absent_since = NULL,
  promoted_cache_key = l.cache_key,
  promoted_at = NOW(),
  last_observed_at = GREATEST(f.last_observed_at, p.updated_at),
  updated_at = NOW()
FROM catalog_formula_serving_links l
JOIN catalog_exact_serving_candidates c
  ON c.formula_key = l.formula_key
 AND c.cache_key = l.cache_key
JOIN public.product_data p
  ON p.cache_key = l.cache_key
WHERE f.formula_key = l.formula_key;

SELECT count(*) AS linked_exact_formulas FROM catalog_formula_serving_links;

-- Retire the stale parser identity only after the exact current formula and
-- serving row pass every manufacturer URL, ingredient, image, species, and form
-- postcondition above.
DO $$
DECLARE
  v_formula_id BIGINT;
  v_stale_formula_id BIGINT;
  v_cache_key TEXT;
BEGIN
  SELECT id, promoted_cache_key
  INTO STRICT v_formula_id, v_cache_key
  FROM public.catalog_formulas
  WHERE formula_key =
    'nulo|nulo|medalseries signature stews|cat|all life stages|wet|chicken duck and pumpkin recipe|'
    AND source_url =
      'https://nulo.com/products/medalseries-signature-stews-chicken-duck-pumpkin-recipe-for-cats'
    AND verification_status = 'verified'
    AND active
    AND cardinality(ingredients) = 36;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_data
    WHERE cache_key = v_cache_key
      AND product_name =
        'MedalSeries Signature Stews Chicken, Duck & Pumpkin Recipe for Cats'
      AND product_line = 'MedalSeries Signature Stews'
      AND flavor = 'Chicken, Duck & Pumpkin Recipe'
      AND pet_type = 'cat'
      AND life_stage = 'all life stages'
      AND food_form = 'wet'
      AND ingredient_count = 36
      AND source_quality = 'manufacturer'
      AND ingredient_verification_status = 'manufacturer'
      AND image_verification_status = 'manufacturer'
      AND is_complete_food
      AND catalog_exclusion_reason IS NULL
  ) THEN
    RAISE EXCEPTION 'Corrected Nulo Signature Stews serving postconditions failed';
  END IF;

  SELECT id
  INTO STRICT v_stale_formula_id
  FROM public.catalog_formulas
  WHERE formula_key = 'nulo|nulo|medalseries and|cat|kitten|wet|chicken|'
    AND source_url =
      'https://nulo.com/products/medalseries-signature-stews-chicken-duck-pumpkin-recipe-for-cats'
    AND cardinality(ingredients) = 36;

  UPDATE public.catalog_formulas
  SET
    verification_status = 'quarantined',
    active = FALSE,
    absent_since = COALESCE(absent_since, NOW()),
    promoted_cache_key = NULL,
    promoted_at = NULL,
    complete_food_evidence =
      'Superseded stale parser identity. Current exact manufacturer page proves MedalSeries Signature Stews, Chicken, Duck & Pumpkin Recipe, all life stages.',
    updated_at = NOW()
  WHERE id = v_stale_formula_id;

  UPDATE public.catalog_field_evidence
  SET accepted = FALSE
  WHERE formula_id = v_stale_formula_id;
END;
$$;
