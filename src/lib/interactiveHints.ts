const REMOTE_ARROW_HINT_KEY = "stone-age-remote-arrow-hint-done";

/** True once the player has completed the in-game remote-arrow-control walkthrough (select an
 * arrow from a distance, move it, then switch control back to the character) — a one-time
 * hands-on follow-up to the animated tutorial, not repeated after that. */
export const getRemoteArrowHintDone = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(REMOTE_ARROW_HINT_KEY) === "1";
  } catch {
    return true;
  }
};

export const setRemoteArrowHintDone = (done: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REMOTE_ARROW_HINT_KEY, done ? "1" : "0");
  } catch {
    // ignore storage failures
  }
};
