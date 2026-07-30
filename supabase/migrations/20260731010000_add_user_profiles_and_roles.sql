CREATE SCHEMA IF NOT EXISTS app_auth;

REVOKE ALL ON SCHEMA app_auth FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA app_auth TO authenticated, service_role;

CREATE TABLE public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor')),
  jobber_user_id TEXT UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION app_auth.set_user_profile_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_profiles_updated_at
BEFORE UPDATE ON public.user_profiles
FOR EACH ROW EXECUTE FUNCTION app_auth.set_user_profile_updated_at();

INSERT INTO public.user_profiles (
  id,
  email,
  display_name,
  role,
  is_active
)
SELECT
  existing_user.id,
  lower(existing_user.email),
  COALESCE(
    NULLIF(btrim(existing_user.raw_user_meta_data ->> 'full_name'), ''),
    NULLIF(btrim(existing_user.raw_user_meta_data ->> 'name'), ''),
    split_part(existing_user.email, '@', 1)
  ),
  'admin',
  true
FROM auth.users AS existing_user
WHERE existing_user.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION app_auth.current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT profile.role
  FROM public.user_profiles AS profile
  WHERE profile.id = auth.uid()
    AND profile.is_active
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION app_auth.current_role() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_auth.current_role() TO authenticated, service_role;
REVOKE ALL ON FUNCTION app_auth.set_user_profile_updated_at() FROM PUBLIC, anon, authenticated, service_role;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_profiles TO service_role;

CREATE POLICY "user_profiles_self_select"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "user_profiles_admin_select"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (app_auth.current_role() = 'admin');

NOTIFY pgrst, 'reload schema';
