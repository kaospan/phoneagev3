import { useState, useEffect, useCallback, useRef } from "react";
import { CellType, Position } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { saveRecordedRun, type RecordedInputCommand } from "@/lib/moveRecording";
import { type ViewMode } from "@/lib/viewModePrefs";
import {
  type InputCommand,
  type PlayerId,
  type SimulationState,
  type FacingDirection,
  MAX_SESSION_RECORDED_INPUTS,
  facingFromDelta,
  deltaFromFacing,
  dirKeyFromDelta,
} from "./useGameEngine";


type QueuedInputCommand =
  | { type: "move"; dx: number; dy: number }
  | { type: "select"; x: number; y: number }
  | { type: "deselect" };


const isKeyboardShortcutTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false;
  return !target.closest("button, input, textarea, select, [contenteditable='true'], [role='dialog']");
};


export interface UseGameControlsProps {
  localPlayerPos: Position;
  localPlayerIsGliding: boolean;
  selectedArrow: { x: number; y: number } | null;
  renderGrid: CellType[][];
  viewMode: ViewMode;
  isMobilePortrait: boolean;
  isBuilding: boolean;
  isComplete: boolean;
  isTimeUp: boolean;
  shouldRotateGate: boolean;
  isWaitingToStart: boolean;
  isReplaying: boolean;
  isTutorialActive: boolean;
  hasStartedGame: boolean;
  currentLevelIndex: number;
  allLevelsLength: number;
  simRef: React.MutableRefObject<SimulationState | null>;
  inputQueueRef: React.MutableRefObject<Map<PlayerId, InputCommand[]>>;
  localPlayerIdRef: React.MutableRefObject<PlayerId>;
  inputSeqRef: React.MutableRefObject<number>;
  lastInputAtRef: React.MutableRefObject<number>;
  recordedActionsRef: React.MutableRefObject<RecordedInputCommand[]>;
  recordMovesEnabledRef: React.MutableRefObject<boolean>;
  isReplayingRef: React.MutableRefObject<boolean>;
  selectedArrowLogRef: React.MutableRefObject<{ x: number; y: number } | null>;
  wsRef: React.MutableRefObject<WebSocket | null>;
  pushHudMessage: (message: string | null, duration?: number) => void;
  flashPlayerHighlight: () => void;
  resetLevel: () => void;
  goToLevelIndex: (nextIndex: number) => boolean;
  startGameFromTitle: () => void;
  startLevelWhenReady: () => void;
}


export interface UseGameControlsReturn {
  enqueueInput: (command: QueuedInputCommand) => void;
  queueMove: (dx: number, dy: number) => void;
  toggleKeyboardSelection: () => void;
  moveKeyboardSelector: (dx: number, dy: number) => void;
  selectorPos: { x: number; y: number };
  isSelectorActive: boolean;
}


export const useGameControls = (props: UseGameControlsProps): UseGameControlsReturn => {
  const {
    localPlayerPos,
    localPlayerIsGliding,
    selectedArrow,
    renderGrid,
    viewMode,
    isMobilePortrait,
    isBuilding,
    isComplete,
    isTimeUp,
    shouldRotateGate,
    isWaitingToStart,
    isReplaying,
    isTutorialActive,
    hasStartedGame,
    currentLevelIndex,
    allLevelsLength,
    simRef,
    inputQueueRef,
    localPlayerIdRef,
    inputSeqRef,
    lastInputAtRef,
    recordedActionsRef,
    recordMovesEnabledRef,
    isReplayingRef,
    selectedArrowLogRef,
    wsRef,
    pushHudMessage,
    flashPlayerHighlight,
    resetLevel,
    goToLevelIndex,
    startGameFromTitle,
    startLevelWhenReady,
  } = props;

  const [selectorPos, setSelectorPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSelectorActive, setIsSelectorActive] = useState(false);

  const enqueueInput = useCallback((command: QueuedInputCommand) => {
    const sim = simRef.current;
    if (!sim) return;
    lastInputAtRef.current = Date.now();
    const localId = localPlayerIdRef.current;
    const seq = ++inputSeqRef.current;
    const input = { ...command, seq } as InputCommand;
    const queue = inputQueueRef.current.get(localId) ?? [];
    queue.push(input);
    inputQueueRef.current.set(localId, queue);

    if (!isReplayingRef.current) {
      recordedActionsRef.current.push(command);
      if (recordedActionsRef.current.length > MAX_SESSION_RECORDED_INPUTS) {
        recordedActionsRef.current.shift();
      }
    }

    if (!isReplayingRef.current && recordMovesEnabledRef.current) {
      if (command.type === "select") {
        selectedArrowLogRef.current = { x: command.x, y: command.y };
      } else if (command.type === "deselect") {
        selectedArrowLogRef.current = null;
      } else if (command.type === "move") {
        const dir = dirKeyFromDelta(command.dx, command.dy);
        if (selectedArrowLogRef.current) {
          const { x, y } = selectedArrowLogRef.current;
          console.log(`A(${x},${y}):${dir}`);
        } else {
          console.log(`P:${dir}`);
        }
      }
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "input", id: localId, input }));
    }
  }, [
    simRef,
    localPlayerIdRef,
    inputQueueRef,
    inputSeqRef,
    lastInputAtRef,
    recordedActionsRef,
    recordMovesEnabledRef,
    isReplayingRef,
    selectedArrowLogRef,
    wsRef,
  ]);

  const queueMove = useCallback((dx: number, dy: number) => {
    if (isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart || isReplaying || isTutorialActive) return;

    if (viewMode === "fps") {
      const sim = simRef.current;
      const localId = localPlayerIdRef.current;
      const facing = sim?.players.get(localId)?.facing ?? "up";
      const fwd = deltaFromFacing(facing);
      const right = { dx: -fwd.dy, dy: fwd.dx };
      const worldDx = dx * right.dx + (-dy) * fwd.dx;
      const worldDy = dx * right.dy + (-dy) * fwd.dy;
      enqueueInput({ type: "move", dx: worldDx, dy: worldDy });
      return;
    }

    if (isMobilePortrait) {
      enqueueInput({ type: "move", dx: -dy, dy: dx });
      return;
    }

    enqueueInput({ type: "move", dx, dy });
  }, [
    enqueueInput,
    isComplete,
    isBuilding,
    isTimeUp,
    shouldRotateGate,
    isWaitingToStart,
    isReplaying,
    isTutorialActive,
    viewMode,
    isMobilePortrait,
    simRef,
    localPlayerIdRef,
  ]);

  const resetSelectorToPlayer = useCallback(() => {
    setIsSelectorActive(false);
    setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
  }, [localPlayerPos.x, localPlayerPos.y]);

  const moveKeyboardSelector = useCallback((dx: number, dy: number) => {
    if (renderGrid.length === 0 || renderGrid[0]?.length === 0) return;

    setIsSelectorActive(true);
    setSelectorPos((prev) => {
      const origin = prev ?? { x: localPlayerPos.x, y: localPlayerPos.y };
      const nextX = Math.max(0, Math.min(renderGrid[0].length - 1, origin.x + dx));
      const nextY = Math.max(0, Math.min(renderGrid.length - 1, origin.y + dy));
      return { x: nextX, y: nextY };
    });
  }, [localPlayerPos.x, localPlayerPos.y, renderGrid]);

  const toggleKeyboardSelection = useCallback(() => {
    if (isBuilding || isComplete || localPlayerIsGliding) return;

    if (selectedArrow) {
      enqueueInput({ type: "deselect" });
      resetSelectorToPlayer();
      flashPlayerHighlight();
      pushHudMessage("Arrow deselected");
      return;
    }

    const currentSelector = selectorPos;
    const isOnPlayer =
      currentSelector.x === localPlayerPos.x && currentSelector.y === localPlayerPos.y;

    if (!isSelectorActive) {
      setIsSelectorActive(true);
      setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
      return;
    }

    const cell = renderGrid[currentSelector.y]?.[currentSelector.x];
    if (cell !== undefined && isArrowCell(cell) && !isOnPlayer) {
      enqueueInput({ type: "select", x: currentSelector.x, y: currentSelector.y });
      setIsSelectorActive(false);
      setSelectorPos({ x: currentSelector.x, y: currentSelector.y });
      pushHudMessage("Arrow selected — use the movement controls to slide it.", 2200);
      return;
    }

    if (isOnPlayer) {
      resetSelectorToPlayer();
      return;
    }

    resetSelectorToPlayer();
    flashPlayerHighlight();
  }, [
    enqueueInput,
    flashPlayerHighlight,
    isBuilding,
    isComplete,
    localPlayerIsGliding,
    localPlayerPos.x,
    localPlayerPos.y,
    pushHudMessage,
    renderGrid,
    resetSelectorToPlayer,
    selectedArrow,
    selectorPos,
    isSelectorActive,
  ]);

  useEffect(() => {
    if (selectedArrow) {
      setIsSelectorActive(false);
      setSelectorPos({ x: selectedArrow.x, y: selectedArrow.y });
      return;
    }

    if (!isSelectorActive) {
      setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
    }
  }, [isSelectorActive, localPlayerPos.x, localPlayerPos.y, selectedArrow]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (isBuilding || isTutorialActive) return;
      const key = e.key;
      const isStartKey = key === " " || key === "Enter" || e.code === "Space";

      if (e.repeat && isStartKey) {
        e.preventDefault();
        return;
      }

      const isUp = key === "ArrowUp" || key === "w" || key === "W";
      const isDown = key === "ArrowDown" || key === "s" || key === "S";
      const isLeft = key === "ArrowLeft" || key === "a" || key === "A";
      const isRight = key === "ArrowRight" || key === "d" || key === "D";

      if (isStartKey && isKeyboardShortcutTarget(e.target)) {
        if (!hasStartedGame) {
          e.preventDefault();
          startGameFromTitle();
          return;
        }

        if (isWaitingToStart) {
          e.preventDefault();
          startLevelWhenReady();
          return;
        }
      }

      if (isStartKey) {
        if (!isKeyboardShortcutTarget(e.target)) return;
        e.preventDefault();
        toggleKeyboardSelection();
        return;
      }

      if (isSelectorActive && !selectedArrow) {
        if (isUp) { e.preventDefault(); moveKeyboardSelector(0, -1); return; }
        if (isDown) { e.preventDefault(); moveKeyboardSelector(0, 1); return; }
        if (isLeft) { e.preventDefault(); moveKeyboardSelector(-1, 0); return; }
        if (isRight) { e.preventDefault(); moveKeyboardSelector(1, 0); return; }
      }

      switch (key) {
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          queueMove(0, -1);
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          queueMove(0, 1);
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          queueMove(-1, 0);
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          queueMove(1, 0);
          break;
        case "r":
        case "R":
          e.preventDefault();
          resetLevel();
          break;
      case "n":
      case "N":
        e.preventDefault();
        if (currentLevelIndex < allLevelsLength && goToLevelIndex(currentLevelIndex + 1)) {
          pushHudMessage("Skipped to next level");
        }
        break;
      case "p":
      case "P":
        e.preventDefault();
        if (currentLevelIndex > 0 && goToLevelIndex(currentLevelIndex - 1)) {
          pushHudMessage("Previous level");
        }
        break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [
    isBuilding,
    isTutorialActive,
    hasStartedGame,
    isWaitingToStart,
    isSelectorActive,
    selectedArrow,
    moveKeyboardSelector,
    queueMove,
    resetLevel,
    currentLevelIndex,
    allLevelsLength,
    goToLevelIndex,
    startGameFromTitle,
    startLevelWhenReady,
    pushHudMessage,
    toggleKeyboardSelection,
  ]);

  return {
    enqueueInput,
    queueMove,
    toggleKeyboardSelection,
    moveKeyboardSelector,
    selectorPos,
    isSelectorActive,
  };
};
