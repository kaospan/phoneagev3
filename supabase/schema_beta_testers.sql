  -- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
  -- Dashboard → SQL Editor → New Query → paste → Run
  --
  -- An intermediate role between "regular player" and "admin": accounts listed here get the same
  -- free level-skip access as admins in the main game (see PuzzleGame.tsx's canSkipLevels), but
  -- NOTHING else — /mapper and /crm are gated purely by admin_users (MapperAuthGate), which this
  -- table is deliberately kept separate from, so granting beta access can never leak mapper/CRM
  -- access to a non-admin account.

  CREATE TABLE IF NOT EXISTS public.beta_testers (
    user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE public.beta_testers ENABLE ROW LEVEL SECURITY;

  -- A player can check their own beta status; admins can see, grant, and revoke anyone's.
  CREATE POLICY "beta_testers_self_read" ON public.beta_testers
    FOR SELECT TO authenticated USING (user_id = auth.uid());
  CREATE POLICY "beta_testers_admin_read_all" ON public.beta_testers
    FOR SELECT TO authenticated USING (public.is_admin());
  CREATE POLICY "beta_testers_admin_insert" ON public.beta_testers
    FOR INSERT TO authenticated WITH CHECK (public.is_admin());
  CREATE POLICY "beta_testers_admin_delete" ON public.beta_testers
    FOR DELETE TO authenticated USING (public.is_admin());
