-- Reconcile seven exact Target BLUE packages whose full ingredient statements
-- match current manufacturer formulas. Package GTINs become SKU children.
-- When a GTIN was previously attached to an older retailer version, preserve
-- that formula/source evidence but route barcode lookup to current.

DO $$
DECLARE
  v_row RECORD;
  v_observation public.catalog_observations%ROWTYPE;
  v_current_id BIGINT;
  v_current_hash TEXT;
  v_current_ingredients TEXT;
  v_observed_hash TEXT;
  v_gtin_conflict BOOLEAN;
  v_observed_at TIMESTAMPTZ := '2026-07-27T03:55:00Z';
BEGIN
  FOR v_row IN
    SELECT * FROM (VALUES
      (
        '52619693','840243104932',
        'blue-buffalo-general-mills:blue buffalo blue homestyle recipe wet dog food - chicken garden vegetables brown rice blue-specialty homestyle-recipe-chicken-dinner',
        '63532a19c532e830a319f1e07e444f722392ab0fa96ddacce4b2f146b3b6af11'
      ),
      (
        '52619697','840243105199',
        'blue-buffalo-general-mills:blue buffalo blue stew sup sup wet dog food - country chicken blue-specialty blue-stew-country-chicken',
        '2f23509ace6780213628650f9b963c4f33add915e0036ec1de34e104866f1759'
      ),
      (
        '52619698','840243105731',
        'blue-buffalo-general-mills:blue buffalo blue homestyle recipe wet puppy food - chicken garden vegetables blue-specialty puppy-homestyle-recipe-chicken-dinner',
        '6170b50e0b9b7e82b3e16b61ea46cc5ca28c6b72a0d400b57c970fcc21aa1fa9'
      ),
      (
        '52619699','859610007479',
        'blue-buffalo-general-mills:blue buffalo blue homestyle recipe sup sup grain-free senior wet dog food - chicken garden vegetables blue-specialty senior-homestyle-recipe-chicken-dinner',
        '87e510e3cd39334471085fc49e9fd1fbd915a6c799e92bc78ea974ac446cc518'
      ),
      (
        '52619700','840243100170',
        'blue-buffalo-general-mills:blue buffalo blue homestyle recipe sup sup wet dog food healthy weight - chicken garden vegetables blue-specialty homestyle-recipe-healthy-weight-chicken-pate',
        'f13e6d878c02b27a7267c8c1dd136011ffc7274ae322b65c974edfa26f611743'
      ),
      (
        '94897302','840243156818',
        'blue-buffalo-general-mills:blue buffalo life protection formula lamb brown rice life-protection-formula senior-lamb-brown-rice-recipe',
        '1525a22b770746462a61eb548cf76ec6a81f0e28436727e77929f2a3baaa5806'
      ),
      (
        '94900475','840243156566',
        'blue-buffalo-general-mills:blue buffalo blue tastefuls gravy chicken brown rice recipe blue tastefuls-adult-chicken-gravy',
        'd99179a123d067067c9f64d9e7896cfa9bad5226ef874c2168458212cd160226'
      )
    ) AS x(tcin,gtin,current_cache_key,expected_hash)
  LOOP
    SELECT * INTO STRICT v_observation
    FROM public.catalog_observations
    WHERE source_slug='target-blue-buffalo-review-v113'
      AND source_external_id=v_row.tcin
      AND gtin=v_row.gtin
      AND validation_status='quarantined';

    v_observed_hash := encode(digest(
      public.catalog_normalize_ingredient_evidence(v_observation.ingredient_text),
      'sha256'
    ),'hex');

    SELECT id,ingredient_text,encode(digest(
      public.catalog_normalize_ingredient_evidence(COALESCE(ingredient_text,'')),
      'sha256'
    ),'hex')
    INTO STRICT v_current_id,v_current_ingredients,v_current_hash
    FROM public.catalog_formulas
    WHERE promoted_cache_key=v_row.current_cache_key
      AND formula_evidence_tier='manufacturer_current_exact'
      AND verification_status='verified' AND active;

    IF v_observed_hash <> v_row.expected_hash
       OR v_current_hash <> v_row.expected_hash
    THEN
      RAISE EXCEPTION 'Target/current ingredient equality changed for TCIN %',
        v_row.tcin;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.catalog_formulas f
      WHERE f.id=v_current_id
        AND f.pet_type=v_observation.pet_type
        AND f.food_form=v_observation.food_form
        AND (
          f.life_stage=v_observation.life_stage
          OR f.life_stage IN ('','unknown')
          OR f.life_stage IS NULL
        )
    ) THEN
      RAISE EXCEPTION 'Target/current identity boundary mismatch for TCIN %',
        v_row.tcin;
    END IF;

    -- Preserve why an older exact source version no longer owns barcode
    -- routing before moving the reused GTIN to current.
    UPDATE public.catalog_formulas f SET
      formula_version_provenance=
        COALESCE(f.formula_version_provenance,'{}'::JSONB)||
        jsonb_build_object(
          'reused_gtin',v_row.gtin,
          'barcode_resolution_policy','prefer_manufacturer_current',
          'current_formula_cache_key',v_row.current_cache_key,
          'reconciled_at',v_observed_at
        ),
      updated_at=now()
    WHERE f.id IN (
      SELECT s.formula_id FROM public.catalog_skus s
      WHERE s.gtin=v_row.gtin AND s.active AND s.formula_id<>v_current_id
    );

    SELECT EXISTS (
      SELECT 1 FROM public.product_data serving
      WHERE regexp_replace(COALESCE(serving.gtin,''),'\D','','g')=v_row.gtin
        AND serving.ingredient_verification_status IN (
          'gdsn','official','manufacturer','retailer_verified',
          'label_ocr_verified'
        )
        AND lower(regexp_replace(
          btrim(COALESCE(serving.ingredient_text,'')),'\s+',' ','g'
        ))<>lower(regexp_replace(
          btrim(COALESCE(v_current_ingredients,'')),'\s+',' ','g'
        ))
    ) INTO v_gtin_conflict;

    IF v_gtin_conflict THEN
      -- A reused GTIN cannot identify which ingredient version is in hand.
      -- Remove deterministic barcode ownership; typed/source-specific search
      -- remains available for both exact versions.
      UPDATE public.catalog_skus SET
        active=false,last_observed_at=v_observed_at,updated_at=now()
      WHERE gtin=v_row.gtin AND active;
    ELSE
      UPDATE public.catalog_skus SET
        active=false,last_observed_at=v_observed_at,updated_at=now()
      WHERE gtin=v_row.gtin AND active AND formula_id<>v_current_id;

      INSERT INTO public.catalog_skus (
        formula_id,gtin,package_size,package_count,source_slug,
        source_external_id,source_url,active,first_observed_at,
        last_observed_at,updated_at
      ) VALUES (
        v_current_id,v_row.gtin,v_observation.package_size,1,
        'target-retail-label-review','TCIN:'||v_row.tcin,
        v_observation.source_url,true,v_observed_at,v_observed_at,now()
      )
      ON CONFLICT (source_slug,source_external_id,gtin,package_size)
      DO UPDATE SET formula_id=excluded.formula_id,
        source_url=excluded.source_url,active=true,
        last_observed_at=excluded.last_observed_at,updated_at=now();
    END IF;

    UPDATE public.catalog_observations SET
      formula_id=v_current_id,
      manufacturer=(SELECT manufacturer FROM public.catalog_formulas WHERE id=v_current_id),
      brand=(SELECT brand FROM public.catalog_formulas WHERE id=v_current_id),
      product_line=(SELECT product_line FROM public.catalog_formulas WHERE id=v_current_id),
      pet_type=(SELECT pet_type FROM public.catalog_formulas WHERE id=v_current_id),
      life_stage=(SELECT COALESCE(NULLIF(life_stage,''),v_observation.life_stage)
                  FROM public.catalog_formulas WHERE id=v_current_id),
      food_form=(SELECT food_form FROM public.catalog_formulas WHERE id=v_current_id),
      flavor=(SELECT flavor FROM public.catalog_formulas WHERE id=v_current_id),
      validation_status='accepted',validation_reasons=ARRAY[]::TEXT[],
      formula_evidence_tier='manufacturer_current_exact',
      formula_version_provenance=jsonb_build_object(
        'version_status','manufacturer_current_equivalent_package',
        'manufacturer_current_equivalence',true,
        'package_gtin',v_row.gtin,
        'product_code','TCIN '||v_row.tcin,
        'captured_at',v_observed_at,
        'ingredient_text_hash',v_observed_hash,
        'manufacturer_current_cache_key',v_row.current_cache_key,
        'barcode_resolution_policy',
          CASE WHEN v_gtin_conflict
            THEN 'abstain_reused_gtin_formula_conflict'
            ELSE 'exact_current_package'
          END
      ),
      observed_at=v_observed_at
    WHERE id=v_observation.id;

    INSERT INTO public.catalog_verified_product_search_aliases (
      cache_key,alias_text,normalized_alias,source_url,source_authority,
      evidence_observed_at,provenance,active,created_at,updated_at
    ) VALUES (
      v_row.current_cache_key,v_observation.product_name,
      public.normalize_verified_product_search_query(v_observation.product_name),
      (SELECT source_url FROM public.product_data
       WHERE cache_key=v_row.current_cache_key),
      'manufacturer',v_observed_at,
      jsonb_build_object(
        'formula_evidence_tier','manufacturer_current_exact',
        'target_product_code','TCIN '||v_row.tcin,
        'target_package_gtin',v_row.gtin,
        'ingredient_hash_equality_verified',true
      ),
      true,now(),now()
    )
    ON CONFLICT (normalized_alias) WHERE active DO UPDATE SET
      cache_key=excluded.cache_key,alias_text=excluded.alias_text,
      source_url=excluded.source_url,source_authority=excluded.source_authority,
      evidence_observed_at=excluded.evidence_observed_at,
      provenance=excluded.provenance,updated_at=now();

    IF v_gtin_conflict THEN
      IF EXISTS (
        SELECT 1 FROM public.resolve_verified_product_by_gtin(v_row.gtin,8)
      ) THEN
        RAISE EXCEPTION 'Reused GTIN must safely abstain for %',v_row.tcin;
      END IF;
    ELSIF (
      SELECT cache_key FROM public.resolve_verified_product_by_gtin(
        v_row.gtin,8
      ) LIMIT 1
    ) IS DISTINCT FROM v_row.current_cache_key THEN
      RAISE EXCEPTION 'Current package barcode resolution failed for %',
        v_row.tcin;
    END IF;
  END LOOP;
END
$$;
