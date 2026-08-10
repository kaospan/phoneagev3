-- Run this once in your Supabase project's SQL editor, AFTER schema.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Adds: per-player accounts (profiles), per-level progress sync, an append-only
-- play-session log (powers "times played" / move history), and an admin allowlist
-- so the CRM page can read every player's data through normal RLS (no service-role
-- key is ever shipped to the browser).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Profiles: one row per signed-up player ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                        UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email                     TEXT,
  display_name              TEXT,
  highest_unlocked_level_id INTEGER     NOT NULL DEFAULT 1,
  last_played_level_id      INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Admin allowlist: which auth users can see every player's data (CRM) ────
CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- SECURITY DEFINER so RLS policies below can call this without recursing into
-- admin_users' own RLS (which would otherwise need admin_users to check admin_users).
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid());
$$;

-- ── Per-level progress — mirrors the record shape the game already tracked
--    client-side only (campaignProgress.ts), now synced per-account ────────
CREATE TABLE IF NOT EXISTS public.player_progress (
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id                INTEGER     NOT NULL,
  completed               BOOLEAN     NOT NULL DEFAULT FALSE,
  clear_count             INTEGER     NOT NULL DEFAULT 0,
  best_moves              INTEGER,
  last_moves              INTEGER,
  best_time_left_seconds  INTEGER,
  last_time_left_seconds  INTEGER,
  last_completed_at       TIMESTAMPTZ,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, level_id)
);
ALTER TABLE public.player_progress ENABLE ROW LEVEL SECURITY;

-- ── Play sessions: one row per attempt (start→end), regardless of outcome —
--    gives an accurate "times played" count and a per-attempt move history ─
CREATE TABLE IF NOT EXISTS public.play_sessions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id    INTEGER     NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at    TIMESTAMPTZ,
  completed   BOOLEAN     NOT NULL DEFAULT FALSE,
  moves       INTEGER
);
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS play_sessions_user_level_idx ON public.play_sessions (user_id, level_id);

-- ── RLS: players see/write only their own rows; admins (admin_users) see all ─
CREATE POLICY "own_profile_select" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin());
CREATE POLICY "own_profile_update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "own_progress_select" ON public.player_progress
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "own_progress_insert" ON public.player_progress
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_progress_update" ON public.player_progress
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own_sessions_select" ON public.play_sessions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "own_sessions_insert" ON public.play_sessions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_sessions_update" ON public.play_sessions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "admin_users_self_read" ON public.admin_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── Finally: register your existing /mapper admin account for CRM access ───
-- Replace the email below with the account you created earlier, then run this insert.
-- INSERT INTO public.admin_users (user_id)
-- SELECT id FROM auth.users WHERE email = 'you@example.com';
