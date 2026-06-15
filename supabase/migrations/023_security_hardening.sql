-- 023: Harden privileged RPC boundaries before launch.
--
-- SECURITY DEFINER functions must not inherit caller search_path, mutate
-- arbitrary user rows, or be publicly executable unless they are intentionally
-- product APIs.

-- Authenticated users may edit profile presentation fields only. Entitlement
-- and quota columns are server-owned.
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (display_name, avatar_url, updated_at)
  ON public.profiles TO authenticated;

-- Rate-limit helper: service-role only.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_user_id UUID,
  p_max_requests INTEGER DEFAULT 20,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  SELECT request_count, window_start
    INTO v_count, v_window_start
    FROM public.rate_limits
   WHERE user_id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.rate_limits (user_id, request_count, window_start)
    VALUES (p_user_id, 1, NOW());
    RETURN TRUE;
  END IF;

  IF v_window_start < NOW() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE public.rate_limits
       SET request_count = 1,
           window_start = NOW()
     WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE public.rate_limits
     SET request_count = v_count + 1
   WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, INTEGER, INTEGER)
  TO service_role;

-- IP rate-limit helper: service-role only.
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip_address TEXT,
  p_max_requests INTEGER DEFAULT 5,
  p_window_minutes INTEGER DEFAULT 60
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_window TIMESTAMPTZ;
BEGIN
  SELECT request_count, window_start
    INTO v_count, v_window
    FROM public.ip_rate_limits
   WHERE ip_address = p_ip_address
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.ip_rate_limits (ip_address, request_count, window_start)
    VALUES (p_ip_address, 1, NOW());
    RETURN TRUE;
  END IF;

  IF v_window < NOW() - (p_window_minutes || ' minutes')::INTERVAL THEN
    UPDATE public.ip_rate_limits
       SET request_count = 1,
           window_start = NOW()
     WHERE ip_address = p_ip_address;
    RETURN TRUE;
  END IF;

  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  UPDATE public.ip_rate_limits
     SET request_count = request_count + 1
   WHERE ip_address = p_ip_address;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ip_rate_limit(TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ip_rate_limit(TEXT, INTEGER, INTEGER)
  TO service_role;

-- Client-callable quota counters may only mutate/read the caller's own row.
CREATE OR REPLACE FUNCTION public.increment_scan_count(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_count INT;
BEGIN
  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to increment this scan count'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET scan_count = COALESCE(scan_count, 0) + 1
   WHERE id = p_user_id
   RETURNING scan_count INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_scan_count(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_scan_count(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.increment_human_food_count(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  new_count INT;
BEGIN
  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to increment this human-food count'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET human_food_count = CASE
           WHEN human_food_count_date IS DISTINCT FROM today THEN 1
           ELSE COALESCE(human_food_count, 0) + 1
         END,
         human_food_count_date = today
   WHERE id = p_user_id
   RETURNING human_food_count INTO new_count;

  IF new_count IS NULL THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN new_count;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_human_food_count(UUID)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_human_food_count_today(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  cnt INT;
  d DATE;
BEGIN
  IF auth.role() <> 'service_role'
     AND (auth.uid() IS NULL OR auth.uid() <> p_user_id) THEN
    RAISE EXCEPTION 'Not authorized to read this human-food count'
      USING ERRCODE = '42501';
  END IF;

  SELECT human_food_count, human_food_count_date
    INTO cnt, d
    FROM public.profiles
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  IF d IS DISTINCT FROM today THEN
    RETURN 0;
  END IF;

  RETURN COALESCE(cnt, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_human_food_count_today(UUID)
  TO authenticated;

-- Catalog writers are trusted ingestion/service-role paths only. User OCR
-- should not directly overwrite shared product_data from the mobile client.
CREATE OR REPLACE FUNCTION public.save_product_data(
  p_cache_key TEXT,
  p_product_name TEXT,
  p_brand TEXT,
  p_ingredients TEXT[],
  p_ingredient_text TEXT,
  p_ingredient_count INTEGER,
  p_source TEXT DEFAULT 'user_ocr',
  p_image_url TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_cache_key IS NULL
     OR LENGTH(TRIM(p_cache_key)) < 3
     OR p_ingredients IS NULL
     OR COALESCE(array_length(p_ingredients, 1), 0) < 3
     OR p_ingredient_count < 3 THEN
    RAISE EXCEPTION 'Invalid product data payload'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.product_data (
    cache_key, product_name, brand, ingredients, ingredient_text,
    ingredient_count, source, image_url, scraped_at, expires_at
  )
  VALUES (
    p_cache_key,
    p_product_name,
    p_brand,
    p_ingredients,
    p_ingredient_text,
    p_ingredient_count,
    p_source,
    p_image_url,
    NOW(),
    NOW() + INTERVAL '90 days'
  )
  ON CONFLICT (cache_key) DO UPDATE SET
    product_name = COALESCE(EXCLUDED.product_name, public.product_data.product_name),
    brand = COALESCE(EXCLUDED.brand, public.product_data.brand),
    ingredients = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.ingredients
      WHEN EXCLUDED.ingredient_count >= public.product_data.ingredient_count
        THEN EXCLUDED.ingredients
      ELSE public.product_data.ingredients
    END,
    ingredient_text = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.ingredient_text
      WHEN LENGTH(COALESCE(EXCLUDED.ingredient_text, '')) >= LENGTH(COALESCE(public.product_data.ingredient_text, ''))
        THEN EXCLUDED.ingredient_text
      ELSE public.product_data.ingredient_text
    END,
    ingredient_count = GREATEST(EXCLUDED.ingredient_count, public.product_data.ingredient_count),
    source = CASE
      WHEN public.product_data.source IN ('opff', 'dfa', 'cfa', 'cats', 'chewy', 'amazon', 'brand_site')
           AND EXCLUDED.source = 'user_ocr'
        THEN public.product_data.source
      ELSE COALESCE(EXCLUDED.source, public.product_data.source)
    END,
    image_url = COALESCE(EXCLUDED.image_url, public.product_data.image_url),
    scraped_at = NOW(),
    expires_at = NOW() + INTERVAL '90 days';
END;
$$;

REVOKE ALL ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_data(TEXT, TEXT, TEXT, TEXT[], TEXT, INTEGER, TEXT, TEXT)
  TO service_role;

REVOKE ALL ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_product_data_with_nutrients(TEXT, TEXT, TEXT, TEXT[], TEXT, INT, TEXT, TEXT, JSONB)
  TO service_role;

-- Public search stays public, but bound the result set and align freshness /
-- minimum ingredient contract with the client analysis path.
CREATE OR REPLACE FUNCTION public.search_products(q TEXT, max_results INT DEFAULT 10)
RETURNS TABLE (
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  ingredient_count INT,
  source TEXT,
  image_url TEXT,
  rank REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle TEXT := lower(trim(q));
  safe_limit INT := LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
BEGIN
  IF needle IS NULL OR length(needle) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pd.cache_key,
    pd.product_name,
    pd.brand,
    pd.ingredient_count,
    pd.source,
    pd.image_url,
    GREATEST(
      CASE WHEN lower(pd.product_name) LIKE '%' || needle || '%' THEN 1.0 ELSE 0.0 END,
      CASE WHEN lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%' THEN 0.9 ELSE 0.0 END,
      similarity(lower(pd.product_name), needle),
      similarity(lower(COALESCE(pd.brand, '')), needle) * 0.8
    )::real AS rank
  FROM public.product_data pd
  WHERE pd.ingredient_count >= 5
    AND pd.expires_at > NOW()
    AND (
      lower(pd.product_name) LIKE '%' || needle || '%'
      OR lower(COALESCE(pd.brand, '')) LIKE '%' || needle || '%'
      OR similarity(lower(pd.product_name), needle) > 0.15
      OR similarity(lower(COALESCE(pd.brand, '')), needle) > 0.15
    )
  ORDER BY rank DESC, pd.ingredient_count DESC
  LIMIT safe_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.search_products(TEXT, INT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INT)
  TO anon, authenticated;

-- Cleanup helpers are operational jobs, not client RPC APIs.
ALTER FUNCTION public.cleanup_expired_cache()
  SET search_path = public;
ALTER FUNCTION public.cleanup_stale_rate_limits()
  SET search_path = public;
ALTER FUNCTION public.cleanup_stale_ip_rate_limits()
  SET search_path = public;

REVOKE ALL ON FUNCTION public.cleanup_expired_cache()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_stale_rate_limits()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cleanup_stale_ip_rate_limits()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_cache()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_rate_limits()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_ip_rate_limits()
  TO service_role;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public;
