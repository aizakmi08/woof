-- Import official Purina Gatsby page-data without exposing catalog write access
-- to app clients. This keeps verified source backfills service-role-only while
-- avoiding large SQL payload uploads for regenerated Purina feeds.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.purina_gatsby_page_data_url(p_source_url TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(trim(p_source_url), '') !~* '^https?://([^/]+\.)?purina\.com(/|$)' THEN NULL
    ELSE
      'https://www.purina.com/page-data'
      || COALESCE(NULLIF(regexp_replace(split_part(regexp_replace(p_source_url, '^https?://[^/]+', ''), '?', 1), '/+$', ''), ''), '/')
      || '/page-data.json'
  END;
$$;

CREATE OR REPLACE FUNCTION public.purina_absolute_url(p_path TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(trim(p_path), '') = '' THEN NULL
    WHEN p_path ~* '^https?://' THEN p_path
    WHEN left(p_path, 1) = '/' THEN 'https://www.purina.com' || p_path
    ELSE 'https://www.purina.com/' || p_path
  END;
$$;

CREATE OR REPLACE FUNCTION public.purina_compact_text(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(trim(regexp_replace(COALESCE(p_value, ''), '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.purina_normalized_key(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(trim(regexp_replace(lower(COALESCE(p_value, '')), '[^a-z0-9]+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_node_title(p_node JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.purina_compact_text(
    COALESCE(
      p_node #>> '{title}',
      p_node #>> '{name}',
      p_node #>> '{field_title}'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_node_url(p_node JSONB, p_fallback_url TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    public.purina_absolute_url(p_node #>> '{path,alias}'),
    public.purina_absolute_url(p_node #>> '{url}'),
    public.purina_absolute_url(p_fallback_url)
  );
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_node_image_url(p_node JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.purina_absolute_url(
    COALESCE(
      p_node #>> '{relationships,image,relationships,file,url}',
      p_node #>> '{relationships,image,gatsbyImage,images,fallback,src}',
      p_node #>> '{image,url}',
      p_node #>> '{image,src}'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_node_gtin(p_node JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(COALESCE((
    SELECT sku ->> 'upc'
    FROM jsonb_array_elements(COALESCE(p_node #> '{relationships,skus}', '[]'::jsonb)) AS sku
    WHERE COALESCE(sku ->> 'upc', '') ~ '[0-9]{8,}'
    LIMIT 1
  ), ''), '[^0-9]', '', 'g'), '');
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_node_package_size(p_node JSONB)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.purina_compact_text(COALESCE(
    (
      SELECT sku ->> 'shortDescription'
      FROM jsonb_array_elements(COALESCE(p_node #> '{relationships,skus}', '[]'::jsonb)) AS sku
      WHERE public.purina_compact_text(sku ->> 'shortDescription') IS NOT NULL
      LIMIT 1
    ),
    (
      SELECT concat_ws(' ', sku ->> 'size', sku ->> 'description')
      FROM jsonb_array_elements(COALESCE(p_node #> '{relationships,skus}', '[]'::jsonb)) AS sku
      WHERE public.purina_compact_text(concat_ws(' ', sku ->> 'size', sku ->> 'description')) IS NOT NULL
      LIMIT 1
    )
  ));
$$;

CREATE OR REPLACE FUNCTION public.purina_gatsby_ingredient_names(p_node JSONB)
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(name ORDER BY ordinal), ARRAY[]::TEXT[])
  FROM (
    SELECT
      public.purina_compact_text(ingredient ->> 'name') AS name,
      ordinal
    FROM jsonb_array_elements(COALESCE(p_node #> '{relationships,ingredients}', '[]'::jsonb)) WITH ORDINALITY AS item(ingredient, ordinal)
  ) AS names
  WHERE name IS NOT NULL
    AND length(name) BETWEEN 2 AND 140
    AND name !~* '^(ingredients?|view all ingredients)$';
$$;

CREATE OR REPLACE FUNCTION public.purina_unique_text_array(p_values TEXT[])
RETURNS TEXT[]
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(value ORDER BY first_ordinal), ARRAY[]::TEXT[])
  FROM (
    SELECT lower(value) AS key, min(ordinal) AS first_ordinal, min(value) AS value
    FROM unnest(COALESCE(p_values, ARRAY[]::TEXT[])) WITH ORDINALITY AS item(value, ordinal)
    WHERE public.purina_compact_text(value) IS NOT NULL
    GROUP BY lower(value)
  ) AS deduped;
$$;

CREATE OR REPLACE FUNCTION public.purina_infer_pet_type(p_title TEXT, p_url TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_title, '') || ' ' || COALESCE(p_url, '') ~* '\m(dog|dogs|puppy|puppies|canine)\M'
      AND COALESCE(p_title, '') || ' ' || COALESCE(p_url, '') !~* '\m(cat|cats|kitten|kittens|feline)\M'
      THEN 'dog'
    WHEN COALESCE(p_title, '') || ' ' || COALESCE(p_url, '') ~* '\m(cat|cats|kitten|kittens|feline)\M'
      AND COALESCE(p_title, '') || ' ' || COALESCE(p_url, '') !~* '\m(dog|dogs|puppy|puppies|canine)\M'
      THEN 'cat'
    ELSE 'unknown'
  END;
$$;

CREATE OR REPLACE FUNCTION public.purina_infer_food_form(p_title TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_title, '') ~* '\m(wet|can|canned|pate|paté|stew|gravy|morsels|chunks|shreds)\M' THEN 'wet'
    WHEN COALESCE(p_title, '') ~* '\m(dry|kibble)\M' THEN 'dry'
    WHEN COALESCE(p_title, '') ~* 'freeze[- ]?dried' THEN 'freeze-dried'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.purina_is_complete_food_candidate(p_title TEXT, p_url TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT (COALESCE(p_title, '') || ' ' || COALESCE(p_url, '')) !~* '\m(treat|treats|snack|snacks|chew|chews|topper|toppers|broth|broths|supplement|supplements|appetizer|appetizers)\M';
$$;

CREATE OR REPLACE FUNCTION public.purina_has_complete_food_evidence(p_ingredients TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT cardinality(COALESCE(p_ingredients, ARRAY[]::TEXT[])) >= 20
    OR array_to_string(COALESCE(p_ingredients, ARRAY[]::TEXT[]), ', ') ~* '\m(taurine|vitamin|zinc|ferrous|iron sulfate|manganese|copper|potassium iodide|calcium iodate|choline chloride|biotin|folic acid|riboflavin|niacin|thiamine|pyridoxine|menadione)\M';
$$;

CREATE OR REPLACE FUNCTION public.purina_fetch_gatsby_node(p_source_url TEXT)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  page_url TEXT := public.purina_gatsby_page_data_url(p_source_url);
  response_status INTEGER;
  response_content TEXT;
BEGIN
  IF page_url IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT status, content
  INTO response_status, response_content
  FROM extensions.http_get(page_url);

  IF response_status <> 200 OR public.purina_compact_text(response_content) IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN response_content::jsonb #> '{result,data,node}';
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.import_purina_gatsby_product_feed(
  p_urls TEXT[],
  p_source TEXT,
  p_expected_brand TEXT,
  p_max_rows INTEGER DEFAULT 150
)
RETURNS TABLE (
  attempted_rows INTEGER,
  fetched_rows INTEGER,
  prepared_rows INTEGER,
  upserted_rows INTEGER,
  skipped JSONB
)
LANGUAGE plpgsql
VOLATILE
SET search_path = public, extensions
AS $$
DECLARE
  source_url TEXT;
  product_node JSONB;
  included_node JSONB;
  included JSONB;
  title TEXT;
  product_url TEXT;
  pet_type TEXT;
  gtin TEXT;
  ingredients TEXT[];
  included_ingredients TEXT[];
  bundle_formulas JSONB;
  bundle_ingredient_union TEXT[];
  image_url TEXT;
  payload JSONB := '[]'::jsonb;
  skipped_counts JSONB := '{}'::jsonb;
  attempted_count INTEGER := 0;
  fetched_count INTEGER := 0;
  prepared_count INTEGER := 0;
  source_name TEXT := COALESCE(public.purina_compact_text(p_source), 'nestle-purina');
  expected_brand TEXT := public.purina_compact_text(p_expected_brand);
  cache_basis TEXT;
  skip_reason TEXT;
BEGIN
  FOREACH source_url IN ARRAY COALESCE(p_urls, ARRAY[]::TEXT[]) LOOP
    EXIT WHEN attempted_count >= LEAST(GREATEST(COALESCE(p_max_rows, 150), 1), 300);
    attempted_count := attempted_count + 1;
    skip_reason := NULL;
    product_node := public.purina_fetch_gatsby_node(source_url);

    IF product_node IS NULL THEN
      skip_reason := 'fetch_failed';
    ELSE
      fetched_count := fetched_count + 1;
      title := public.purina_gatsby_node_title(product_node);
      product_url := public.purina_gatsby_node_url(product_node, source_url);
      pet_type := public.purina_infer_pet_type(title, product_url);
      gtin := public.purina_gatsby_node_gtin(product_node);
      ingredients := public.purina_gatsby_ingredient_names(product_node);
      bundle_formulas := '[]'::jsonb;
      bundle_ingredient_union := ingredients;

      IF cardinality(ingredients) < 5 THEN
        FOR included IN
          SELECT value
          FROM jsonb_array_elements(COALESCE(product_node #> '{relationships,products}', '[]'::jsonb))
        LOOP
          included_node := public.purina_fetch_gatsby_node(public.purina_gatsby_node_url(included));
          included_ingredients := public.purina_gatsby_ingredient_names(included_node);
          IF cardinality(included_ingredients) >= 5 THEN
            bundle_ingredient_union := public.purina_unique_text_array(bundle_ingredient_union || included_ingredients);
            bundle_formulas := bundle_formulas || jsonb_build_array(jsonb_build_object(
              'product_name', public.purina_gatsby_node_title(included_node),
              'product_url', public.purina_gatsby_node_url(included_node),
              'gtin', public.purina_gatsby_node_gtin(included_node),
              'ingredients', to_jsonb(included_ingredients)
            ));
          END IF;
        END LOOP;
        ingredients := bundle_ingredient_union;
      END IF;

      image_url := public.purina_gatsby_node_image_url(product_node);

      IF title IS NULL THEN
        skip_reason := 'missing_product_name';
      ELSIF expected_brand IS NULL THEN
        skip_reason := 'missing_expected_brand';
      ELSIF pet_type NOT IN ('dog', 'cat') THEN
        skip_reason := 'unknown_pet_type';
      ELSIF NOT public.purina_is_complete_food_candidate(title, product_url) THEN
        skip_reason := 'not_complete_food';
      ELSIF cardinality(ingredients) < 5 THEN
        skip_reason := 'missing_ingredients';
      ELSIF NOT public.purina_has_complete_food_evidence(ingredients) THEN
        skip_reason := 'incomplete_ingredient_statement';
      ELSIF image_url IS NULL THEN
        skip_reason := 'missing_image';
      ELSE
        cache_basis := COALESCE(gtin, public.purina_normalized_key(expected_brand || ' ' || title));
        payload := payload || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'cache_key', source_name || ':' || cache_basis,
          'product_name', title,
          'brand', expected_brand,
          'gtin', gtin,
          'product_line', NULL,
          'flavor', NULL,
          'life_stage', NULL,
          'food_form', public.purina_infer_food_form(title),
          'package_size', public.purina_gatsby_node_package_size(product_node),
          'pet_type', pet_type,
          'ingredients', to_jsonb(ingredients),
          'ingredient_text', array_to_string(ingredients, ', '),
          'nutrient_panel',
            CASE
              WHEN jsonb_array_length(bundle_formulas) > 0 THEN jsonb_build_object(
                'bundle_formulas', bundle_formulas,
                'ingredient_evidence', 'Official Purina page-data included product ingredient relationships'
              )
              ELSE NULL
            END,
          'has_published_nutrients', jsonb_array_length(bundle_formulas) > 0,
          'source', source_name,
          'source_quality', 'manufacturer',
          'ingredient_verification_status', 'manufacturer',
          'image_verification_status', 'manufacturer',
          'verified_at', now(),
          'source_url', product_url,
          'scraped_at', now(),
          'expires_at', now() + interval '365 days',
          'image_url', image_url,
          'is_complete_food', TRUE,
          'updated_at', now()
        )));
        prepared_count := prepared_count + 1;
      END IF;
    END IF;

    IF skip_reason IS NOT NULL THEN
      skipped_counts := jsonb_set(
        skipped_counts,
        ARRAY[skip_reason],
        to_jsonb(COALESCE((skipped_counts ->> skip_reason)::INTEGER, 0) + 1),
        TRUE
      );
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    attempted_count,
    fetched_count,
    prepared_count,
    CASE
      WHEN prepared_count > 0 THEN (SELECT count(*)::INTEGER FROM public.upsert_catalog_product_feed(payload))
      ELSE 0
    END AS upserted_rows,
    skipped_counts;
END;
$$;

REVOKE ALL ON FUNCTION public.purina_gatsby_page_data_url(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_page_data_url(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_page_data_url(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_page_data_url(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_absolute_url(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_absolute_url(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_absolute_url(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_absolute_url(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_compact_text(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_compact_text(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_compact_text(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_compact_text(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_normalized_key(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_normalized_key(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_normalized_key(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_normalized_key(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_node_title(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_title(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_title(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_node_title(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_node_url(JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_url(JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_url(JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_node_url(JSONB, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_node_image_url(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_image_url(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_image_url(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_node_image_url(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_node_gtin(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_gtin(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_gtin(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_node_gtin(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_node_package_size(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_package_size(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_node_package_size(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_node_package_size(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.purina_gatsby_ingredient_names(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_gatsby_ingredient_names(JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.purina_gatsby_ingredient_names(JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_gatsby_ingredient_names(JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.purina_unique_text_array(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_unique_text_array(TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.purina_unique_text_array(TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_unique_text_array(TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.purina_infer_pet_type(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_infer_pet_type(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_infer_pet_type(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_infer_pet_type(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_infer_food_form(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_infer_food_form(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_infer_food_form(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_infer_food_form(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_is_complete_food_candidate(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_is_complete_food_candidate(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_is_complete_food_candidate(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_is_complete_food_candidate(TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.purina_has_complete_food_evidence(TEXT[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_has_complete_food_evidence(TEXT[]) FROM anon;
REVOKE ALL ON FUNCTION public.purina_has_complete_food_evidence(TEXT[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_has_complete_food_evidence(TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.purina_fetch_gatsby_node(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purina_fetch_gatsby_node(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.purina_fetch_gatsby_node(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purina_fetch_gatsby_node(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.import_purina_gatsby_product_feed(TEXT[], TEXT, TEXT, INTEGER) TO service_role;
