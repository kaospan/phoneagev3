const MUSIC_KEY = "stone-age-music-enabled";
export const MUSIC_ENABLED_UPDATED_EVENT = "stone-age-music-enabled-updated";

/** Music plays by default for everyone — only an explicit mute persists as "off". */
export const getMusicEnabled = (): boolean => {
  if (typeof window === "undefined") return true;
  try {
    return (localStorage.getItem(MUSIC_KEY) ?? "1") === "1";
  } catch {
    return true;
  }
};

export const setMusicEnabled = (enabled: boolean): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(MUSIC_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new Event(MUSIC_ENABLED_UPDATED_EVENT));
  } catch {
    // ignore storage failures
  }
};
