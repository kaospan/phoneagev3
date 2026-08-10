import { beforeEach, describe, expect, it } from "vitest";
import { MUSIC_ENABLED_UPDATED_EVENT, getMusicEnabled, setMusicEnabled } from "./musicPrefs";

describe("musicPrefs", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to enabled when nothing has been stored", () => {
    expect(getMusicEnabled()).toBe(true);
  });

  it("persists a mute choice", () => {
    setMusicEnabled(false);
    expect(getMusicEnabled()).toBe(false);
  });

  it("persists an explicit unmute choice", () => {
    setMusicEnabled(false);
    setMusicEnabled(true);
    expect(getMusicEnabled()).toBe(true);
  });

  it("dispatches the updated event so other components can react", () => {
    let fired = false;
    window.addEventListener(MUSIC_ENABLED_UPDATED_EVENT, () => { fired = true; }, { once: true });
    setMusicEnabled(false);
    expect(fired).toBe(true);
  });
});
