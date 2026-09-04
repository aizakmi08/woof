WITH artifact_demotions(id) AS (
  VALUES
    ('94105332-c3f7-4b1a-83a0-06df83f3abf9'::UUID),
    ('b8dab535-0183-49ee-9159-d64ea3d4ed37'::UUID),
    ('7d4161bd-f730-4ce4-a0ca-3d8d3410a521'::UUID),
    ('1e6c2320-24d6-4308-bac5-76341b125e11'::UUID),
    ('fb7687e1-1a82-48b4-b016-5ebcc59cc547'::UUID),
    ('3c0ee3e2-736a-46d9-8322-7bbdb13e0717'::UUID),
    ('d2ac1114-9b2d-48ed-b0ce-b83e9f3a5e77'::UUID)
),
variety_pack_demotions(id) AS (
  VALUES
    ('42da9d18-6bdd-4ea3-ad07-b93522a06a2b'::UUID)
),
artifact_updates AS (
  UPDATE public.product_data AS pd
  SET
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM artifact_demotions
  WHERE pd.id = artifact_demotions.id
    AND pd.catalog_exclusion_reason IS NULL
    AND pd.ingredient_verification_status IN ('gdsn', 'official', 'manufacturer', 'retailer_verified', 'label_ocr_verified')
  RETURNING pd.cache_key
),
variety_pack_updates AS (
  UPDATE public.product_data AS pd
  SET
    is_complete_food = FALSE,
    catalog_exclusion_reason = COALESCE(NULLIF(pd.catalog_exclusion_reason, ''), 'multi_formula_or_variety_pack'),
    ingredient_verification_status = 'unverified',
    verified_at = NULL,
    updated_at = NOW()
  FROM variety_pack_demotions
  WHERE pd.id = variety_pack_demotions.id
    AND pd.catalog_exclusion_reason IS NULL
  RETURNING pd.cache_key
),
demoted AS (
  SELECT cache_key FROM artifact_updates
  UNION ALL
  SELECT cache_key FROM variety_pack_updates
),
evidence_review AS (
  UPDATE public.catalog_product_evidence evidence
  SET
    review_state = 'manual_review',
    updated_at = NOW()
  FROM demoted
  WHERE evidence.cache_key = demoted.cache_key
    AND evidence.review_state = 'promoted'
  RETURNING evidence.id
)
SELECT
  (SELECT count(*) FROM artifact_updates) AS demoted_ingredient_artifact_rows,
  (SELECT count(*) FROM variety_pack_updates) AS demoted_variety_pack_rows,
  (SELECT count(*) FROM evidence_review) AS evidence_rows_marked_manual_review;
