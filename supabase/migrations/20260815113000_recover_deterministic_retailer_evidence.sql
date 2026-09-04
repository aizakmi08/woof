-- Recover retailer rows that are safe to serve after deterministic, auditable
-- transcription cleanup or an exact cross-source formula reconciliation.
-- Raw retailer evidence is never overwritten: serving text and correction codes
-- are stored separately, and every cross-source link requires one unique formula.

ALTER TABLE public.catalog_retailer_ingredient_evidence
  ADD COLUMN IF NOT EXISTS serving_ingredient_text TEXT,
  ADD COLUMN IF NOT EXISTS serving_ingredient_normalization_codes TEXT[]
    NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE OR REPLACE FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(
  p_value TEXT
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      COALESCE(p_value, ''),
                      'Calcium[[:space:]]+Lodate', 'Calcium Iodate', 'gi'
                    ),
                    'Potassium[[:space:]]+Lodide', 'Potassium Iodide', 'gi'
                  ),
                  'Cooper[[:space:]]+Sulfate', 'Copper Sulfate', 'gi'
                ),
                'Choride', 'Chloride', 'gi'
              ),
              'Subtillis', 'Subtilis', 'gi'
            ),
            '\{Vitamin[[:space:]]+B1\}', '(Vitamin B1)', 'gi'
          ),
          '\)[[:space:]]+Vitamins[[:space:]]*:', '), Vitamins:', 'gi'
        ),
        '\)[[:space:]]+Minerals[[:space:]]*:', '), Minerals:', 'gi'
      ),
      '\.[[:space:]]*Vitamin E Supplement\.[[:space:]]*Preserved With Mixed Tocopherols,',
      ', Vitamin E Supplement (Preserved With Mixed Tocopherols),',
      'gi'
    ),
    '[[:space:]]+', ' ', 'g'
  ));
$function$;

CREATE OR REPLACE FUNCTION public.catalog_retailer_ingredient_normalization_codes(
  p_value TEXT
)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT array_remove(ARRAY[
    CASE WHEN COALESCE(p_value, '') ~* 'Calcium[[:space:]]+Lodate'
      THEN 'calcium_iodate_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Potassium[[:space:]]+Lodide'
      THEN 'potassium_iodide_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Cooper[[:space:]]+Sulfate'
      THEN 'copper_sulfate_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Choride'
      THEN 'chloride_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* 'Subtillis'
      THEN 'bacillus_subtilis_transcription' END,
    CASE WHEN COALESCE(p_value, '') ~* '\{Vitamin[[:space:]]+B1\}'
      THEN 'vitamin_b1_group_delimiter' END,
    CASE WHEN COALESCE(p_value, '') ~* '\)[[:space:]]+(Vitamins|Minerals)[[:space:]]*:'
      THEN 'group_separator_punctuation' END,
    CASE WHEN COALESCE(p_value, '') ~*
      '\.[[:space:]]*Vitamin E Supplement\.[[:space:]]*Preserved With Mixed Tocopherols,'
      THEN 'vitamin_e_preservative_punctuation' END
  ]::TEXT[], NULL);
$function$;

CREATE OR REPLACE FUNCTION public.catalog_retailer_serving_ingredient_count(
  p_value TEXT
)
RETURNS INTEGER
LANGUAGE sql
STABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT count(*)::INTEGER
  FROM unnest(public.catalog_split_ingredient_statement(COALESCE(p_value, '')))
    AS ingredient
  WHERE public.is_plausible_product_ingredient(ingredient);
$function$;

CREATE INDEX IF NOT EXISTS catalog_formulas_active_ingredient_identity_idx
  ON public.catalog_formulas (
    pet_type,
    public.catalog_normalize_ingredient_evidence(ingredient_text)
  )
  WHERE active AND is_complete_food AND NULLIF(btrim(ingredient_text), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_retailer_current_ingredient_identity_idx
  ON public.catalog_retailer_ingredient_evidence (
    import_run_id,
    source_slug,
    evidence_status,
    pet_type,
    public.catalog_normalize_ingredient_evidence(ingredient_text)
  )
  WHERE is_current;

CREATE OR REPLACE FUNCTION public.recover_normalized_retailer_evidence(
  p_import_run_id UUID,
  p_source_slug TEXT DEFAULT 'chewy',
  p_limit INTEGER DEFAULT 500
)
RETURNS TABLE(updated_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF p_source_slug NOT IN ('chewy', 'walmart') THEN
    RAISE EXCEPTION 'Unsupported retailer source %', p_source_slug;
  END IF;
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 5000';
  END IF;

  WITH eligible AS (
    SELECT evidence.id,
      public.catalog_normalize_retailer_serving_ingredient_text(
        evidence.ingredient_text
      ) AS normalized_text,
      public.catalog_retailer_ingredient_normalization_codes(
        evidence.ingredient_text
      ) AS normalization_codes
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
     AND formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
    JOIN public.catalog_observations observation
      ON observation.id = evidence.linked_observation_id
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.source_slug = p_source_slug
      AND evidence.is_current
      AND evidence.evidence_status = 'quarantined_validation'
      AND evidence.image_validation_status IN (
        'exact_retailer_sku', 'exact_catalog_formula'
      )
      AND evidence.validation_reasons <@ ARRAY[
        'product_data_ingredient_contract',
        'product_data_ingredient_artifact_contract'
      ]::TEXT[]
      AND evidence.validation_reasons && ARRAY[
        'product_data_ingredient_contract',
        'product_data_ingredient_artifact_contract'
      ]::TEXT[]
      AND cardinality(public.catalog_retailer_ingredient_normalization_codes(
        evidence.ingredient_text
      )) > 0
      AND NOT public.is_likely_non_product_catalog_row(
        formula.product_name, formula.brand
      )
      AND length(public.catalog_normalize_retailer_serving_ingredient_text(
        evidence.ingredient_text
      )) >= 30
      AND public.catalog_retailer_serving_ingredient_count(
        public.catalog_normalize_retailer_serving_ingredient_text(evidence.ingredient_text)
      ) >= 5
      AND public.catalog_retailer_ingredient_is_serving_safe(
        public.catalog_normalize_retailer_serving_ingredient_text(evidence.ingredient_text)
      )
      AND public.catalog_normalize_retailer_serving_ingredient_text(
        evidence.ingredient_text
      ) !~ '(\.\.\.|…)'
      AND NOT public.catalog_has_unbalanced_parentheses(
        public.catalog_normalize_retailer_serving_ingredient_text(evidence.ingredient_text)
      )
      AND NOT public.catalog_has_ingredient_ocr_artifacts(
        public.catalog_normalize_retailer_serving_ingredient_text(evidence.ingredient_text)
      )
    ORDER BY evidence.id
    LIMIT p_limit
    FOR UPDATE OF evidence SKIP LOCKED
  ), changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      serving_ingredient_text = eligible.normalized_text,
      serving_ingredient_normalization_codes = eligible.normalization_codes,
      evidence_status = 'promotable_exact_package',
      validation_reasons = array_remove(array_remove(
        evidence.validation_reasons,
        'product_data_ingredient_contract'
      ), 'product_data_ingredient_artifact_contract'),
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'serving_ingredient_normalization', jsonb_build_object(
          'policy', 'deterministic_transcription_corrections_v1',
          'codes', to_jsonb(eligible.normalization_codes),
          'raw_ingredient_hash', evidence.ingredient_hash,
          'raw_evidence_preserved', true,
          'normalized_at', now()
        )
      ),
      updated_at = now()
    FROM eligible
    WHERE evidence.id = eligible.id
    RETURNING evidence.id
  )
  SELECT count(*)::INTEGER INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.attach_exact_catalog_formula_images(
  p_import_run_id UUID,
  p_source_slug TEXT DEFAULT 'walmart'
)
RETURNS TABLE(updated_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF p_source_slug NOT IN ('chewy', 'walmart') THEN
    RAISE EXCEPTION 'Unsupported retailer source %', p_source_slug;
  END IF;

  WITH changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      front_image_url = formula.front_image_url,
      image_title = formula.product_name,
      image_source_url = formula.source_url,
      image_observed_at = formula.updated_at,
      image_content_hash = encode(extensions.digest(
        formula.id::TEXT || E'\n' || formula.front_image_url || E'\n' || formula.product_name,
        'sha256'
      ), 'hex'),
      image_validation_status = 'exact_catalog_formula',
      evidence_status = 'promotable_exact_package',
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'package_evidence_method', 'verified_exact_catalog_formula_image',
        'package_image_source_url', formula.source_url,
        'package_image_observed_at', formula.updated_at,
        'catalog_formula_id', formula.id,
        'identity_requirement',
          'prelinked exact formula plus normalized-identical full ingredient statement'
      ),
      validation_reasons = array_remove(
        evidence.validation_reasons,
        'exact_formula_missing_front_image'
      ),
      updated_at = now()
    FROM public.catalog_formulas formula
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.source_slug = p_source_slug
      AND evidence.evidence_status = 'linked_missing_exact_image'
      AND formula.id = evidence.linked_formula_id
      AND formula.active
      AND formula.is_complete_food
      AND formula.pet_type = evidence.pet_type
      AND formula.image_verification_status IN ('manufacturer', 'retailer_verified')
      AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
      AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text)
        = public.catalog_normalize_ingredient_evidence(evidence.ingredient_text)
    RETURNING evidence.linked_observation_id, evidence.front_image_url
  ), observation_update AS (
    UPDATE public.catalog_observations observation
    SET front_image_url = changed.front_image_url
    FROM changed
    WHERE observation.id = changed.linked_observation_id
    RETURNING observation.id
  )
  SELECT count(*)::INTEGER INTO v_updated FROM changed;

  RETURN QUERY SELECT v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reconcile_walmart_unique_ingredient_formulas(
  p_import_run_id UUID,
  p_limit INTEGER DEFAULT 250
)
RETURNS TABLE(reconciled_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_source_run_id BIGINT;
  v_ids BIGINT[] := ARRAY[]::BIGINT[];
  v_reconciled INTEGER := 0;
BEGIN
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit must be between 1 and 1000';
  END IF;

  SELECT id INTO v_source_run_id
  FROM public.catalog_source_runs
  WHERE run_key = 'retailer-web-materialize:' || p_import_run_id::TEXT
  ORDER BY id DESC
  LIMIT 1;

  IF v_source_run_id IS NULL THEN
    RAISE EXCEPTION 'Missing retailer materialization source run for %', p_import_run_id;
  END IF;

  WITH candidates AS (
    SELECT
      evidence.id AS evidence_id,
      formula.id AS formula_id,
      similarity(
        public.catalog_normalize_retailer_title(evidence.product_name),
        public.catalog_normalize_retailer_title(concat_ws(
          ' ', formula.brand, formula.product_line, formula.product_name
        ))
      ) AS title_similarity,
      count(*) OVER (PARTITION BY evidence.id) AS candidate_count
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
     AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text)
       = public.catalog_normalize_ingredient_evidence(evidence.ingredient_text)
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.source_slug = 'walmart'
      AND evidence.is_current
      AND evidence.evidence_status = 'unmatched_catalog_sku'
      AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
      AND formula.image_verification_status IN ('manufacturer', 'retailer_verified')
      AND length(public.catalog_normalize_retailer_title(formula.brand)) >= 4
      AND public.catalog_normalize_retailer_title(evidence.product_name)
        LIKE '%' || public.catalog_normalize_retailer_title(formula.brand) || '%'
  ), eligible AS (
    SELECT candidate.evidence_id
    FROM candidates candidate
    JOIN public.catalog_retailer_ingredient_evidence evidence
      ON evidence.id = candidate.evidence_id
    JOIN public.catalog_formulas formula
      ON formula.id = candidate.formula_id
    WHERE candidate.candidate_count = 1
      AND candidate.title_similarity >= 0.65
      AND public.catalog_retailer_ingredient_is_serving_safe(evidence.ingredient_text)
      AND NOT public.catalog_has_unbalanced_parentheses(evidence.ingredient_text)
      AND NOT public.catalog_has_ingredient_ocr_artifacts(evidence.ingredient_text)
      AND NOT public.is_likely_non_product_catalog_row(
        formula.product_name, formula.brand
      )
      AND evidence.product_name !~* '\m(variety[ -]?pack|assortment|bundle|topper|treat|appetizer|complementary|supplement|mixer|broth|spray)\M'
      AND CASE
        WHEN lower(COALESCE(formula.food_form, '')) IN ('dry', 'kibble')
          THEN evidence.product_name ~* '\m(dry|kibble)\M'
        WHEN lower(COALESCE(formula.food_form, '')) IN ('wet', 'canned')
          THEN evidence.product_name ~* '\m(wet|can|cans|canned|pate|paté|mousse|stew|gravy|entree|entrée|chunk|chunks|cuts|loaf|flaked|tray|pouch)\M'
        WHEN lower(COALESCE(formula.food_form, '')) LIKE '%freeze%'
          THEN evidence.product_name ~* 'freeze[ -]?dried'
        WHEN lower(COALESCE(formula.food_form, '')) LIKE '%dehydrat%'
          THEN evidence.product_name ~* '\mdehydrated\M'
        WHEN lower(COALESCE(formula.food_form, '')) LIKE '%frozen%'
          THEN evidence.product_name ~* '\m(frozen|raw)\M'
        WHEN lower(COALESCE(formula.food_form, '')) LIKE '%fresh%'
          THEN evidence.product_name ~* '\m(fresh|refrigerated)\M'
        ELSE false
      END
      AND CASE
        WHEN lower(COALESCE(formula.life_stage, '')) LIKE '%puppy%'
          THEN evidence.product_name ~* '\mpupp(y|ies)\M'
        WHEN lower(COALESCE(formula.life_stage, '')) LIKE '%kitten%'
          THEN evidence.product_name ~* '\mkitten(s)?\M'
        WHEN lower(COALESCE(formula.life_stage, '')) ~ '(senior|mature)'
          THEN evidence.product_name ~* '\m(senior|mature)\M'
        WHEN lower(COALESCE(formula.life_stage, '')) = 'adult'
          THEN evidence.product_name !~* '\m(pupp(y|ies)|kitten(s)?|senior|mature)\M'
        ELSE evidence.product_name !~* '\m(pupp(y|ies)|kitten(s)?|senior|mature)\M'
      END
    ORDER BY candidate.title_similarity DESC, candidate.evidence_id
    LIMIT p_limit
    FOR UPDATE OF evidence SKIP LOCKED
  )
  SELECT COALESCE(array_agg(evidence_id ORDER BY evidence_id), ARRAY[]::BIGINT[])
  INTO v_ids
  FROM eligible;

  IF cardinality(v_ids) = 0 THEN
    RETURN QUERY SELECT 0;
    RETURN;
  END IF;

  WITH resolved AS (
    SELECT evidence.*, formula.id AS exact_formula_id,
      encode(extensions.digest(
        evidence.content_hash || E'\n' || formula.id::TEXT || E'\n' ||
        formula.front_image_url || E'\nunique-normalized-ingredient-formula-v1',
        'sha256'
      ), 'hex') AS observation_content_hash
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
     AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text)
       = public.catalog_normalize_ingredient_evidence(evidence.ingredient_text)
     AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
     AND formula.image_verification_status IN ('manufacturer', 'retailer_verified')
     AND length(public.catalog_normalize_retailer_title(formula.brand)) >= 4
     AND public.catalog_normalize_retailer_title(evidence.product_name)
       LIKE '%' || public.catalog_normalize_retailer_title(formula.brand) || '%'
    WHERE evidence.id = ANY(v_ids)
  )
  INSERT INTO public.catalog_observations (
    run_id, formula_id, source_slug, source_external_id, source_url,
    source_authority, gtin, manufacturer, brand, product_name, product_line,
    pet_type, life_stage, food_form, flavor, diet_condition, package_size,
    ingredient_text, front_image_url, is_complete_food, available_in_us,
    observed_at, content_hash, validation_status, validation_reasons,
    raw_payload, formula_evidence_tier, formula_version_provenance
  )
  SELECT
    v_source_run_id, resolved.exact_formula_id, 'walmart-retailer-web',
    resolved.source_external_id, resolved.source_url, 'retailer_verified',
    resolved.retailer_gtin, formula.manufacturer, formula.brand,
    formula.product_name, formula.product_line, formula.pet_type,
    formula.life_stage, formula.food_form, formula.flavor,
    formula.diet_condition, COALESCE(resolved.package_size, ''),
    resolved.ingredient_text, formula.front_image_url, true, true,
    COALESCE(resolved.fetched_at, now()), resolved.observation_content_hash,
    'accepted', ARRAY[]::TEXT[],
    jsonb_build_object(
      'import_run_id', p_import_run_id,
      'retailer_product_name', resolved.product_name,
      'identity_method', 'unique_normalized_full_ingredients_brand_species_form_life_stage_title',
      'catalog_formula_id', formula.id,
      'ingredient_source_url', resolved.source_url,
      'image_source_url', formula.source_url,
      'raw_evidence_preserved', true
    ),
    'retailer_web_version',
    jsonb_build_object(
      'manufacturer_current_equivalence', false,
      'version_status', 'dated_retailer_web_version',
      'gtin_resolution_policy', 'abstain_on_version_conflict',
      'package_identifier', 'walmart:' || resolved.source_external_id,
      'ingredient_text_hash', resolved.ingredient_hash,
      'ingredient_source_url', resolved.source_url,
      'front_image_url', formula.front_image_url,
      'front_image_source_url', formula.source_url,
      'captured_at', resolved.fetched_at
    )
  FROM resolved
  JOIN public.catalog_formulas formula ON formula.id = resolved.exact_formula_id
  ON CONFLICT (run_id, source_slug, source_external_id, content_hash)
  DO UPDATE SET
    formula_id = EXCLUDED.formula_id,
    ingredient_text = EXCLUDED.ingredient_text,
    front_image_url = EXCLUDED.front_image_url,
    observed_at = GREATEST(public.catalog_observations.observed_at, EXCLUDED.observed_at),
    validation_status = 'accepted',
    validation_reasons = ARRAY[]::TEXT[],
    raw_payload = EXCLUDED.raw_payload,
    formula_evidence_tier = EXCLUDED.formula_evidence_tier,
    formula_version_provenance = EXCLUDED.formula_version_provenance;

  WITH resolved AS (
    SELECT evidence.id AS evidence_id, formula.id AS formula_id,
      formula.identity_hash, formula.product_name AS image_title,
      formula.front_image_url, formula.source_url AS image_source_url,
      formula.updated_at AS image_observed_at,
      encode(extensions.digest(
        evidence.content_hash || E'\n' || formula.id::TEXT || E'\n' ||
        formula.front_image_url || E'\nunique-normalized-ingredient-formula-v1',
        'sha256'
      ), 'hex') AS observation_content_hash,
      encode(extensions.digest(
        formula.id::TEXT || E'\n' || formula.front_image_url || E'\n' || formula.product_name,
        'sha256'
      ), 'hex') AS image_content_hash
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.active
     AND formula.is_complete_food
     AND formula.pet_type = evidence.pet_type
     AND public.catalog_normalize_ingredient_evidence(formula.ingredient_text)
       = public.catalog_normalize_ingredient_evidence(evidence.ingredient_text)
     AND NULLIF(btrim(formula.front_image_url), '') IS NOT NULL
     AND formula.image_verification_status IN ('manufacturer', 'retailer_verified')
     AND length(public.catalog_normalize_retailer_title(formula.brand)) >= 4
     AND public.catalog_normalize_retailer_title(evidence.product_name)
       LIKE '%' || public.catalog_normalize_retailer_title(formula.brand) || '%'
    WHERE evidence.id = ANY(v_ids)
  ), changed AS (
    UPDATE public.catalog_retailer_ingredient_evidence evidence
    SET
      linked_formula_id = resolved.formula_id,
      linked_observation_id = observation.id,
      formula_identity_hash = resolved.identity_hash,
      front_image_url = resolved.front_image_url,
      image_title = resolved.image_title,
      image_source_url = resolved.image_source_url,
      image_observed_at = resolved.image_observed_at,
      image_content_hash = resolved.image_content_hash,
      image_validation_status = 'exact_catalog_formula',
      evidence_status = 'promotable_exact_package',
      validation_reasons = array_remove(
        evidence.validation_reasons, 'no_unique_exact_catalog_sku_identity'
      ),
      raw_payload = evidence.raw_payload || jsonb_build_object(
        'reconciliation', jsonb_build_object(
          'policy', 'unique_normalized_full_ingredients_brand_species_form_life_stage_title_v1',
          'catalog_formula_id', resolved.formula_id,
          'ingredient_source_url', evidence.source_url,
          'image_source_url', resolved.image_source_url,
          'reconciled_at', now()
        )
      ),
      updated_at = now()
    FROM resolved
    JOIN public.catalog_observations observation
      ON observation.run_id = v_source_run_id
     AND observation.source_slug = 'walmart-retailer-web'
     AND observation.source_external_id = (
       SELECT source_external_id
       FROM public.catalog_retailer_ingredient_evidence source_evidence
       WHERE source_evidence.id = resolved.evidence_id
     )
     AND observation.content_hash = resolved.observation_content_hash
    WHERE evidence.id = resolved.evidence_id
    RETURNING evidence.id
  )
  SELECT count(*)::INTEGER INTO v_reconciled FROM changed;

  RETURN QUERY SELECT v_reconciled;
END;
$function$;

-- Teach the existing generic promotion lane to validate and serve the separate
-- normalized serving text while preserving raw retailer evidence and its hash.
DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := v_definition;
  v_fixed_definition := replace(
    v_fixed_definition,
    'public.catalog_retailer_ingredient_is_serving_safe(' || chr(10) ||
      '      evidence.ingredient_text' || chr(10) || '    )',
    'public.catalog_retailer_ingredient_is_serving_safe(' || chr(10) ||
      '      COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text)' ||
      chr(10) || '    )'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'public.catalog_retailer_ingredient_is_serving_safe(evidence.ingredient_text)',
    'public.catalog_retailer_ingredient_is_serving_safe(' ||
      'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text))'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'length(evidence.ingredient_text)',
    'length(COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text))'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'evidence.ingredient_count < 5',
    'public.catalog_retailer_serving_ingredient_count(' ||
      'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text)) < 5'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'evidence.ingredient_count >= 5',
    'public.catalog_retailer_serving_ingredient_count(' ||
      'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text)) >= 5'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'evidence.ingredient_text ~ ''(\.\.\.|…)''',
    'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text) ' ||
      '~ ''(\.\.\.|…)'''
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'evidence.ingredient_text !~ ''(\.\.\.|…)''',
    'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text) ' ||
      '!~ ''(\.\.\.|…)'''
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'public.catalog_has_unbalanced_parentheses(evidence.ingredient_text)',
    'public.catalog_has_unbalanced_parentheses(' ||
      'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text))'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    'public.catalog_has_ingredient_ocr_artifacts(evidence.ingredient_text)',
    'public.catalog_has_ingredient_ocr_artifacts(' ||
      'COALESCE(NULLIF(evidence.serving_ingredient_text, ''''), evidence.ingredient_text))'
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $old$      evidence.*,
      formula.identity_hash,$old$,
    $new$      evidence.*,
      COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
        AS normalized_ingredient_text,
      public.catalog_retailer_serving_ingredient_count(
        COALESCE(NULLIF(evidence.serving_ingredient_text, ''), evidence.ingredient_text)
      ) AS normalized_ingredient_count,
      formula.identity_hash,$new$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $old$    regexp_split_to_array(ingredient_text, '\s*,\s*'),
    ingredient_text,
    ingredient_count,$old$,
    $new$    public.catalog_split_ingredient_statement(normalized_ingredient_text),
    normalized_ingredient_text,
    normalized_ingredient_count,$new$
  );
  v_fixed_definition := replace(
    v_fixed_definition,
    $old$        'ingredient_text_hash', ingredient_hash,
        'front_image_url',$old$,
    $new$        'ingredient_text_hash', ingredient_hash,
        'raw_ingredient_text_preserved', true,
        'serving_ingredient_normalization_codes',
          to_jsonb(serving_ingredient_normalization_codes),
        'front_image_url',$new$
  );

  IF v_fixed_definition = v_definition
    OR position('normalized_ingredient_text' IN v_fixed_definition) = 0
    OR position('serving_ingredient_normalization_codes' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'retailer serving normalization promotion markers not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_retailer_ingredient_normalization_codes(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.catalog_retailer_serving_ingredient_count(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recover_normalized_retailer_evidence(UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.catalog_normalize_retailer_serving_ingredient_text(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_retailer_ingredient_normalization_codes(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.catalog_retailer_serving_ingredient_count(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.recover_normalized_retailer_evidence(UUID, TEXT, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.attach_exact_catalog_formula_images(UUID, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_walmart_unique_ingredient_formulas(UUID, INTEGER)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;

COMMENT ON COLUMN public.catalog_retailer_ingredient_evidence.serving_ingredient_text IS
  'Deterministically normalized text used by the serving layer; raw ingredient_text remains immutable source evidence.';
COMMENT ON COLUMN public.catalog_retailer_ingredient_evidence.serving_ingredient_normalization_codes IS
  'Auditable correction codes applied to serving_ingredient_text; empty means raw evidence is served unchanged.';
