import { supabase } from "@/lib/supabaseClient";
import type { RecordedInputCommand } from "@/lib/moveRecording";

export type PlaySessionEndReason = "completed" | "restarted" | "level_changed" | "tab_hidden" | "timed_out";

/** Logs the start of a level attempt. Returns the session id to close out later, or null if unavailable. */
export async function startPlaySession(userId: string, levelId: number): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("play_sessions")
    .insert({ user_id: userId, level_id: levelId })
    .select("id")
    .single();
  if (error) {
    console.warn("[playSessions] start error:", error.message);
    return null;
  }
  return data?.id ?? null;
}

/** Closes out a previously-started session (completion, or the player left/reset before finishing). */
export async function endPlaySession(
  sessionId: string,
  outcome: {
    completed: boolean;
    moves: number | null;
    timeLeftSeconds?: number | null;
    endReason?: PlaySessionEndReason;
    moveHistory?: RecordedInputCommand[] | null;
    // Wall-clock time minus stretches with no move/keystroke for SESSION_IDLE_TIMEOUT_MS or
    // longer — lets the CRM report actual engagement instead of "tab left open" time.
    activeSeconds?: number | null;
  },
): Promise<void> {
  if (!supabase) return;
  const payload = {
    ended_at: new Date().toISOString(),
    completed: outcome.completed,
    moves: outcome.moves,
    time_left_seconds: outcome.timeLeftSeconds ?? null,
    active_seconds: outcome.activeSeconds ?? null,
    end_reason: outcome.endReason ?? (outcome.completed ? "completed" : "level_changed"),
    move_history: outcome.moveHistory ?? null,
  };
  const { error } = await supabase
    .from("play_sessions")
    .update(payload)
    .eq("id", sessionId);
  if (!error) return;

  if (error.message.includes("end_reason") || error.message.includes("move_history")) {
    const { error: fallbackError } = await supabase
      .from("play_sessions")
      .update({
        ended_at: payload.ended_at,
        completed: payload.completed,
        moves: payload.moves,
        time_left_seconds: payload.time_left_seconds,
        active_seconds: payload.active_seconds,
      })
      .eq("id", sessionId);
    if (fallbackError) console.warn("[playSessions] end fallback error:", fallbackError.message);
    return;
  }

  console.warn("[playSessions] end error:", error.message);
}
