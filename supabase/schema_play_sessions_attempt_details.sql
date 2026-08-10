-- Adds per-attempt outcome details for the CRM:
-- - end_reason distinguishes completion, restart, timeout, level switch, and tab close.
-- - move_history stores the captured input commands so admins can inspect or replay attempts.

ALTER TABLE public.play_sessions
  ADD COLUMN IF NOT EXISTS end_reason TEXT,
  ADD COLUMN IF NOT EXISTS move_history JSONB;

CREATE INDEX IF NOT EXISTS play_sessions_user_level_started_idx
  ON public.play_sessions (user_id, level_id, started_at DESC);
