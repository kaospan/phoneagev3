-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run

-- ── Test-user flag on profiles ────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Allow admins to toggle the flag ──────────────────────────────────────
CREATE POLICY "admin_update_test_flag" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Allow admins to delete profile rows (and cascade to progress/sessions) ─
CREATE POLICY "admin_delete_profile" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());
