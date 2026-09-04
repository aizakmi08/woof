-- Close executable defects found by the quality-regimen database tests.
-- The public wrapper serializes one user + scan id before entering the
-- historical implementation, so two concurrent retries converge instead of
-- racing into the scan_usage_events primary key.

DO $migration$
BEGIN
  IF to_regprocedure('public.consume_scan_unlocked(uuid,text,text,integer)') IS NULL THEN
    ALTER FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER)
      RENAME TO consume_scan_unlocked;
  END IF;
END
$migration$;

REVOKE ALL ON FUNCTION public.consume_scan_unlocked(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_scan_unlocked(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_scan_unlocked(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
REVOKE ALL ON FUNCTION public.consume_scan_unlocked(UUID, TEXT, TEXT, INTEGER) FROM service_role;

CREATE OR REPLACE FUNCTION public.consume_scan(
  p_user_id UUID DEFAULT NULL,
  p_scan_id TEXT DEFAULT NULL,
  p_scan_mode TEXT DEFAULT 'unknown',
  p_free_limit INTEGER DEFAULT 3
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID;
  v_scan_id TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    v_user_id := p_user_id;
  ELSE
    v_user_id := auth.uid();
  END IF;

  IF v_user_id IS NULL THEN
    RETURN public.consume_scan_unlocked(p_user_id, p_scan_id, p_scan_mode, p_free_limit);
  END IF;

  v_scan_id := COALESCE(NULLIF(TRIM(p_scan_id), ''), extensions.gen_random_uuid()::TEXT);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::TEXT || ':' || v_scan_id, 0)
  );

  RETURN public.consume_scan_unlocked(p_user_id, v_scan_id, p_scan_mode, p_free_limit);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_scan(UUID, TEXT, TEXT, INTEGER) TO service_role;

-- These legacy argument-trusting RPCs are unused by the client. Keeping them
-- callable lets one authenticated account mutate or read another account's
-- counters, so only server-side code may retain access.
DO $migration$
BEGIN
  IF to_regprocedure('public.get_human_food_count_today(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.get_human_food_count_today(UUID) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.get_human_food_count_today(UUID) TO service_role;
  END IF;

  IF to_regprocedure('public.increment_human_food_count(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.increment_human_food_count(UUID) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_human_food_count(UUID) TO service_role;
  END IF;

  IF to_regprocedure('public.increment_scan_count(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.increment_scan_count(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.increment_scan_count(UUID) FROM anon;
    REVOKE ALL ON FUNCTION public.increment_scan_count(UUID) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.increment_scan_count(UUID) TO service_role;
  END IF;
END
$migration$;

CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'delete_own_account requires an authenticated user';
  END IF;

  DELETE FROM public.analytics_events
  WHERE user_id = v_user_id;

  DELETE FROM public.product_events
  WHERE user_id = v_user_id;

  DELETE FROM public.revenuecat_events
  WHERE app_user_id = v_user_id::TEXT
    OR original_app_user_id = v_user_id::TEXT
    OR subscriber_app_user_id = v_user_id::TEXT
    OR v_user_id = ANY(processed_user_ids)
    OR v_user_id::TEXT = ANY(aliases)
    OR payload::TEXT LIKE ('%' || v_user_id::TEXT || '%');

  DELETE FROM public.scan_usage_events
  WHERE user_id = v_user_id;

  DELETE FROM public.rate_limits
  WHERE user_id = v_user_id;

  DELETE FROM auth.users
  WHERE id = v_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_own_account() FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
