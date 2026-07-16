-- A later production restore of 066_profile_write_security revoked the
-- user-owned pet_profile grant added by migration 286. Restore only the two
-- columns required by the pet editor; entitlement and usage fields remain
-- service-owned.
REVOKE UPDATE (pet_profile, updated_at)
  ON TABLE public.profiles
  FROM anon;

GRANT UPDATE (pet_profile, updated_at)
  ON TABLE public.profiles
  TO authenticated;
