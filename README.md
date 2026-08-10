# Stone Age

An arrow-and-terrain traversal puzzle inspired by retro DOS logic games. You guide a green dino across hazardous terrain to reach the cave, riding directional arrow blocks across gaps of void and water, collecting keys, breaking rocks, and warping through teleport pads. 200 hand-tuned/generated campaign levels, cloud-synced progress, an in-app level editor, and a full interactive tutorial system.

Live at **https://kaospan.github.io/phoneagev3/**.

## Features

* Arrow blocks with directional, bidirectional, and omnidirectional glide logic, movable in place ("remote arrow control") or ridden by stepping onto them
* Keys & locks, breakable rocks, teleport pads, and bonus-time pickups
* Five renderable view modes — Top (default, clean SVG tiles), Sprite, 2D, 3D, and FPS
* A data-driven, animated tutorial system that teaches each mechanic on real board data, stepped through manually (Got it / Replay per step)
* A 200-level campaign map with per-account cloud-synced progress (Supabase), personal bests, and a "Start Over" reset
* Built-in level editor ("Mapper") with grid detection from reference images, bulk editing, and a level solver for QA
* Lightweight WebSocket layer for real-time presence/multiplayer alongside Supabase
* Admin CRM dashboard for player activity, session time, and beta-tester management
* Android app wrapper via Capacitor (`apps/android`)

## Tech Stack

* React + TypeScript + Vite, TailwindCSS, shadcn/ui, Radix UI
* Supabase (Postgres, Auth, Realtime) for accounts, campaign progress, presence, and admin data
* A small Node WebSocket server (`server/ws-server.mjs`) for real-time multiplayer, deployable to Render (`render.yaml`)
* Vitest for unit tests, Playwright for e2e
* Deployed to GitHub Pages via GitHub Actions (`.github/workflows/deploy-pages.yml`) on every push to `main`

## Legend (Cell Types)

| Code | Type                  | Notes |
|------|-----------------------|-------|
| 0    | Floor                 | Safe ground |
| 1    | Fire / Wall           | Impassable to the player; a remotely-moved arrow can glide over it |
| 2    | Stone (solid)         | Impassable |
| 3    | Cave / Goal           | Reach this to clear the level |
| 4    | Water                 | Impassable to walk; glidable |
| 5    | Void                  | Impassable to walk; glidable — a glide that runs out of room here is a soft-lock (Restart Level fixes it instantly) |
| 6    | Breakable Rock        | Walkable once; crumbles to void after you step off |
| 7–10 | Arrow (up/right/down/left) | Glides only in its one fixed direction |
| 11   | Arrow (up/down)       | Glides vertically |
| 12   | Arrow (left/right)    | Glides horizontally |
| 13   | Arrow (omnidirectional) | Glides any cardinal direction |
| 14 / 15 | Red / Green Key    | Collectible |
| 16 / 17 | Red / Green Lock   | Requires the matching key to pass |
| 18   | Start Marker          | Player's spawn cave (unlit arch) |
| 19   | Teleport              | Warps to its linked pad after a short cycle |
| 20   | Bonus Time            | Adds time to the level clock |

## Core Mechanics

1. **Standing on an arrow**: you can step to adjacent floor, cave, an unbroken breakable rock, or another arrow freely. Moving in the arrow's own direction instead starts a glide.
2. **Gliding**: the player traverses a straight line of glidable cells (void/water) and stops just before the next obstacle (stone, floor, cave, breakable rock, fire/wall, another arrow, or the map edge).
3. **Remote arrow control**: tap an arrow from anywhere (no need to be adjacent) to select it, then relay it in one of its own valid directions across void/water. Useful for bringing an out-of-reach arrow within stepping distance.
4. **Breakable rocks**: crumble to void the first time you step *off* one — you can never step onto the same rock twice.
5. **Void / water / fire**: never directly walkable by the player; only reachable via a glide.
6. **Stuck detection**: if none of the 4 directions produce a valid move, the Restart Level button pulses and (once per player, first time it happens) a tutorial explains the ↻ Restart Level button.

## Architecture

* **Model**: pure state/types in `src/game/types.ts`, level data in `src/data/levels.ts` and `src/data/promoted-levels.json`.
* **Controller logic**: `src/game/movement.ts` (move/glide attempts for player & remote arrow), `src/game/glide.ts` (pure glide path calculation), `src/game/arrows.ts` (direction helpers), `src/game/teleport.ts`, `src/game/caves.ts`.
* **View**: `PuzzleGame.tsx` orchestrates gameplay and HUD; rendering is pluggable across `GameTop2D.tsx` (default), `GameSprite2D.tsx`, `Game2D.tsx`, `Game3D.tsx`/`GameBoard.tsx` per view mode. Shared tile visuals (ladder, cracked rock, arrow block) live in `src/components/tiles/` so every view mode and the tutorial mini-grid render identically.
* **Tutorials**: data-driven definitions in `src/lib/tutorials/tutorialDefinitions.ts`, rendered by `TutorialOverlay.tsx`; trigger detection lives in `PuzzleGame.tsx` (cell-type presence in the current level, or a few mechanics-specific checks like the stuck-move detector).
* **Campaign & accounts**: `PlayerAuthGate.tsx` gates play behind Supabase auth; progress lives in `src/lib/campaignProgress.ts` (local) and `src/lib/cloudProgress.ts` (Supabase), scoped per-account so switching accounts on the same browser never leaks progress.
* **Level editor**: `src/components/level-mapper/` — grid detection from a reference image, bulk editing, JSON import/export, and a solver for verifying levels are completable.

Movement functions return outcome objects (`attemptPlayerMove`, `attemptRemoteArrowMove`, `computePlayerGlidePath`, ...) so the view layer decides how to apply side effects and animate them, keeping game logic UI-agnostic and unit-testable.

## File Structure (Key)

```
src/
  components/
    PuzzleGame.tsx         # Orchestrates gameplay, HUD, tutorials, campaign flow
    GameTop2D.tsx           # Default top-down renderer (clean SVG tiles)
    GameSprite2D.tsx        # Sprite-based renderer
    Game2D.tsx / Game3D.tsx / GameBoard.tsx  # Other view modes (2d/3d/fps)
    TutorialOverlay.tsx     # Animated, step-through tutorial engine
    CampaignDialog.tsx      # Campaign map / level select
    tiles/                  # Shared tile visuals (CaveTile, ArrowTile, CrackedRockTile)
    level-mapper/           # In-app level editor
    CrmDashboard.tsx        # Admin analytics/player activity dashboard
  game/
    types.ts                # Core game type definitions
    arrows.ts / glide.ts / movement.ts / teleport.ts / caves.ts
  lib/
    tutorials/               # Tutorial content + progress tracking
    campaignProgress.ts / cloudProgress.ts
  data/
    levels.ts, promoted-levels.json   # Level definitions
  hooks/                     # usePlayerPresence, use-mobile, use-toast
server/
  ws-server.mjs              # Real-time multiplayer WebSocket server
supabase/
  schema*.sql                # Postgres schema, RLS policies, migrations
apps/android/                # Capacitor Android app wrapper
```

## Development

```bash
npm install       # install deps
npm run dev       # start dev server (Vite)
npx tsc --noEmit  # typecheck
npm run lint      # eslint
npm run test      # unit tests (Vitest)
npm run test:e2e  # end-to-end tests (Playwright)
npm run build     # production bundle
npm run preview   # preview the production build
```

Copy `.env.example`-style vars into `.env` (Supabase URL/anon key, service role key for scripts). See `supabase/schema*.sql` for the database schema to apply in your own Supabase project.

## Deployment

Pushing to `main` triggers `.github/workflows/deploy-pages.yml`, which runs the test suite, builds with a unique `VITE_BUILD_ID`, and publishes to GitHub Pages. `src/main.tsx` actively polls for a new `build-id` in production and shows an in-app "update available" banner, since GitHub Pages doesn't support custom cache-control headers.

### WebSocket Server (Render)

Real-time multiplayer presence runs through a small WebSocket server:

1. Create a Render **Web Service** from this repo — `render.yaml` is picked up automatically.
2. Set the frontend env: `VITE_WS_URL=wss://<your-service>.onrender.com/ws`.
3. Health check: `https://<your-service>.onrender.com/healthz`.

## Testing

Unit tests cover glide/arrow/movement logic and tutorial progress tracking (`src/game/*.test.ts`, `src/lib/tutorials/*.test.ts`). When adding a new mechanic, check:

* Stepping off an arrow in its own direction onto floor/cave starts a glide; other directions don't.
* A glide stops exactly one cell before an obstacle.
* Remote arrow moves leave void behind at the origin and stop under the same blocking rules.
* A breakable rock only crumbles after you step off it, and can't be re-entered.
* Void/water/fire are never directly walkable.
* The stuck-detector doesn't mutate real game state while probing (it must always run against cloned grid/inventory/rock-state).

## Contributing

1. Branch from `main`: `git checkout -b feature/my-change`.
2. Keep game logic pure and side-effect-free in `src/game/*` — the view layer applies outcomes.
3. Add/update Vitest coverage for new movement or tutorial logic.
4. Run `npx tsc --noEmit`, `npm run lint`, and `npm run test` before opening a PR.

## License

Currently proprietary.

---
Happy puzzling! 🦕
