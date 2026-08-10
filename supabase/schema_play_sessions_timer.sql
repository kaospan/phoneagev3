-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Adds the per-attempt "time left on the clock" to play_sessions, so the CRM can show not
-- just how many moves an attempt took but how much of the level's timer was left when it
-- ended (null for levels with no time limit, or if the attempt was abandoned before the
-- timer mattered).

ALTER TABLE public.play_sessions
  ADD COLUMN IF NOT EXISTS time_left_seconds INTEGER;
