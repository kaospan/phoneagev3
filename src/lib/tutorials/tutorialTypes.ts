import type { CellType } from "@/game/types";

export type TutorialId =
  | "basics"
  | "arrow-single"
  | "arrow-multi"
  | "arrow-remote"
  | "teleport"
  | "key-lock"
  | "breakable-rock"
  | "bonus-time"
  | "stuck-reminder";

export type TutorialSound = "tap" | "glide" | "unlock" | "collect" | "teleport" | "break" | "chime";

export interface TutorialStep {
  /** Character's cell in the mini demo grid for this step. Omit for a uiCallout step. */
  characterAt?: { x: number; y: number };
  /** Where the animated finger/pointer taps or rests during this step; omitted to hide it. */
  fingerAt?: { x: number; y: number };
  /** Cells to highlight with a glowing outline during this step. */
  highlightCells?: Array<{ x: number; y: number }>;
  /** Cells whose rock tile should play the crumble animation (rock fading/scaling into void). */
  crumblingCells?: Array<{ x: number; y: number }>;
  /** Camera focus point (mini-grid cell coordinates) and zoom level (1 = fit whole board). Omit for a uiCallout step. */
  cameraFocus?: { x: number; y: number };
  cameraZoom?: number;
  durationMs: number;
  slowMotion?: boolean;
  sound?: TutorialSound;
  /** Optional secondary line shown only for this step (e.g. "Tap again to redirect"). */
  caption?: string;
  /**
   * When set, the arrow block from the mini-grid is rendered as a sliding sprite at this cell
   * for the step (instead of sitting statically in the grid), so the animation can show it
   * gliding to a new spot — e.g. when demonstrating a remote arrow move. The block at its
   * original grid position is suppressed so it isn't drawn twice.
   */
  arrowAt?: { x: number; y: number };
  /**
   * Replaces the mini demo board with a callout pointing at a real HUD control instead of a
   * grid cell — used for mechanics that live outside the level grid (e.g. the Restart Level button).
   */
  uiCallout?: { icon: "restart"; label: string };
}

export interface TutorialDefinition {
  id: TutorialId;
  title: string;
  /** 1-2 short sentences, shown for the whole sequence. */
  text: string;
  /** Cell types that trigger this tutorial the first time they appear in a level's grid. */
  triggerCellTypes: CellType[];
  /** Small hand-authored demo grid (cell type numbers) — kept tiny so the mini-board reads clearly. */
  miniGrid: number[][];
  steps: TutorialStep[];
}
