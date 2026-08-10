import { describe, expect, it } from "vitest";
import { getAllLevels, type Level } from "@/data/levels";
import { solveLevel } from "@/lib/levelSolver";
import { isGeneratorDone } from "../genUtils";
import { DEFAULT_SEARCH_LIMITS, type SearchEvent, type SearchResult } from "../types";
import { buildSearchInputs } from "../levelCatalog";
import { astar } from "./astar";
import { beamSearch } from "./beamSearch";
import { bfs } from "./bfs";
import { dfs } from "./dfs";
import { dijkstra } from "./dijkstra";
import { greedyBestFirst } from "./greedyBestFirst";
import { hillClimbing } from "./hillClimbing";
import { iddfs } from "./iddfs";
import { simulatedAnnealing } from "./simulatedAnnealing";
import { weightedAstar } from "./weightedAstar";

function drainCounting(gen: Generator<SearchEvent, SearchResult>): {
  result: SearchResult;
  expanded: number;
  generated: number;
  rejected: number;
} {
  let expanded = 0;
  let generated = 0;
  let rejected = 0;
  for (;;) {
    const step = gen.next();
    if (isGeneratorDone(step)) {
      return { result: step.value, expanded, generated, rejected };
    }
    const event = step.value;
    if (event.type === "expand") expanded += 1;
    else if (event.type === "generate") generated += 1;
    else if (event.type === "reject") rejected += 1;
  }
}

function levelOrThrow(id: number): Level {
  const level = getAllLevels().find((l) => l.id === id);
  if (!level) throw new Error(`Level ${id} not found in getAllLevels()`);
  return level;
}

describe("algorithms-lab search engine — small-level correctness", () => {
  for (const levelId of [1, 4]) {
    it(`level ${levelId}: BFS/A*/Dijkstra/IDDFS agree exactly on optimal length; DFS/Greedy/Weighted A*/Beam/Hill Climbing never beat it`, () => {
      const { start, goalCaves } = buildSearchInputs(levelOrThrow(levelId));

      const bfsOut = drainCounting(bfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const astarOut = drainCounting(astar.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const dfsOut = drainCounting(dfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const greedyOut = drainCounting(greedyBestFirst.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const dijkstraOut = drainCounting(dijkstra.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const iddfsOut = drainCounting(iddfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const weightedOut = drainCounting(weightedAstar.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      const beamOut = drainCounting(beamSearch.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      // Deterministic (no RNG), unlike Simulated Annealing — safe to include in this strict loop.
      const hillOut = drainCounting(hillClimbing.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));

      expect(bfsOut.result.solved, bfsOut.result.reason).toBe(true);
      expect(astarOut.result.solved, astarOut.result.reason).toBe(true);
      expect(dfsOut.result.solved, dfsOut.result.reason).toBe(true);
      expect(greedyOut.result.solved, greedyOut.result.reason).toBe(true);
      expect(dijkstraOut.result.solved, dijkstraOut.result.reason).toBe(true);
      expect(iddfsOut.result.solved, iddfsOut.result.reason).toBe(true);
      expect(weightedOut.result.solved, weightedOut.result.reason).toBe(true);
      // Beam search is the one algorithm here that isn't even guaranteed to find a solution
      // (see beamSearch.ts's doc comment) — but with BEAM_WIDTH=50 on these small levels, every
      // candidate fits within the beam, so it should still solve in practice; assert it here as
      // an empirical fact about these specific small levels, not a general guarantee.
      expect(beamOut.result.solved, beamOut.result.reason).toBe(true);
      // Hill Climbing has no completeness guarantee either (see hillClimbing.ts's doc comment)
      // — it happens to reach the goal without ever getting stuck on these two small levels,
      // confirmed empirically, not a property the algorithm promises in general.
      expect(hillOut.result.solved, hillOut.result.reason).toBe(true);

      // BFS/A*/Dijkstra/IDDFS all guarantee optimality under this game's uniform per-action
      // cost, so — despite exploring in completely different orders — they must all agree.
      expect(astarOut.result.moves).toBe(bfsOut.result.moves);
      expect(dijkstraOut.result.moves).toBe(bfsOut.result.moves);
      expect(iddfsOut.result.moves).toBe(bfsOut.result.moves);
      // DFS/Greedy/Weighted A*/Beam/Hill Climbing make no optimality guarantee: they must find
      // *a* solution, never a shorter-than-optimal one (which would indicate a bug, since
      // optimal is a lower bound no real solution can beat).
      expect(dfsOut.result.moves as number).toBeGreaterThanOrEqual(bfsOut.result.moves as number);
      expect(greedyOut.result.moves as number).toBeGreaterThanOrEqual(bfsOut.result.moves as number);
      expect(weightedOut.result.moves as number).toBeGreaterThanOrEqual(bfsOut.result.moves as number);
      expect(beamOut.result.moves as number).toBeGreaterThanOrEqual(bfsOut.result.moves as number);
      expect(hillOut.result.moves as number).toBeGreaterThanOrEqual(bfsOut.result.moves as number);
    });
  }
});

describe("algorithms-lab search engine — simulated annealing (stochastic)", () => {
  // Simulated Annealing is the one algorithm in the Lab that's genuinely non-deterministic, and
  // empirically its success rate depends a lot on a level's specific geometry (confirmed: 10/10
  // successes across two parameter tunings on level 4, 0/10 on level 1's narrower, more
  // arrow-constrained layout — even with a much more patient cooling schedule). So this suite
  // deliberately does NOT assert solved:true on every run or every level; it asserts only the
  // properties that must hold regardless of how the randomness falls, plus one "not completely
  // broken" check across repeated attempts on a level it's empirically reliable on.
  it("level 4: every one of several runs is internally consistent (never below optimal, always a legal path when solved)", () => {
    const { start, goalCaves } = buildSearchInputs(levelOrThrow(4));
    const bfsOut = drainCounting(bfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
    const optimal = bfsOut.result.moves as number;

    let sawAtLeastOneSolve = false;
    for (let i = 0; i < 8; i += 1) {
      const out = drainCounting(simulatedAnnealing.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
      expect(typeof out.result.solved).toBe("boolean");
      if (out.result.solved) {
        sawAtLeastOneSolve = true;
        expect(out.result.moves as number).toBeGreaterThanOrEqual(optimal);
        expect(out.result.actions.length).toBe(out.result.moves);
      } else {
        expect(out.result.moves).toBeNull();
        expect(out.result.reason).toBeTruthy();
      }
    }
    expect(sawAtLeastOneSolve).toBe(true);
  });
});

describe("algorithms-lab search engine — beam search actually prunes", () => {
  it("level 8: beam search rejects at least one candidate with reason 'beam-pruned'", () => {
    // Level 8's branching factor is large enough (lots of remote-arrow actions available from
    // most states) that at least one layer should generate more than BEAM_WIDTH candidates —
    // this confirms the pruning mechanism actually fires, not just that the algorithm runs.
    // Not asserting solved: beam search is allowed to fail to find a solution (see doc comment).
    const { start, goalCaves } = buildSearchInputs(levelOrThrow(8));
    const limits = { ...DEFAULT_SEARCH_LIMITS, maxMs: 5_000 };

    let sawBeamPruned = false;
    const gen = beamSearch.run(start, goalCaves, limits);
    let step = gen.next();
    while (!isGeneratorDone(step)) {
      if (step.value.type === "reject" && step.value.reason === "beam-pruned") {
        sawBeamPruned = true;
        break;
      }
      step = gen.next();
    }

    expect(sawBeamPruned).toBe(true);
  }, 20_000);
});

describe("algorithms-lab search engine — production parity (level 8)", () => {
  // Level 8 is the flagship "why did BFS explode?" level called out in the Algorithms Lab
  // spec. These tests prove the Lab's engine explores the *same* legal-move graph as the
  // real game rather than a silently simplified stand-in: it reuses generateSuccessors/
  // stateKey directly, but the search/dedup logic around them is reimplemented (to make it
  // steppable), so this is the check that would actually catch a subtly wrong reimplementation.
  it("Lab BFS and production BFS agree on outcome (both solve with equal length, or both fail identically)", async () => {
    const { start, goalCaves } = buildSearchInputs(levelOrThrow(8));

    const lab = drainCounting(bfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
    const prod = await solveLevel(8, start, goalCaves, {
      maxMsPerLevel: DEFAULT_SEARCH_LIMITS.maxMs,
      maxNodesPerLevel: DEFAULT_SEARCH_LIMITS.maxExpansions,
      maxDepth: DEFAULT_SEARCH_LIMITS.maxDepth,
      searchMode: "bfs",
    });

    expect(lab.result.solved).toBe(prod.solved);
    if (lab.result.solved && prod.solved) {
      expect(lab.result.moves).toBe(prod.moves);
    }
  }, 90_000);

  it("Lab A* is truly optimal (matches Lab BFS's move count exactly) and expands far fewer states than BFS on level 8", async () => {
    const { start, goalCaves } = buildSearchInputs(levelOrThrow(8));

    const labBfs = drainCounting(bfs.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));
    const labAstar = drainCounting(astar.run(start, goalCaves, DEFAULT_SEARCH_LIMITS));

    expect(labBfs.result.solved, labBfs.result.reason).toBe(true);
    expect(labAstar.result.solved, labAstar.result.reason).toBe(true);
    // The real optimality check: A* must match true BFS's move count exactly. This is checked
    // against Lab BFS rather than production's astar-equivalent mode on purpose — production's
    // solver.ts tests isGoal() at successor-*generation* time (see its line ~330) and
    // tie-breaks its priority queue toward lower distance-to-goal, both of which assume the
    // heuristic never overestimates. manhattanToGoal measures tile distance, not action count,
    // and an arrow-glide/teleport can cover several tiles in one action — so it *can*
    // overestimate the true remaining action count at specific states (confirmed on level 8;
    // see astar.ts's doc comment for the full argument and a concrete example). That means
    // production's astar-equivalent mode can occasionally accept a suboptimal path. Lab's
    // astar.ts fixes this (pop-time goal testing, full reopening, no heuristic-biased
    // tie-break), so it has no such caveat.
    expect(labAstar.result.moves).toBe(labBfs.result.moves);
    // The pedagogical point of the whole feature: A*'s heuristic guidance should let it reach
    // the same goal while expanding meaningfully fewer states than blind BFS on this level.
    expect(labAstar.expanded).toBeLessThan(labBfs.expanded);

    // Sanity cross-check against production: solved status should agree, and since Lab A* is
    // genuinely optimal, it should never do *worse* than production's astar-equivalent mode
    // (not asserting exact equality — see the comment above for why production can differ).
    const prod = await solveLevel(8, start, goalCaves, {
      maxMsPerLevel: DEFAULT_SEARCH_LIMITS.maxMs,
      maxNodesPerLevel: DEFAULT_SEARCH_LIMITS.maxExpansions,
      maxDepth: DEFAULT_SEARCH_LIMITS.maxDepth,
    });
    expect(prod.solved, prod.reason).toBe(true);
    expect(labAstar.result.moves as number).toBeLessThanOrEqual(prod.moves as number);
  }, 90_000);
});
