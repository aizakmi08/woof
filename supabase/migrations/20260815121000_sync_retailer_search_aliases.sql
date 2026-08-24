-- Every promoted retailer package already has exact, source-backed identity.
-- Make that shelf title searchable without allowing a shared/ambiguous title
-- to choose between formula versions. Package-size wording is an SKU detail,
-- so a size-stripped alias is safe only when it maps to one serving cache key.

CREATE OR REPLACE FUNCTION public.sync_retailer_verified_search_aliases(
  p_import_run_id UUID
)
RETURNS TABLE(inserted_rows INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_inserted INTEGER := 0;
BEGIN
  WITH evidence_base AS (
    SELECT
      evidence.id AS evidence_id,
      evidence.formula_title,
      evidence.source_slug,
      evidence.source_url,
      evidence.fetched_at,
      evidence.linked_formula_id,
      resolved.cache_key AS preferred_cache_key,
      regexp_replace(
        public.catalog_normalize_retailer_title(evidence.formula_title),
        '[[:space:]]+(can|cans|bag|bags|tray|trays|pouch|pouches|cup|cups|box|boxes|carton|cartons|bottle|bottles|tub|tubs|roll|rolls)?[[:space:]]*(case|pack)[[:space:]]+of[[:space:]]+[0-9]+$',
        '',
        'i'
      ) AS package_stripped_title
    FROM public.catalog_retailer_ingredient_evidence evidence
    JOIN public.catalog_formulas formula
      ON formula.id = evidence.linked_formula_id
    CROSS JOIN LATERAL (
      SELECT choice.cache_key
      FROM (
        VALUES
          (
            CASE
              WHEN formula.source_authority = 'manufacturer'
                THEN NULLIF(formula.promoted_cache_key, '')
              ELSE NULL
            END,
            0
          ),
          (NULLIF(evidence.promoted_cache_key, ''), 1)
      ) AS choice(cache_key, preference)
      JOIN public.product_data serving
        ON serving.cache_key = choice.cache_key
      WHERE choice.cache_key IS NOT NULL
        AND serving.expires_at > now()
        AND serving.ingredient_count >= 5
        AND serving.is_complete_food
        AND serving.catalog_exclusion_reason IS NULL
        AND serving.source_quality IN (
          'gdsn', 'official', 'manufacturer', 'retailer_verified'
        )
        AND serving.ingredient_verification_status IN (
          'gdsn', 'official', 'manufacturer',
          'retailer_verified', 'label_ocr_verified'
        )
        AND serving.image_verification_status IN (
          'official', 'manufacturer', 'retailer_verified'
        )
        AND NULLIF(btrim(serving.source_url), '') IS NOT NULL
        AND NULLIF(btrim(serving.image_url), '') IS NOT NULL
      ORDER BY choice.preference
      LIMIT 1
    ) resolved
    WHERE evidence.import_run_id = p_import_run_id
      AND evidence.is_current
      AND evidence.evidence_status = 'promoted'
      AND NULLIF(btrim(evidence.formula_title), '') IS NOT NULL
      AND NULLIF(btrim(evidence.source_url), '') IS NOT NULL
  ), alias_forms AS (
    SELECT
      base.*,
      alias_form.alias_kind,
      NULLIF(btrim(alias_form.alias_text), '') AS alias_text
    FROM evidence_base base
    CROSS JOIN LATERAL (
      VALUES
        ('retailer_formula_title', base.formula_title),
        ('package_size_stripped', base.package_stripped_title),
        (
          'hills_apostrophe_folded',
          regexp_replace(
            base.package_stripped_title,
            '^hill s([[:space:]]|$)',
            'hills\1',
            'i'
          )
        ),
        (
          'veterinary_diet_optional',
          regexp_replace(
            base.package_stripped_title,
            '\mveterinary[[:space:]]+diet\M',
            'veterinary',
            'gi'
          )
        ),
        (
          'hills_apostrophe_and_veterinary_folded',
          regexp_replace(
            regexp_replace(
              base.package_stripped_title,
              '\mveterinary[[:space:]]+diet\M',
              'veterinary',
              'gi'
            ),
            '^hill s([[:space:]]|$)',
            'hills\1',
            'i'
          )
        )
    ) AS alias_form(alias_kind, alias_text)
  ), normalized_candidates AS (
    SELECT DISTINCT
      preferred_cache_key,
      source_url,
      source_slug,
      linked_formula_id,
      evidence_id,
      fetched_at,
      alias_kind,
      alias_text,
      public.normalize_verified_product_search_query(alias_text)
        AS normalized_alias
    FROM alias_forms
    WHERE alias_text IS NOT NULL
      AND length(alias_text) >= 3
  ), safe_aliases AS (
    SELECT
      normalized_alias,
      min(preferred_cache_key) AS cache_key,
      min(alias_text) AS alias_text,
      min(source_url) AS source_url,
      max(COALESCE(fetched_at, now())) AS evidence_observed_at,
      count(DISTINCT evidence_id) AS source_row_count,
      array_agg(DISTINCT source_slug ORDER BY source_slug) AS source_slugs,
      array_agg(DISTINCT alias_kind ORDER BY alias_kind) AS alias_kinds,
      array_agg(DISTINCT linked_formula_id ORDER BY linked_formula_id)
        AS formula_ids
    FROM normalized_candidates
    WHERE normalized_alias IS NOT NULL
      AND length(normalized_alias) >= 2
    GROUP BY normalized_alias
    HAVING count(DISTINCT preferred_cache_key) = 1
  ), inserted AS (
    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,
      alias_text,
      normalized_alias,
      source_url,
      source_authority,
      evidence_observed_at,
      provenance
    )
    SELECT
      safe.cache_key,
      safe.alias_text,
      safe.normalized_alias,
      safe.source_url,
      'retailer_identity',
      safe.evidence_observed_at,
      jsonb_build_object(
        'source', 'retailer_import_exact_title_alias_v1',
        'import_run_id', p_import_run_id,
        'identity_rule', 'one_normalized_title_to_one_verified_cache_key',
        'package_size_is_sku_only', true,
        'source_row_count', safe.source_row_count,
        'source_slugs', to_jsonb(safe.source_slugs),
        'alias_kinds', to_jsonb(safe.alias_kinds),
        'formula_ids', to_jsonb(safe.formula_ids)
      )
    FROM safe_aliases safe
    ON CONFLICT (normalized_alias) WHERE active DO NOTHING
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_inserted FROM inserted;

  RETURN QUERY SELECT v_inserted;
END;
$function$;

DO $migration$
DECLARE
  v_definition TEXT;
  v_fixed_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.promote_retailer_ingredient_versions(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_fixed_definition := replace(
    v_definition,
    $old$  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence$old$,
    $new$  PERFORM public.sync_retailer_serving_normalization_provenance(
    p_import_run_id
  );

  PERFORM public.sync_retailer_verified_search_aliases(
    p_import_run_id
  );

  SELECT count(*) INTO v_remaining
  FROM public.catalog_retailer_ingredient_evidence$new$
  );

  IF v_fixed_definition = v_definition
    OR position('sync_retailer_verified_search_aliases' IN v_fixed_definition) = 0
  THEN
    RAISE EXCEPTION 'Retailer promotion search-alias marker not found';
  END IF;

  EXECUTE v_fixed_definition;
END;
$migration$;

REVOKE ALL ON FUNCTION public.sync_retailer_verified_search_aliases(UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_verified_search_aliases(UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.promote_retailer_ingredient_versions(UUID, INTEGER)
  TO service_role;
