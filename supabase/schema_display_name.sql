-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Populates profiles.display_name at signup time from whatever name is available in
-- auth.users' metadata: Google OAuth sign-ins get "full_name"/"name" from Google automatically;
-- email/password sign-ups get "full_name" from the "Name" field the signup form now sends.
-- Also backfills existing accounts (most commonly Google sign-ins from before this shipped,
-- whose name was already sitting in auth.users but never copied over).

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

UPDATE public.profiles p
SET display_name = COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
FROM auth.users u
WHERE p.id = u.id
  AND p.display_name IS NULL
  AND COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') IS NOT NULL;
