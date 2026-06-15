-- Atomic scan count increment (avoids race conditions from concurrent calls)
CREATE OR REPLACE FUNCTION increment_scan_count(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_count INT;
BEGIN
  UPDATE profiles
  SET scan_count = COALESCE(scan_count, 0) + 1
  WHERE id = p_user_id
  RETURNING scan_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$;
