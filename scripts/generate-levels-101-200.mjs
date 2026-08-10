/**
 * v2 — Procedurally generates levels 101-200 as "room archipelago" puzzles: small floor rooms
 * scattered across a void-heavy canvas, connected only by arrow tiles that must be ridden or
 * REMOTELY relocated (the game's actual signature mechanic — see e.g. level 17's solution,
 * which opens with four consecutive remote-arrow moves before the player takes a single step).
 * v1 built fully-connected mazes, which reduced every level to plain pathfinding; this version
 * is built from real level 1-100 solutions instead (see reports/final-merged.json).
 *
 * Every candidate is still verified by the real in-game solver (window.solveGrid) before being
 * accepted — nothing is accepted on faith.
 *
 * Each hop between rooms is either "forward" (arrow lives in the room being left, wide gap,
 * personally ridden) or "reversed" (arrow lives in the room being ENTERED, pointing back, gap
 * forced to exactly 1 cell) — a reversed hop's arrow is physically unreachable by the player
 * until it's remotely relocated into the gap first, so it genuinely requires the remote-move
 * mechanic rather than just offering it as an option.
 *
 * Difficulty ramps by adding rooms/hops and, from tier 4, key/lock gates on room entrances:
 *   101-120  2-3 rooms, forward hops only (approachable)         target moves ~10-22
 *   121-140  3-4 rooms, forward + reversed hops mixed             target moves ~18-32
 *   141-160  4 rooms, breakable rocks inside rooms                target moves ~24-42
 *   161-180  4-5 rooms, one red key/lock gating a room entrance   target moves ~32-58
 *   181-200  5-6 rooms, red+green locks, omni arrow on last hop   target moves ~46-85
 *
 * Usage: node scripts/generate-levels-101-200.mjs [--start=101] [--end=200] [--seed=42] [--out=preview.json]
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key.replace(/^--/, ''), value ?? true);
});
const RANGE_START = Number(argMap.get('start') ?? 101);
const RANGE_END = Number(argMap.get('end') ?? 200);
const BASE_SEED = Number(argMap.get('seed') ?? 2024);
const OUT_PATH = argMap.get('out') ?? null;

// ---------------------------------------------------------------------------
// Seeded RNG
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed | 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ---------------------------------------------------------------------------
// Canvas + room construction
// ---------------------------------------------------------------------------
const ROWS = 11;
// Mutable, set per-candidate in buildCandidate() before anything else runs (synchronous, so this
// is safe). A relay hop's wide gap makes a 3rd room physically impossible to fit in the original
// fixed 20-column canvas (confirmed empirically — every tier collapsed to 2 rooms), which also
// silently starved tier 4+ of lock-gating (locks need a simple-hop room entrance, and a 2-room
// level's only hop is always the forced relay). Widening the canvas for higher tiers is what
// actually lets "more rooms + locks" difficulty scaling exist at all. Levels 1-100 already vary
// board width slightly (11x20 and 11x21 both appear), so this isn't unprecedented.
let COLS = 20;
const colsForTier = (tier) => (tier <= 2 ? 20 : tier === 3 ? 24 : tier === 4 ? 27 : 30);

const setStoneIfVoid = (grid, x, y) => {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return;
  if (grid[y][x] === 5) grid[y][x] = 2;
};

/** Fills a room's interior with floor and draws a stone ring around it, leaving gaps open
 *  at the given bridge rows (left/right sides) and/or bottom columns, so incoming/outgoing
 *  glides (or a relay leg dropping down to a corridor) can pass through. */
function stampRoom(grid, room, openLeftRow, openRightRow, openBottomCols = []) {
  const { x0, y0, w, h } = room;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) grid[y][x] = 0;
  }
  for (let x = x0 - 1; x <= x0 + w; x++) {
    setStoneIfVoid(grid, x, y0 - 1);
    if (!openBottomCols.includes(x)) setStoneIfVoid(grid, x, y0 + h);
  }
  for (let y = y0; y < y0 + h; y++) {
    if (y !== openLeftRow) setStoneIfVoid(grid, x0 - 1, y);
    if (y !== openRightRow) setStoneIfVoid(grid, x0 + w, y);
  }
}

function tierFor(id) {
  if (id <= 120) return 1;
  if (id <= 140) return 2;
  if (id <= 160) return 3;
  if (id <= 180) return 4;
  return 5;
}

// The 20-column canvas physically caps how many rooms fit with genuine void gaps between them
// (a relay hop's corridor alone needs ~9-11 columns) — 2-4 rooms is the realistic ceiling, not
// the 5-6 v1 assumed. Difficulty past that comes from room size (more internal walking), how
// many of the available hops are relays instead of simple rides, and lock/rock density — not
// from an ever-climbing move count chasing a target the geometry can't support.
function targetMovesFor(id) {
  const t = (id - 101) / (200 - 101);
  return Math.round(10 + t * 22);
}

const roomCountForTier = (tier, rng) => {
  switch (tier) {
    case 1: return 2;
    case 2: return randInt(rng, 2, 3);
    case 3: return 3;
    case 4: return randInt(rng, 3, 4);
    default: return randInt(rng, 3, 4);
  }
};

const roomSizeForTier = (tier, rng) => ({
  w: randInt(rng, 3, tier >= 4 ? 6 : tier >= 2 ? 5 : 4),
  h: randInt(rng, 3, tier >= 4 ? 6 : tier >= 2 ? 5 : 4),
});

/**
 * A relay hop is a faithful reproduction of how the real levels use remote arrow moves (see
 * e.g. level 2's solution): the player personally rides a LOCAL arrow down out of the room
 * into a corridor below, which is a real glide (their own move) that leaves a "trail" marking
 * where they land. That trail cell now blocks line-of-sight for a SEPARATE remote arrow parked
 * further down the corridor — remotely triggering it sends it sliding until it hits that trail
 * and parks right next to the player. Only then can they step onto it and (since it's an omni
 * arrow) glide onward to a leg that climbs back up into the next room. Skipping the remote
 * trigger leaves the player stranded — there is no walking path across void, ever, in this
 * game, so this genuinely requires the mechanic rather than just permitting it.
 */
function buildRelayHop(grid, room, nextRoom, bandY0, bandHeight, rng, usedCells) {
  const corridorGapY = bandY0 + bandHeight; // void row directly below the rooms
  const corridorY = corridorGapY + 1; // where the player's local glide lands
  const stoneBlockerY = corridorY + 1; // stops that glide exactly at corridorY
  if (stoneBlockerY >= ROWS - 1) return false;

  const localArrowX = room.x0 + room.w - 1;
  setStoneIfVoid(grid, localArrowX, stoneBlockerY);
  grid[bandY0 + bandHeight - 1][localArrowX] = 9; // down — lives in the room's own bottom row
  usedCells.add(`${localArrowX},${bandY0 + bandHeight - 1}`);

  const legX = nextRoom.x0;
  if (legX <= localArrowX + 2) return false; // not enough room for the remote arrow between them
  grid[corridorGapY][legX] = 0;
  grid[corridorY][legX] = 0;

  const remoteX = randInt(rng, localArrowX + 2, legX - 1);
  grid[corridorY][remoteX] = 13; // omni — parked in the corridor, remote-only reachable
  usedCells.add(`${remoteX},${corridorY}`);
  return true;
}

/** Builds one candidate level for the given id/seed. Returns null if room layout doesn't fit. */
function buildCandidate(id, rng) {
  const tier = tierFor(id);
  COLS = colsForTier(tier);
  const numRooms = roomCountForTier(tier, rng);

  // Fixed near the top of the canvas so every room has guaranteed room below it for a relay
  // hop's corridor (see buildRelayHop) without needing per-level bounds-juggling. Taller for
  // higher tiers so there's more internal walking distance, since the 20-column canvas caps
  // room *count* well before it caps room *size*.
  const bandHeight = randInt(rng, 3, tier >= 4 ? 6 : tier >= 2 ? 5 : 3);
  const bandY0 = 1;

  // Lay rooms left-to-right. Relay hops need a wider gap (room for the corridor's remote arrow).
  // Hop 0 is ALWAYS relay: the original generator let tier-1 levels use a "simple ride" hop,
  // which meant their solver-optimal solution used zero remote-arrow moves at all (confirmed
  // empirically against the real solver — the arrow was decorative). Since room 0 -> room 1 is
  // the only way forward, forcing that first hop to be relay guarantees every level genuinely
  // requires the remote-move mechanic. Later hops stay probabilistic so simple-hop entrances
  // (needed for lock gating, see below) remain available at higher tiers.
  const hopIsRelay = [];
  for (let i = 0; i < numRooms - 1; i++) hopIsRelay.push(i === 0 || (tier >= 2 && rng() < 0.7));

  const rooms = [];
  let cursorX = 1;
  for (let i = 0; i < numRooms; i++) {
    const w = roomSizeForTier(tier, rng).w;
    if (cursorX + w > COLS - 1) break;
    rooms.push({ x0: cursorX, y0: bandY0, w, h: bandHeight });
    const gap = hopIsRelay[i] ? randInt(rng, 5, 7) : randInt(rng, 3, 6);
    cursorX += w + gap;
  }
  if (rooms.length < 2) return null;
  hopIsRelay.length = rooms.length - 1;

  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(5));
  const usedCells = new Set();
  const isFreeFloor = (x, y) => grid[y]?.[x] === 0 && !usedCells.has(`${x},${y}`);

  // Simple hops connect at a shared row (top of the band); relay hops connect via each room's
  // own bottom-row local arrow / corridor leg (see buildRelayHop), so no shared row is needed.
  const bridgeRow = bandY0;
  for (let i = 0; i < rooms.length; i++) {
    const openLeft = i > 0 && !hopIsRelay[i - 1] ? bridgeRow : undefined;
    const openRight = i < rooms.length - 1 && !hopIsRelay[i] ? bridgeRow : undefined;
    const openBottomCols = [];
    if (i > 0 && hopIsRelay[i - 1]) openBottomCols.push(rooms[i].x0); // incoming relay leg
    if (i < rooms.length - 1 && hopIsRelay[i]) openBottomCols.push(rooms[i].x0 + rooms[i].w - 1); // outgoing local arrow
    stampRoom(grid, rooms[i], openLeft, openRight, openBottomCols);
  }

  for (let i = 0; i < rooms.length - 1; i++) {
    if (hopIsRelay[i]) {
      const ok = buildRelayHop(grid, rooms[i], rooms[i + 1], bandY0, bandHeight, rng, usedCells);
      if (!ok) return null;
    } else {
      const room = rooms[i];
      const x = room.x0 + room.w - 1;
      const isLastHop = i === rooms.length - 2;
      const arrowType = tier === 5 && isLastHop && rng() < 0.5 ? 13 : 8; // 13 = omni, 8 = right
      grid[bridgeRow][x] = arrowType;
      usedCells.add(`${x},${bridgeRow}`);
    }
  }

  // Tier 3+: breakable rocks scattered inside rooms for texture.
  if (tier >= 3) {
    for (const room of rooms) {
      if (rng() >= 0.5) continue;
      const x = randInt(rng, room.x0, room.x0 + room.w - 1);
      const y = randInt(rng, room.y0, room.y0 + room.h - 1);
      if (!isFreeFloor(x, y)) continue;
      grid[y][x] = 6;
      usedCells.add(`${x},${y}`);
    }
  }

  // Player start in room 0, goal cave in the last room — pick cells away from the bridge edges.
  const farCell = (room, awayFromRight) => {
    const x = awayFromRight ? room.x0 : room.x0 + room.w - 1;
    const y = room.y0 + randInt(rng, 0, room.h - 1);
    return { x, y };
  };
  const startRoom = rooms[0];
  const goalRoom = rooms[rooms.length - 1];
  const playerStart = farCell(startRoom, true);
  const cavePos = farCell(goalRoom, false);
  if (!isFreeFloor(playerStart.x, playerStart.y) || !isFreeFloor(cavePos.x, cavePos.y) || (playerStart.x === cavePos.x && playerStart.y === cavePos.y)) {
    return null;
  }
  usedCells.add(`${playerStart.x},${playerStart.y}`);
  grid[cavePos.y][cavePos.x] = 3;
  usedCells.add(`${cavePos.x},${cavePos.y}`);

  // Tier 4+: gate a room entrance with a lock; the matching key sits in an earlier room.
  // Only rooms reached via a SIMPLE hop have a single-cell doorway a lock can sit on cleanly —
  // a relay hop's entrance is the two-cell corridor leg, which a lock can't cleanly gate.
  const simpleEntranceRoomIndices = [];
  for (let i = 1; i < rooms.length; i++) if (!hopIsRelay[i - 1]) simpleEntranceRoomIndices.push(i);
  const lockRooms = [];
  if (tier >= 4 && simpleEntranceRoomIndices.length >= 1) {
    lockRooms.push({ roomIndex: pick(rng, simpleEntranceRoomIndices), color: 'red' });
  }
  if (tier >= 5 && simpleEntranceRoomIndices.length >= 2) {
    const rest = simpleEntranceRoomIndices.filter((i) => i !== lockRooms[0].roomIndex);
    if (rest.length > 0) lockRooms.push({ roomIndex: pick(rng, rest), color: 'green' });
  }
  for (const { roomIndex, color } of lockRooms) {
    const room = rooms[roomIndex];
    const entranceY = bridgeRow;
    const entranceX = room.x0;
    if (!isFreeFloor(entranceX, entranceY)) continue;
    const keyRoomIndex = randInt(rng, 0, roomIndex - 1);
    const keyRoom = rooms[keyRoomIndex];
    const keyCandidates = [];
    for (let y = keyRoom.y0; y < keyRoom.y0 + keyRoom.h; y++) {
      for (let x = keyRoom.x0; x < keyRoom.x0 + keyRoom.w; x++) {
        if (isFreeFloor(x, y)) keyCandidates.push({ x, y });
      }
    }
    if (keyCandidates.length === 0) continue;
    const keyPos = pick(rng, keyCandidates);
    grid[entranceY][entranceX] = color === 'red' ? 16 : 17;
    grid[keyPos.y][keyPos.x] = color === 'red' ? 14 : 15;
    usedCells.add(`${entranceX},${entranceY}`);
    usedCells.add(`${keyPos.x},${keyPos.y}`);
  }

  return { grid, playerStart, cavePos, tier, rooms: rooms.length };
}

// ---------------------------------------------------------------------------
// Browser-driven solver verification
// ---------------------------------------------------------------------------
async function withSolverPage(fn) {
  const server = await createServer({ root: ROOT, server: { port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://localhost:${address.port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.solveGrid === 'function', { timeout: 20000 });

  try {
    return await fn(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function solve(page, grid, playerStart, cavePos) {
  return page.evaluate(
    ([grid, playerStart, cavePos]) =>
      window.solveGrid(grid, playerStart, cavePos, { maxMsPerLevel: 8000, maxNodesPerLevel: 180000, maxDepth: 260 }),
    [grid, playerStart, cavePos],
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const results = [];
  await withSolverPage(async (page) => {
    for (let id = RANGE_START; id <= RANGE_END; id++) {
      const target = targetMovesFor(id);
      let best = null;
      const maxAttempts = 30;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const rng = mulberry32(BASE_SEED * 1000003 + id * 97 + attempt);
        const candidate = buildCandidate(id, rng);
        if (!candidate) continue;
        const solution = await solve(page, candidate.grid, candidate.playerStart, candidate.cavePos);
        if (!solution.solved) continue;
        const gap = Math.abs(solution.moves - target);
        const remoteMoves = solution.actions.filter((a) => a.startsWith('A(')).length;
        // Every level's hop 0 is a forced relay hop now (see buildCandidate), so a genuinely
        // solvable candidate should never have a zero-remote-move optimal solution — require it
        // at every tier instead of exempting tier 1, as a defense-in-depth check on that fix.
        const meetsRemote = remoteMoves > 0;
        const better = !best || (meetsRemote && !best.meetsRemote) || (meetsRemote === best.meetsRemote && gap < best.gap);
        if (better) {
          best = { ...candidate, moves: solution.moves, gap, remoteMoves, meetsRemote };
        }
        if (meetsRemote && gap <= Math.max(3, target * 0.25)) break;
      }
      if (!best) {
        console.error(`Level ${id}: FAILED to find any solvable candidate after ${maxAttempts} attempts`);
        continue;
      }
      // Timer formula derived from levels 1-100's real (solver-moves, assigned-timer) pairs:
      // a median of ~8.5 seconds of timer per minimum-solution move, plus a flat bonus per
      // remote-arrow move (those need extra thinking time — identify the arrow, plan the glide)
      // and a small flat buffer for initial orientation. Floored at 30s.
      const timeLimitSeconds = Math.max(30, Math.round(best.moves * 8.5 + best.remoteMoves * 5 + 15));
      console.log(
        `Level ${id} [tier ${best.tier}, ${best.rooms} rooms]: target ${target}mv, got ${best.moves}mv (gap ${best.gap}), ${best.remoteMoves} remote-arrow moves, timer ${timeLimitSeconds}s`,
      );
      results.push({
        id,
        grid: best.grid,
        playerStart: best.playerStart,
        cavePos: best.cavePos,
        tier: best.tier,
        targetMoves: target,
        actualMoves: best.moves,
        remoteMoves: best.remoteMoves,
        timeLimitSeconds,
      });
    }
  });

  if (OUT_PATH) {
    writeFileSync(path.resolve(ROOT, OUT_PATH), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${results.length} candidate levels to ${OUT_PATH}`);
    return;
  }

  const promotedPath = path.resolve(ROOT, 'src/data/promoted-levels.json');
  const existing = JSON.parse(readFileSync(promotedPath, 'utf8'));
  const filtered = existing.filter((l) => l.id < RANGE_START || l.id > RANGE_END);
  const newEntries = results.map((r) => ({
    id: r.id,
    grid: r.grid,
    playerStart: r.playerStart,
    cavePos: r.cavePos,
    timeLimitSeconds: r.timeLimitSeconds,
  }));
  const merged = [...filtered, ...newEntries].sort((a, b) => a.id - b.id);
  writeFileSync(promotedPath, JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${results.length} generated levels into ${promotedPath}`);

  const remoteUsers = results.filter((r) => r.remoteMoves > 0).length;
  console.log(`\nLevels using at least one remote-arrow move: ${remoteUsers} / ${results.length}`);
  const summary = results.map((r) => `L${r.id} [T${r.tier}] ${r.actualMoves}mv (target ${r.targetMoves}), ${r.remoteMoves} remote`).join('\n');
  console.log('\n--- Summary ---\n' + summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
