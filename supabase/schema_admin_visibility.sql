-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Lets the CRM tell which profiles belong to admin accounts (so it can badge them and hide them
-- from the Players list by default) and backfills a profiles row for any admin account that
-- predates the handle_new_user() trigger — e.g. an admin created before schema_players.sql was
-- ever run has an auth.users row but no profiles row, so it never showed up in the CRM at all.

-- admin_users previously only let a user read their OWN row (admin_users_self_read). That's not
-- enough for the CRM to list every admin — add a second, additive policy so a verified admin can
-- read the whole table too.
CREATE POLICY "admin_users_admin_read_all" ON public.admin_users
  FOR SELECT TO authenticated USING (public.is_admin());

INSERT INTO public.profiles (id, email, display_name)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')
FROM auth.users u
JOIN public.admin_users a ON a.user_id = u.id
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
