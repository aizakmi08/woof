-- Normalize only distinct useful retailer title forms. The first version was
-- deliberately conservative but repeated expensive query normalization for
-- unchanged variants on every package-size row.

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
  ), raw_alias_forms AS (
    SELECT
      base.*,
      'retailer_formula_title'::TEXT AS alias_kind,
      base.formula_title AS alias_text
    FROM evidence_base base

    UNION ALL

    SELECT
      base.*,
      'package_size_stripped'::TEXT AS alias_kind,
      base.package_stripped_title AS alias_text
    FROM evidence_base base

    UNION ALL

    SELECT
      base.*,
      'hills_apostrophe_folded'::TEXT AS alias_kind,
      regexp_replace(
        base.package_stripped_title,
        '^hill s([[:space:]]|$)',
        'hills\1',
        'i'
      ) AS alias_text
    FROM evidence_base base
    WHERE base.package_stripped_title ~* '^hill s([[:space:]]|$)'
  ), distinct_alias_forms AS (
    SELECT
      preferred_cache_key,
      alias_text,
      min(source_url) AS source_url,
      max(COALESCE(fetched_at, now())) AS evidence_observed_at,
      count(DISTINCT evidence_id) AS source_row_count,
      array_agg(DISTINCT source_slug ORDER BY source_slug) AS source_slugs,
      array_agg(DISTINCT alias_kind ORDER BY alias_kind) AS alias_kinds,
      array_agg(DISTINCT linked_formula_id ORDER BY linked_formula_id)
        AS formula_ids
    FROM raw_alias_forms
    WHERE NULLIF(btrim(alias_text), '') IS NOT NULL
      AND length(btrim(alias_text)) >= 3
    GROUP BY preferred_cache_key, alias_text
  ), normalized_candidates AS (
    SELECT
      preferred_cache_key,
      alias_text,
      source_url,
      evidence_observed_at,
      source_row_count,
      source_slugs,
      alias_kinds,
      formula_ids,
      public.normalize_verified_product_search_query(alias_text)
        AS normalized_alias
    FROM distinct_alias_forms
  ), safe_aliases AS (
    SELECT
      normalized_alias,
      min(preferred_cache_key) AS cache_key,
      min(alias_text) AS alias_text,
      min(source_url) AS source_url,
      max(evidence_observed_at) AS evidence_observed_at,
      max(source_row_count)::BIGINT AS source_row_count,
      jsonb_agg(DISTINCT to_jsonb(source_slugs))
        AS source_slugs_nested,
      jsonb_agg(DISTINCT to_jsonb(alias_kinds))
        AS alias_kinds_nested,
      jsonb_agg(DISTINCT to_jsonb(formula_ids))
        AS formula_ids_nested
    FROM normalized_candidates candidate
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
        'source_slugs', safe.source_slugs_nested,
        'alias_kinds', safe.alias_kinds_nested,
        'formula_ids', safe.formula_ids_nested
      )
    FROM safe_aliases safe
    ON CONFLICT (normalized_alias) WHERE active DO NOTHING
    RETURNING id
  )
  SELECT count(*)::INTEGER INTO v_inserted FROM inserted;

  RETURN QUERY SELECT v_inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_retailer_verified_search_aliases(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_retailer_verified_search_aliases(UUID)
  TO service_role;
