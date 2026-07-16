-- Store one user-owned pet profile for deterministic ingredient and life-stage
-- checks. This data never changes catalog truth or scoring inputs.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pet_profile JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pet_profile_shape_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pet_profile_shape_check
  CHECK (
    jsonb_typeof(pet_profile) = 'object'
    AND pg_column_size(pet_profile) <= 4096
  );

GRANT UPDATE (pet_profile, updated_at)
  ON TABLE public.profiles
  TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;

COMMENT ON COLUMN public.profiles.pet_profile IS
  'User-owned pet name, species, life stage, and avoid-ingredient preferences used for deterministic result personalization.';
