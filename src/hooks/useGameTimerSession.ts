import { useState, useRef, useCallback, useEffect } from "react";
import type { Level } from "@/data/levels";
import type { RecordedInputCommand } from "@/lib/moveRecording";
import { startPlaySession, endPlaySession, type PlaySessionEndReason } from "@/lib/playSessions";
import { touchLastSeen } from "@/lib/cloudProgress";

const SESSION_IDLE_TIMEOUT_MS = 30_000;
const SESSION_ACTIVE_TIME_TICK_MS = 1_000;
const LAST_SEEN_TOUCH_INTERVAL_MS = 60_000;

export interface UseGameTimerSessionProps {
  currentLevel: Level | null;
  playerUserId: string | null;
  isComplete: boolean;
  isBuilding: boolean;
  isReplaying: boolean;
  isPaused: boolean;
  onPushHudMessage: (message: string | null, duration?: number) => void;
}

export const useGameTimerSession = ({
  currentLevel,
  playerUserId,
  isComplete,
  isBuilding,
  isReplaying,
  isPaused,
  onPushHudMessage,
}: UseGameTimerSessionProps) => {
  const [levelTimeLimitSeconds, setLevelTimeLimitSeconds] = useState<number | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [isTimerArmed, setIsTimerArmed] = useState(true);
  const [hasStartedGame, setHasStartedGame] = useState(false);

  const timerRemainingMsRef = useRef(0);
  const timerEndAtMsRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const timerEnabledRef = useRef(false);

  const currentPlaySessionIdRef = useRef<string | null>(null);
  const currentPlaySessionLevelIdRef = useRef<number | null>(null);
  const sessionStartInFlightRef = useRef(false);
  const sessionActiveMsRef = useRef(0);
  const sessionAccountedAtRef = useRef<number>(Date.now());
  const lastSeenTouchedAtRef = useRef(0);
  const lastInputAtRef = useRef<number>(Date.now());
  const pendingSessionEndReasonRef = useRef<PlaySessionEndReason>("level_changed");

  useEffect(() => {
    timerEnabledRef.current = Boolean(levelTimeLimitSeconds);
  }, [levelTimeLimitSeconds]);

  const clearTimerInterval = useCallback(() => {
    if (timerIntervalRef.current != null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const resetSessionActiveTime = useCallback(() => {
    sessionActiveMsRef.current = 0;
    sessionAccountedAtRef.current = Date.now();
  }, []);

  const accrueSessionActiveTime = useCallback(() => {
    const now = Date.now();
    const elapsed = now - sessionAccountedAtRef.current;
    sessionAccountedAtRef.current = now;
    if (elapsed <= 0) return;
    if (now - lastInputAtRef.current < SESSION_IDLE_TIMEOUT_MS) {
      sessionActiveMsRef.current += elapsed;
      if (playerUserId && now - lastSeenTouchedAtRef.current >= LAST_SEEN_TOUCH_INTERVAL_MS) {
        lastSeenTouchedAtRef.current = now;
        void touchLastSeen(playerUserId);
      }
    }
  }, [playerUserId]);

  const closeCurrentPlaySession = useCallback((outcome: {
    completed: boolean;
    moves: number | null;
    timeLeftSeconds?: number | null;
    endReason: PlaySessionEndReason;
    moveHistory?: RecordedInputCommand[] | null;
  }) => {
    const openSessionId = currentPlaySessionIdRef.current;
    if (!openSessionId) return;
    accrueSessionActiveTime();
    void endPlaySession(openSessionId, {
      completed: outcome.completed,
      moves: outcome.moves,
      timeLeftSeconds: outcome.timeLeftSeconds ?? null,
      activeSeconds: Math.round(sessionActiveMsRef.current / 1000),
      endReason: outcome.endReason,
      moveHistory: outcome.moveHistory ?? null,
    });
    currentPlaySessionIdRef.current = null;
  }, [accrueSessionActiveTime]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (currentPlaySessionIdRef.current) accrueSessionActiveTime();
    }, SESSION_ACTIVE_TIME_TICK_MS);
    return () => window.clearInterval(interval);
  }, [accrueSessionActiveTime]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "hidden") return;
      if (!currentPlaySessionIdRef.current) return;
      closeCurrentPlaySession({
        completed: false,
        moves: null,
        timeLeftSeconds: timerEnabledRef.current ? Math.max(0, Math.ceil(timerRemainingMsRef.current / 1000)) : null,
        endReason: "tab_hidden",
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [closeCurrentPlaySession]);

  const resetLevelTimer = useCallback((limitSeconds: number | undefined) => {
    clearTimerInterval();
    timerEndAtMsRef.current = null;
    timerRemainingMsRef.current = 0;
    setIsTimeUp(false);

    const n = Number(limitSeconds);
    if (!Number.isFinite(n) || n <= 0) {
      setLevelTimeLimitSeconds(null);
      setTimeLeftSeconds(null);
      setIsTimerArmed(true);
      return;
    }

    const sec = Math.min(86400, Math.round(n));
    setLevelTimeLimitSeconds(sec);
    setTimeLeftSeconds(sec);
    timerRemainingMsRef.current = sec * 1000;
    setIsTimerArmed(true);
  }, [clearTimerInterval]);

  const addLevelTimeSeconds = useCallback((deltaSeconds: number) => {
    const delta = Math.max(0, Math.round(Number(deltaSeconds)));
    if (delta <= 0 || !timerEnabledRef.current) return;

    const deltaMs = delta * 1000;
    const maxMs = 86400 * 1000;
    const nextRemaining = Math.min(maxMs, timerRemainingMsRef.current + deltaMs);
    timerRemainingMsRef.current = nextRemaining;

    if (timerEndAtMsRef.current != null) {
      timerEndAtMsRef.current = Math.min(Date.now() + maxMs, timerEndAtMsRef.current + deltaMs);
    } else {
      timerEndAtMsRef.current = Date.now() + nextRemaining;
    }

    setIsTimeUp(false);
    setTimeLeftSeconds(Math.ceil(nextRemaining / 1000));
  }, []);

  useEffect(() => {
    if (!levelTimeLimitSeconds) {
      clearTimerInterval();
      timerEndAtMsRef.current = null;
      timerRemainingMsRef.current = 0;
      setTimeLeftSeconds(null);
      setIsTimeUp(false);
      return;
    }

    if (!hasStartedGame || !isTimerArmed || isComplete || isTimeUp || isBuilding || isPaused) {
      clearTimerInterval();
      timerEndAtMsRef.current = null;
      return;
    }

    if (isBuilding) {
      if (timerEndAtMsRef.current != null) {
        const remaining = Math.max(0, timerEndAtMsRef.current - Date.now());
        timerRemainingMsRef.current = remaining;
        timerEndAtMsRef.current = null;
        setTimeLeftSeconds(Math.ceil(remaining / 1000));
      }
      clearTimerInterval();
      return;
    }

    if (timerEndAtMsRef.current == null) {
      timerEndAtMsRef.current = Date.now() + timerRemainingMsRef.current;
    }

    const tick = () => {
      const endAt = timerEndAtMsRef.current;
      if (endAt == null) return;
      const remaining = Math.max(0, endAt - Date.now());
      timerRemainingMsRef.current = remaining;
      const sec = Math.ceil(remaining / 1000);
      setTimeLeftSeconds(sec);

      if (remaining <= 0) {
        setIsTimeUp(true);
        timerEndAtMsRef.current = null;
        clearTimerInterval();
      }
    };

    tick();
    const id = window.setInterval(tick, 250);
    timerIntervalRef.current = id;
    return () => window.clearInterval(id);
  }, [clearTimerInterval, hasStartedGame, isBuilding, isComplete, isTimeUp, isTimerArmed, isPaused, levelTimeLimitSeconds]);

  return {
    levelTimeLimitSeconds,
    timeLeftSeconds,
    isTimeUp,
    isTimerArmed,
    setIsTimerArmed,
    hasStartedGame,
    setHasStartedGame,
    timerEnabledRef,
    timerRemainingMsRef,
    pendingSessionEndReasonRef,
    currentPlaySessionIdRef,
    currentPlaySessionLevelIdRef,
    sessionStartInFlightRef,
    lastInputAtRef,
    resetLevelTimer,
    addLevelTimeSeconds,
    closeCurrentPlaySession,
    resetSessionActiveTime,
  };
};
