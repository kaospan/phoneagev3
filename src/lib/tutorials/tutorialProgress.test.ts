import { beforeEach, describe, expect, it } from "vitest";
import {
  getSeenTutorials,
  getTutorialsEnabled,
  hasSeenTutorial,
  markTutorialSeen,
  resetSeenTutorials,
  setTutorialsEnabled,
} from "./tutorialProgress";

describe("tutorialProgress: enabled flag", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to enabled", () => {
    expect(getTutorialsEnabled()).toBe(true);
  });

  it("persists a disabled choice", () => {
    setTutorialsEnabled(false);
    expect(getTutorialsEnabled()).toBe(false);
  });
});

describe("tutorialProgress: seen tracking", () => {
  beforeEach(() => localStorage.clear());

  it("reports nothing seen initially", () => {
    expect(hasSeenTutorial("basics")).toBe(false);
    expect(getSeenTutorials().size).toBe(0);
  });

  it("marks a tutorial as seen and keeps it that way", () => {
    markTutorialSeen("basics");
    expect(hasSeenTutorial("basics")).toBe(true);
    expect(hasSeenTutorial("teleport")).toBe(false);
  });

  it("is idempotent — marking the same tutorial twice doesn't duplicate it", () => {
    markTutorialSeen("basics");
    markTutorialSeen("basics");
    expect(getSeenTutorials().size).toBe(1);
  });

  it("resetSeenTutorials clears everything so tutorials show again", () => {
    markTutorialSeen("basics");
    markTutorialSeen("teleport");
    resetSeenTutorials();
    expect(getSeenTutorials().size).toBe(0);
    expect(hasSeenTutorial("basics")).toBe(false);
  });
});
