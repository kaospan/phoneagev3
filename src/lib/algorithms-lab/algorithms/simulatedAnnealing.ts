import type { Position } from "@/game/types";
import { generateSuccessors } from "@/lib/solver/actions";
import { manhattanToGoal } from "@/lib/solver/heuristics";
import type { SolveState } from "@/lib/solver/state";
import { stateKey } from "@/lib/solver/state";
import type { AlgorithmDescriptor, SearchEvent, SearchLimits, SearchResult } from "../types";
import { goalKeySet, isGoalState } from "./shared";

/** Starting "how adventurous" value — high enough that early on, a move several tiles worse is
 *  still routinely accepted. Not a distance; a control value in the acceptance formula below. */
export const INITIAL_TEMPERATURE = 8;
/** Multiplied into the temperature after every step — slow enough to give the search room to
 *  wander before it locks in, fast enough to reliably freeze well inside MAX_STEPS. Tuned
 *  empirically: 0.999 (~6.7k steps to freeze) reliably failed on some small levels simply from
 *  running out of road before finding the goal by chance; 0.9995 (~13.4k steps) reliably solves
 *  the same levels across repeated runs. */
export const COOLING_RATE = 0.9995;
/** Below this, the acceptance formula is close enough to "never" that continuing is pointless. */
const MIN_TEMPERATURE = 0.01;
/** Hard cap independent of the generic search limits — SA doesn't make monotonic progress, so
 *  without this it could wander right up to maxExpansions on a level it was never going to solve.
 *  Comfortably above the ~13.4k steps COOLING_RATE needs to freeze on its own. */
const MAX_STEPS = 40_000;

/**
 * Simulated Annealing: like Hill Climbing, just one current state and no frontier — but instead
 * of always taking the single best neighbor, it picks a *random* neighbor each step and decides
 * whether to move there with a probability that depends on both how much worse it looks and the
 * current temperature. A move that's no worse is always taken. A worse move is taken with
 * probability e^(-delta/temperature): likely while hot (early), unlikely once cold (late). That
 * lets it do what Hill Climbing structurally cannot — climb back out of a local optimum by
 * accepting a temporarily worse position — at the cost of no longer being deterministic: running
 * this twice on the same level can take different paths, or even find different-length answers.
 */
function* run(start: SolveState, goalCaves: Position[], limits: SearchLimits): Generator<SearchEvent, SearchResult> {
  const t0 = performance.now();
  const goalKeys = goalKeySet(goalCaves);

  if (isGoalState(start, goalKeys)) {
    return { solved: true, moves: 0, actions: [], endReason: "solved" };
  }

  let current = start;
  let currentH = manhattanToGoal(start.playerPos, goalCaves);
  let depth = 0;
  let temperature = INITIAL_TEMPERATURE;
  const actions: string[] = [];
  let stepCount = 0;

  for (;;) {
    const now = performance.now();
    if (now - t0 > limits.maxMs) {
      return { solved: false, moves: null, actions: [], reason: `Timed out after ${Math.round(now - t0)}ms`, endReason: "timeout" };
    }
    if (stepCount >= limits.maxExpansions || stepCount >= MAX_STEPS) {
      return { solved: false, moves: null, actions: [], reason: `Cooled off after ${stepCount} steps without reaching the goal`, endReason: "exhausted" };
    }
    if (temperature < MIN_TEMPERATURE) {
      return { solved: false, moves: null, actions: [], reason: "Cooled below the minimum temperature without reaching the goal", endReason: "exhausted" };
    }
    // Deliberately NOT checking limits.maxDepth here: `depth` counts accepted transitions, and
    // a random walk can rack up hundreds of them just doubling back on itself without any net
    // progress — that generic cap (meant for monotonically-progressing frontier search) doesn't
    // fit SA's nature and was empirically causing spurious failures. `actions.length` is already
    // implicitly bounded by MAX_STEPS below, since every accepted move consumes one step.

    stepCount += 1;
    const currentKey = stateKey(current);
    yield {
      type: "expand",
      stateKey: currentKey,
      playerPos: current.playerPos,
      depth,
      g: depth,
      h: currentH,
      f: depth + currentH,
      temperature,
      frontierSize: 1,
    };

    const candidates = Array.from(generateSuccessors(current));
    if (candidates.length === 0) {
      return { solved: false, moves: null, actions: [], reason: "Dead end — no legal moves from here", endReason: "exhausted" };
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const pickH = manhattanToGoal(pick.state.playerPos, goalCaves);
    const delta = pickH - currentH;
    const accept = delta <= 0 || Math.random() < Math.exp(-delta / temperature);

    yield {
      type: "generate",
      stateKey: stateKey(pick.state),
      parentKey: currentKey,
      actionString: pick.actionString,
      description: pick.description,
      playerPos: pick.state.playerPos,
      depth: depth + 1,
      g: depth + 1,
      h: pickH,
      f: depth + 1 + pickH,
      temperature,
      frontierSize: 1,
    };

    if (isGoalState(pick.state, goalKeys)) {
      const finalActions = [...actions, pick.actionString];
      yield { type: "goal", stateKey: stateKey(pick.state), depth: depth + 1, actions: finalActions };
      return { solved: true, moves: finalActions.length, actions: finalActions, endReason: "solved" };
    }

    if (accept) {
      actions.push(pick.actionString);
      current = pick.state;
      currentH = pickH;
      depth += 1;
    } else {
      yield {
        type: "reject",
        stateKey: stateKey(pick.state),
        parentKey: currentKey,
        actionString: pick.actionString,
        description: pick.description,
        playerPos: pick.state.playerPos,
        reason: "annealing-rejected",
      };
    }

    temperature *= COOLING_RATE;
  }
}

export const simulatedAnnealing: AlgorithmDescriptor = {
  id: "simulatedAnnealing",
  name: "Simulated Annealing",
  shortDescription: "Hill Climbing that sometimes accepts a worse move on purpose — less so as it \"cools\".",
  explanation:
    "Simulated Annealing keeps just one current state, like Hill Climbing — but instead of only ever taking the best neighbor, it picks a random neighbor and sometimes accepts a worse one anyway, with a probability that shrinks as a \"temperature\" cools down over time. Early on (hot), it wanders fairly freely, which lets it escape the exact local optima that trap Hill Climbing. Late on (cold), it behaves almost exactly like Hill Climbing, homing in on whatever looks best nearby. The name and the cooling idea both come from annealing metal: heat it so atoms move freely, then cool slowly so they settle into a low-energy structure.",
  equationsNote:
    `h(n) is still the Manhattan tile-distance estimate. What's new is temperature (T) — not a distance or a count of anything, just a unitless "how adventurous" knob that starts at ${INITIAL_TEMPERATURE} and is multiplied by ${COOLING_RATE} every step. delta = h(neighbor) − h(current) is the change in estimated tiles a candidate move would cause (negative means it looks better). A move is always taken when delta ≤ 0; otherwise it's taken with probability e^(−delta⁄T) — a number between 0 and 1 that shrinks as T cools, so accepting a worse-looking move gets rarer and rarer over the run.`,
  usesHeuristic: true,
  optimalGuaranteed: false,
  frontierKind: "annealing",
  pseudocode: [
    `current ← start; temperature ← ${INITIAL_TEMPERATURE}`,
    "loop:",
    "  if current is goal: return path",
    `  if temperature < ${MIN_TEMPERATURE} or step limit reached: give up`,
    "  neighbor ← a RANDOM neighbor of current",
    "  delta ← h(neighbor) − h(current)",
    "  if delta ≤ 0 or random() < e^(−delta/temperature): current ← neighbor",
    `  temperature ← temperature × ${COOLING_RATE}`,
  ],
  realWorldUses: [
    "Combinatorial optimization: scheduling, circuit layout, the traveling salesman problem",
    "Any large solution space where plain gradient/heuristic descent keeps getting stuck",
    "Hyperparameter and design-space search too large to explore exhaustively",
  ],
  advantages: [
    "Can escape local optima that permanently trap Hill Climbing",
    "Still uses almost no memory — one current state, no frontier to maintain",
    "Tunable — the cooling schedule trades exploration time for solution quality",
  ],
  disadvantages: [
    "No optimality or completeness guarantee — can still fail, especially if it cools too fast",
    "Non-deterministic: running it twice on the same level can take different paths or find different-length solutions",
    "The cooling schedule needs tuning — too fast and it's just Hill Climbing with extra steps; too slow and it wastes time wandering",
  ],
  run,
};
