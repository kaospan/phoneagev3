import type { TutorialDefinition } from "./tutorialTypes";

/**
 * Data-driven tutorial registry. Adding a new mechanic later means adding a new entry here —
 * the engine (TutorialOverlay + the detection hook in PuzzleGame) never needs to change.
 *
 * Mini-grid cell types match the real game's legend (see src/data/levels.ts header comment):
 * 0 floor, 2 stone, 3 cave/goal, 5 void, 6 breakable rock, 8 arrow-right, 13 omni arrow,
 * 14 red key, 16 red lock, 18 start marker, 19 teleport, 20 bonus time.
 */
export const TUTORIAL_DEFINITIONS: TutorialDefinition[] = [
  {
    id: "basics",
    title: "Getting Started",
    // Kept short on purpose: this is also the fallback caption for the quick walking-tap beats
    // below that have no caption of their own — a long paragraph there would fly by unread.
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
        highlightCells: [{ x: 2, y: 1 }, { x: 3, y: 1 }, { x: 4, y: 1 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1,
        durationMs: 1600,
        caption: "Yellow tiles are walkable floor.",
      },
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1,
        durationMs: 1400,
        caption: "Stone blocks are solid walls.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.6,
        durationMs: 500,
        sound: "tap",
      },
      {
        characterAt: { x: 3, y: 1 },
        fingerAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.6,
        durationMs: 450,
        sound: "tap",
      },
      {
        characterAt: { x: 4, y: 1 },
        fingerAt: { x: 4, y: 1 },
        cameraFocus: { x: 4, y: 1 },
        cameraZoom: 1.6,
        durationMs: 450,
        sound: "tap",
      },
      {
        characterAt: { x: 5, y: 1 },
        highlightCells: [{ x: 5, y: 1 }],
        cameraFocus: { x: 5, y: 1 },
        cameraZoom: 1.6,
        durationMs: 1200,
        sound: "chime",
        caption: "Reach the ladder to clear the level!",
      },
      {
        uiCallout: { icon: "restart", label: "Restart Level" },
        durationMs: 2800,
        caption: "Heads up: some moves can leave you stuck with no way to finish — the game won't warn you. Remember this ↻ Restart Level button — it restarts the level instantly, no penalty.",
      },
    ],
  },
  {
    id: "arrow-single",
    title: "Arrow Tile",
    // Short on purpose — it's also the fallback caption for the step-onto-arrow tap beat below,
    // which has no caption of its own. The full explanation is already spread across that step's
    // sibling captions ("...until something stops you", "tap to grab", "glides on"), so nothing
    // here needs to repeat it at length.
    text: "Step onto an arrow and it carries you across the gap to the ladder.",
    triggerCellTypes: [7, 8, 9, 10],
    // Extended past the original wall dead-end so the step-on-and-glide demo now pays off at an
    // actual goal — matches what the very first real level asks the player to do.
    miniGrid: [
      [2, 2, 2, 2, 2, 2, 2],
      [2, 0, 8, 5, 5, 5, 3],
      [2, 2, 2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.2,
        durationMs: 1500,
        caption: "This arrow points right.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        arrowAt: { x: 2, y: 1 },
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.4,
        durationMs: 700,
        sound: "tap",
        caption: "Step onto it to launch.",
      },
      {
        characterAt: { x: 5, y: 1 },
        // Trails one cell behind the character rather than matching it exactly — same position
        // would render the block sprite completely hidden under the dino (they're drawn in the
        // same cell), so the "block travels with you" motion would be invisible.
        arrowAt: { x: 4, y: 1 },
        highlightCells: [{ x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 }],
        cameraFocus: { x: 4, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1300,
        slowMotion: true,
        sound: "glide",
        caption: "It carries you across the gap...",
      },
      {
        characterAt: { x: 6, y: 1 },
        arrowAt: { x: 5, y: 1 },
        highlightCells: [{ x: 6, y: 1 }],
        cameraFocus: { x: 5, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1200,
        sound: "chime",
        caption: "...right to the ladder. Reach the cave to clear the level!",
      },
      {
        characterAt: { x: 1, y: 1 },
        fingerAt: { x: 2, y: 1 },
        arrowAt: { x: 2, y: 1 },
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.4,
        durationMs: 900,
        slowMotion: true,
        sound: "tap",
        caption: "Step off — tap an arrow from anywhere to grab it.",
      },
      {
        characterAt: { x: 1, y: 1 },
        fingerAt: { x: 5, y: 1 },
        arrowAt: { x: 4, y: 1 },
        highlightCells: [{ x: 3, y: 1 }, { x: 4, y: 1 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1000,
        slowMotion: true,
        sound: "glide",
        caption: "Choose a direction and it glides on, just like you.",
      },
    ],
  },
  {
    id: "arrow-multi",
    title: "Multi-Directional Arrow",
    text: "This arrow can send you any direction.",
    triggerCellTypes: [11, 12, 13],
    miniGrid: [
      [2, 2, 2, 0, 2, 2, 2],
      [2, 5, 5, 13, 5, 5, 2],
      [2, 2, 2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 3, y: 0 },
        highlightCells: [{ x: 3, y: 1 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.1,
        durationMs: 1300,
        caption: "This arrow opens in every direction.",
      },
      {
        characterAt: { x: 3, y: 1 },
        fingerAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.3,
        durationMs: 450,
        sound: "tap",
      },
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 1, y: 1 }, { x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1000,
        slowMotion: true,
        sound: "glide",
        caption: "Press left...",
      },
      {
        characterAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.3,
        durationMs: 350,
        sound: "tap",
      },
      {
        characterAt: { x: 5, y: 1 },
        highlightCells: [{ x: 4, y: 1 }, { x: 5, y: 1 }],
        cameraFocus: { x: 4, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1000,
        slowMotion: true,
        sound: "glide",
        caption: "...or press right. You choose.",
      },
      {
        characterAt: { x: 3, y: 0 },
        fingerAt: { x: 3, y: 1 },
        arrowAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.3,
        durationMs: 900,
        slowMotion: true,
        sound: "tap",
        caption: "Step off — tap the arrow from anywhere to grab it.",
      },
      {
        characterAt: { x: 3, y: 0 },
        fingerAt: { x: 0, y: 1 },
        arrowAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }, { x: 1, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1000,
        slowMotion: true,
        sound: "glide",
        caption: "It glides whichever way you choose.",
      },
    ],
  },
  {
    // Shown once, forced at level 2 regardless of cell types present (see the currentLevel.id
    // === 2 check in PuzzleGame.tsx) rather than the usual triggerCellTypes detection — this is
    // the level where an arrow first sits somewhere the player physically can't walk to, so
    // remote control stops being optional trivia and becomes the way to solve the puzzle.
    id: "arrow-remote",
    title: "Remote Arrow Control",
    text: "You don't have to stand next to an arrow to move it. Tap it from anywhere, then use your movement controls to walk it toward you — even across a gap you could never cross yourself.",
    triggerCellTypes: [11, 12, 13],
    // Arrow starts off in the bottom-right, disconnected from the dino by a void gap. Relaying
    // it up then left lands it in the tile directly next to the dino — the point being not just
    // "you can move an arrow from a distance" but specifically that you'd relay it TO yourself so
    // you can then step on and ride it, not send it off toward the goal on its own.
    miniGrid: [
      [2, 2, 2, 2, 2, 2, 2],
      [2, 0, 5, 5, 5, 5, 2],
      [2, 2, 2, 2, 2, 13, 2],
      [2, 2, 2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 5, y: 2 }],
        cameraFocus: { x: 3, y: 1.5 },
        cameraZoom: 1,
        durationMs: 1400,
        caption: "This arrow is stuck behind a gap — there's no path to it.",
      },
      {
        characterAt: { x: 1, y: 1 },
        fingerAt: { x: 5, y: 2 },
        cameraFocus: { x: 5, y: 2 },
        cameraZoom: 1.3,
        durationMs: 600,
        sound: "tap",
        caption: "Tap it anyway — distance doesn't matter.",
      },
      {
        characterAt: { x: 1, y: 1 },
        fingerAt: { x: 5, y: 1 },
        arrowAt: { x: 5, y: 1 },
        highlightCells: [{ x: 5, y: 2 }, { x: 5, y: 1 }],
        cameraFocus: { x: 5, y: 1.5 },
        cameraZoom: 1.2,
        durationMs: 900,
        slowMotion: true,
        sound: "glide",
        caption: "Your movement controls slide it now — not you.",
      },
      {
        characterAt: { x: 1, y: 1 },
        fingerAt: { x: 2, y: 1 },
        arrowAt: { x: 2, y: 1 },
        highlightCells: [{ x: 5, y: 1 }, { x: 2, y: 1 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1,
        durationMs: 1000,
        slowMotion: true,
        sound: "glide",
        caption: "Guide it all the way back toward you...",
      },
      {
        characterAt: { x: 2, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.4,
        durationMs: 1100,
        sound: "chime",
        caption: "...right next to you, so you can step on and ride it.",
      },
    ],
  },
  {
    id: "breakable-rock",
    title: "Breakable Rock",
    text: "It stays open once broken.",
    triggerCellTypes: [6],
    miniGrid: [
      [2, 2, 2, 2, 2],
      [2, 0, 6, 0, 2],
      [2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.4,
        durationMs: 1300,
        caption: "This rock is cracked — it'll give way.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.5,
        durationMs: 700,
        sound: "break",
        caption: "One step smashes it open.",
      },
      {
        characterAt: { x: 3, y: 1 },
        crumblingCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.2,
        durationMs: 700,
      },
    ],
  },
  {
    id: "key-lock",
    title: "Keys & Locks",
    text: "Matching colors unlock together.",
    triggerCellTypes: [14, 15, 16, 17],
    miniGrid: [
      [2, 2, 2, 2, 2, 2, 2],
      [2, 0, 14, 0, 16, 0, 2],
      [2, 2, 2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.3,
        durationMs: 1300,
        caption: "Grab the key.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.3,
        durationMs: 600,
        sound: "collect",
      },
      {
        characterAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.3,
        durationMs: 400,
        sound: "tap",
      },
      {
        characterAt: { x: 4, y: 1 },
        highlightCells: [{ x: 4, y: 1 }],
        cameraFocus: { x: 4, y: 1 },
        cameraZoom: 1.3,
        durationMs: 900,
        sound: "unlock",
        caption: "The matching lock opens.",
      },
      {
        characterAt: { x: 5, y: 1 },
        cameraFocus: { x: 4, y: 1 },
        cameraZoom: 1.1,
        durationMs: 500,
      },
    ],
  },
  {
    id: "teleport",
    title: "Teleport",
    text: "Linked pads swap you instantly.",
    triggerCellTypes: [19],
    miniGrid: [
      [2, 2, 2, 2, 2, 2, 2, 2],
      [2, 0, 19, 0, 0, 19, 0, 2],
      [2, 2, 2, 2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }, { x: 5, y: 1 }],
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1,
        durationMs: 1500,
        caption: "These two pads are linked.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.5,
        durationMs: 500,
        sound: "tap",
      },
      {
        characterAt: { x: 5, y: 1 },
        highlightCells: [{ x: 5, y: 1 }],
        cameraFocus: { x: 5, y: 1 },
        cameraZoom: 1.5,
        durationMs: 900,
        sound: "teleport",
        caption: "Instant travel to the matching pad!",
      },
      {
        characterAt: { x: 6, y: 1 },
        cameraFocus: { x: 5, y: 1 },
        cameraZoom: 1.2,
        durationMs: 500,
      },
    ],
  },
  {
    id: "bonus-time",
    title: "Bonus Time",
    text: "Free seconds on the clock.",
    triggerCellTypes: [20],
    miniGrid: [
      [2, 2, 2, 2, 2],
      [2, 0, 20, 0, 2],
      [2, 2, 2, 2, 2],
    ],
    steps: [
      {
        characterAt: { x: 1, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.4,
        durationMs: 1300,
        caption: "An hourglass — free time on the clock.",
      },
      {
        characterAt: { x: 2, y: 1 },
        fingerAt: { x: 2, y: 1 },
        highlightCells: [{ x: 2, y: 1 }],
        cameraFocus: { x: 2, y: 1 },
        cameraZoom: 1.5,
        durationMs: 800,
        sound: "collect",
        caption: "+ time added instantly.",
      },
      {
        characterAt: { x: 3, y: 1 },
        cameraFocus: { x: 3, y: 1 },
        cameraZoom: 1.2,
        durationMs: 500,
      },
    ],
  },
  {
    // Never cell-type-triggered — forced directly (see the stuck-detection effect in
    // PuzzleGame.tsx) the moment the player's own position lands on a void tile, which is
    // always an unrecoverable dead end (void is impassable to normal walking, see
    // movement.ts) — first reachable on level 3, where a glide with nothing stopping it partway
    // can run the player the entire length of an empty gap.
    id: "stuck-reminder",
    title: "Stuck?",
    text: "No moves left from here — restart the level to try again.",
    triggerCellTypes: [],
    miniGrid: [[0]],
    steps: [
      {
        uiCallout: { icon: "restart", label: "Restart Level" },
        durationMs: 2600,
        caption: "No move from here can reach the cave. Tap ↻ Restart Level to try again instantly, no penalty.",
      },
    ],
  },
];

export const getTutorialDefinition = (id: string) => TUTORIAL_DEFINITIONS.find((t) => t.id === id) ?? null;
