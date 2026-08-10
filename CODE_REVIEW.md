# Code Review Report — Phoneage Web Game

**Scope:** Full repository review focusing on security, code quality (DRY/readability), and type safety.
**Date:** 2026-08-04
**Method:** Manual source review + automated checks (`tsc --noEmit`, `eslint .`)

---

## 1. Summary

| Area | Status |
|------|--------|
| Build / lint / typecheck | Type errors exist; lint is clean |
| Security | Several findings (dev infrastructure, client-side debug exposure, unvalidated redirects) |
| Code quality (DRY) | Mixed; some duplication, several monolithic files |
| Tests | **None** — no `.test.`/`.spec.` files in the project |
| Type safety | `strict: false` globally — safety largely disabled |

**Verdict:** The game logic modules (`src/game/*`, `src/lib/levelSolver.ts`) are well-written and clean. However, the project has systemic type-safety gaps (strict mode disabled), a monolithic 3600-line `PuzzleGame.tsx`, debug tooling shipped to production clients, and a dev asset-write server with zero authentication. These are flagged below with priority and location.

---

## 2. Automated Checks (run)

### 2.1 TypeScript — `tsc --noEmit`
**Result: 30+ type errors.** Most are in:
- `src/components/Game3D.tsx`
- `src/components/PuzzleGame.tsx`
- `src/components/GameSprite2D.tsx`
- `src/components/GameTop2D.tsx`
- `src/components/level-mapper/mapperTrainingSet.ts`

Note: `tsconfig.app.json` has `"strict": false`, `"noImplicitAny": false`, `"noUnusedLocals": false`, so many real type issues are suppressed. Re-enabling strict mode will surface additional errors.

### 2.2 ESLint — `eslint .`
**Result: 0 errors, only warnings.** Warnings are `react-hooks/exhaustive-deps` and `react-refresh/only-export-components` (non-blocking). ESLint is configured for `.ts`/`.tsx` only; `server/*.mjs` files are not linted.

### 2.3 Tests
**Result: No test files found.** Searched for `*.test.{ts,tsx,js,mjs}` and `*.spec.*`. Zero matches. The project has a BFS level solver, movement/recording logic, and cloud sync — none covered by automated tests.

---

## 3. Security Findings

### S1 (Medium) — Debug globals attached to `window` in production
**File:** `src/main.tsx:110-135`

Debug functions (`runBulkBuildAndDownload`, `solveGrid`, `runLevelQaReport`, `exportLocalStorageSeed`, `importLocalStorageSeed`, etc.) are attached to `window` **unconditionally** — not gated by `import.meta.env.PROD`.

Impact: Any user on the production site can open devtools and call these functions. `exportLocalStorageSeed`/`importLocalStorageSeed` can read/write arbitrary localStorage keys with the recognized prefixes. While these are "just" game-save keys (not auth tokens), this is an unnecessary attack surface and a data-leak vector (a player's level progress/mapping data is trivially extractable).

Recommendation: Wrap in `if (import.meta.env.DEV)` or `if (import.meta.env.PROD && isAdmin)` so these are never attached in production builds.

### S2 (Medium) — Unvalidated `redirect` query parameter (open-redirect pattern)
**File:** `index.html:18-29`

The page reads a `redirect` query parameter at load time and performs `history.replaceState` with it **without validation**.

Impact: An attacker can craft a URL like `https://game.example.com?redirect=https://evil.example.com` that looks like a legitimate game URL but silently redirects the browser history entry to a malicious site. While `replaceState` doesn't change the visible URL bar immediately, this is exploitable in phishing flows and can be combined with clickjacking of the `#root` mount. It also enables history-state poisoning.

Recommendation: Validate that `redirect` is a same-origin path (starts with `/`, doesn't start with `//`, and resolves against the current origin). Reject absolute external URLs.

### S3 (Medium) — Stack-trace leakage in error boundary
**File:** `src/main.tsx:162-171` and `src/App.tsx` (error boundary)

When the app fails to load, the full stack trace is rendered into the DOM (`document.body.innerHTML` and the `App.tsx` error boundary renders `<pre>` with stack). In production this leaks implementation details (file paths, internal structure) to end users.

Recommendation: In production, render a generic error message. Gate detailed diagnostics behind a dev-mode or admin-mode check.

### S4 (Low) — Console debug logging shipped to production
**File:** `src/main.tsx` (lines 10, 95, 103, 154, 161, 163) and `src/App.tsx`

`console.log('🚀 main.tsx starting...')`, `console.log('📦 Root element:', ...)`, `console.log('🎯 Creating React root...')`, etc. are emitted on every page load regardless of environment.

Impact: Information leakage (DOM structure, internal state) and minor performance/noise cost for end users. Not a direct exploit but poor hygiene.

Recommendation: Gate behind `import.meta.env.DEV` or replace with a structured logger that respects an env-level config.

### S5 (High) — Production WebSocket server has zero authentication & broadcasts unsanitized input
**File:** `server/ws-server.mjs` (lines 8–49), `render.yaml` (line 7)

`render.yaml` deploys `server/ws-server.mjs` as the `phoneage-ws` service on Render (production). The server:
- Binds to `0.0.0.0` (all interfaces) — line 5
- Has **no authentication** on the WebSocket endpoint (`/ws`) — line 18
- Has **no origin check** — any website can open a connection
- **Broadcasts raw client input** to all peers with zero validation or sanitization — lines 40–49

```js
ws.on('message', (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'input' && msg.input) {
      broadcast({ type: 'input', id: msg.id || id, input: msg.input }, ws);
    }
  } catch { /* Ignore malformed messages */ }
});
```

Impact:
1. **Unauthenticated WebSocket flooding:** Any anonymous client can connect and broadcast arbitrary `input` messages to all connected players. An attacker can flood every connected player with phantom inputs, effectively causing a denial-of-service / input-spoofing attack during multiplayer sessions.
2. **Client-side input trust (confirmed):** The client receives `msg.input` and pushes it directly into the input queue with **zero schema validation** — `PuzzleGame.tsx:1589` (`queue.push(msg.input)`). The queued input is then dispatched by `input.type` (`select`/`deselect`/`move`) and for `move`, `input.dx`/`input.dy` are passed directly to `attemptPlayerMove(state, input.dx, input.dy)` at `PuzzleGame.tsx:1799`, which assumes these are numbers. If an attacker sends `{ type: 'move', dx: 'evil', dy: 'string' }`, `playerPos.x + dx` produces string concatenation, `grid[NaN]` returns `undefined`, and `undefined[targetX]` throws a `TypeError` — crashing the game loop on the **receiving** client. Since the server broadcasts to all peers, a single malicious client can crash every connected player's game.
3. **No rate limiting:** An attacker can open many connections or send high-frequency messages without throttling.

Recommendation (High priority):
- Add **authentication**: issue signed session tokens (JWT or Supabase-signed) and require them in the WebSocket handshake query param / `Sec-WebSocket-Protocol`.
- Add an **origin check** on the initial HTTP upgrade request.
- **Validate/sanitize** `msg.input` on the server before broadcasting (schema-validated with `zod` or equivalent; cap message size).
- Add **rate limiting** (e.g., max N messages/second per connection, max concurrent connections per IP).

### S6 (Medium) — Dev asset-writer server has zero auth + wildcard CORS
**File:** `server/asset-writer.mjs` (lines 43–53, 74–219)

The `asset-writer.mjs` server exposes two HTTP endpoints — `POST /write-level-image` and `POST /write-level-default` — that write files to the repository (`src/assets/level_*.png` and `src/data/promoted-levels.json`). CORS is set to `access-control-allow-origin: *`. **No authentication, no origin check.**

A notable positive: the handler does validate input shape (`isGrid`, `isInt`, bounds checks on `playerStart`/`cavePos`) before writing — lines 137–166. The path-confinement is implicit (hardcoded `path.resolve(repoRoot, ...)` — can't be manipulated to escape the repo root). So this is **input-validated but unauthenticated**.

Impact: If exposed to the internet, an attacker can (a) upload arbitrary PNG data to `src/assets/level_XXX.png`, and (b) overwrite `promoted-levels.json` with attacker-controlled level definitions (subject to the `?overwrite=1` query gate, and `?force=1` to bypass locks). The PNG upload could be used to serve malicious content if `src/assets` is web-served, and the level JSON could inject malformed levels that break the solver or rendering.

Note: `asset-writer.mjs` is **not** referenced in `render.yaml` — it appears to be a local-dev tool. Confirm it is never started in production.

Recommendation: Bind to `localhost` only in dev; add a shared-secret token for write access; restrict `access-control-allow-origin` to `localhost:*` in dev.

### S7 (Informational) — `.env` file contains live secrets
**File:** `.env` (git-ignored)

The `.env` file contains `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, and a Google OAuth secret. The file is correctly git-ignored (`git status` confirms it is not tracked; only `.env.example` is tracked). This is expected for local dev, but worth confirming the production deploy uses a secrets manager and not a committed `.env`.

### S8 (Informational) — `dangerouslySetInnerHTML` usage
**File:** `src/components/ui/chart.tsx` (1 match)

One usage of `dangerouslySetInnerHTML` found in the charting component (likely the Recharts-based `Cell` rendering). Verify the HTML content is static/trusted (not derived from user input). If this component is used in the level mapper or admin dashboard, confirm no user-controlled data flows into it.

### S9 (Positive) — Admin-mode client flag is properly server-validated
**File:** `src/lib/adminMode.ts` + `src/lib/adminAccount.ts`

The `stone-age-admin-mode` localStorage flag is correctly documented as spoofable/client-side only. The authoritative check (`checkIsAdminAccount`) queries the `admin_users` table via Supabase with RLS, so a user cannot escalate privileges by editing localStorage. This is a good pattern — no action needed.

### S10 (Positive) — `localStorage` access is null-safe
**File:** `src/lib/supabaseClient.ts`

Supabase client construction guards for missing env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Good defensive practice.

---

## 4. Code Quality Findings (DRY & Readability)

### Q1 (High) — `PuzzleGame.tsx` is a 3600-line monolith
**File:** `src/components/PuzzleGame.tsx` (~3600 lines)

This single component mixes:
- Game rendering (DOM/Canvas)
- Game loop and timers
- Move recording / playback
- Cloud sync (`cloudProgress.ts` integration)
- Multiplayer presence / WebSocket orchestration
- Input handling (touch, keyboard)
- Level state management
- Victory / completion logic
- UI overlay state (menus, hints, QA)

Impact: Extremely difficult to maintain, test, or navigate. Violates single-responsibility principle. A single change (e.g., modifying the victory condition) risks breaking rendering, sync, or multiplayer.

Recommendation: Split into focused components and hooks:
- `hooks/useGameState.ts` — level state, move history, victory logic
- `hooks/useMoveRecording.ts` — recording/playback
- `hooks/useCloudSync.ts` — cloud save integration
- `hooks/useMultiplayerPresence.ts` — WebSocket/presence
- `components/GameRenderer.tsx` — pure rendering
- `components/GameOverlays.tsx` — UI overlays

### Q2 (High) — `src/data/levels.ts` is a 30k-character data file
**File:** `src/data/levels.ts` (~30,000 chars)

Contains all 100+ level definitions, theme configurations, and some logic in a single file. While data files can be large, this mixes data with logic and makes individual level editing/error-prone.

Recommendation: Split into `levels/levels.ts` (index), `levels/definitions.ts` (raw data), `levels/themes.ts` (theme config), per-level files or a generated JSON.

### Q3 (Medium) — Cloud-sync logic duplicated across `cloudProgress.ts` and `PuzzleGame.tsx`
**Files:** `src/lib/cloudProgress.ts`, `src/components/PuzzleGame.tsx`

`cloudProgress.ts` provides `syncToCloud` / `loadFromCloud` helpers, but `PuzzleGame.tsx` also contains inline Supabase calls for progress merging and conflict resolution. The merge strategy (local wins vs. cloud wins, timestamp comparison) is implemented in both places with subtle differences.

Impact: Risk of divergent merge behavior; hard to reason about consistency.

Recommendation: Centralize all cloud-sync merge logic in `cloudProgress.ts` and have `PuzzleGame.tsx` call a single `syncProgress()` entry point.

### Q4 (Medium) — `levelSolver.ts` is ~27k characters with no test coverage
**File:** `src/lib/levelSolver.ts` (~27,000 chars)

A BFS solver with edge-case handling for every tile type. It is pure logic (well-separated from rendering — good) but has **zero tests**. Given its size and the game's correctness depends on it, this is a significant risk.

Recommendation: Extract core primitives (`canMove`, `isComplete`, `bfsStep`) into small testable functions and add a test suite. Even 20 targeted tests would dramatically de-risk this module.

### Q5 (Medium) — Repeated localStorage read/write boilerplate
**Files:** `src/lib/campaignProgress.ts`, `src/lib/viewModePrefs.ts`, `src/lib/adminMode.ts`, `src/lib/levelOverrides.ts`

Multiple modules independently implement the same pattern:
```ts
try {
  localStorage.setItem(KEY, value);
} catch {
  // ignore
}
```
and
```ts
try {
  const v = localStorage.getItem(KEY);
  return v ? JSON.parse(v) : defaultValue;
} catch {
  return defaultValue;
}
```

Impact: Duplication of error-handling boilerplate; inconsistent handling across modules.

Recommendation: Extract a `src/lib/storage.ts` helper: `safeGet<T>(key, default)`, `safeSet(key, value)`, `safeRemove(key)`. This would consolidate ~50 lines of repeated try/catch into one well-tested utility.

### Q6 (Medium) — `main.tsx` localStorage seed logic duplicates mapper persistence
**Files:** `src/main.tsx:18-71`, `src/components/level-mapper/persistenceOperations.ts`

`main.tsx` has `buildLocalStorageSeed` / `applyLocalStorageSeed` that filter and reapply localStorage keys by prefix (`level_override_`, `custom_level_def_`, etc.). `persistenceOperations.ts` (in the LevelMapper) has its own key-prefix logic for the same keys.

Impact: The list of prefixes is defined in two places. If a new prefix is added, both must be updated — easy to miss.

Recommendation: Export the prefix list from a single constants module (e.g., `src/lib/mapperStorageKeys.ts`) and import it in both `main.tsx` and `persistenceOperations.ts`.

### Q7 (Low) — Inconsistent error-handling patterns
Some functions (`adminAccount.ts:checkIsAdminAccount`) return `false` on error with a `console.warn`. Others (`customLevels.ts`, `levelOverrides.ts`) throw. Others (`campaignProgress.ts`) silently fall back to defaults. This makes it hard for callers to know whether they need try/catch.

Recommendation: Adopt a consistent error contract — e.g., always return `Result<T, Error>` or always throw, documented at the module level.

### Q8 (Low) — `referenceSeeder.ts` may seed unbounded references
**File:** `src/lib/referenceSeeder.ts`

Called on app startup (`main.tsx:106`). Verify it does not loop over an unbounded data set or make unbounded Supabase calls on every load. (Not yet fully read — please confirm logic before production scaling.)

### Q9 (Low) — `ui/chart.tsx` is a generated/third-party file in `src/`
**File:** `src/components/ui/chart.tsx`

This file (containing the `dangerouslySetInnerHTML` from S7) appears to be a vendored copy of a charting library component. Confirm it is not modified from upstream and is properly attributed/version-tracked.

### Q10 (Positive) — Game engine modules are clean and well-separated
**Files:** `src/game/movement.ts`, `arrows.ts`, `caves.ts`, `glide.ts`, `teleport.ts`, `src/lib/levelSolver.ts`

These are pure functions, well-typed (where strict applies), with clear inputs/outputs and minimal side effects. `src/game/types.ts` provides shared types. This is the codebase's strongest area — keep this pattern.

---

## 5. Type Safety Findings

### T1 (High) — `strict: false` in `tsconfig.app.json`
**File:** `tsconfig.app.json`

```json
"strict": false,
"noImplicitAny": false,
"noUnusedLocals": false
```

This contradicts the `AGENTS.md` guideline: "Fix type errors at their source rather than suppressing them" and "Preserve strict TypeScript type safety."

Impact: `any` is silently permitted throughout; unused variables go undetected; null-safety checks are bypassed. This is the root cause of the 30+ type errors and the reason type safety is weak across the codebase.

Recommendation: Flip `strict: true`, `noImplicitAny: true`, `noUnusedLocals: true`, and `noUnusedParameters: true`. Fix the resulting errors incrementally (most will be legitimate null-check or type-annotation fixes). This is a prerequisite for all other type-safety improvements.

### T2 (Medium) — `as` casts obscure real type issues
**Files:** `src/main.tsx:58,64`, `src/lib/supabaseClient.ts`, `src/lib/cloudProgress.ts`

Several `as` casts bypass type checking (e.g., `seed as Partial<LocalStorageSeed>`, `error as Error`). While some are necessary for JSON parsing, several could be replaced with proper validation functions.

Recommendation: Replace ad-hoc `as` casts with `zod` (or a lightweight runtime validator) for external/untrusted data (localStorage, API responses, URL params).

### T3 (Low) — `import.meta.env.PROD` is typed as `boolean | undefined`
**File:** `src/main.tsx:77`

`(import.meta.env.VITE_BUILD_ID as string | undefined)` — the `as` cast here is needed because Vite types don't know about this custom env var. Fine, but worth a comment or a typed wrapper (`env.ts`).

---

## 6. Architecture Observations

| Area | Assessment |
|------|-----------|
| Game engine (`src/game/*`) | Single-responsibility pure functions. Strong. |
| Supabase client (`src/lib/supabaseClient.ts`) | Null-safe construction. Good. |
| Admin check (`src/lib/adminAccount.ts`) | Server-authoritative (RLS). Correct. |
| Auth gates (`PlayerAuthGate.tsx`, `MapperAuthGate.tsx`) | Present and used. Good. |
| Level solver (`src/lib/levelSolver.ts`) | Pure, well-separated, but untested. Risky. |
| `PuzzleGame.tsx` | Monolith — needs decomposition. |
| Dev servers (`server/`) | `ws-server.mjs` is **production** (Render `phoneage-ws`); `asset-writer.mjs` is dev-only (not in render.yaml). |
| `AGENTS.md` alignment | Partially violated (strict mode off, debug logging, stack-trace leakage). |

---

## 7. Priority Todo

| Priority | Item | Files | Effort |
|----------|------|-------|--------|
| P0 | Add auth + input validation + rate limiting to production WS server | `server/ws-server.mjs`, `render.yaml` | Medium |
| P0 | Gate debug `window` attachment behind `DEV` | `src/main.tsx:110-135` | Small |
| P0 | Fix unvalidated `redirect` param | `index.html:18-29` | Small |
| P0 | Gate stack-trace leakage in error boundary | `src/main.tsx:162-171`, `src/App.tsx` | Small |
| P1 | Re-enable `strict: true` in tsconfig | `tsconfig.app.json` + fix errors | Medium |
| P1 | Split `PuzzleGame.tsx` | `src/components/PuzzleGame.tsx` | Large |
| P1 | Extract `storage.ts` utility for localStorage | `src/lib/` + call sites | Medium |
| P1 | Add tests for `levelSolver.ts` | `src/lib/levelSolver.ts` + new test files | Medium |
| P2 | Centralize cloud-sync merge logic | `cloudProgress.ts`, `PuzzleGame.tsx` | Medium |
| P2 | Unify localStorage prefix constants | `main.tsx`, `persistenceOperations.ts` | Small |
| P2 | Split `data/levels.ts` | `src/data/levels.ts` | Medium |

---

## 8. Verification Commands (run by reviewer)

```bash
tsc --noEmit                # 30+ errors (strict: false)
eslint .                    # 0 errors, warnings only
git status                  # .env ignored, .env.example tracked
grep -r "dangerouslySetInnerHTML" src/  # 1 match
find src -name "*.test.*" -o -name "*.spec.*"  # 0 results
```
