import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TutorialOverlay } from "@/components/TutorialOverlay";
import type { TutorialDefinition } from "@/lib/tutorials/tutorialTypes";

const basicTutorial: TutorialDefinition = {
  id: "basics",
  title: "Getting Started",
  text: "Reach the ladder — stone blocks the way.",
  triggerCellTypes: [0, 2, 3],
  miniGrid: [
    [2, 2, 2, 2, 2, 2],
    [2, 18, 0, 0, 0, 3],
    [2, 2, 2, 2, 2, 2],
  ],
  steps: [
    {
      characterAt: { x: 1, y: 1 },
      cameraFocus: { x: 3, y: 1 },
      cameraZoom: 1,
      durationMs: 1600,
    },
  ],
};

describe("TutorialOverlay", () => {
  it("uses fixed 220px mini-grid height in landscape", () => {
    const onDone = vi.fn();
    render(<TutorialOverlay queue={[basicTutorial]} onDone={onDone} />);
    const grid = screen.getByTestId("tutorial-mini-grid");
    expect(grid.getAttribute("style")).toContain("220px");
  });

  it("uses responsive height in mobile portrait instead of fixed 220px", () => {
    const onDone = vi.fn();
    render(<TutorialOverlay queue={[basicTutorial]} onDone={onDone} isMobilePortrait />);
    const grid = screen.getByTestId("tutorial-mini-grid");
    const styleAttr = grid.getAttribute("style");
    // happy-dom does not serialize CSS min() to the inline style attribute,
    // but the prop-driven branch must still diverge from landscape: it must
    // not fall back to the fixed 220px height.
    expect(styleAttr ?? "").not.toContain("220px");
  });
});
