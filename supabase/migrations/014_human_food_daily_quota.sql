-- 014: Human-food daily quota for free users
--
-- Free users get 1 human-food check per UTC day. Tracked server-side so it
-- can't be bypassed by clearing app data or signing out + signing back in.
-- The RPC is atomic so concurrent requests can't double-spend the quota.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS human_food_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS human_food_count_date DATE;

-- Atomic check + increment. Returns the post-increment count for the current UTC day.
-- If the stored date is older than today, the counter resets to 1.
CREATE OR REPLACE FUNCTION increment_human_food_count(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  new_count INT;
BEGIN
  UPDATE profiles
  SET
    human_food_count = CASE
      WHEN human_food_count_date IS DISTINCT FROM today THEN 1
      ELSE COALESCE(human_food_count, 0) + 1
    END,
    human_food_count_date = today
  WHERE id = p_user_id
  RETURNING human_food_count INTO new_count;

  RETURN COALESCE(new_count, 1);
END;
$$;

-- Read-only quota check. Returns the count consumed today (0 if none / different day).
-- Lets the client show "1 free check left today" without mutating state.
CREATE OR REPLACE FUNCTION get_human_food_count_today(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := (NOW() AT TIME ZONE 'UTC')::DATE;
  cnt INT;
  d DATE;
BEGIN
  SELECT human_food_count, human_food_count_date INTO cnt, d
  FROM profiles WHERE id = p_user_id;

  IF d IS DISTINCT FROM today THEN RETURN 0; END IF;
  RETURN COALESCE(cnt, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION increment_human_food_count(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_human_food_count_today(UUID) TO authenticated, anon;

ANALYZE public.profiles;
