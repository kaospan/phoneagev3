import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  BookOpen, Compass, Expand, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, PanelRightOpen, Pause, Play, RotateCcw, Settings2, SkipBack, SkipForward,
  Sparkles, Star, TimerReset, Volume2, VolumeX, ZoomIn, ZoomOut,
} from "lucide-react";
import { getAllLevels, normalizeHud3DSettings, themes, manualFallbackById } from "@/data/levels";
import { getMusicEnabled, setMusicEnabled, MUSIC_ENABLED_UPDATED_EVENT } from "@/lib/musicPrefs";
import phoneageMusicUrl from "@/assets/phoneage.mp3";
import { Game3D } from "./Game3D";
import { GameSprite2D } from "./GameSprite2D";
import { GameTop2D } from "./GameTop2D";
import { checkIsBetaTester } from "@/lib/betaTesters";
import {
  RECORD_MOVES_UPDATED_EVENT, getRecordMovesEnabled, getRecordedRun, saveRecordedRun,
  type RecordedInputCommand,
} from "@/lib/moveRecording";
import { Thumbstick } from "./Thumbstick";
import { GameState, KeyInventory, Position } from "@/game/types";
import { isArrowCell, getArrowDirections } from "@/game/arrows";
import { buildGoalCaveKeySet, findGoalCaves } from "@/game/caves";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";
import { solveGrid } from "@/lib/levelSolver";
import { getNextTeleport, TELEPORT_CELL } from "@/game/teleport";
import { buildLevelFromSources } from "@/lib/levelImageDetection";
import { LEVEL_OVERRIDES_UPDATED_EVENT, saveLevelOverride } from "@/lib/levelOverrides";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import {
  formatCampaignClock, getCompletedLevelCount, getHighestUnlockedLevelIndex,
  getLevelCampaignRecord, loadCampaignProgress, recordLevelCompletion, resetCampaignProgress,
  saveCampaignProgress, setLastPlayedLevel, syncCampaignProgress,
  type CampaignLevelRecord, type CampaignProgressState,
} from "@/lib/campaignProgress";
import { usePlayerSession } from "@/contexts/PlayerSessionContext";
import { fetchCloudProgress, pushLevelProgress, pushProfileMeta, resetCloudProgress, touchLastSeen } from "@/lib/cloudProgress";
import { startPlaySession, endPlaySession, type PlaySessionEndReason } from "@/lib/playSessions";
import { usePlayerPresence } from "@/hooks/usePlayerPresence";
import { TutorialOverlay } from "./TutorialOverlay";
import { TUTORIAL_DEFINITIONS, getTutorialDefinition } from "@/lib/tutorials/tutorialDefinitions";
import type { TutorialDefinition } from "@/lib/tutorials/tutorialTypes";
import {
  TUTORIALS_ENABLED_UPDATED_EVENT, getSeenTutorials, getTutorialsEnabled,
  markTutorialSeen, resetSeenTutorials, setTutorialsEnabled,
} from "@/lib/tutorials/tutorialProgress";
import { useIsMobile } from "@/hooks/use-mobile";
import { CampaignDialog, type CampaignDialogLevel } from "./CampaignDialog";
import { CampaignJourneyOverlay } from "./CampaignJourneyOverlay";
import { hasSeenCampaignIntro, markCampaignIntroSeen } from "@/lib/campaignIntroSeen";
import { getRemoteArrowHintDone, setRemoteArrowHintDone } from "@/lib/interactiveHints";
import {
  DISABLED_VIEW_MODES_UPDATED_EVENT, getDisabledViewModes, subscribeToDisabledViewModes,
} from "@/lib/viewModePrefs";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { TouchControls } from "./TouchControls";
import { getLevelImageUrl } from "@/components/level-mapper/levelImageStore";
import menuArt from "@/assets/menu.png";
import { useGameEngine, type SimulationState, type SessionCloseOutcome } from "@/hooks/useGameEngine";
import { useGameControls } from "@/hooks/useGameControls";
import { useCameraGestures, CAMERA_ZOOM_LEVELS, DEFAULT_CAMERA_ZOOM_INDEX } from "@/hooks/useCameraGestures";
import { useGameTimerSession } from "@/hooks/useGameTimerSession";
import { GameHudTop } from "@/shell/GameHudTop";

const RECORDED_REPLAY_BASE_INTERVAL_MS = 220;
const REPLAY_SPEED_MIN = 0.25;
const REPLAY_SPEED_MAX = 3;
const REPLAY_SPEED_STEP = 0.25;
const IDLE_ARROW_HINT_MS = 2500;
const BOTTOM_HUD_CLEARANCE_PX = 60;
const VIEW_SWITCHER_ADMIN_EMAIL = "kaospen@gmail.com";
const ENABLE_3D_GAMEPLAY_REDESIGN = true;

export const VIEW_MODES = ["3d", "fps", "2d", "sprite", "top"] as const;
export type ViewMode = typeof VIEW_MODES[number];

const devLog = (...args: unknown[]) => { if (import.meta.env.DEV) console.log(...args); };
devLog("📦 PuzzleGame.tsx loading...");

type PlayerId = string;
type FacingDirection = "up" | "right" | "down" | "left";

type InputCommand =
  | { type: "move"; dx: number; dy: number; seq: number }
  | { type: "select"; x: number; y: number; seq: number }
  | { type: "deselect"; seq: number };

const isSafeIntegerInRange = (value: unknown, min: number, max: number): value is number =>
  Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;

const isCardinalDelta = (dx: unknown, dy: unknown): dx is number =>
  (dx === 0 && (dy === -1 || dy === 1)) || (dy === 0 && (dx === -1 || dx === 1));

const parseInputCommand = (input: unknown): InputCommand | null => {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Record<string, unknown>;
  if (candidate.type === "move") {
    if (!isCardinalDelta(candidate.dx, candidate.dy)) return null;
    if (!isSafeIntegerInRange(candidate.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: "move", dx: candidate.dx, dy: candidate.dy as number, seq: candidate.seq };
  }
  if (candidate.type === "select") {
    if (!isSafeIntegerInRange(candidate.x, 0, 255)) return null;
    if (!isSafeIntegerInRange(candidate.y, 0, 255)) return null;
    if (!isSafeIntegerInRange(candidate.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: "select", x: candidate.x, y: candidate.y, seq: candidate.seq };
  }
  if (candidate.type === "deselect") {
    if (!isSafeIntegerInRange(candidate.seq, 1, Number.MAX_SAFE_INTEGER)) return null;
    return { type: "deselect", seq: candidate.seq };
  }
  return null;
};

const EMPTY_KEYS: KeyInventory = { red: 0, green: 0 };
const DEFAULT_BONUS_TIME_SECONDS = 50;
const TELEPORT_CYCLE_DELAY_TICKS = 60;
const TELEPORT_WARP_FLASH_TICKS = 60;
const DEFAULT_RECORDED_WAIT_MS = Math.ceil(((TELEPORT_CYCLE_DELAY_TICKS + TELEPORT_WARP_FLASH_TICKS) / 60) * 1000);
const CRUMBLE_ANIMATION_TICKS = 42;

const distanceBetweenTouches = (t1: Pick<Touch, "clientX" | "clientY">, t2: Pick<Touch, "clientX" | "clientY">) =>
  Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

const facingFromDelta = (dx: number, dy: number, fallback: FacingDirection): FacingDirection => {
  if (dx > 0) return "right"; if (dx < 0) return "left";
  if (dy > 0) return "down"; if (dy < 0) return "up";
  return fallback;
};

const facingTowardTarget = (from: Position, target: Position, fallback: FacingDirection): FacingDirection => {
  const dx = target.x - from.x; const dy = target.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return facingFromDelta(dx, 0, fallback);
  return facingFromDelta(0, dy, fallback);
};

const deltaFromFacing = (facing: FacingDirection): { dx: number; dy: number } => {
  switch (facing) {
    case "up": return { dx: 0, dy: -1 }; case "right": return { dx: 1, dy: 0 };
    case "down": return { dx: 0, dy: 1 }; case "left": return { dx: -1, dy: 0 };
    default: return { dx: 0, dy: -1 };
  }
};

const dirKeyFromDelta = (dx: number, dy: number): "U" | "R" | "D" | "L" => {
  if (dx === 0 && dy === -1) return "U"; if (dx === 1 && dy === 0) return "R";
  if (dx === 0 && dy === 1) return "D"; return "L";
};

type LevelData = ReturnType<typeof getAllLevels>[number];

interface LevelCompletionSummary {
  levelId: number; moves: number; timeLeftSeconds: number | null;
  bestMoves: number | null; bestTimeLeftSeconds: number | null;
  isFirstClear: boolean; isNewBestMoves: boolean; isNewBestTime: boolean;
  completedCount: number; totalLevels: number;
}

type BrowserFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void; msExitFullscreen?: () => Promise<void> | void;
};
type BrowserFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void; msRequestFullscreen?: () => Promise<void> | void;
};

interface TutorialSettingsPopoverProps {
  enabled: boolean;
  onToggleEnabled: () => void;
  onReplay: () => void;
  onReplaySingle: () => void;
}

const TutorialSettingsPopover = ({ enabled, onToggleEnabled, onReplay, onReplaySingle }: TutorialSettingsPopoverProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 text-base hover:bg-primary/20" title="Tutorial settings" aria-label="Tutorial settings">
        <Settings2 className="h-4 w-4" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="end" className="w-64 space-y-3">
      <label htmlFor="tutorials-enabled" className="flex items-center justify-between gap-3 text-sm font-medium">
        Show tutorials
        <Checkbox id="tutorials-enabled" checked={enabled} onCheckedChange={() => onToggleEnabled()} />
      </label>
      <Button variant="outline" size="sm" className="w-full" onClick={onReplay}>Replay all tutorials</Button>
      <Button variant="outline" size="sm" className="w-full" onClick={onReplaySingle}>Replay this level's tutorial</Button>
    </PopoverContent>
  </Popover>
);

export const PuzzleGame = () => {
  devLog("⚛️ PuzzleGame component rendering...");

  const playerSession = usePlayerSession();
  const playerUserId = playerSession?.user?.id ?? null;
  const playerEmail = playerSession?.user?.email ?? null;
  const isPrimaryLevelSkipAdmin = playerEmail?.trim().toLowerCase() === VIEW_SWITCHER_ADMIN_EMAIL;
  const canUseViewSwitcher = isPrimaryLevelSkipAdmin;
  const playerUserIdRef = useRef<string | null>(playerUserId);
  useEffect(() => { playerUserIdRef.current = playerUserId; }, [playerUserId]);

  const isMobile = useIsMobile();
  const [isPortrait, setIsPortrait] = useState(false);
  const [hasMeasuredOrientation, setHasMeasuredOrientation] = useState(false);
  const shouldRotateGate = false;
  const isMobilePortrait = isMobile && isPortrait;
  const showRotateHint = false;
  const isMobileLandscape = isMobile && hasMeasuredOrientation && !isPortrait;

  const [isFullscreenMode, setIsFullscreenMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("stone-age-fullscreen-mode") === "1"; } catch { return false; }
  });
  const [showThumbstick, setShowThumbstick] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("stone-age-show-thumbstick") === "1"; } catch { return false; }
  });
  const prevZoomIndexRef = useRef<number | null>(null);
  const autoMobileFullscreenAppliedRef = useRef(false);
  const topHudBarRef = useRef<HTMLDivElement | null>(null);
  const bottomHudBarRef = useRef<HTMLDivElement | null>(null);
  const [topHudBarPx, setTopHudBarPx] = useState(0);
  const [bottomHudBarPx, setBottomHudBarPx] = useState(0);
  const [fitRevision, setFitRevision] = useState(0);
  const initialCampaignProgressRef = useRef<CampaignProgressState | null>(null);
  if (initialCampaignProgressRef.current == null) initialCampaignProgressRef.current = loadCampaignProgress();

  const [currentLevelIndex, setCurrentLevelIndex] = useState(() =>
    Math.max(0, (initialCampaignProgressRef.current?.lastPlayedLevelId ?? 1) - 1)
  );
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgressState>(
    () => initialCampaignProgressRef.current ?? loadCampaignProgress()
  );
  const [overrideRevision, setOverrideRevision] = useState(0);
  const [isVerifiedBetaTester, setIsVerifiedBetaTester] = useState(false);
  const canSkipLevels = isPrimaryLevelSkipAdmin || isVerifiedBetaTester;
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayActions, setReplayActions] = useState<RecordedInputCommand[]>([]);
  const [replayStepIndex, setReplayStepIndex] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const [resolvedLevelImageUrl, setResolvedLevelImageUrl] = useState<string | null>(null);
  const [tutorialQueue, setTutorialQueue] = useState<TutorialDefinition[]>([]);
  const [tutorialsEnabled, setTutorialsEnabledState] = useState(() => getTutorialsEnabled());
  const isTutorialActive = tutorialQueue.length > 0;
  const [remoteArrowHintStage, setRemoteArrowHintStage] = useState<"select" | "move" | "deselect" | null>(null);
  const remoteArrowHintMoveOriginRef = useRef<{ x: number; y: number } | null>(null);
  const [musicEnabled, setMusicEnabledState] = useState(() => getMusicEnabled());
  const musicElRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = musicElRef.current;
    if (!el) return;
    if (musicEnabled) {
      // Browsers block autoplay-with-sound until the page has seen a user gesture; by the time
      // this component mounts, signing in through PlayerAuthGate has already provided one, so
      // this normally succeeds. Swallow a rejection rather than throw if it's still blocked.
      void el.play().catch(() => {});
    } else {
      el.pause();
    }
  }, [musicEnabled]);
  const [selectedArrow, setSelectedArrow] = useState<{ x: number, y: number } | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<string>("");
  const [networkStatus, setNetworkStatus] = useState<"offline" | "connecting" | "online">("offline");
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const hudMessageTimeoutRef = useRef<number | null>(null);
  const [showArrowSelectHint, setShowArrowSelectHint] = useState(false);
  const arrowSelectHintSeenRef = useRef<boolean>((() => { try { return localStorage.getItem("arrowSelectHintSeen") === "1"; } catch { return false; } })());
  const arrowSelectHintTimeoutRef = useRef<number | null>(null);
  const [leftShellPanelOpen, setLeftShellPanelOpen] = useState(false);
  const [rightShellPanelOpen, setRightShellPanelOpen] = useState(false);
  const [showGameTools, setShowGameTools] = useState(true);
  const [showCampaignIntro, setShowCampaignIntro] = useState(false);
  const campaignProgressRef = useRef<CampaignProgressState>(initialCampaignProgressRef.current ?? loadCampaignProgress());
  const didRestoreCampaignLevelRef = useRef(false);
  const cloudProgressSettledRef = useRef(false);
  const [cloudProgressSettledTick, setCloudProgressSettledTick] = useState(0);
  const applyingCloudProgressRef = useRef(false);
  const pendingLevelTransitionRef = useRef<{ fromLevelId: number; toLevelId: number; toIndex: number } | null>(null);
  const [pendingLevelTransition, setPendingLevelTransition] = useState<{ fromLevelId: number; toLevelId: number; toIndex: number } | null>(null);

  const allLevels = useMemo(() => { void overrideRevision; return getAllLevels(); }, [overrideRevision]);
  const currentLevel = allLevels[Math.min(currentLevelIndex, Math.max(0, allLevels.length - 1))] ?? allLevels[0];
  const orderedLevelIds = useMemo(() => allLevels.map((level) => level.id), [allLevels]);
  usePlayerPresence(playerUserId, playerEmail, currentLevel?.id ?? null);
  const commitCampaignProgress = useCallback((next: CampaignProgressState) => {
    if (next === campaignProgressRef.current) return;
    const prev = campaignProgressRef.current;
    campaignProgressRef.current = next;
    saveCampaignProgress(next);
    setCampaignProgress(next);
    const userId = playerUserIdRef.current;
    if (userId && !applyingCloudProgressRef.current) {
      for (const [levelIdStr, record] of Object.entries(next.levels)) {
        if (prev.levels[levelIdStr] === record) continue;
        void pushLevelProgress(userId, Number(levelIdStr), record as CampaignLevelRecord);
      }
      if (next.highestUnlockedLevelId !== prev.highestUnlockedLevelId || next.lastPlayedLevelId !== prev.lastPlayedLevelId) {
        void pushProfileMeta(userId, { highestUnlockedLevelId: next.highestUnlockedLevelId, lastPlayedLevelId: next.lastPlayedLevelId });
      }
    }
  }, []);
  useEffect(() => { campaignProgressRef.current = campaignProgress; }, [campaignProgress]);

  useEffect(() => {
    if (!playerUserId) { cloudProgressSettledRef.current = true; setCloudProgressSettledTick((t) => t + 1); return; }
    let cancelled = false;
    (async () => {
      const cloud = await fetchCloudProgress(playerUserId);
      if (cancelled) return;
      if (cloud) { applyingCloudProgressRef.current = true; commitCampaignProgress(cloud); applyingCloudProgressRef.current = false; }
      cloudProgressSettledRef.current = true;
      setCloudProgressSettledTick((t) => t + 1);
    })();
    return () => { cancelled = true; };
  }, [playerUserId, commitCampaignProgress]);

  const updateCampaignProgress = useCallback((updater: (prev: CampaignProgressState) => CampaignProgressState) => {
    const next = updater(campaignProgressRef.current);
    commitCampaignProgress(next);
  }, [commitCampaignProgress]);

  const pushHudMessage = useCallback((message: string | null, duration = 1800) => {
    if (hudMessageTimeoutRef.current != null) { window.clearTimeout(hudMessageTimeoutRef.current); hudMessageTimeoutRef.current = null; }
    setHudMessage(message);
    if (!message) return;
    hudMessageTimeoutRef.current = window.setTimeout(() => {
      setHudMessage((current) => (current === message ? null : current));
      hudMessageTimeoutRef.current = null;
    }, duration);
  }, []);
  useEffect(() => { return () => { if (hudMessageTimeoutRef.current != null) window.clearTimeout(hudMessageTimeoutRef.current); }; }, []);

  const flashPlayerHighlight = useCallback(() => {}, []);

  const simRef = useRef<SimulationState | null>(null);
  const localPlayerIdRef = useRef<PlayerId>("local");
  const inputQueueRef = useRef<Map<PlayerId, InputCommand[]>>(new Map());
  const inputSeqRef = useRef(0);
  const lastInputAtRef = useRef<number>(Date.now());
  const recordedActionsRef = useRef<RecordedInputCommand[]>([]);
  const recordMovesEnabledRef = useRef(false);
  const isReplayingRef = useRef(false);
  const selectedArrowLogRef = useRef<{ x: number; y: number } | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const hasCompletedRef = useRef(false);
  const pendingSessionEndReasonRef = useRef<PlaySessionEndReason>("level_changed");
  const sessionStartInFlightRef = useRef(false);
  const currentPlaySessionIdRef = useRef<string | null>(null);
  const currentPlaySessionLevelIdRef = useRef<number | null>(null);
  const replayIntervalRef = useRef<number | null>(null);
  const replayActionsRef = useRef<RecordedInputCommand[]>([]);
  const replayStepIndexRef = useRef(0);

  const [isPaused, setIsPaused] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "fps" | "2d" | "sprite" | "top">(() => {
    if (typeof window === "undefined") return "3d";
    try { const stored = localStorage.getItem("stone-age-view-mode"); if (stored && ["3d","fps","2d","sprite","top"].includes(stored)) return stored as ViewMode; } catch { /* ignore storage errors */ }
    return "3d";
  });
  const [disabledViewModes, setDisabledViewModes] = useState<Set<ViewMode>>(() => new Set(getDisabledViewModes()));

  // useGameTimerSession is constructed before useGameEngine (the engine depends on the
  // session's timer refs/callbacks), so engine.isComplete can't be threaded in directly.
  // Mirror it through state just to break that cycle; every other read below uses
  // engine.isComplete directly.
  const [engineIsCompleteMirror, setEngineIsCompleteMirror] = useState(false);

  // Forwarding refs so useGameControls always calls the fully-featured versions of these
  // callbacks (defined further down, after applyLevelState/session/engine are available)
  // instead of a second, divergent inline implementation.
  const resetLevelRef = useRef<() => void>(() => {});
  const goToLevelIndexRef = useRef<(nextIndex: number) => boolean>(() => false);
  const startGameFromTitleRef = useRef<() => void>(() => {});
  const startLevelWhenReadyRef = useRef<() => void>(() => {});

  const session = useGameTimerSession({
    currentLevel, playerUserId, isComplete: engineIsCompleteMirror, isBuilding: isBuilding, isReplaying: isReplaying, isPaused: isPaused,
    onPushHudMessage: pushHudMessage,
  });

  const engine = useGameEngine({
    level: currentLevel, currentLevelIndex, allLevels, orderedLevelIds, canSkipLevels,
    playerUserIdRef, isReplaying: isReplaying, isTutorialActive: isTutorialActive,
    isBuilding: isBuilding, isTimeUp: session.isTimeUp, isTimerArmed: session.isTimerArmed,
    hasStartedGame: session.hasStartedGame, selectedArrow, levelTimeLimitSeconds: session.levelTimeLimitSeconds,
    campaignProgressRef,
    refs: {
      simRef, localPlayerIdRef, inputQueueRef, hasCompletedRef, isReplayingRef, recordMovesEnabledRef,
      recordedActionsRef, selectedArrowLogRef,
      timerEnabledRef: session.timerEnabledRef, timerRemainingMsRef: session.timerRemainingMsRef,
      currentPlaySessionIdRef: session.currentPlaySessionIdRef,
      currentPlaySessionLevelIdRef: session.currentPlaySessionLevelIdRef,
      sessionStartInFlightRef: session.sessionStartInFlightRef,
      pendingSessionEndReasonRef: session.pendingSessionEndReasonRef,
    },
    callbacks: {
      pushHudMessage, closeCurrentPlaySession: session.closeCurrentPlaySession,
      commitCampaignProgress, onSelectedArrowChange: (selected) => setSelectedArrow(selected),
      resetSessionActiveTime: session.resetSessionActiveTime, resetLevelTimer: session.resetLevelTimer,
      addLevelTimeSeconds: session.addLevelTimeSeconds, setIsTimeUp: () => {},
    },
  });

  useEffect(() => { setEngineIsCompleteMirror(engine.isComplete); }, [engine.isComplete]);

  // Canonical, zero-lag reads — no local mirror state, so these can't drift from the
  // hooks that actually own them.
  const moves = engine.moves;
  const isComplete = engine.isComplete;
  const completionSummary = engine.completionSummary;
  const timeLeftSeconds = session.timeLeftSeconds;
  const isTimeUp = session.isTimeUp;
  const isTimerArmed = session.isTimerArmed;
  const hasStartedGame = session.hasStartedGame;
  const levelTimeLimitSeconds = session.levelTimeLimitSeconds;
  const isWaitingToStart = !!levelTimeLimitSeconds && !isTimerArmed && !isTimeUp;

  const controls = useGameControls({
    localPlayerPos: engine.localPlayerPos, localPlayerIsGliding: engine.localPlayer?.isGliding ?? false,
    selectedArrow, renderGrid: engine.renderGrid, viewMode, isMobilePortrait,
    isBuilding: isBuilding, isComplete: engine.isComplete, isTimeUp: session.isTimeUp,
    shouldRotateGate: shouldRotateGate, isWaitingToStart, isReplaying: isReplaying,
    isTutorialActive: isTutorialActive, hasStartedGame: session.hasStartedGame,
    currentLevelIndex, allLevelsLength: allLevels.length,
    simRef, inputQueueRef, localPlayerIdRef, inputSeqRef, lastInputAtRef,
    recordedActionsRef, recordMovesEnabledRef, isReplayingRef, selectedArrowLogRef, wsRef,
    pushHudMessage, flashPlayerHighlight,
    resetLevel: () => resetLevelRef.current(),
    goToLevelIndex: (nextIndex) => goToLevelIndexRef.current(nextIndex),
    startGameFromTitle: () => startGameFromTitleRef.current(),
    startLevelWhenReady: () => startLevelWhenReadyRef.current(),
  });

  const camera = useCameraGestures({
    renderGrid: engine.renderGrid, viewMode, isMobilePortrait, isMobile,
    onPushHudMessage: pushHudMessage,
  });

  const resetLevelTimer = useCallback((limitSeconds: number | undefined) => { session.resetLevelTimer(limitSeconds); }, [session]);
  const addLevelTimeSeconds = useCallback((deltaSeconds: number) => { session.addLevelTimeSeconds(deltaSeconds); }, [session]);
  const closeCurrentPlaySession = useCallback((outcome: SessionCloseOutcome) => { session.closeCurrentPlaySession(outcome); }, [session]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      if (next) {
        session.setIsTimerArmed(false);
        pushHudMessage("Paused", 1800);
      } else {
        session.setIsTimerArmed(true);
        pushHudMessage("Resumed", 1800);
      }
      return next;
    });
  }, [session, pushHudMessage]);

  const goToLevelIndex = useCallback((nextIndex: number) => {
    if (isTutorialActive) return false;
    if (nextIndex < 0 || nextIndex >= allLevels.length) return false;
    if (!canSkipLevels && nextIndex > getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds)) {
      const currentFrontier = allLevels[Math.min(getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds), allLevels.length - 1)];
      const nextLocked = allLevels[nextIndex];
      if (currentFrontier && nextLocked) pushHudMessage(`Complete Level ${currentFrontier.id} to unlock Level ${nextLocked.id}.`, 2200);
      else pushHudMessage("Complete the frontier level to unlock more stages.", 2200);
      return false;
    }
    pendingSessionEndReasonRef.current = "level_changed";
    setSelectedArrow(null); camera.setCameraOffset({ x: 0, z: 0 }); setCurrentLevelIndex(nextIndex);
    return true;
  }, [allLevels, campaignProgress, orderedLevelIds, canSkipLevels, isTutorialActive, pushHudMessage]);

  const goToLevelId = useCallback((levelId: number) => {
    const nextIndex = allLevels.findIndex((level) => level.id === levelId);
    if (nextIndex < 0) return false;
    return goToLevelIndex(nextIndex);
  }, [allLevels, goToLevelIndex]);

  const handleStartOver = useCallback(() => {
    const fresh = resetCampaignProgress();
    campaignProgressRef.current = fresh;
    setCampaignProgress(fresh);
    const userId = playerUserIdRef.current;
    if (userId) void resetCloudProgress(userId);
    goToLevelIndex(0);
    pushHudMessage("Progress reset — starting over from Level 1", 2600);
  }, [goToLevelIndex, pushHudMessage]);

  const applyLevelState = useCallback((level: LevelData) => {
    engine.applyLevelState(level);
    setSelectedArrow(null);
    camera.setCameraOffset({ x: 0, z: 0 });
    resetLevelTimer(level.timeLimitSeconds);
  }, [engine, camera, resetLevelTimer]);

  // Nothing else loads the level into the simulation when currentLevel changes (only
  // explicit reset/replay called applyLevelState) — without this, navigating to a new
  // level never actually loads its grid; the sim silently keeps running the old one.
  useEffect(() => {
    if (!currentLevel) return;
    applyLevelState(currentLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLevel?.id]);

  useEffect(() => {
    if (allLevels.length === 0) return;
    updateCampaignProgress((prev) => syncCampaignProgress(prev, orderedLevelIds));
  }, [allLevels.length, orderedLevelIds, updateCampaignProgress]);

  useEffect(() => {
    if (didRestoreCampaignLevelRef.current) return;
    if (allLevels.length === 0) return;
    if (!cloudProgressSettledRef.current) return;
    didRestoreCampaignLevelRef.current = true;
    const savedLevelId = campaignProgressRef.current.lastPlayedLevelId;
    if (savedLevelId == null) { setCurrentLevelIndex((index) => Math.min(index, allLevels.length - 1)); return; }
    const exactIndex = allLevels.findIndex((level) => level.id === savedLevelId);
    if (exactIndex >= 0) { setCurrentLevelIndex(exactIndex); return; }
    setCurrentLevelIndex((index) => Math.min(index, allLevels.length - 1));
  }, [allLevels, cloudProgressSettledTick]);

  useEffect(() => {
    if (!currentLevel) return;
    updateCampaignProgress((prev) => setLastPlayedLevel(prev, currentLevel.id));
  }, [currentLevel, updateCampaignProgress]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia?.('(orientation: portrait)');
    const update = () => {
      const portrait = mql ? mql.matches : window.innerHeight > window.innerWidth;
      setIsPortrait(portrait); setHasMeasuredOrientation(true);
    };
    update();
    mql?.addEventListener?.('change', update);
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true } as AddEventListenerOptions);
    return () => {
      mql?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update as EventListener);
      window.removeEventListener('orientationchange', update as EventListener);
    };
  }, []);

  // Measures the floating top/bottom HUD bars' real rendered heights so the rotated mobile-portrait
  // board (below) can reserve exactly that much clearance instead of guessing a fixed inset.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const topEl = topHudBarRef.current;
    const bottomEl = bottomHudBarRef.current;
    const topObserver = topEl
      ? new ResizeObserver((entries) => setTopHudBarPx(entries[0]?.contentRect.height ?? 0))
      : null;
    const bottomObserver = bottomEl
      ? new ResizeObserver((entries) => setBottomHudBarPx(entries[0]?.contentRect.height ?? 0))
      : null;
    if (topEl && topObserver) topObserver.observe(topEl);
    if (bottomEl && bottomObserver) bottomObserver.observe(bottomEl);
    return () => {
      topObserver?.disconnect();
      bottomObserver?.disconnect();
    };
  }, [isMobilePortrait, showGameTools]);

  useEffect(() => {
    if (!isMobile || !hasMeasuredOrientation) { autoMobileFullscreenAppliedRef.current = false; return; }
    if (!isMobileLandscape) { autoMobileFullscreenAppliedRef.current = false; return; }
    if (autoMobileFullscreenAppliedRef.current) return;
    autoMobileFullscreenAppliedRef.current = true;
    setIsFullscreenMode(true); camera.setUserZoomTouched(false); camera.setCameraOffset({ x: 0, z: 0 }); setSelectedArrow(null);
  }, [hasMeasuredOrientation, isMobile, isMobileLandscape]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setFitRevision((v) => v + 1);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize as EventListener);
  }, []);

  useLayoutEffect(() => {
    if (!hasStartedGame || isBuilding) return;
    const el = camera.gestureSurfaceRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      camera.setCameraOffset({ x: 0, z: 0 });
    });
    return () => cancelAnimationFrame(raf);
  }, [fitRevision, hasStartedGame, isBuilding, isFullscreenMode, viewMode]);

  useEffect(() => { camera.setCameraZoomIndex(isMobilePortrait ? camera.fitToWidthZoomIndex : DEFAULT_CAMERA_ZOOM_INDEX); camera.setUserZoomTouched(false); }, [currentLevelIndex]);
  useEffect(() => { if (isMobilePortrait && !camera.userZoomTouched) camera.setCameraZoomIndex(camera.fitToWidthZoomIndex); }, [isMobilePortrait, camera.userZoomTouched, camera.fitToWidthZoomIndex]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("stone-age-view-mode", viewMode); } catch { /* ignore storage errors */ }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("stone-age-fullscreen-mode", isFullscreenMode ? "1" : "0"); } catch { /* ignore storage errors */ }
  }, [isFullscreenMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem("stone-age-show-thumbstick", showThumbstick ? "1" : "0"); } catch { /* ignore storage errors */ }
  }, [showThumbstick]);

  const resetLevel = useCallback(() => {
    if (isTutorialActive) return;
    const levelToReset = currentLevel;
    if (!levelToReset) return;
    pendingSessionEndReasonRef.current = "restarted";
    applyLevelState(levelToReset);
    pushHudMessage("Level reset");
  }, [isTutorialActive, currentLevel, applyLevelState, pushHudMessage]);

  resetLevelRef.current = resetLevel;
  goToLevelIndexRef.current = goToLevelIndex;

  const clearReplayTimer = useCallback(() => {
    if (replayIntervalRef.current != null) { window.clearTimeout(replayIntervalRef.current); replayIntervalRef.current = null; }
  }, []);

  const stopReplay = useCallback(() => {
    clearReplayTimer(); isReplayingRef.current = false; setIsReplaying(false);
    setReplayPlaying(false); setReplayActions([]); replayActionsRef.current = [];
    replayStepIndexRef.current = 0; setReplayStepIndex(0);
  }, [clearReplayTimer]);

  const setReplayIndex = useCallback((nextIndex: number) => {
    replayStepIndexRef.current = nextIndex; setReplayStepIndex(nextIndex);
  }, []);

  const runReplayStep = useCallback(() => {
    const actions = replayActionsRef.current;
    const index = replayStepIndexRef.current;
    if (!isReplayingRef.current || index >= actions.length) { setReplayPlaying(false); return; }
    const action = actions[index];
    const nextIndex = index + 1;
    setReplayIndex(nextIndex);
    if (action.type === "wait") {
      if (nextIndex >= actions.length) { setReplayPlaying(false); return; }
      clearReplayTimer(); setReplayPlaying(false);
      const durationMs = Math.max(0, Math.round(Number(action.durationMs ?? DEFAULT_RECORDED_WAIT_MS)));
      replayIntervalRef.current = window.setTimeout(() => {
        if (!isReplayingRef.current) return;
        setReplayPlaying(true); runReplayStep();
      }, Math.max(50, Math.round(durationMs / replaySpeed)));
      return;
    }
    controls.enqueueInput(action);
    if (nextIndex >= actions.length) setReplayPlaying(false);
  }, [clearReplayTimer, controls, replaySpeed, setReplayIndex]);

  useEffect(() => {
    clearReplayTimer();
    if (!isReplaying || !replayPlaying || replayActions.length === 0) return;
    if (replayStepIndex >= replayActions.length) { setReplayPlaying(false); return; }
    const delay = Math.max(50, Math.round(RECORDED_REPLAY_BASE_INTERVAL_MS / replaySpeed));
    replayIntervalRef.current = window.setInterval(runReplayStep, delay);
    return clearReplayTimer;
  }, [clearReplayTimer, isReplaying, replayActions.length, replayPlaying, replaySpeed, replayStepIndex, runReplayStep]);

  const replayToIndex = useCallback((targetIndex: number) => {
    const levelForReplay = currentLevel;
    if (!levelForReplay || !isReplayingRef.current) return;
    const actions = replayActionsRef.current;
    const clampedIndex = Math.max(0, Math.min(actions.length, targetIndex));
    clearReplayTimer(); setReplayPlaying(false);
    applyLevelState(levelForReplay);
    inputQueueRef.current.set(localPlayerIdRef.current, []);
    for (let i = 0; i < clampedIndex; i += 1) { const action = actions[i]; if (action.type !== "wait") controls.enqueueInput(action); }
    setReplayIndex(clampedIndex);
  }, [currentLevel, applyLevelState, clearReplayTimer, controls, setReplayIndex]);

  const stepReplayBackward = useCallback(() => { replayToIndex(replayStepIndexRef.current - 1); }, [replayToIndex]);
  const stepReplayForward = useCallback(() => { clearReplayTimer(); setReplayPlaying(false); runReplayStep(); }, [clearReplayTimer, runReplayStep]);

  const adjustReplaySpeed = useCallback((delta: number) => {
    setReplaySpeed((speed) => {
      const next = Math.round((speed + delta) / REPLAY_SPEED_STEP) * REPLAY_SPEED_STEP;
      return Math.max(REPLAY_SPEED_MIN, Math.min(REPLAY_SPEED_MAX, Number(next.toFixed(2))));
    });
  }, []);

  const startReplay = useCallback(() => {
    const levelForReplay = currentLevel;
    if (!levelForReplay) return;
    const run = getRecordedRun(levelForReplay.id);
    if (!run) { pushHudMessage("No recorded run for this level"); return; }
    stopReplay();
    isReplayingRef.current = true;
    applyLevelState(levelForReplay);
    inputQueueRef.current.set(localPlayerIdRef.current, []);
    replayActionsRef.current = run.actions;
    setReplayActions(run.actions);
    setReplayIndex(0);
    setIsReplaying(true);
    setReplayPlaying(true);
    window.setTimeout(runReplayStep, 0);
  }, [currentLevel, applyLevelState, pushHudMessage, runReplayStep, setReplayIndex, stopReplay]);

  useEffect(() => {
    if (typeof window === "undefined" || isReplaying) return;
    const params = new URLSearchParams(window.location.search);
    const replayLevelRaw = params.get("replayLevel");
    const replayLevelId = replayLevelRaw ? Number(replayLevelRaw) : null;
    if (!Number.isInteger(replayLevelId) || !replayLevelId) return;
    const levelForReplay = currentLevel;
    if (!levelForReplay || levelForReplay.id !== replayLevelId) { goToLevelId(replayLevelId); return; }
    params.delete("replayLevel");
    const nextSearch = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`);
    window.setTimeout(() => startReplay(), 250);
  }, [currentLevel, goToLevelId, isReplaying, startReplay]);

  const startLevelWhenReady = useCallback(() => {
    if (!levelTimeLimitSeconds || isTimerArmed || isTimeUp || isBuilding || isComplete) return;
    if (session.timerRemainingMsRef.current <= 0) {
      session.timerRemainingMsRef.current = levelTimeLimitSeconds * 1000;
    }
    session.setIsTimerArmed(true);
    pushHudMessage("Timer started — good luck!", 1600);
  }, [isBuilding, isComplete, isTimeUp, isTimerArmed, levelTimeLimitSeconds, pushHudMessage, session]);

  const armAndStartTimer = useCallback(() => {
    if (levelTimeLimitSeconds) {
      session.timerRemainingMsRef.current = levelTimeLimitSeconds * 1000;
    }
    session.setIsTimerArmed(true);
  }, [levelTimeLimitSeconds, session]);

  const startGameFromTitle = useCallback(() => {
    session.setHasStartedGame(true);
    if (currentLevelIndex === 0 && !hasSeenCampaignIntro()) {
      setShowCampaignIntro(true);
      return;
    }
    armAndStartTimer();
  }, [armAndStartTimer, currentLevelIndex, session]);

  const handleCampaignIntroBegin = useCallback(() => {
    markCampaignIntroSeen();
    setShowCampaignIntro(false);
    armAndStartTimer();
  }, [armAndStartTimer]);

  startGameFromTitleRef.current = startGameFromTitle;
  startLevelWhenReadyRef.current = startLevelWhenReady;

  useEffect(() => {
    if (!tutorialsEnabled || isReplaying || isTutorialActive) return;
    if (!currentLevel || engine.renderGrid.length === 0) return;
    if (tutorialQueue.length > 0) return;
    const seen = getSeenTutorials();
    const queue: TutorialDefinition[] = [];
    if (currentLevel.id === 1 && !seen.has("basics")) {
      const basics = getTutorialDefinition("basics");
      if (basics) queue.push(basics);
    }
    if (currentLevel.id === 2 && !seen.has("arrow-remote")) {
      const remote = getTutorialDefinition("arrow-remote");
      if (remote) queue.push(remote);
    }
    const usedTypes = new Set<number>();
    for (const row of engine.renderGrid) for (const cell of row) usedTypes.add(cell);
    for (const def of TUTORIAL_DEFINITIONS) {
      if (def.id === "basics" || def.id === "arrow-remote" || seen.has(def.id)) continue;
      if (def.triggerCellTypes.some((t) => usedTypes.has(t))) queue.push(def);
    }
    if (queue.length > 0) setTutorialQueue(queue);
  }, [engine.renderGrid, currentLevel?.id, tutorialsEnabled, isReplaying, isTutorialActive, tutorialQueue.length]);

  useEffect(() => {
    if (!tutorialsEnabled || isReplaying || isTutorialActive) return;
    if (!currentLevel || engine.renderGrid.length === 0) return;
    if (isBuilding || isComplete || isTimeUp) return;
    const localPlayer = engine.renderPlayers.find((p) => p.isLocal);
    if (!localPlayer) return;
    const DIRECTIONS = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    const hasAnyMove = DIRECTIONS.some(({ dx, dy }) => {
      const probeState: GameState = {
        grid: engine.renderGrid.map(row => [...row]),
        baseGrid: engine.renderGrid.map(row => [...row]),
        playerPos: localPlayer.pos,
        inventory: { ...localPlayer.keys },
        selectedArrow: null,
        breakableRockStates: new Map(),
        isGliding: false,
        isComplete: false,
      };
      const outcome = attemptPlayerMove(probeState, dx, dy);
      return !!(outcome.newPlayerPos || outcome.glidePath);
    });
    if (!hasAnyMove) {
      pushHudMessage("No moves available — try restarting the level.", 3000);
    }
  }, [engine.renderGrid, engine.renderPlayers, currentLevel?.id, isBuilding, isComplete, isTimeUp, pushHudMessage]);

  useEffect(() => {
    if (!currentLevel || engine.renderGrid.length === 0) return;
    let cancelled = false;
    void getLevelImageUrl(currentLevel.id).then((resolved) => {
      if (!cancelled) setResolvedLevelImageUrl(resolved);
    });
    return () => { cancelled = true; };
  }, [currentLevel, engine.renderGrid.length]);

  const campaignLevelCards: CampaignDialogLevel[] = useMemo(() => {
    const highestUnlockedIndex = getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds);
    return allLevels.map((level, index) => {
      const record = getLevelCampaignRecord(campaignProgress, level.id);
      return {
        id: level.id,
        theme: level.theme,
        isCurrent: currentLevel?.id === level.id,
        isCompleted: !!record?.completed,
        isUnlocked: canSkipLevels || index <= highestUnlockedIndex,
        bestMoves: record?.bestMoves ?? null,
        bestTimeLeftSeconds: record?.bestTimeLeftSeconds ?? null,
      };
    });
  }, [allLevels, campaignProgress, orderedLevelIds, currentLevel, canSkipLevels]);

  const levelBackground = resolvedLevelImageUrl;
  const activeThemeKey = currentLevel?.theme ?? "default";
  const activeTheme = themes[activeThemeKey];
  const networkBadgeText =
    networkStatus === "online" ? "Connected" : networkStatus === "connecting" ? "Connecting" : "Solo";
  const chapterCards = useMemo(() => {
    const chapterBlueprints = [
      { title: "Forest Caves", subtitle: "Soft moss, hidden roots, and cozy starts.", accent: "from-emerald-400/35 via-lime-300/10 to-transparent" },
      { title: "Crystal Depths", subtitle: "Glowing caverns with trickier lines.", accent: "from-fuchsia-400/35 via-violet-300/10 to-transparent" },
      { title: "Volcano Core", subtitle: "Hot routes, sharp turns, no pressure. Okay, some pressure.", accent: "from-orange-400/40 via-red-300/10 to-transparent" },
      { title: "Frozen Hollow", subtitle: "Calm blue light and slippery brainteasers.", accent: "from-sky-400/35 via-cyan-300/10 to-transparent" },
    ] as const;
    const levelsPerChapter = Math.max(1, Math.ceil(allLevels.length / chapterBlueprints.length));
    return chapterBlueprints.map((chapter, index) => {
      const sliceStart = index * levelsPerChapter;
      const sliceEnd = Math.min(allLevels.length, sliceStart + levelsPerChapter);
      const segment = allLevels.slice(sliceStart, sliceEnd);
      const completed = segment.reduce((count, level) => {
        const record = getLevelCampaignRecord(campaignProgress, level.id);
        return count + (record?.completed ? 1 : 0);
      }, 0);
      const preview = segment.find((level) => level.image)?.image ?? levelBackground ?? null;
      const containsCurrent = Boolean(currentLevel && segment.some((level) => level.id === currentLevel.id));
      return { ...chapter, completed, total: segment.length, preview, containsCurrent };
    });
  }, [allLevels, campaignProgress, currentLevel, levelBackground]);

  const goToMapper = useCallback(() => {
    if (typeof window === "undefined") return;
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    window.location.assign(`${window.location.origin}${normalizedBase}mapper`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const doc = typeof document !== "undefined" ? document : null;
    if (!doc) return;
    const onChange = () => {
      if (!doc.fullscreenElement) {
        setIsFullscreenMode(false);
        if (prevZoomIndexRef.current != null) {
          camera.setCameraZoomIndex(prevZoomIndexRef.current);
          prevZoomIndexRef.current = null;
        }
      }
    };
    doc.addEventListener("fullscreenchange", onChange);
    return () => doc.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreenMode = useCallback(async () => {
    const next = !isFullscreenMode;
    setIsFullscreenMode(next);
    if (next) {
      prevZoomIndexRef.current = camera.cameraZoomIndex;
      camera.setUserZoomTouched(false);
      camera.setCameraOffset({ x: 0, z: 0 });
      setSelectedArrow(null);
    } else if (prevZoomIndexRef.current != null) {
      camera.setCameraZoomIndex(prevZoomIndexRef.current);
      prevZoomIndexRef.current = null;
      camera.setUserZoomTouched(true);
    }
    if (typeof document === "undefined") return;
    try {
      const doc = document as BrowserFullscreenDocument;
      const el = document.documentElement as BrowserFullscreenElement;
      if (next) {
        const req = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.msRequestFullscreen;
        if (typeof req === "function") await req.call(el);
      } else {
        const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.msExitFullscreen;
        if (typeof exit === "function") await exit.call(el);
      }
    } catch { /* ignore */ }
  }, [camera, isFullscreenMode]);

  const isCompact3DView = ENABLE_3D_GAMEPLAY_REDESIGN && viewMode === "3d";
  const useSplitHud = isMobile || isFullscreenMode || viewMode === "sprite" || viewMode === "top" || isCompact3DView;
  const desktopShellActive = !useSplitHud && !shouldRotateGate;
  const desktopTopInsetClass =
    leftShellPanelOpen && rightShellPanelOpen ? "xl:left-[22rem] xl:right-[22rem]" :
    leftShellPanelOpen ? "xl:left-[22rem] xl:right-4" :
    rightShellPanelOpen ? "xl:left-4 xl:right-[22rem]" :
    "xl:left-4 xl:right-4";
  const desktopBoardInsetClass =
    leftShellPanelOpen && rightShellPanelOpen ? "xl:px-[22rem]" :
    leftShellPanelOpen ? "xl:pl-[22rem] xl:pr-3" :
    rightShellPanelOpen ? "xl:pl-3 xl:pr-[22rem]" :
    "xl:px-3";
  const hasNextLevel = currentLevelIndex < allLevels.length - 1;
  const nextLevelLocked = !canSkipLevels && hasNextLevel && currentLevelIndex + 1 > getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds);
  const nextLevelTitle = !hasNextLevel
    ? "No more levels"
    : nextLevelLocked
      ? `Complete Level ${currentLevel.id} to unlock the next stage`
      : "Next level (N)";

  const campaignDialog = (
    <CampaignDialog
      compact={useSplitHud}
      disabled={shouldRotateGate}
      levels={campaignLevelCards}
      completedCount={getCompletedLevelCount(campaignProgress, orderedLevelIds)}
      frontierLevelId={allLevels[Math.min(getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds), allLevels.length - 1)]?.id ?? null}
      progressValue={Math.max(0, Math.min(1, (getCompletedLevelCount(campaignProgress, orderedLevelIds) / Math.max(1, allLevels.length))))}
      totalLevels={allLevels.length}
      onSelectLevel={goToLevelId}
      onStartOver={handleStartOver}
    />
  );

  const isStuck = useMemo(() => {
    if (isBuilding || isComplete || isTimeUp || engine.localPlayer?.isGliding) return false;
    const localPlayer = engine.renderPlayers.find((p) => p.isLocal);
    if (!localPlayer) return false;
    const DIRECTIONS = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }];
    return !DIRECTIONS.some(({ dx, dy }) => {
      const probeState: GameState = {
        grid: engine.renderGrid.map(row => [...row]),
        baseGrid: engine.renderGrid.map(row => [...row]),
        playerPos: localPlayer.pos,
        inventory: { ...localPlayer.keys },
        selectedArrow: null,
        breakableRockStates: new Map(),
        isGliding: false,
        isComplete: false,
      };
      const outcome = attemptPlayerMove(probeState, dx, dy);
      return !!(outcome.newPlayerPos || outcome.glidePath);
    });
  }, [engine.renderGrid, engine.renderPlayers, isBuilding, isComplete, isTimeUp, engine.localPlayer?.isGliding]);

  const restartLevelButton = (
    <Button
      onClick={resetLevel}
      variant="outline"
      size="sm"
      disabled={isComplete || engine.localPlayer?.isGliding}
      className={[
        isMobilePortrait
          ? "h-12 w-12 p-0 text-2xl font-black border-amber-300/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25"
          : isCompact3DView
            ? "h-10 w-10 shrink-0 p-0 text-xl font-black border-amber-300/50 bg-amber-400/10 text-amber-200 hover:bg-amber-400/20"
            : showGameTools
              ? "h-9 w-9 p-0 text-base font-semibold hover:bg-primary/20"
              : "h-9 gap-1.5 px-3 text-base font-semibold hover:bg-primary/20",
        isStuck ? "animate-stuck-hint-pulse" : "",
      ].join(" ")}
      title="Restart level (R)"
    >
      <RotateCcw className="h-5 w-5" />
      {!isMobilePortrait && !isCompact3DView && !showGameTools && (
        <span className="text-sm">Restart Level</span>
      )}
    </Button>
  );

  const secondaryHudButtons = (
    <>
      {campaignDialog}
      <Button
        onClick={() => { camera.setUserZoomTouched(true); camera.setCameraZoomIndex((i) => Math.max(camera.fitToWidthZoomIndex, i - 1)); }}
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 text-base hover:bg-primary/20"
        title={`Zoom out (${camera.cameraZoomPercent}%)`}
        disabled={!camera.canZoomOut}
      >
        −
      </Button>
      <Button
        onClick={() => { camera.setUserZoomTouched(true); camera.setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1)); }}
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 text-base hover:bg-primary/20"
        title={`Zoom in (${camera.cameraZoomPercent}%)`}
        disabled={!camera.canZoomIn}
      >
        +
      </Button>
      {canUseViewSwitcher && (
        <Button
          onClick={() => {
            setViewMode((prev) => {
              const modes = ["3d", "fps", "2d", "sprite", "top"] as const;
              const idx = modes.indexOf(prev);
              const next = modes[(idx + 1) % modes.length];
              return next;
            });
            camera.setCameraZoomIndex(DEFAULT_CAMERA_ZOOM_INDEX);
            camera.setUserZoomTouched(false);
            camera.setCameraOffset({ x: 0, z: 0 });
          }}
          variant="ghost"
          size="sm"
          className="h-9 px-3 text-xs font-bold tracking-wide hover:bg-primary/20"
          title="Switch view mode"
        >
          {viewMode.toUpperCase()}
        </Button>
      )}
      <Button
        onClick={togglePause}
        variant="ghost"
        size="sm"
        className="h-9 w-9 p-0 text-base hover:bg-primary/20"
        title={isPaused ? "Resume" : "Pause"}
        aria-label={isPaused ? "Resume" : "Pause"}
        aria-pressed={isPaused}
      >
        {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
      </Button>
      <TutorialSettingsPopover
        enabled={tutorialsEnabled}
        onToggleEnabled={() => {
          setTutorialsEnabledState((v) => {
            const next = !v;
            setTutorialsEnabled(next);
            return next;
          });
        }}
        onReplay={() => {
          resetSeenTutorials();
          pushHudMessage("Tutorials reset — they'll show again as mechanics appear.");
        }}
        onReplaySingle={(id) => {
          const def = getTutorialDefinition(id);
          if (def) setTutorialQueue([def]);
        }}
      />
      <Button
        onClick={() => {
          const next = !musicEnabled;
          setMusicEnabledState(next);
          setMusicEnabled(next);
          window.dispatchEvent(new CustomEvent(MUSIC_ENABLED_UPDATED_EVENT, { detail: { enabled: next } }));
        }}
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 text-stone-300 hover:bg-primary/20"
        title={musicEnabled ? "Mute music" : "Unmute music"}
        aria-label={musicEnabled ? "Mute music" : "Unmute music"}
        aria-pressed={musicEnabled}
      >
        {musicEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </Button>
      {playerSession && (
        <Button
          onClick={() => playerSession.signOut()}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-stone-300 hover:bg-primary/20"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      )}
      {isMobile && (
        <Button
          onClick={() => setShowThumbstick((v) => !v)}
          variant="ghost"
          size="sm"
          className={["h-9 w-9 p-0 text-base hover:bg-primary/20", showThumbstick ? "text-primary bg-primary/10" : ""].join(" ")}
          title={showThumbstick ? "Hide thumbstick" : "Show thumbstick"}
          aria-pressed={showThumbstick}
        >
          🕹
        </Button>
      )}
      {isMobilePortrait && (
        <Button
          onClick={() => void toggleFullscreenMode()}
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-base font-bold hover:bg-primary/20"
          title={isFullscreenMode ? "Exit fullscreen layout" : "Fullscreen layout (fit board)"}
          aria-pressed={isFullscreenMode}
        >
          ⛶
        </Button>
      )}
      {!isFullscreenMode && (camera.cameraOffset.x !== 0 || camera.cameraOffset.z !== 0) && (
        <Button
          onClick={() => { camera.setCameraOffset({ x: 0, z: 0 }); pushHudMessage("View reset"); }}
          variant="ghost"
          size="sm"
          className="h-9 px-2 text-xs hover:bg-primary/20"
          title="Reset camera view"
        >
          ⟲
        </Button>
      )}
    </>
  );

  const nextLevel = useCallback(() => {
    if (currentLevelIndex < allLevels.length - 1) {
      const toLevel = allLevels[currentLevelIndex + 1];
      if (currentLevel && toLevel) {
        setPendingLevelTransition({ fromLevelId: currentLevel.id, toLevelId: toLevel.id, toIndex: currentLevelIndex + 1 });
      } else {
        goToLevelIndex(currentLevelIndex + 1);
      }
    } else {
      pushHudMessage("All levels complete!", 2600);
    }
  }, [allLevels, currentLevel, currentLevelIndex, goToLevelIndex, pushHudMessage]);

  const prevLevel = useCallback(() => {
    if (currentLevelIndex > 0) goToLevelIndex(currentLevelIndex - 1);
  }, [currentLevelIndex, goToLevelIndex]);

  // Keyboard shortcuts (move/select/reset/skip level/start) are handled inside
  // useGameControls' own keydown listener, which now receives the real callbacks above
  // via the forwarding refs. A second listener here would double-fire every keypress.

  if (!hasStartedGame) {
    return (
      <div className="relative flex h-[100svh] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-stone-900 via-stone-800 to-stone-950 px-5 py-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.15),transparent_55%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.12),transparent_55%)]" />
        <div className="relative z-10 flex w-full max-w-3xl flex-col items-center text-center">
          <div className="text-[clamp(4rem,13vw,9rem)] font-black uppercase leading-none text-stone-50 drop-shadow-[0_8px_0_rgba(54,32,15,0.75)]">
            PhoneAge
          </div>
          <Button
            onClick={startGameFromTitle}
            size="lg"
            className="mt-10 h-20 min-w-[18rem] rounded-[28px] border-4 border-amber-100/80 bg-emerald-500 px-12 text-3xl font-black uppercase tracking-[0.12em] text-emerald-950 shadow-[0_18px_0_rgba(18,83,49,0.75),0_30px_70px_rgba(0,0,0,0.55)] hover:bg-emerald-400"
          >
            <Play className="mr-4 h-9 w-9" />
            Start
          </Button>
        </div>
      </div>
    );
  }

  if (showCampaignIntro) {
    return (
      <div className="relative h-[100svh] w-full overflow-hidden">
        <CampaignJourneyOverlay
          levels={campaignLevelCards}
          dinoAtLevelId={allLevels[0]?.id ?? 1}
          title="Your Journey Begins"
          subtitle="Every stage on this path is waiting to be cleared."
          ctaLabel="Start Level 1"
          onCta={handleCampaignIntroBegin}
        />
      </div>
    );
  }

  return (
    <div className={`relative flex h-[100svh] w-full flex-col overflow-hidden ${isCompact3DView ? 'bg-[#081214]' : 'bg-black'}`}>
      <audio ref={musicElRef} src={phoneageMusicUrl} loop preload="auto" />
      <div className={`absolute inset-0 bg-gradient-to-br ${currentLevel.theme ? themes[currentLevel.theme].background : 'from-amber-50 to-orange-100'} ${isCompact3DView ? 'opacity-20' : 'opacity-28'}`} />
      {levelBackground && (
        <div
          className={`absolute inset-0 bg-cover bg-center scale-105 ${isCompact3DView ? 'opacity-35 blur-[2px]' : 'opacity-28 blur-[1px]'}`}
          style={{ backgroundImage: `url(${levelBackground})` }}
        />
      )}
      {isCompact3DView ? (
        <>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,205,138,0.20),transparent_24%),radial-gradient(circle_at_top_right,rgba(98,220,255,0.16),transparent_22%),linear-gradient(180deg,rgba(5,12,14,0.18)_0%,rgba(5,12,14,0.68)_58%,rgba(3,8,9,0.88)_100%)]" />
          <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        </>
      ) : null}
      {isBuilding && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 text-white">
          <div className="bg-black/70 border border-white/20 rounded-lg px-6 py-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
            <div className="text-sm font-semibold">{buildStatus || 'Building level...'}</div>
          </div>
        </div>
      )}
      <TouchControls
        onMove={controls.queueMove}
        disabled={isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart || isPaused}
        targetRef={camera.gestureSurfaceRef}
      />
      {isMobile && showThumbstick && (
        <Thumbstick
          onMove={controls.queueMove}
          disabled={isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart || isPaused}
          opacity={0.55}
          liftPx={isMobilePortrait ? BOTTOM_HUD_CLEARANCE_PX : 0}
        />
      )}

      {desktopShellActive && (
        <>
          {!leftShellPanelOpen && (
            <Button
              onClick={() => setLeftShellPanelOpen(true)}
              variant="ghost"
              size="sm"
              className="absolute left-4 top-[calc(env(safe-area-inset-top)+5.25rem)] z-50 hidden h-12 w-12 rounded-2xl border border-amber-200/25 bg-[#120d09]/82 p-0 text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl hover:bg-[#23170f] xl:inline-flex"
              title="Show adventure panel"
            >
              <Compass className="h-5 w-5" />
            </Button>
          )}
          {!rightShellPanelOpen && (
            <Button
              onClick={() => setRightShellPanelOpen(true)}
              variant="ghost"
              size="sm"
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+5.25rem)] z-50 hidden h-12 w-12 rounded-2xl border border-amber-200/25 bg-[#120d09]/82 p-0 text-amber-100 shadow-[0_12px_40px_rgba(0,0,0,0.42)] backdrop-blur-xl hover:bg-[#23170f] xl:inline-flex"
              title="Show level tools"
            >
              <Sparkles className="h-5 w-5" />
            </Button>
          )}
        </>
      )}

      <div className="flex flex-1 min-h-0">
        {leftShellPanelOpen && desktopShellActive && (
          <div className="hidden xl:flex w-[22rem] shrink-0 flex-col border-r border-white/10 bg-[#12130f]/90 p-4 gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="text-sm font-black uppercase tracking-[0.12em] text-amber-200">Adventure</div>
              <Button onClick={() => setLeftShellPanelOpen(false)} variant="ghost" size="sm" className="h-8 w-8 p-0 text-stone-300">
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <CampaignDialog
              compact={false}
              disabled={shouldRotateGate}
              levels={campaignLevelCards}
              completedCount={getCompletedLevelCount(campaignProgress, orderedLevelIds)}
              frontierLevelId={allLevels[Math.min(getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds), allLevels.length - 1)]?.id ?? null}
              progressValue={Math.max(0, Math.min(1, (getCompletedLevelCount(campaignProgress, orderedLevelIds) / Math.max(1, allLevels.length))))}
              totalLevels={allLevels.length}
              onSelectLevel={goToLevelId}
              onStartOver={handleStartOver}
            />
          </div>
        )}

        <div className={`flex flex-1 min-h-0 flex-col ${desktopShellActive ? desktopBoardInsetClass : ""}`}>
          <GameHudTop
            ref={topHudBarRef}
            currentLevelId={currentLevel?.id ?? 0}
            moves={moves}
            timeLeftText={timeLeftSeconds != null && timeLeftSeconds > 0 && !isTimeUp ? formatCampaignClock(timeLeftSeconds) : null}
            isTimerUrgent={!!levelTimeLimitSeconds && (timeLeftSeconds ?? 0) <= 10 && !isTimeUp}
            redKeyCount={engine.redKeyCount}
            greenKeyCount={engine.greenKeyCount}
            isWaitingToStart={!!levelTimeLimitSeconds && !isTimerArmed && !isTimeUp}
            onPrevLevel={() => { if (currentLevelIndex > 0) goToLevelIndex(currentLevelIndex - 1); }}
            onNextLevel={() => { if (currentLevelIndex < allLevels.length - 1) goToLevelIndex(currentLevelIndex + 1); }}
            onStartLevel={startLevelWhenReady}
          />

          {useSplitHud && (
            <div className="shrink-0 px-3 pt-3 xl:hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button onClick={resetLevel} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white">
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                  <Button onClick={() => goToLevelIndex(Math.max(0, currentLevelIndex - 1))} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white" disabled={currentLevelIndex <= 0}>
                    ←
                  </Button>
                  <div className="text-xs font-bold text-white">L{currentLevel?.id ?? 0}</div>
                  <Button onClick={() => goToLevelIndex(Math.min(allLevels.length - 1, currentLevelIndex + 1))} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white" disabled={currentLevelIndex >= allLevels.length - 1}>
                    →
                  </Button>
                </div>
                <div className="flex items-center gap-1">
                  <Button onClick={() => camera.setCameraZoomIndex((i) => Math.max(camera.fitToWidthZoomIndex, i - 1))} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white" disabled={!camera.canZoomOut}>−</Button>
                  <Button onClick={() => camera.setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1))} variant="ghost" size="sm" className="h-8 w-8 p-0 text-white" disabled={!camera.canZoomIn}>+</Button>
                  {canUseViewSwitcher && (
                    <Button onClick={() => setViewMode((prev) => { const modes = ["3d", "fps", "2d", "sprite", "top"] as const; const idx = modes.indexOf(prev); return modes[(idx + 1) % modes.length]; })} variant="ghost" size="sm" className="h-8 px-2 text-[10px] font-black text-white">
                      {viewMode.toUpperCase()}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Desktop: Restart Level sits at the opposite (bottom-left) corner from the game-tools
              (settings) toggle, rather than crowding the same bottom-right cluster mobile uses. */}
          {!isMobile && (
            <div
              className="pointer-events-none fixed bottom-2 left-2 z-50"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <div className="pointer-events-auto">
                {restartLevelButton}
              </div>
            </div>
          )}

          <div
            ref={bottomHudBarRef}
            className="pointer-events-none fixed bottom-2 right-2 z-50 flex max-w-[calc(100vw-1rem)] items-end justify-end gap-2"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Mobile keeps Restart Level here, outside the tools toggle; desktop renders it at
                bottom-left instead (above). */}
            {isMobile && (
              <div className="pointer-events-auto">
                {restartLevelButton}
              </div>
            )}
            {showGameTools && (
              <div className="pointer-events-auto flex max-w-[calc(100vw-4.75rem)] items-center gap-1 overflow-x-auto rounded-lg border border-white/15 bg-[#12130f]/92 px-1 py-1 shadow-[0_12px_42px_rgba(0,0,0,0.55)] backdrop-blur-xl">
                {secondaryHudButtons}
              </div>
            )}
            <Button
              data-testid="game-tools-toggle"
              onClick={() => setShowGameTools((open) => !open)}
              variant="ghost"
              size="sm"
              className="pointer-events-auto h-10 w-10 shrink-0 rounded-lg border border-[#b89a6a]/40 bg-[#17140f]/92 p-0 text-amber-100 shadow-[0_10px_34px_rgba(0,0,0,0.52)] backdrop-blur-xl hover:bg-[#272017]"
              title={showGameTools ? "Hide game tools" : "Show game tools"}
              aria-label={showGameTools ? "Hide game tools" : "Show game tools"}
              aria-expanded={showGameTools}
            >
              <Settings2 className="h-[18px] w-[18px]" />
            </Button>
          </div>

          <div className="relative flex-1 min-h-0">
            {isPaused && (
              <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-xl">
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-stone-950/90 px-8 py-6 text-stone-50 shadow-2xl">
                  <Pause className="h-10 w-10 text-amber-200" />
                  <div className="text-lg font-black uppercase tracking-[0.16em] text-amber-100">Paused</div>
                  <Button onClick={togglePause} className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400 font-black">
                    <Play className="mr-2 h-4 w-4" /> Resume
                  </Button>
                </div>
              </div>
            )}
            <div
              ref={camera.gestureSurfaceRef}
              className="absolute inset-0"
              {...camera.handlers}
            >
              <div
                className={isMobilePortrait ? undefined : "absolute inset-0"}
                style={isMobilePortrait ? {
                  position: "fixed",
                  width: `calc(100svh - ${topHudBarPx + bottomHudBarPx}px)`,
                  height: "100svw",
                  top: `calc((100svh - 100svw) / 2 + ${(topHudBarPx - bottomHudBarPx) / 2}px)`,
                  left: `calc((100svw - 100svh) / 2 + ${(topHudBarPx + bottomHudBarPx) / 2}px)`,
                  transform: "rotate(-90deg)",
                  transformOrigin: "center center",
                } : undefined}
              >
              {viewMode === "top" ? (
                <GameTop2D
                  grid={engine.renderGrid}
                  cavePos={engine.renderCavePos}
                  playerStart={currentLevel?.playerStart ?? null}
                  selectedArrow={selectedArrow}
                  selectorPos={controls.isSelectorActive && !selectedArrow ? controls.selectorPos : null}
                  players={engine.renderPlayers}
                  zoomFactor={camera.cameraZoomFactor}
                  fullBleed={isFullscreenMode}
                  rotateUpright={isMobilePortrait}
                  theme={currentLevel.theme}
                  idleArrowHintDirections={[]}
                  levelId={currentLevel?.id ?? null}
                  crumbleAnimations={engine.crumbleAnimations}
                  onArrowClick={(x, y) => {
                    if (engine.localPlayer?.isGliding) return;
                    const cell = engine.renderGrid[y]?.[x];
                    if (cell !== undefined && isArrowCell(cell)) {
                      if (engine.localPlayerPos.x === x && engine.localPlayerPos.y === y) {
                        pushHudMessage("Step off the arrow before selecting it.", 2200);
                        return;
                      }
                      const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                      if (isSameArrow) {
                        controls.enqueueInput({ type: "deselect" });
                        setSelectedArrow(null);
                        pushHudMessage("Arrow deselected");
                      } else {
                        controls.enqueueInput({ type: "select", x, y });
                        pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                      }
                    }
                  }}
                  onCancelSelection={() => {
                    if (selectedArrow) {
                      controls.enqueueInput({ type: "deselect" });
                      setSelectedArrow(null);
                      pushHudMessage("Arrow deselected");
                    }
                  }}
                />
              ) : viewMode === "3d" && isCompact3DView ? (
                <GameTop2D
                  grid={engine.renderGrid}
                  cavePos={engine.renderCavePos}
                  playerStart={currentLevel?.playerStart ?? null}
                  selectedArrow={selectedArrow}
                  selectorPos={controls.isSelectorActive && !selectedArrow ? controls.selectorPos : null}
                  players={engine.renderPlayers}
                  zoomFactor={camera.cameraZoomFactor * 1.04}
                  fullBleed={isFullscreenMode}
                  rotateUpright={isMobilePortrait}
                  theme={currentLevel.theme}
                  idleArrowHintDirections={[]}
                  levelId={currentLevel?.id ?? null}
                  crumbleAnimations={engine.crumbleAnimations}
                  onArrowClick={(x, y) => {
                    if (engine.localPlayer?.isGliding) return;
                    const cell = engine.renderGrid[y]?.[x];
                    if (cell !== undefined && isArrowCell(cell)) {
                      if (engine.localPlayerPos.x === x && engine.localPlayerPos.y === y) {
                        pushHudMessage("Step off the arrow before selecting it.", 2200);
                        return;
                      }
                      const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                      if (isSameArrow) {
                        controls.enqueueInput({ type: "deselect" });
                        setSelectedArrow(null);
                        pushHudMessage("Arrow deselected");
                      } else {
                        controls.enqueueInput({ type: "select", x, y });
                        pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                      }
                    }
                  }}
                  onCancelSelection={() => {
                    if (selectedArrow) {
                      controls.enqueueInput({ type: "deselect" });
                      setSelectedArrow(null);
                      pushHudMessage("Arrow deselected");
                    }
                  }}
                />
              ) : viewMode === "sprite" ? (
                <GameSprite2D
                  grid={engine.renderGrid}
                  atlasSourceGrid={currentLevel?.grid ?? engine.renderGrid}
                  cavePos={engine.renderCavePos}
                  levelImageUrl={resolvedLevelImageUrl}
                  playerStart={currentLevel?.playerStart ?? null}
                  selectedArrow={selectedArrow}
                  selectorPos={controls.isSelectorActive && !selectedArrow ? controls.selectorPos : null}
                  players={engine.renderPlayers}
                  zoomFactor={camera.cameraZoomFactor}
                  fullBleed={isFullscreenMode}
                  rotateUpright={isMobilePortrait}
                  idleArrowHintDirections={[]}
                  crumbleAnimations={engine.crumbleAnimations}
                  onArrowClick={(x, y) => {
                    if (engine.localPlayer?.isGliding) return;
                    const cell = engine.renderGrid[y]?.[x];
                    if (cell !== undefined && isArrowCell(cell)) {
                      if (engine.localPlayerPos.x === x && engine.localPlayerPos.y === y) {
                        pushHudMessage("Step off the arrow before selecting it.", 2200);
                        return;
                      }
                      const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                      if (isSameArrow) {
                        controls.enqueueInput({ type: "deselect" });
                        setSelectedArrow(null);
                        pushHudMessage("Arrow deselected");
                      } else {
                        controls.enqueueInput({ type: "select", x, y });
                        pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                      }
                    }
                  }}
                  onCancelSelection={() => {
                    if (selectedArrow) {
                      controls.enqueueInput({ type: "deselect" });
                      setSelectedArrow(null);
                      pushHudMessage("Arrow deselected");
                    }
                  }}
                />
              ) : (
                <Game3D
                  grid={engine.renderGrid}
                  cavePos={engine.renderCavePos}
                  selectedArrow={selectedArrow}
                  selectorPos={controls.isSelectorActive && !selectedArrow ? controls.selectorPos : null}
                  cameraOffset={camera.cameraOffset}
                  zoomFactor={camera.cameraZoomFactor}
                  viewMode={viewMode}
                  theme={currentLevel.theme}
                  rotateUpright={isMobilePortrait}
                  players={engine.renderPlayers}
                  localPlayerId={engine.localPlayer?.id}
                  onPlayerClick={flashPlayerHighlight}
                  playerFlashCount={0}
                  crumbleAnimations={engine.crumbleAnimations}
                  onArrowClick={(x, y) => {
                    if (engine.localPlayer?.isGliding) return;
                    const cell = engine.renderGrid[y]?.[x];
                    if (cell !== undefined && isArrowCell(cell)) {
                      if (engine.localPlayerPos.x === x && engine.localPlayerPos.y === y) {
                        pushHudMessage("Step off the arrow before selecting it.", 2200);
                        return;
                      }
                      const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                      if (isSameArrow) {
                        controls.enqueueInput({ type: "deselect" });
                        setSelectedArrow(null);
                        pushHudMessage("Arrow deselected");
                      } else {
                        controls.enqueueInput({ type: "select", x, y });
                        pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                      }
                    }
                  }}
                  onCancelSelection={() => {
                    if (selectedArrow) {
                      controls.enqueueInput({ type: "deselect" });
                      setSelectedArrow(null);
                      pushHudMessage("Arrow deselected");
                    }
                  }}
                />
              )}
              </div>
            </div>
          </div>

          {selectedArrow && (
            <div className="absolute top-1 right-1 z-50 bg-primary/90 backdrop-blur px-2 py-0.5 rounded text-xs font-semibold text-primary-foreground shadow-md">Arrow ({selectedArrow.x},{selectedArrow.y})</div>
          )}
          {isWaitingToStart && (
            <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[65] flex justify-center px-4">
              <div className="pointer-events-auto rounded-2xl border border-emerald-300/45 bg-emerald-700/92 px-4 py-2 text-center text-white shadow-2xl">
                <div className="text-[11px] font-black tracking-[0.14em]">READY CHECK</div>
                <div className="mt-1 text-sm">Timer is paused. Press START when ready.</div>
              </div>
            </div>
          )}
          {isReplaying && (
            <div className="pointer-events-none absolute left-1/2 top-16 z-[65] w-full max-w-[min(96vw,44rem)] -translate-x-1/2 px-4">
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-xl border border-red-300/30 bg-red-950/85 px-3 py-2 text-red-100 shadow-xl backdrop-blur-md">
                <div className="mr-1 flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em]">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                  Recorded Run
                </div>
                <Button onClick={() => replayToIndex(0)} size="sm" variant="ghost" className="h-7 w-7 px-0 text-red-100 hover:bg-red-500/20" title="Restart replay">
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
                <Button onClick={stepReplayBackward} disabled={replayStepIndex <= 0} size="sm" variant="ghost" className="h-7 w-7 px-0 text-red-100 hover:bg-red-500/20 disabled:opacity-40" title="Previous recorded input">
                  <SkipBack className="h-3.5 w-3.5" />
                </Button>
                <Button onClick={() => setReplayPlaying((playing) => !playing)} disabled={replayActions.length === 0 || replayStepIndex >= replayActions.length} size="sm" variant="ghost" className="h-7 w-7 px-0 text-red-100 hover:bg-red-500/20 disabled:opacity-40" title={replayPlaying ? "Pause replay" : "Play replay"}>
                  {replayPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </Button>
                <Button onClick={stepReplayForward} disabled={replayStepIndex >= replayActions.length} size="sm" variant="ghost" className="h-7 w-7 px-0 text-red-100 hover:bg-red-500/20 disabled:opacity-40" title="Next recorded input">
                  <SkipForward className="h-3.5 w-3.5" />
                </Button>
                <div className="mx-1 min-w-[5.75rem] text-center text-[11px] font-semibold text-red-100/85">
                  {replayStepIndex}/{replayActions.length}
                </div>
                <Button onClick={() => adjustReplaySpeed(-REPLAY_SPEED_STEP)} disabled={replaySpeed <= REPLAY_SPEED_MIN} size="sm" variant="ghost" className="h-7 px-2 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-40" title="Slow replay by 0.25x">
                  -0.25x
                </Button>
                <div className="min-w-12 text-center text-xs font-black tabular-nums">{replaySpeed.toFixed(2)}x</div>
                <Button onClick={() => adjustReplaySpeed(REPLAY_SPEED_STEP)} disabled={replaySpeed >= REPLAY_SPEED_MAX} size="sm" variant="ghost" className="h-7 px-2 text-xs font-bold text-red-100 hover:bg-red-500/20 disabled:opacity-40" title="Speed replay by 0.25x">
                  +0.25x
                </Button>
                <Button onClick={stopReplay} size="sm" variant="ghost" className="h-7 px-2 text-[10px] font-bold uppercase tracking-wide text-red-100 hover:bg-red-500/20">
                  Stop
                </Button>
              </div>
            </div>
          )}
          {isTutorialActive && (
            <TutorialOverlay
              queue={tutorialQueue}
              onDone={(shown) => {
                for (const t of shown) markTutorialSeen(t.id);
                setTutorialQueue([]);
              }}
              isMobilePortrait={isMobilePortrait}
            />
          )}
          {remoteArrowHintStage && !isTutorialActive && !isComplete && !isTimeUp && (
            <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[65] flex justify-center px-4">
              <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-amber-300/40 bg-stone-950/92 px-4 py-2.5 text-stone-50 shadow-2xl backdrop-blur-md">
                <span className="inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300" />
                <span className="text-sm font-semibold">
                  {remoteArrowHintStage === "select"
                    ? "Tap an arrow tile to select it — you don't need to stand next to it."
                    : remoteArrowHintStage === "move"
                      ? "Now use your movement controls to slide it."
                      : "Tap the arrow again (or your dinosaur) to switch control back."}
                </span>
                <button onClick={() => setRemoteArrowHintStage(null)} aria-label="Dismiss hint" title="Dismiss hint" className="ml-1 shrink-0 text-stone-400 hover:text-stone-100">
                  ×
                </button>
              </div>
            </div>
          )}
          {showArrowSelectHint && selectedArrow && !remoteArrowHintStage && !isTutorialActive && !isComplete && !isTimeUp && (currentLevel?.id == null || currentLevel.id <= 3) && (
            <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[65] flex justify-center px-3">
              <div className="pointer-events-none flex max-w-[min(92vw,34rem)] items-center gap-2 rounded-full border border-white/25 bg-stone-950/85 px-3 py-1.5 text-center text-[11px] font-semibold leading-snug text-stone-100 shadow-xl backdrop-blur-md sm:text-xs">
                <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-white" />
                Arrow selected — tap it again, or tap elsewhere, to switch back to your dinosaur.
              </div>
            </div>
          )}
          {hudMessage && !isComplete && !isTimeUp && (
            <div className="pointer-events-none absolute left-1/2 z-40 -translate-x-1/2 px-4" style={{ bottom: isMobilePortrait ? `calc(env(safe-area-inset-bottom) + ${BOTTOM_HUD_CLEARANCE_PX}px + 0.75rem)` : '0.75rem' }}>
              <div className="rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm font-medium text-stone-100 shadow-xl backdrop-blur-md">
                {hudMessage}
              </div>
            </div>
          )}

          {isTimeUp && levelTimeLimitSeconds && (
            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-3 py-2 backdrop-blur-sm sm:px-4">
              <div className="pointer-events-auto flex max-h-[calc(100svh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-red-200/20 bg-stone-950/92 p-3 text-stone-50 shadow-2xl sm:rounded-[28px] sm:p-5 md:p-6">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <div className="text-center">
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-red-300">Time Expired</div>
                    <div className="mt-1 text-2xl font-black uppercase tracking-[0.14em] text-red-50 sm:mt-2 sm:text-3xl md:text-4xl">Time&apos;s Up!</div>
                    <div className="mt-2 text-sm font-semibold text-stone-300 sm:mt-3">Level {currentLevel.id} stopped at {moves} moves.</div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Run Moves</div>
                      <div className="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">{moves}</div>
                    </div>
                    <div className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 sm:p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-red-200/80">Clock</div>
                      <div className="mt-1 text-2xl font-black text-red-100 sm:mt-2 sm:text-3xl">0:00</div>
                    </div>
                  </div>
                </div>
                <div className="shrink-0 -mx-3 mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-stone-950/95 px-3 pb-1 pt-3 sm:-mx-5 sm:mt-5 sm:px-5 md:-mx-6 md:px-6">
                  <Button onClick={resetLevel} className="bg-red-300 text-stone-950 hover:bg-red-200">Restart Level</Button>
                </div>
              </div>
            </div>
          )}
          {isComplete && completionSummary && !pendingLevelTransition && (
            <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-3 py-2 backdrop-blur-sm sm:px-4">
              <div className="pointer-events-auto flex max-h-[calc(100svh-1rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-stone-950/92 p-3 text-stone-50 shadow-2xl sm:rounded-[28px] sm:p-5 md:p-6">
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                  <div className="text-center">
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Stage Cleared</div>
                    <div className="mt-1 text-2xl font-black uppercase tracking-[0.14em] sm:mt-2 sm:text-3xl md:text-4xl">Level {completionSummary.levelId} Complete</div>
                    <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:mt-3 sm:gap-2">
                      {completionSummary.isFirstClear && (
                        <span className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100">First Clear</span>
                      )}
                      {completionSummary.isNewBestMoves && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-100">Best Moves</span>
                      )}
                      {completionSummary.isNewBestTime && (
                        <span className="rounded-full border border-sky-300/40 bg-sky-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-sky-100">Best Clock</span>
                      )}
                    </div>
                  </div>
                  <div className="mx-auto mt-3 grid w-full max-w-xl gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Run Moves</div>
                      <div className="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">{completionSummary.moves}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:p-4">
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Personal Best</div>
                      <div className="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">{completionSummary.bestMoves ?? "--"}</div>
                    </div>
                    {(() => {
                      const completionClockText = timeLeftSeconds != null && timeLeftSeconds > 0 ? formatCampaignClock(timeLeftSeconds) : null;
                      const completionBestClockText = completionSummary.bestTimeLeftSeconds != null && completionSummary.bestTimeLeftSeconds > 0 ? formatCampaignClock(completionSummary.bestTimeLeftSeconds) : null;
                      return (
                        <>
                          {completionClockText && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:p-4">
                              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Clock Left</div>
                              <div className="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">{completionClockText}</div>
                            </div>
                          )}
                          {completionBestClockText && (
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center sm:p-4">
                              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Best Clock</div>
                              <div className="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">{completionBestClockText}</div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center sm:mt-4 sm:px-4 sm:py-3">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Campaign Progress</div>
                    <div className="mt-1 text-base font-black text-stone-50 sm:mt-2 sm:text-lg">
                      {getCompletedLevelCount(campaignProgress, orderedLevelIds)}/{allLevels.length} stages cleared
                    </div>
                  </div>
                </div>
                <div className="shrink-0 -mx-3 mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-stone-950/95 px-3 pb-1 pt-3 sm:-mx-5 sm:mt-5 sm:px-5 md:-mx-6 md:px-6">
                  <Button onClick={resetLevel} variant="outline" className="border-white/15 bg-white/5 text-stone-50 hover:bg-white/10">Restart Level</Button>
                  {getRecordedRun(completionSummary.levelId) && (
                    <Button onClick={startReplay} variant="outline" className="border-red-300/30 bg-red-500/10 text-red-100 hover:bg-red-500/20" title="Watch back the moves you recorded while playing this level">
                      Watch Recorded Run
                    </Button>
                  )}
                  {currentLevelIndex < allLevels.length - 1 ? (
                    <Button onClick={nextLevel} className="bg-amber-300 text-stone-950 hover:bg-amber-200">Next Level</Button>
                  ) : (
                    <Button onClick={() => { goToLevelIndex(0); pushHudMessage("Campaign restarted", 2200); }} className="bg-amber-300 text-stone-950 hover:bg-amber-200">Restart Campaign</Button>
                  )}
                </div>
              </div>
            </div>
          )}
          {pendingLevelTransition && (
            <CampaignJourneyOverlay
              levels={campaignLevelCards}
              dinoAtLevelId={pendingLevelTransition.fromLevelId}
              walkToLevelId={pendingLevelTransition.toLevelId}
              title={`Level ${pendingLevelTransition.fromLevelId} Complete!`}
              subtitle={`Onward to Level ${pendingLevelTransition.toLevelId}`}
              onDone={() => {
                goToLevelIndex(pendingLevelTransition.toIndex);
                setPendingLevelTransition(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
