import { useCallback, useEffect, useRef, useState } from "react";
import { CellType, GameState, KeyInventory, Position } from "@/game/types";
import { isArrowCell, getArrowDirections } from "@/game/arrows";
import { buildGoalCaveKeySet, findGoalCaves } from "@/game/caves";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";
import { getNextTeleport, TELEPORT_CELL } from "@/game/teleport";
import {
  recordLevelCompletion,
  getCompletedLevelCount,
  type CampaignLevelRecord,
  type CampaignProgressState,
} from "@/lib/campaignProgress";
import type { Level } from "@/data/levels";
import { themes } from "@/data/levels";
import { startPlaySession, type PlaySessionEndReason } from "@/lib/playSessions";
import { saveRecordedRun, type RecordedInputCommand } from "@/lib/moveRecording";
import { touchLastSeen } from "@/lib/cloudProgress";

export type PlayerId = string;
export type FacingDirection = "up" | "right" | "down" | "left";

export type InputCommand =
  | { type: "move"; dx: number; dy: number; seq: number }
  | { type: "select"; x: number; y: number; seq: number }
  | { type: "deselect"; seq: number };

export type QueuedInputCommand =
  | { type: "move"; dx: number; dy: number }
  | { type: "select"; x: number; y: number }
  | { type: "deselect" };

export interface SimPlayer {
  id: PlayerId;
  pos: Position;
  facing: FacingDirection;
  isLocal: boolean;
  color: string;
  keys: KeyInventory;
  selectedArrow: Position | null;
  isGliding: boolean;
  glidePath: Position[] | null;
  glideArrowType: CellType | null;
  glideIndex: number;
  moves: number;
  teleportCycleTicksLeft: number;
  teleportWarpTicksLeft: number;
  teleportWarpFrom: Position | null;
  teleportWarpTo: Position | null;
}

export interface ArrowGlide {
  ownerId: PlayerId;
  from: Position;
  path: Position[];
  arrowType: CellType;
  index: number;
}

export interface SimulationState {
  grid: CellType[][];
  baseGrid: CellType[][];
  breakableRockStates: Map<string, boolean>;
  crumbleAnimations: Map<string, number>;
  players: Map<PlayerId, SimPlayer>;
  arrowGlides: ArrowGlide[];
  goalCaveKeys: Set<string>;
  cavePos: Position;
  tick: number;
}

export interface LevelCompletionSummary {
  levelId: number;
  moves: number;
  timeLeftSeconds: number | null;
  bestMoves: number | null;
  bestTimeLeftSeconds: number | null;
  isFirstClear: boolean;
  isNewBestMoves: boolean;
  isNewBestTime: boolean;
  completedCount: number;
  totalLevels: number;
}

export interface StoredLevelOverrideShape {
  grid?: unknown;
  hud3d?: unknown;
}

// —————————————————————— Constants (from original component) ————————————————

const TELEPORT_CYCLE_DELAY_TICKS = 60;
const TELEPORT_WARP_FLASH_TICKS = 60;
const TELEPORT_CYCLE_DELAY_SECONDS = Math.round(TELEPORT_CYCLE_DELAY_TICKS / 60);
const DEFAULT_RECORDED_WAIT_MS = Math.ceil(((TELEPORT_CYCLE_DELAY_TICKS + TELEPORT_WARP_FLASH_TICKS) / 60) * 1000);
const CRUMBLE_ANIMATION_TICKS = 42;
const PLAYER_GLIDE_DIV = 3;
const EMPTY_KEYS: KeyInventory = { red: 0, green: 0 };
const DEFAULT_BONUS_TIME_SECONDS = 50;
export const MAX_SESSION_RECORDED_INPUTS = 1000;

// —————————————————————— Helper functions (from original component) ————————————————

export const facingFromDelta = (dx: number, dy: number, fallback: FacingDirection): FacingDirection => {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  if (dy > 0) return "down";
  if (dy < 0) return "up";
  return fallback;
};

export const facingTowardTarget = (
  from: Position,
  target: Position,
  fallback: FacingDirection
): FacingDirection => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return facingFromDelta(dx, 0, fallback);
  }

  return facingFromDelta(0, dy, fallback);
};

export const deltaFromFacing = (facing: FacingDirection): { dx: number; dy: number } => {
  switch (facing) {
    case "up":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: 1, dy: 0 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    default:
      return { dx: 0, dy: -1 };
  }
};

export const dirKeyFromDelta = (dx: number, dy: number): "U" | "R" | "D" | "L" => {
  if (dx === 0 && dy === -1) return "U";
  if (dx === 1 && dy === 0) return "R";
  if (dx === 0 && dy === 1) return "D";
  return "L";
};

// —————————————————————— buildBaseGrid (from original) ————————————————

const buildBaseGrid = (levelGrid: CellType[][]): CellType[][] => {
  return levelGrid.map((row, y) =>
    row.map((cell, x) => {
      if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
        const adjacentCells: CellType[] = [];
        if (y > 0) adjacentCells.push(levelGrid[y - 1][x]);
        if (y < levelGrid.length - 1) adjacentCells.push(levelGrid[y + 1][x]);
        if (x > 0) adjacentCells.push(levelGrid[y][x - 1]);
        if (x < row.length - 1) adjacentCells.push(levelGrid[y][x + 1]);

        const terrainTypes = adjacentCells.filter(c =>
          c !== 7 && c !== 8 && c !== 9 && c !== 10 && c !== 11 && c !== 12 && c !== 13 && c !== 2 && c !== 6
        ).map((c) => (c === 18 || c === 19 || c === 20 ? 0 : c));

        if (terrainTypes.length > 0) {
          const counts = terrainTypes.reduce((acc, type) => {
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {} as Record<number, number>);

          const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
          return Number(mostCommon) as CellType;
        }
        return 0;
      }
      return cell;
    })
  ) as CellType[][];
};

// —————————————————————— Types for refs that stepSimulation / applyLevelState need ————————————————

export interface SessionCloseOutcome {
  completed: boolean;
  moves: number | null;
  timeLeftSeconds?: number | null;
  endReason: PlaySessionEndReason;
}

export interface EngineRefs {
  // Owned by component, shared with useGameControls
  simRef: React.MutableRefObject<SimulationState | null>;
  localPlayerIdRef: React.MutableRefObject<PlayerId>;
  inputQueueRef: React.MutableRefObject<Map<PlayerId, InputCommand[]>>;
  isReplayingRef: React.MutableRefObject<boolean>;
  recordMovesEnabledRef: React.MutableRefObject<boolean>;
  recordedActionsRef: React.MutableRefObject<RecordedInputCommand[]>;
  selectedArrowLogRef: React.MutableRefObject<{ x: number; y: number } | null>;
  hasCompletedRef: React.MutableRefObject<boolean>;

  // From useGameTimerSession
  timerEnabledRef: React.MutableRefObject<boolean>;
  timerRemainingMsRef: React.MutableRefObject<number>;
  currentPlaySessionIdRef: React.MutableRefObject<string | null>;
  currentPlaySessionLevelIdRef: React.MutableRefObject<number | null>;
  sessionStartInFlightRef: React.MutableRefObject<boolean>;
  pendingSessionEndReasonRef: React.MutableRefObject<PlaySessionEndReason>;
}

export interface EngineCallbacks {
  pushHudMessage: (message: string | null, duration?: number) => void;
  closeCurrentPlaySession: (outcome: SessionCloseOutcome) => void;
  commitCampaignProgress: (next: CampaignProgressState) => void;
  onSelectedArrowChange: (selected: { x: number; y: number } | null) => void;
  resetSessionActiveTime: () => void;
  resetLevelTimer: (limitSeconds: number | undefined) => void;
  addLevelTimeSeconds: (deltaSeconds: number) => void;
  setIsTimeUp: (up: boolean) => void;
}

export interface GameEngineConfig {
  // Level & game context
  level: Level | null;
  allLevels: Level[];
  currentLevelIndex: number;
  orderedLevelIds: number[];
  canSkipLevels: boolean;

  // Auth
  playerUserIdRef: React.MutableRefObject<string | null>;

  // Game flags (values, not refs)
  isReplaying: boolean;
  isTutorialActive: boolean;
  isBuilding: boolean;
  isTimeUp: boolean;
  isTimerArmed: boolean;
  hasStartedGame: boolean;
  selectedArrow: { x: number; y: number } | null;
  levelTimeLimitSeconds: number | null;

  // Campaign
  campaignProgressRef: React.MutableRefObject<CampaignProgressState>;

  // All refs (engine + controls + timer session)
  refs: EngineRefs;

  // All callbacks
  callbacks: EngineCallbacks;
}

// —————————————————————— Return interface ————————————————

export interface GameEngineReturn {
  renderGrid: CellType[][];
  renderPlayers: SimPlayer[];
  renderCavePos: Position;
  crumbleAnimations: Map<string, number>;
  moves: number;
  isComplete: boolean;
  completionSummary: LevelCompletionSummary | null;

  // Derived values
  localPlayer: SimPlayer | undefined;
  localPlayerPos: Position;
  redKeyCount: number;
  greenKeyCount: number;

  // Functions
  applyLevelState: (level: Level) => void;
}

// —————————————————————— Hook ————————————————

export function useGameEngine(config: GameEngineConfig): GameEngineReturn {
  const {
    level,
    allLevels,
    currentLevelIndex,
    orderedLevelIds,
    canSkipLevels,

    playerUserIdRef,

    isReplaying,
    isTutorialActive,
    isBuilding,
    isTimeUp,
    isTimerArmed,
    hasStartedGame,
    selectedArrow,
    levelTimeLimitSeconds,

    campaignProgressRef,

    refs,
    callbacks,
  } = config;

  const {
    simRef,
    localPlayerIdRef,
    inputQueueRef,
    isReplayingRef,
    recordMovesEnabledRef,
    recordedActionsRef,
    selectedArrowLogRef,
    hasCompletedRef,
    timerEnabledRef,
    timerRemainingMsRef,
    currentPlaySessionIdRef,
    currentPlaySessionLevelIdRef,
    sessionStartInFlightRef,
    pendingSessionEndReasonRef,
  } = refs;

  const {
    pushHudMessage,
    closeCurrentPlaySession,
    commitCampaignProgress,
    onSelectedArrowChange,
    resetSessionActiveTime,
    resetLevelTimer,
    addLevelTimeSeconds,
    setIsTimeUp,
  } = callbacks;

  // —— State owned by the engine ——

  const [renderGrid, setRenderGrid] = useState<CellType[][]>([]);
  const [renderPlayers, setRenderPlayers] = useState<SimPlayer[]>([]);
  const [renderCavePos, setRenderCavePos] = useState<Position>({ x: 0, y: 0 });
  const [crumbleAnimations, setCrumbleAnimations] = useState<Map<string, number>>(new Map());
  const [moves, setMoves] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<LevelCompletionSummary | null>(null);

  // —— Derived values ——

  const localPlayer = renderPlayers.find((p) => p.isLocal) ?? renderPlayers[0];
  const localPlayerPos: Position = localPlayer?.pos ?? { x: 0, y: 0 };
  const redKeyCount = Math.max(0, Math.floor(Number(localPlayer?.keys.red) || 0));
  const greenKeyCount = Math.max(0, Math.floor(Number(localPlayer?.keys.green) || 0));

  // —— applyLevelState ——

  const applyLevelState = useCallback((level: Level) => {
    const priorMoves = simRef.current?.players.get(localPlayerIdRef.current)?.moves ?? 0;
    const isRedundantReapply =
      level.id === currentPlaySessionLevelIdRef.current &&
      priorMoves === 0 &&
      (currentPlaySessionIdRef.current !== null || sessionStartInFlightRef.current);

    if (!isRedundantReapply) {
      if (currentPlaySessionIdRef.current) {
        const abandonedTimeLeftSeconds = timerEnabledRef.current
          ? Math.max(0, Math.ceil(timerRemainingMsRef.current / 1000))
          : null;
        closeCurrentPlaySession({
          completed: false,
          moves: priorMoves || null,
          timeLeftSeconds: abandonedTimeLeftSeconds,
          endReason: pendingSessionEndReasonRef.current,
        });
      }
      pendingSessionEndReasonRef.current = "level_changed";
      const sessionUserId = playerUserIdRef.current;
      if (sessionUserId && !isReplayingRef.current) {
        currentPlaySessionLevelIdRef.current = level.id;
        sessionStartInFlightRef.current = true;
        resetSessionActiveTime();
        void startPlaySession(sessionUserId, level.id).then((id) => {
          sessionStartInFlightRef.current = false;
          currentPlaySessionIdRef.current = id;
        });
      }
    }

    const gridCopy = level.grid.map(row => [...row]) as CellType[][];
    const baseGridCopy = buildBaseGrid(gridCopy);
    const rows = gridCopy.length;
    const cols = gridCopy[0]?.length ?? 0;

    const clampToGrid = (pos: Position): Position => {
      if (rows <= 0 || cols <= 0) return { x: 0, y: 0 };
      return {
        x: Math.max(0, Math.min(cols - 1, pos.x)),
        y: Math.max(0, Math.min(rows - 1, pos.y)),
      };
    };

    const actualGoalCaves = findGoalCaves(gridCopy, null);
    const cave = clampToGrid(actualGoalCaves[0] ?? { ...level.cavePos });
    const spawn = clampToGrid(level.playerStart);
    const localId = localPlayerIdRef.current;
    const localPlayer: SimPlayer = {
      id: localId,
      pos: { ...spawn },
      facing: facingTowardTarget(spawn, cave, "down"),
      isLocal: true,
      color: themes[level.theme ?? 'default']?.player ?? '#7dff9b',
      keys: { ...EMPTY_KEYS },
      selectedArrow: null,
      isGliding: false,
      glidePath: null,
      glideArrowType: null,
      glideIndex: 0,
      moves: 0,
      teleportCycleTicksLeft: 0,
      teleportWarpTicksLeft: 0,
      teleportWarpFrom: null,
      teleportWarpTo: null,
    };

    const players = new Map<PlayerId, SimPlayer>();
    players.set(localId, localPlayer);

    hasCompletedRef.current = false;
    simRef.current = {
      grid: gridCopy,
      baseGrid: baseGridCopy,
      breakableRockStates: new Map(),
      crumbleAnimations: new Map(),
      players,
      arrowGlides: [],
      goalCaveKeys: buildGoalCaveKeySet(gridCopy, null),
      cavePos: cave,
      tick: 0,
    };

    setRenderGrid(gridCopy.map(row => [...row]));
    setCrumbleAnimations(new Map());
    setRenderPlayers(Array.from(players.values()));
    setRenderCavePos(cave);
    setMoves(0);
    setIsComplete(false);
    setCompletionSummary(null);
    recordedActionsRef.current = [];
    selectedArrowLogRef.current = null;
    onSelectedArrowChange(null);
    resetLevelTimer(level.timeLimitSeconds);
  }, [
    closeCurrentPlaySession,
    currentPlaySessionIdRef,
    currentPlaySessionLevelIdRef,
    hasCompletedRef,
    isReplayingRef,
    localPlayerIdRef,
    onSelectedArrowChange,
    pendingSessionEndReasonRef,
    playerUserIdRef,
    recordedActionsRef,
    resetLevelTimer,
    resetSessionActiveTime,
    selectedArrowLogRef,
    sessionStartInFlightRef,
    simRef,
    timerEnabledRef,
    timerRemainingMsRef,
  ]);

  // —— stepSimulation ——

  const stepSimulation = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.tick += 1;

    let gridDirty = false;
    let playersDirty = false;
    let crumbleDirty = false;
    let localMoves = moves;
    let localSelected = selectedArrow;
    let localComplete = isComplete;

    // Advance arrow glides
    if (sim.arrowGlides.length > 0) {
      sim.arrowGlides = sim.arrowGlides.filter((glide) => {
        const next = glide.path[glide.index];
        const prev = glide.index === 0 ? glide.from : glide.path[glide.index - 1];
        if (!next) return false;

        if (glide.index === 0) sim.grid[glide.from.y][glide.from.x] = 5;
        else sim.grid[prev.y][prev.x] = sim.baseGrid[prev.y][prev.x];
        sim.grid[next.y][next.x] = glide.arrowType;
        glide.index += 1;
        gridDirty = true;

        if (glide.index >= glide.path.length) {
          const owner = sim.players.get(glide.ownerId);
          if (owner) {
            owner.isGliding = false;
            const newArrowPos = { x: next.x, y: next.y };
            const testState: GameState = {
              grid: sim.grid,
              baseGrid: sim.baseGrid,
              playerPos: owner.pos,
              inventory: owner.keys,
              selectedArrow: newArrowPos,
              breakableRockStates: sim.breakableRockStates,
              isGliding: false,
              isComplete: false,
            } as GameState;
            const dirs = [
              { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
            ];
            const canMove = dirs.some((dir) => attemptRemoteArrowMove(testState, dir.dx, dir.dy).glidePath);
            owner.selectedArrow = canMove ? newArrowPos : null;
            if (owner.isLocal) {
              localSelected = owner.selectedArrow;
            }
          }
          return false;
        }
        return true;
      });
    }

    // Advance crumble animations every simulation tick
    if (sim.crumbleAnimations.size > 0) {
      for (const [key, progress] of sim.crumbleAnimations.entries()) {
        const nextProgress = progress + 1;
        if (nextProgress >= CRUMBLE_ANIMATION_TICKS) {
          sim.crumbleAnimations.delete(key);
          crumbleDirty = true;
        } else {
          sim.crumbleAnimations.set(key, nextProgress);
          crumbleDirty = true;
        }
      }
    }

    // Advance player glides and inputs
    sim.players.forEach((player, id) => {
      if (player.isGliding && player.glidePath && player.glideIndex < player.glidePath.length) {
        if (sim.tick % PLAYER_GLIDE_DIV !== 0) {
          return;
        }
        const stepPos = player.glidePath[player.glideIndex];
        const prevPos = player.glideIndex === 0 ? player.pos : player.glidePath[player.glideIndex - 1];
        if (player.glideIndex === 0) {
          sim.grid[player.pos.y][player.pos.x] = 5;
        } else {
          sim.grid[prevPos.y][prevPos.x] = sim.baseGrid[prevPos.y][prevPos.x];
        }
        sim.grid[stepPos.y][stepPos.x] = player.glideArrowType ?? sim.grid[stepPos.y][stepPos.x];
        player.pos = { ...stepPos };
        player.facing = facingFromDelta(stepPos.x - prevPos.x, stepPos.y - prevPos.y, player.facing);
        player.glideIndex += 1;
        gridDirty = true;
        playersDirty = true;

        if (player.glideIndex >= player.glidePath.length) {
          player.isGliding = false;
          player.glidePath = null;
          player.glideArrowType = null;
          player.glideIndex = 0;
          player.moves += 1;
          if (player.isLocal) localMoves = player.moves;
        }
        return;
      }

      // Committed warp in progress
      if (player.teleportWarpTicksLeft > 0) {
        player.teleportWarpTicksLeft -= 1;
        if (player.teleportWarpTicksLeft <= 0) {
          const dest = player.teleportWarpTo;
          if (dest) {
            player.facing = facingFromDelta(dest.x - player.pos.x, dest.y - player.pos.y, player.facing);
            player.pos = { ...dest };
            player.teleportCycleTicksLeft = TELEPORT_CYCLE_DELAY_TICKS;
            if (player.isLocal) {
              pushHudMessage(`Teleporting again in ${TELEPORT_CYCLE_DELAY_SECONDS}s — act to break free!`, 1800);
            }
          }
          player.teleportWarpFrom = null;
          player.teleportWarpTo = null;
        }
        playersDirty = true;
        return;
      }

      if (player.isGliding) return;

      // Standing on a teleport pad
      if (player.teleportCycleTicksLeft > 0) {
        const pendingQueue = inputQueueRef.current.get(id);
        const nextQueued = pendingQueue && pendingQueue.length > 0 ? pendingQueue[0] : null;
        // Any queued input (move, arrow select, or deselect) counts as "taking control" and
        // breaks the auto-cycle — not just moves. Previously only 'move' qualified, so a queued
        // 'select' sat unprocessed at the front of the queue for as long as the pad kept
        // auto-warping, blocking every input behind it too. On a closed loop of teleport pads
        // that never stops auto-cycling on its own, that left the player permanently stuck: unable
        // to walk off and unable to select an arrow, since the stuck 'select' never got a turn.
        if (nextQueued) {
          player.teleportCycleTicksLeft = 0;
        } else {
          player.teleportCycleTicksLeft -= 1;
          if (player.teleportCycleTicksLeft <= 0) {
            const dest = getNextTeleport(sim.grid, player.pos);
            if (dest) {
              if (player.isLocal && !isReplayingRef.current && recordMovesEnabledRef.current) {
                recordedActionsRef.current.push({ type: "wait", durationMs: DEFAULT_RECORDED_WAIT_MS });
                if (recordedActionsRef.current.length > MAX_SESSION_RECORDED_INPUTS) {
                  recordedActionsRef.current.shift();
                }
                console.log("T");
              }
              player.teleportWarpFrom = { ...player.pos };
              player.teleportWarpTo = dest;
              player.teleportWarpTicksLeft = TELEPORT_WARP_FLASH_TICKS;
            }
          }
          playersDirty = true;
          return;
        }
      }

      const queue = inputQueueRef.current.get(id);
      if (!queue || queue.length === 0) return;

      const input = queue.shift();
      if (!input) return;

      if (input.type === 'select') {
        if (player.pos.x === input.x && player.pos.y === input.y) return;
        const cell = sim.grid[input.y]?.[input.x];
        if (cell !== undefined && isArrowCell(cell)) {
          player.selectedArrow = { x: input.x, y: input.y };
          if (player.isLocal) localSelected = player.selectedArrow;
        }
        return;
      }

      if (input.type === 'deselect') {
        player.selectedArrow = null;
        if (player.isLocal) localSelected = null;
        return;
      }

      if (input.type === 'move') {
        if (player.selectedArrow) {
          const state: GameState = {
            grid: sim.grid,
            baseGrid: sim.baseGrid,
            playerPos: player.pos,
            inventory: player.keys,
            selectedArrow: player.selectedArrow,
            breakableRockStates: sim.breakableRockStates,
            isGliding: false,
            isComplete: false,
          } as GameState;
          const outcome = attemptRemoteArrowMove(state, input.dx, input.dy);
          if (outcome.glidePath) {
            sim.arrowGlides.push({
              ownerId: player.id,
              from: { ...player.selectedArrow },
              path: outcome.glidePath.path,
              arrowType: outcome.glidePath.arrowType,
              index: 0,
            });
            player.isGliding = true;
            player.moves += 1;
            if (player.isLocal) localMoves = player.moves;
          }
          return;
        }

        const state: GameState = {
          grid: sim.grid,
          baseGrid: sim.baseGrid,
          playerPos: player.pos,
          inventory: player.keys,
          selectedArrow: player.selectedArrow,
          breakableRockStates: sim.breakableRockStates,
          isGliding: false,
          isComplete: false,
        } as GameState;
        const outcome = attemptPlayerMove(state, input.dx, input.dy);

        if (outcome.glidePath && outcome.startGlide) {
          const firstGlideStep = outcome.glidePath.path[0];
          if (firstGlideStep) {
            player.facing = facingFromDelta(
              firstGlideStep.x - player.pos.x,
              firstGlideStep.y - player.pos.y,
              player.facing,
            );
          } else {
            player.facing = facingFromDelta(input.dx, input.dy, player.facing);
          }
          player.isGliding = true;
          player.glidePath = outcome.glidePath.path;
          player.glideArrowType = outcome.glidePath.arrowType;
          player.glideIndex = 0;
          return;
        }

        if (outcome.newGrid) {
          sim.grid = outcome.newGrid as CellType[][];
          gridDirty = true;
        }
        if (outcome.newPlayerPos) {
          const oldPos = { ...player.pos };
          player.facing = facingFromDelta(
            outcome.newPlayerPos.x - player.pos.x,
            outcome.newPlayerPos.y - player.pos.y,
            player.facing,
          );
          player.pos = { ...outcome.newPlayerPos };
          playersDirty = true;
          if (sim.grid[player.pos.y]?.[player.pos.x] === TELEPORT_CELL) {
            player.teleportCycleTicksLeft = TELEPORT_CYCLE_DELAY_TICKS;
            if (player.isLocal) {
              pushHudMessage(`Teleporting in ${TELEPORT_CYCLE_DELAY_SECONDS}s — act to break free!`, 1800);
            }
          }
          if (outcome.brokeRock) {
            const rockKey = `${oldPos.x},${oldPos.y}`;
            sim.crumbleAnimations.set(rockKey, 0);
            crumbleDirty = true;
            if (player.isLocal) pushHudMessage("Rock crumbled");
          }
        }
        if (outcome.collectedKey && player.isLocal) {
          pushHudMessage(`${outcome.collectedKey.toUpperCase()} key collected`);
        }
        if (outcome.unlockedLock && player.isLocal) {
          pushHudMessage(`${outcome.unlockedLock.toUpperCase()} lock opened`);
        }
        if (outcome.collectedHourglass && player.isLocal) {
          const at = outcome.collectedHourglass;
          const key = `${at.x},${at.y}`;
          const raw = level?.hourglassBonusByCell?.[key];
          const bonus = Math.max(1, Math.min(86400, Math.round(Number(raw ?? DEFAULT_BONUS_TIME_SECONDS))));
          if (timerEnabledRef.current) {
            addLevelTimeSeconds(bonus);
            pushHudMessage(`+${bonus}s bonus time`, 1400);
          } else {
            pushHudMessage("Bonus time collected", 1400);
          }
        }
        if (outcome.consumedMove) {
          player.moves += 1;
          if (player.isLocal) localMoves = player.moves;
        }
      }
    });

    // Goal cave / completion check
    const localPlayer = sim.players.get(localPlayerIdRef.current);
    if (localPlayer && sim.goalCaveKeys.has(`${localPlayer.pos.x},${localPlayer.pos.y}`) && !localComplete && !hasCompletedRef.current) {
      localComplete = true;
      hasCompletedRef.current = true;
      const clearTimeLeftSeconds = timerEnabledRef.current
        ? Math.max(0, Math.ceil(timerRemainingMsRef.current / 1000))
        : null;
      const clearUpdate = recordLevelCompletion({
        progress: campaignProgressRef.current,
        levelId: level!.id,
        moves: localPlayer.moves,
        timeLeftSeconds: clearTimeLeftSeconds,
        nextLevelId: allLevels[currentLevelIndex + 1]?.id ?? null,
      });

      commitCampaignProgress(clearUpdate.progress);
      if (currentPlaySessionIdRef.current) {
        closeCurrentPlaySession({
          completed: true,
          moves: localPlayer.moves,
          timeLeftSeconds: clearTimeLeftSeconds,
          endReason: "completed",
        });
      }
      if (recordMovesEnabledRef.current && !isReplayingRef.current && recordedActionsRef.current.length > 0) {
        saveRecordedRun({
          levelId: level!.id,
          actions: recordedActionsRef.current,
          moves: localPlayer.moves,
          recordedAt: new Date().toISOString(),
        });
      }
      setCompletionSummary({
        levelId: level!.id,
        moves: localPlayer.moves,
        timeLeftSeconds: clearTimeLeftSeconds,
        bestMoves: clearUpdate.record.bestMoves,
        bestTimeLeftSeconds: clearUpdate.record.bestTimeLeftSeconds,
        isFirstClear: clearUpdate.isFirstClear,
        isNewBestMoves: clearUpdate.isNewBestMoves,
        isNewBestTime: clearUpdate.isNewBestTime,
        completedCount: getCompletedLevelCount(clearUpdate.progress, orderedLevelIds),
        totalLevels: allLevels.length,
      });
      setIsComplete(true);

      if (recordMovesEnabledRef.current && !isReplayingRef.current && recordedActionsRef.current.length > 0) {
        const moveLines: string[] = [];
        let activeArrow: { x: number; y: number } | null = null;
        for (const action of recordedActionsRef.current) {
          if (action.type === "select") {
            activeArrow = { x: action.x, y: action.y };
          } else if (action.type === "deselect") {
            activeArrow = null;
          } else if (action.type === "wait") {
            activeArrow = null;
            moveLines.push("T");
          } else if (action.type === "move") {
            const dir = action.dy === -1 ? "U" : action.dy === 1 ? "D" : action.dx === -1 ? "L" : "R";
            moveLines.push(activeArrow ? `A(${activeArrow.x},${activeArrow.y}):${dir}` : `P:${dir}`);
          }
        }
        console.log(`Level ${level!.id} complete • Moves: [${moveLines.join(", ")}]`);
      }

      const clearHighlights = [];
      if (clearUpdate.isFirstClear) clearHighlights.push("First clear");
      if (clearUpdate.isNewBestMoves) clearHighlights.push("Best moves");
      if (clearUpdate.isNewBestTime) clearHighlights.push("Best clock");

      pushHudMessage(
        clearHighlights.length > 0
          ? `Level ${level!.id} complete • ${clearHighlights.join(" • ")}`
          : `Level ${level!.id} complete • Moves ${localPlayer.moves}`,
        2600,
      );
    }

    // State updates
    if (gridDirty) setRenderGrid(sim.grid.map(row => [...row]));
    if (crumbleDirty) setCrumbleAnimations(new Map(sim.crumbleAnimations));
    if (playersDirty || gridDirty || crumbleDirty) setRenderPlayers(Array.from(sim.players.values()).map(p => ({ ...p, pos: { ...p.pos } })));
    if (localMoves !== moves) setMoves(localMoves);
    if (localSelected !== selectedArrow) onSelectedArrowChange(localSelected);
    if (sim.cavePos.x !== renderCavePos.x || sim.cavePos.y !== renderCavePos.y) setRenderCavePos(sim.cavePos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    moves,
    selectedArrow,
    isComplete,
    isReplayingRef,
    recordMovesEnabledRef,
    recordedActionsRef,
    campaignProgressRef,
    allLevels,
    currentLevelIndex,
    orderedLevelIds,
    level,
    pushHudMessage,
    addLevelTimeSeconds,
    closeCurrentPlaySession,
    commitCampaignProgress,
    onSelectedArrowChange,
    localPlayerIdRef,
    hasCompletedRef,
    currentPlaySessionIdRef,
    timerEnabledRef,
    timerRemainingMsRef,
    playerUserIdRef,
    renderCavePos.x,
    renderCavePos.y,
  ]);

  // —— rAF loop ——

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let accumulator = 0;
    const step = 1000 / 60;

    const frame = (now: number) => {
      const delta = now - last;
      last = now;
      accumulator += delta;
      while (accumulator >= step) {
        stepSimulation();
        accumulator -= step;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [stepSimulation]);

  return {
    renderGrid,
    renderPlayers,
    renderCavePos,
    crumbleAnimations,
    moves,
    isComplete,
    completionSummary,

    localPlayer,
    localPlayerPos,
    redKeyCount,
    greenKeyCount,

    applyLevelState,
  };
}
