# STONE AGE (PHONEAGE) — DEVELOPMENT HISTORY

**Project**: Stone Age — arrow-and-terrain traversal puzzle game (a.k.a. "Phone Age")  
**Live**: https://kaospan.github.io/phoneagev3/  
**Current as of**: August 8, 2026

---

## EXECUTIVE SUMMARY

Stone Age began as a "Level Mapper" tool for detecting tile types from reference images (sprite matching + pattern detection). It evolved into a complete puzzle game: a grid-based traversal title where the player guides a green dinosaur across hazardous terrain using directional arrow blocks, collecting keys, breaking rocks, and warping through teleporters — across 200 campaign levels with cloud-synced progress, an in-app level editor, a BFS-powered level solver, and a data-driven animated tutorial system.

---

## DEVELOPMENT TIMELINE

### July 2026 — Foundation, Levels, and Cloud Infrastructure

All commits in the repository trace back to July 14, 2026, indicating a point of history reset / rebase. The following phases occurred during this window:

#### Phase 1: Project Bootstrapping & HUD Refinements (Jul 14)
- Established the core game loop, tile graphics, and HUD layout.
- Refinements across view modes (TOP, Sprite, 2D, 3D, FPS) and mobile portrait orientation support.
- Green ladder sprite in the exit cave tile; unified tile art for the top-down view.
- Mobile-portrait HUD split: HUD items repositioned into a bottom cluster so nothing is clipped on narrow screens.

#### Phase 2: Level Data & Asset Pipeline (Jul 14)
- Core level definitions authored for levels 1–100 (the "canonical" set).
- Levels 1–89 locked as canonical defaults.
- Asset writer tooling (`server/asset-writer.mjs`) with `--env-file` support for loading `.env`.
- Supabase env vars passed into the GitHub Pages build.
- Supabase agent skills integrated (postgres best practices + Supabase).
- Solver work began (`tmpsolve`, `levels`, `addewlevels`).

#### Phase 3: Level Mapper Context & Teleport Fixes (Jul 14–15)
- Level mapper context and grid detection system (`LEVEL MAPPER CONTEXT`, `FIX OFF LEVELS`, `FIX DUPE ERROR`).
- Promoted levels pipeline finalized (up to 100 levels promoted).
- Teleport bug fixes (3 incremental commits: `teleport bug fix`, `teleport fix 2`, `teleport fix 3`).
- Camera-mode skip settings on the view-cycle button.
- Left panel view modes; mapper edit save fix; promoted levels fix; type checking pass.

#### Phase 4: Solver Hardening (Jul 28–30)
- **Jul 30**: `fix solver buildBaseGrid: exclude stone(2) and breakable(6) from arrow terrain voting` — arrow terrain voting now correctly excludes solid/impassable cell types.
- **Jul 28**: `Fix: arrows in baseGrid incorrectly restoring stone cells when moved` — base grid reconstruction no longer restores stone cells at arrow origin after an arrow is moved.

#### Phase 5: Player Accounts, Cloud Sync & CRM (Aug 4)
A major feature release centered on accounts and backend infrastructure:

- **Player accounts & cloud progress sync**: Supabase Auth-gated play with per-account cloud-synced campaign progress. Local and cloud merge logic ensures switching accounts on the same browser never leaks progress.
- **CRM dashboard**: Admin analytics showing player activity, session time (idle-aware), exact + relative timestamps, player names in registration/CRM display.
- **Authentication gates**: Password reset and Google sign-in on both player and mapper auth gates.
- **Auth + access control**:
  - Mapper access and level-skip restricted to server-verified admin accounts (RLS-enforced).
  - Verified admins get unconditional level access.
  - Beta-tester role added: level-skip access without mapper/CRM access.
  - `last_seen_at` now tracks actual activity instead of going stale after signup.
- **Testing infrastructure**: Vitest/Playwright test suite wired into CI before deploy; HTML reporter for Playwright so a report exists to upload.
- **Mobile HUD / UX**: Portrait HUD fixes, restart button relabeled on desktop and enlarged/accented on mobile.
- **Teleport**: Cycle delay extended to 3 seconds.
- **Level fixes**: Arrow positions corrected in levels 112, 118, 119, 120 (moved from disconnected void to connected corridors); level 12's real solution recorded.
- **CRM UI**: Radix Tabs rendering fix, CRM scroll-box sizing fix, exact timestamps alongside relative text.
- **Bug fixes**: Account contamination fix, GitHub Pages caching fix, two real bugs from end-to-end CRM testing, cloud-progress restore race fix.

#### Phase 6: Procedural Levels 101–200 & Tutorial System (Aug 4)
- **Levels 101–200**: Procedurally generated with a verified difficulty curve, rebuilt around genuine remote-arrow-move puzzles (not maze pathfinding). Real tile sprites for the 101–200 set; red/green keys recolored.
- **Tutorial system**: Data-driven, animated tutorials teaching real game mechanics, triggered by cell-type presence in the current level.
  - Dedicated Remote Arrow Control tutorial, forced at level 2.
  - Arrow Tile tutorial text fixes + hands-on arrow hints + stuck reminder.
  - Tutorial UX overhaul: bigger/slower captions, stays until dismissed, gated rewatch list, "Watch Again" replay button.
- **Tutorial content**: Rebuilt arrow tutorial around reaching the ladder; unified tile art.
  - Campaign journey intro overlay, tutorial replay-button callout, icon cleanup.
- **Level regeneration fixes**: Duplicate levels 108/112 cleaned up; levels redesigned for real difficulty and arrow-tile clarity.

#### Phase 7: Mapper Enhancements & Campaign Polish (Aug 4)
- **Mapper palettes**: Real sprite thumbnails and full tile names in the palette.
- **View modes**: Filtering control moved to mapper-only (removed from main app).
- **Solutions page**: Mapper Solutions page with top-view preview + solved playthrough per level.
- **Campaign map**: Animated snake-path campaign map; default background music; fixed duplicate close button; added "Start Over" action; scrollable overlay for portrait.

#### Phase 8: Solver Refactor & Trace Viewer (Aug 5)
A significant refactor of the BFS level solver (`src/lib/levelSolver.ts`):

- **Monolithic split**: Split `levelSolver` into focused solver modules (`refactor(solver): split monolithic levelSolver into focused solver modules`).
- **Trace system overhaul**:
  - Removed stale `trace.ts`, restructured imports to `trace/trace`.
  - Removed board snapshots from trace; added `reconstructState` for state reconstruction.
  - Record rejections, enrich collisions, explicit dead-end recording, `closestManhattan` heuristic.
  - `CollisionRecord[]` storage (instead of `Map`) for collisions.
  - `reconstructState` for HTML export.
  - Trace viewer auto-opens on failed solves; defaults to `lastExpandedStateId`.
  - Exposed solver trace viewer from `LevelSolutionsBrowser`.
  - BFS debug visualizer added.
- **Global dead-end detection**: Stranding a bridge arrow now pulses "Restart Level" (not just local dead ends).
- **ParseActionString**: Restored helper in `levelSolver`.

#### Phase 9: Solver Input Validation & Move Recording (Aug 5)
- **Solver input validator**: Added validation layer for solver inputs; updated tutorials and game rendering; updated Tailwind config. (Later reverted in a single commit — Aug 5 — then the fix (`a50815f`) re-applied the `parseActionString` restoration separately, indicating the revert only dropped the validator/tutorials/render/tailwind portion.)
- **Move recording**: Console output for recorded moves; admin coordinate tooltips in the CRM.
- **Stuck-detection polish**: Integrated with global dead-end detection and the arrow tutorial.

#### Phase 10: 3D Mode & Admin/CRM Features (Aug 5)
- **3D mode**: Added a tilted top-view 3D mode; stabilized the left HUD cluster width.
- **Admin/CRM**:
  - Beta-tester role (level-skip without mapper/CRM).
  - Verified admins: unconditional level access, surfaced in CRM.
  - `last_seen_at` actual-activity tracking.
  - Idle-aware active-time tracking for CRM "Time Played" stat.
  - `isAdmin` prop fix (removed broken prop causing `ReferenceError`).
- **UX polish**: Account contamination fix, GitHub Pages caching fix, general UX polish.

#### Phase 11: Development Guidelines (Aug 6)
- Enhanced development guidelines for agent execution and debugging workflow across `AGENTS.md`.

#### Phase 12: Gameplay Presentation & Board Fit (Aug 7)
- Reworked the compact gameplay presentation while leaving game rules and solver logic unchanged.
- Board is now kept just inside its fitted viewport with a small fullscreen safety frame, ensuring perimeter grid tiles are never cropped at the default zoom.
- Reduced the compact HUD to level, timer, and key status; moved secondary controls into a collapsible corner dock.
- Refined visual hierarchy: warmer stone and softer sand, beveled collectibles, quieter embossed teal arrow tiles, and a glowing exit-cave beacon with subtle particles.
- Made the dinosaur more prominent with a stronger outline and gentle idle/breathing motion.
- Removed the old footer overlay and added a restrained cave-like backdrop/vignette behind the board.
- Commit: `6a344a0` (`Polish gameplay board presentation`). Automated test/build verification remains pending because the current WSL environment has no runnable Linux Node installation.

#### Phase 13: 3D-Only Redesign Rollout Guard (Aug 7)
- Applied a rollout guard so the gameplay redesign path is active **only** in `3d` view mode.
- `top` view is intentionally kept on the non-redesign presentation path for side-by-side comparison.
- Added a single fallback switch in `src/components/PuzzleGame.tsx`:
  - `ENABLE_3D_GAMEPLAY_REDESIGN = true`
  - Set it to `false` for immediate fallback to the legacy `Game3D` path if production issues appear.
- This keeps rollback low-risk and one-line, while preserving current game rules/solver behavior.

---

## CURRENT ARCHITECTURE

```
src/
  components/
    PuzzleGame.tsx         # Orchestrates gameplay, HUD, tutorials, campaign flow, WebSocket
    GameTop2D.tsx           # Default clean SVG top-down renderer
    GameSprite2D.tsx        # Sprite-based renderer
    Game2D.tsx / Game3D.tsx / GameBoard.tsx  # Other view modes (2d/3d/fps)
    TutorialOverlay.tsx     # Animated, step-through tutorial engine
    CampaignDialog.tsx      # Campaign map / level select
    tiles/                  # Shared tile visuals (CaveTile, ArrowTile, CrackedRockTile)
    level-mapper/           # In-app level editor (grid detection, bulk edit, solver)
    CrmDashboard.tsx        # Admin analytics / player activity dashboard
  game/
    types.ts                # Core game type definitions
    arrows.ts / glide.ts / movement.ts / teleport.ts / caves.ts
  lib/
    tutorials/               # Tutorial content + progress tracking
    campaignProgress.ts / cloudProgress.ts
    levelSolver.ts           # BFS solver (pure logic)
    adminMode.ts / adminAccount.ts
    supabaseClient.ts
  data/
    levels.ts, promoted-levels.json   # Level definitions (200 levels)
  hooks/                     # usePlayerPresence, use-mobile, use-toast
server/
  ws-server.mjs              # Real-time multiplayer WebSocket server (Render)
  asset-writer.mjs           # Dev-only asset generation tool
supabase/
  schema*.sql                # Postgres schema, RLS policies, migrations
apps/android/                # Capacitor Android app wrapper
```

### Cell Type Legend

| Code | Type                  | Notes |
|------|-----------------------|-------|
| 0    | Floor                 | Safe ground |
| 1    | Fire / Wall           | Impassable to player; glidable by arrows |
| 2    | Stone (solid)         | Impassable |
| 3    | Cave / Goal           | Reach to clear |
| 4    | Water                 | Glidable |
| 5    | Void                  | Glidable — glide running out here is a soft-lock |
| 6    | Breakable Rock        | Walkable once; crumbles to void after stepping off |
| 7–10 | Arrow (U/R/D/L)       | Glides in one fixed direction |
| 11   | Arrow (up/down)       | Glides vertically |
| 12   | Arrow (left/right)    | Glides horizontally |
| 13   | Arrow (omnidirectional) | Glides any cardinal direction |
| 14/15 | Red / Green Key      | Collectible |
| 16/17 | Red / Green Lock     | Requires matching key |
| 18   | Start Marker          | Player spawn (unlit arch) |
| 19   | Teleport              | Warps to linked pad after 3s cycle |
| 20   | Bonus Time            | Adds time to level clock |

### Core Mechanics
1. **Stepping on an arrow**: step to adjacent floor/cave/breakable/arrow freely; move in the arrow's direction to glide.
2. **Gliding**: traverse a straight line of glidable cells (void/water), stopping just before the next obstacle.
3. **Remote arrow control**: tap any arrow from anywhere, then relay it in a valid direction across void/water.
4. **Breakable rocks**: crumble to void the first time you step *off* one.
5. **Stuck detection**: if no directions produce a valid move, the Restart Level button pulses (and a tutorial explains it the first time).

---

## LEVEL SOLVER

- **Algorithm**: Breadth-first search (BFS) over game states.
- **Location**: `src/lib/levelSolver.ts` (split into focused modules; trace system in `src/lib/trace/`).
- **Notation**: `P:<dir>` = player move, `A(x,y):<dir>` = trigger remote arrow at grid cell (x,y), `T` = teleporter use.
- **Solutions file**: `level_solutions.txt` — 200 levels generated using the built-in BFS solver.
- **Status**: 85 solved, 34 placeholder (blank grids), 81 unsolved (real content, search budget exceeded at ~20s / 300k nodes).
- **Trace viewer**: Auto-opens on failed solves; supports HTML export via `reconstructState`; uses `closestManhattan` heuristic.

---

## TESTING

### Infrastructure
- **Unit tests**: Vitest (`src/game/*.test.ts`, `src/lib/tutorials/*.test.ts`) — covers glide/arrow/movement logic and tutorial progress tracking.
- **E2E tests**: Playwright, wired into CI (`.github/workflows/deploy-pages.yml`) with an HTML reporter.
- **CI**: Tests run before deploy on every push to `main`; unique `VITE_BUILD_ID` injected for cache-busting.

### Verification Commands
```bash
npm run dev       # Vite dev server
npx tsc --noEmit  # typecheck (30+ errors, strict: false)
npm run lint      # eslint (0 errors, warnings only)
npm run test      # unit tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
npm run build     # production bundle
```

### Testing Checklist (Movement Mechanics)
- Stepping off an arrow in its own direction onto floor/cave starts a glide; other directions don't.
- A glide stops exactly one cell before an obstacle.
- Remote arrow moves leave void behind at the origin and stop under the same blocking rules.
- A breakable rock only crumbles after stepping off; can't be re-entered.
- Void/water/fire are never directly walkable.
- The stuck-detector runs against cloned grid/inventory/rock-state (no mutation).

---

## CODE REVIEW FINDINGS (Aug 4, 2026)

A full code review was conducted. Key findings (full report in `CODE_REVIEW.md`):

### Compliance
- ✅ Game engine modules (`src/game/*`, `src/lib/levelSolver.ts`) are well-written pure functions, cleanly separated from rendering.

### Violations / Gaps
- **Type safety**: `strict: false` in `tsconfig.app.json` — contradicts AGENTS.md guidelines. 30+ type errors exist.
- **`PuzzleGame.tsx`**: ~3600-line monolith mixing rendering, game loop, cloud sync, multiplayer, input, UI state.
- **Tests**: None for the solver or game loop (only glide/arrow/movement + tutorials covered).
- **Security**:
  - `window` debug globals attached unconditionally (no `DEV` gate) — `src/main.tsx:110-135`.
  - Unvalidated `redirect` query parameter — `index.html:18-29`.
  - Stack-trace leakage in error boundary — `src/main.tsx`, `src/App.tsx`.
  - Production WebSocket server (`server/ws-server.mjs`) has no auth, no origin check, broadcasts unsanitized client input (input-spoofing / crash DoS vector).
  - Console debug logging shipped to production.
- **Quality**: Cloud-sync merge logic duplicated between `cloudProgress.ts` and `PuzzleGame.tsx`; localStorage boilerplate repeated across 4+ modules; `as` casts obscure type issues; `.env` contains live secrets (git-ignored but noted).

---

## KNOWN ISSUES & PLACEHOLDERS

- **Unsolved levels**: 81 levels have real content but were not solved within the solver's search budget (20s / 300k nodes). See `level_solutions.txt` for the full list (IDs: 12, 18–21, 25–30, 32–34, 36–40, 42, 44, 47, 49–61, 63–64, 112, 118–121, 125–130, 132–140, 142, 147, 149–153, 155–161, 163–164, 178, 184–187, 191–196, 198, 200).
- **Placeholder levels**: Levels 66–100 are blank/void grids (no mapper content yet). Level 166 is empty.
- **Solver**: No automated tests for `levelSolver.ts` despite being ~27k characters of BFS logic.

---

## DEPLOYMENT

- **Frontend**: GitHub Pages via `.github/workflows/deploy-pages.yml` on every push to `main`.
- **WebSocket**: Render (`render.yaml` → `phoneage-ws` service, `server/ws-server.mjs`). Health check: `/healthz`. Set `VITE_WS_URL=wss://<service>.onrender.com/ws`.
- **Database**: Supabase Postgres. Schema in `supabase/schema*.sql`.
- **Build ID polling**: `src/main.tsx` polls for a new `build-id` in production and shows an "update available" banner.

---

**Document Version**: 2.0  
**Last Updated**: August 7, 2026
**Author**: GitHub Copilot (automated from git history)  
**Status**: Reflects current repository HEAD (`6a344a0`)
