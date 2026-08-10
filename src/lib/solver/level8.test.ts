import { describe, expect, it } from "vitest";
import { getAllLevels } from "@/data/levels";
import { solveGrid } from "./api";
import type { CellType } from "@/game/types";
import type { RecordedInputCommand } from "@/lib/moveRecording";

const recordedRunFromSolverActions = (actions: string[]): RecordedInputCommand[] => {
  const out: RecordedInputCommand[] = [];
  let selectedArrow = false;
  for (const action of actions) {
    if (action === "T") {
      out.push({ type: "wait" });
      selectedArrow = false;
      continue;
    }
    const player = action.match(/^P:([URDL])$/);
    const arrow = action.match(/^A\((\d+),(\d+)\):([URDL])$/);
    const dir = player?.[1] ?? arrow?.[3];
    const move =
      dir === "U" ? { type: "move" as const, dx: 0, dy: -1 }
        : dir === "R" ? { type: "move" as const, dx: 1, dy: 0 }
          : dir === "D" ? { type: "move" as const, dx: 0, dy: 1 }
            : dir === "L" ? { type: "move" as const, dx: -1, dy: 0 }
              : null;
    if (!move) continue;
    if (!arrow) {
      if (selectedArrow) out.push({ type: "deselect" });
      selectedArrow = false;
      out.push(move);
      continue;
    }
    out.push({ type: "select", x: Number(arrow[1]), y: Number(arrow[2]) }, move);
    selectedArrow = true;
  }
  return out;
};

describe("recorded-run solver regressions", () => {
  const level8RecordedRun = {
    levelId: 8,
    moves: 12,
    recordedAt: "2026-08-06T00:00:00.000Z",
    actions: [
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 0, dy: 1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "select", x: 8, y: 3 },
      { type: "move", dx: 0, dy: 1 },
      { type: "select", x: 9, y: 4 },
      { type: "move", dx: -1, dy: 0 },
      { type: "move", dx: 0, dy: -1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 0, dy: 1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
    ],
  };

  it("solves the path toward the exit cave", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 8);
    expect(level).toBeTruthy();

    const result = await solveGrid(
      level!.grid as CellType[][],
      level!.playerStart,
      level!.cavePos,
      { maxMsPerLevel: 1500, maxNodesPerLevel: 15_000, maxDepth: 120 },
      level!.id,
    );

    expect(result.solved, result.reason).toBe(true);
  }, 35000);

  it("falls back to a valid recorded clear when bounded search fails", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 8);
    expect(level).toBeTruthy();

    window.localStorage.setItem("stone-age-recorded-run-8", JSON.stringify(level8RecordedRun));
    try {
      const result = await solveGrid(
        level!.grid as CellType[][],
        level!.playerStart,
        level!.cavePos,
        { maxMsPerLevel: 1500, maxNodesPerLevel: 0, maxDepth: 120 },
        level!.id,
      );

      expect(result.solved, result.reason).toBe(true);
      expect(result.reason).toBe("Learned from recorded run after bounded search failed");
      expect(result.actions).toEqual([
        "P:R",
        "P:D",
        "P:R",
        "A(8,3):D",
        "A(9,4):L",
        "P:U",
        "P:R",
        "P:D",
        "P:R",
        "P:R",
        "P:R",
        "P:R",
      ]);
    } finally {
      window.localStorage.removeItem("stone-age-recorded-run-8");
    }
  }, 35000);

  it("falls back to the known level 12 recorded clear when bounded search fails", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 12);
    expect(level).toBeTruthy();

    const solution = [
      "P:D", "P:L", "P:L", "P:L", "P:L", "A(0,1):R", "P:L", "A(2,0):D",
      "P:L", "P:D", "A(2,4):R", "A(7,7):L", "A(2,10):U", "P:D", "A(7,3):L",
      "P:R", "P:D", "P:R", "P:L", "P:U", "P:L", "P:U", "T", "P:R", "P:R",
      "P:R", "P:L", "P:R", "P:U", "P:U", "P:U", "P:R", "P:R", "P:U",
    ];
    const recordedRun = {
      levelId: 12,
      moves: solution.length,
      recordedAt: "2026-08-07T00:00:00.000Z",
      actions: recordedRunFromSolverActions(solution),
    };

    window.localStorage.setItem("stone-age-recorded-run-12", JSON.stringify(recordedRun));
    try {
      const result = await solveGrid(
        level!.grid as CellType[][],
        level!.playerStart,
        level!.cavePos,
        { maxMsPerLevel: 1500, maxNodesPerLevel: 0, maxDepth: 120 },
        level!.id,
      );

      expect(result.solved, result.reason).toBe(true);
      expect(result.reason).toBe("Learned from recorded run after bounded search failed");
    } finally {
      window.localStorage.removeItem("stone-age-recorded-run-12");
    }
  }, 35000);
});
