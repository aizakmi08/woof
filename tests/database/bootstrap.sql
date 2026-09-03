-- Disposable foundation for migrations 007-057, which are absent from HEAD.
-- This file is test-only. It must never be applied to a linked or production project.

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$roles$;

DROP SCHEMA IF EXISTS auth CASCADE;
DROP SCHEMA IF EXISTS extensions CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA public;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY,
  email TEXT
);

CREATE FUNCTION auth.uid()
RETURNS UUID
LANGUAGE sql
STABLE
AS $function$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::UUID
$function$;

CREATE FUNCTION auth.role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $function$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), current_user)
$function$;

GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  email TEXT,
  provider TEXT,
  scan_count INTEGER NOT NULL DEFAULT 0,
  is_pro BOOLEAN NOT NULL DEFAULT false,
  pro_expires_at TIMESTAMPTZ,
  human_food_count INTEGER NOT NULL DEFAULT 0,
  human_food_count_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE public.scan_history (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT 'Scan result',
  overall_score INTEGER,
  date_scanned TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, user_id)
);
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY scan_history_own ON public.scan_history FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_insert_own ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
GRANT INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  session_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_events TO service_role;

CREATE TABLE public.rate_limits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE public.revenuecat_events (
  event_id TEXT PRIMARY KEY,
  app_user_id TEXT,
  original_app_user_id TEXT,
  subscriber_app_user_id TEXT,
  processed_user_ids UUID[] NOT NULL DEFAULT '{}',
  aliases TEXT[] NOT NULL DEFAULT '{}',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB
);
ALTER TABLE public.revenuecat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.revenuecat_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.revenuecat_events TO service_role;

CREATE TABLE public.product_data (
  cache_key TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT DEFAULT 'dog',
  ingredients TEXT[] NOT NULL DEFAULT '{}',
  ingredient_text TEXT,
  ingredient_count INTEGER NOT NULL DEFAULT 0,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN NOT NULL DEFAULT false,
  source TEXT DEFAULT 'manufacturer',
  source_quality TEXT NOT NULL DEFAULT 'manufacturer',
  ingredient_verification_status TEXT NOT NULL DEFAULT 'manufacturer',
  image_verification_status TEXT NOT NULL DEFAULT 'manufacturer',
  verified_at TIMESTAMPTZ DEFAULT now(),
  source_url TEXT DEFAULT 'https://example.test/product',
  image_url TEXT DEFAULT 'https://example.test/product.jpg',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 year'),
  is_complete_food BOOLEAN NOT NULL DEFAULT true,
  catalog_exclusion_reason TEXT,
  formula_evidence_tier TEXT NOT NULL DEFAULT 'manufacturer_current_exact',
  formula_version_provenance JSONB NOT NULL DEFAULT '{}'::JSONB
);
ALTER TABLE public.product_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_data_read ON public.product_data FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.product_data TO authenticated;
GRANT ALL ON public.product_data TO service_role;

CREATE FUNCTION public.search_verified_products(q TEXT, max_results INTEGER DEFAULT 10)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    product.cache_key,
    product.product_name,
    product.brand,
    product.gtin,
    product.product_line,
    product.flavor,
    product.life_stage,
    product.food_form,
    product.package_size,
    product.pet_type,
    product.ingredient_count,
    product.source,
    product.source_quality,
    product.ingredient_verification_status,
    product.image_verification_status,
    product.verified_at,
    product.image_url,
    product.ingredients,
    product.ingredient_text,
    product.nutritional_info,
    product.nutrient_panel,
    product.has_published_nutrients,
    product.source_url,
    10::REAL
  FROM public.product_data AS product
  WHERE lower(product.product_name) LIKE '%' || lower(q) || '%'
    OR product.cache_key = q
  ORDER BY product.product_name
  LIMIT LEAST(GREATEST(COALESCE(max_results, 10), 1), 25);
$function$;

CREATE FUNCTION public.resolve_verified_product_by_gtin(q TEXT, max_results INTEGER DEFAULT 8)
RETURNS TABLE(
  cache_key TEXT,
  product_name TEXT,
  brand TEXT,
  gtin TEXT,
  product_line TEXT,
  flavor TEXT,
  life_stage TEXT,
  food_form TEXT,
  package_size TEXT,
  pet_type TEXT,
  ingredient_count INTEGER,
  source TEXT,
  source_quality TEXT,
  ingredient_verification_status TEXT,
  image_verification_status TEXT,
  verified_at TIMESTAMPTZ,
  image_url TEXT,
  ingredients TEXT[],
  ingredient_text TEXT,
  nutritional_info JSONB,
  nutrient_panel JSONB,
  has_published_nutrients BOOLEAN,
  source_url TEXT,
  rank REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT result.*
  FROM public.search_verified_products(q, max_results) AS result
  WHERE result.gtin = q;
$function$;

GRANT EXECUTE ON FUNCTION public.search_verified_products(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_verified_product_by_gtin(TEXT, INTEGER) TO authenticated;

CREATE TABLE public.catalog_private_evidence (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  raw_payload JSONB NOT NULL
);
ALTER TABLE public.catalog_private_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.catalog_private_evidence FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.catalog_private_evidence TO service_role;

-- Historical definitions from the missing migrations. They deliberately trust
-- p_user_id so the current hardening migration is tested against the real risk.
CREATE FUNCTION public.increment_scan_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE new_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET scan_count = scan_count + 1
  WHERE id = p_user_id
  RETURNING scan_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END
$function$;

CREATE FUNCTION public.increment_human_food_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE new_count INTEGER;
BEGIN
  UPDATE public.profiles
  SET human_food_count = human_food_count + 1,
      human_food_count_date = (now() AT TIME ZONE 'UTC')::DATE
  WHERE id = p_user_id
  RETURNING human_food_count INTO new_count;
  RETURN COALESCE(new_count, 0);
END
$function$;

CREATE FUNCTION public.get_human_food_count_today(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT COALESCE(human_food_count, 0) FROM public.profiles WHERE id = p_user_id
$function$;

GRANT EXECUTE ON FUNCTION public.increment_scan_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_human_food_count(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_human_food_count_today(UUID) TO anon, authenticated;
