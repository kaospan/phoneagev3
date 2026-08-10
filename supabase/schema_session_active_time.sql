-- Run this once in your Supabase project's SQL editor, AFTER schema_players.sql.
-- Dashboard → SQL Editor → New Query → paste → Run
--
-- Adds the per-attempt "active" duration to play_sessions — wall-clock time minus any stretch
-- of 30s+ with no move/keystroke (see SESSION_IDLE_TIMEOUT_MS in PuzzleGame.tsx). The CRM's
-- "Time Played" stat uses this when present, so a tab left open and forgotten no longer inflates
-- total play time; it falls back to the old started_at/ended_at wall-clock calculation for
-- sessions logged before this shipped (active_seconds NULL).

ALTER TABLE public.play_sessions
  ADD COLUMN IF NOT EXISTS active_seconds INTEGER;
