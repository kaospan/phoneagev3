-- Run this once in your Supabase project's SQL editor
-- Dashboard → SQL Editor → New Query → paste → Run

CREATE TABLE IF NOT EXISTS public.levels (
  id                      INTEGER      PRIMARY KEY,
  grid                    JSONB        NOT NULL,
  player_start            JSONB        NOT NULL,
  cave_pos                JSONB        NOT NULL,
  theme                   TEXT,
  time_limit_seconds      INTEGER,
  hourglass_bonus_by_cell JSONB,
  provenance              TEXT,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Allow the public (game players) to read all level data
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read" ON public.levels
  FOR SELECT TO anon, authenticated USING (true);

-- Writes go through the service-role key (asset-writer server), which bypasses RLS.
-- No INSERT/UPDATE policy is needed for that path.
