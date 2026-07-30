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
