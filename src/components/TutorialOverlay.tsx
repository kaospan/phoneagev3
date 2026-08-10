import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import dinotoonUrl from "@/assets/dinotoon.png";
import { CaveTile } from "@/components/tiles/CaveTile";
import { CrackedRockTile, RockCrumbleEffect } from "@/components/tiles/CrackedRockTile";
import { ArrowBg, ArrowGlyph, ArrowTile } from "@/components/tiles/ArrowTile";
import { isArrowCell } from "@/game/arrows";
import type { CellType } from "@/game/types";
import type { TutorialDefinition, TutorialSound } from "@/lib/tutorials/tutorialTypes";
import { Button } from "@/components/ui/button";
import { createVortexIconDataUrl } from "@/lib/canvasIcons";

const CELL_PX = 64;

// ─── Synthesized sound effects (no audio assets needed) ───────────────────────

let audioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
};

const playTone = (freqStart: number, freqEnd: number, durationSec: number, type: OscillatorType = "sine", gainPeak = 0.08) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ctx.currentTime + durationSec);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationSec + 0.05);
};

const playTutorialSound = (sound: TutorialSound | undefined) => {
  if (!sound) return;
  try {
    switch (sound) {
      case "tap": playTone(520, 460, 0.08, "triangle", 0.06); break;
      case "glide": playTone(300, 900, 0.5, "sawtooth", 0.05); break;
      case "unlock": playTone(440, 880, 0.15, "square", 0.05); setTimeout(() => playTone(660, 1200, 0.18, "square", 0.05), 120); break;
      case "collect": playTone(700, 1100, 0.2, "sine", 0.07); break;
      case "teleport": playTone(200, 1600, 0.4, "sine", 0.06); break;
      case "break": playTone(180, 90, 0.25, "sawtooth", 0.08); break;
      case "chime": playTone(600, 1000, 0.3, "sine", 0.07); setTimeout(() => playTone(900, 1300, 0.3, "sine", 0.06), 150); break;
    }
  } catch {
    // Audio is best-effort; never let it break the tutorial.
  }
};

// ─── Mini-board tile rendering ─────────────────────────────────────────────────

// Same vortex icon the real game's teleport pad uses (createVortexIconDataUrl is deterministic —
// see canvasIcons.ts — so this is cached once rather than redrawn on every render).
let vortexUrl: string | null | undefined;
const getVortexUrl = (): string | null => {
  if (vortexUrl === undefined) {
    vortexUrl = typeof window !== "undefined" ? createVortexIconDataUrl(128) : null;
  }
  return vortexUrl;
};

const TileBg = ({ type, uid }: { type: number; uid: string }) => {
  switch (type) {
    case 0: // floor
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#d9a55a,#b8823a)" }} />;
    case 2: // stone
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#5b4d42,#332a22)" }} />;
    case 3: // cave/goal — the real game's ladder-arch tile, not a placeholder, so this reads as
      // the same "ladder" players will actually see (see the original complaint this fixed).
      return <CaveTile uid={uid} isStart={false} />;
    case 18: // start marker — same arch, unlit (no ladder drawn inside)
      return <CaveTile uid={uid} isStart />;
    case 5: // void
      return <div className="h-full w-full" style={{ background: "#0a0a0c" }} />;
    case 6: // breakable rock — the real game's shattered-facet tile, not a placeholder
      return <CrackedRockTile uid={uid} />;
    case 19: // teleport — same purple pad color as the real game's IconTile
      return <div className="h-full w-full" style={{ background: "rgba(70,0,140,0.78)" }} />;
    case 14: case 15: case 16: case 17: case 20:
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#c8a455,#8a6a2f)" }} />;
    default:
      // Arrows use the real game's own amber tile background, not a placeholder gradient.
      if (isArrowCell(type as CellType)) return <ArrowBg uid={uid} />;
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#c8a455,#8a6a2f)" }} />;
  }
};

const TileIcon = ({ type }: { type: number }) => {
  if (isArrowCell(type as CellType)) {
    return <ArrowGlyph type={type} />;
  }
  if (type === 14 || type === 15) {
    return <div className="text-2xl">{type === 14 ? "🗝️" : "🔑"}</div>;
  }
  if (type === 16 || type === 17) {
    return <div className="text-2xl">🔒</div>;
  }
  if (type === 19) {
    const url = getVortexUrl();
    if (!url) return null;
    return <img src={url} alt="" aria-hidden className="pointer-events-none" style={{ width: "72%", height: "72%", objectFit: "contain" }} />;
  }
  if (type === 20) {
    return <div className="text-2xl">⏳</div>;
  }
  return null;
};

const FingerCursor = () => (
  <svg viewBox="0 0 48 48" className="pointer-events-none h-10 w-10 drop-shadow-lg">
    <circle cx="24" cy="24" r="18" fill="rgba(255,255,255,0.18)" className="animate-ping" />
    <path
      d="M20 30 L20 14 a3 3 0 0 1 6 0 L26 24 M26 24 L26 12 a3 3 0 0 1 6 0 L32 24 M32 24 L32 16 a3 3 0 0 1 6 0 L38 28 a10 10 0 0 1 -10 10 L24 38 a8 8 0 0 1 -6 -3 L12 28 a3 3 0 0 1 4 -4 L20 28"
      fill="#ffe4b5"
      stroke="#4a2f14"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Mimics the real in-game Replay button so the callout reads as "this exact button", not a
// generic icon — paired with a pulsing ring and a bouncing finger so it can't be missed.
const UiCallout = ({ label }: { label: string }) => (
  <div className="flex h-full w-full flex-col items-center justify-center">
    <div className="relative">
      <div className="absolute -inset-3 rounded-2xl bg-amber-300/25 animate-ping" />
      <div className="relative flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-stone-50 shadow-xl">
        <RotateCcw className="h-5 w-5 text-amber-300" />
        <span className="text-sm font-black uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="absolute left-1/2 top-full -translate-x-1/2 animate-bounce pt-1">
        <FingerCursor />
      </div>
    </div>
  </div>
);

// ─── Main overlay ───────────────────────────────────────────────────────────────

interface TutorialOverlayProps {
  queue: TutorialDefinition[];
  onDone: (shown: TutorialDefinition[]) => void;
  isMobilePortrait?: boolean;
}

export function TutorialOverlay({ queue, onDone, isMobilePortrait }: TutorialOverlayProps) {
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingDismiss, setAwaitingDismiss] = useState(false);
  // While true, the mini-grid renders the PREVIOUS step's positions (see displayStep below) so a
  // "Replay" click can snap back and re-play the current step's slide-in from the start.
  const [isRewinding, setIsRewinding] = useState(false);
  const shownRef = useRef<TutorialDefinition[]>([]);
  const replayTimerRef = useRef<number | null>(null);

  const tutorial = queue[tutorialIndex] ?? null;
  const step = tutorial?.steps[stepIndex] ?? null;

  const finish = () => {
    if (replayTimerRef.current != null) window.clearTimeout(replayTimerRef.current);
    onDone(shownRef.current);
  };

  const advance = () => {
    if (!tutorial) return;
    if (stepIndex < tutorial.steps.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    if (!shownRef.current.includes(tutorial)) shownRef.current.push(tutorial);
    if (tutorialIndex < queue.length - 1) {
      setTutorialIndex((i) => i + 1);
      setStepIndex(0);
      return;
    }
    // Reached the end of the last queued tutorial — freeze here instead of auto-closing;
    // the player has to click Got it (or ×) to dismiss.
    setAwaitingDismiss(true);
  };

  const skip = () => {
    // Skipping marks every queued tutorial (and all of their steps) as "shown" and closes the
    // whole overlay in one go — it's an escape hatch out of the entire walkthrough, not just the
    // single tutorial or step currently on screen.
    if (replayTimerRef.current != null) window.clearTimeout(replayTimerRef.current);
    shownRef.current = [...queue];
    finish();
  };

  // Replays the whole queue from the top without closing the overlay — lets a player who just
  // finished immediately watch it again instead of having to dig it out of the "?" menu later.
  // Still goes one step at a time (Got it required each time), same as the first time through.
  const replay = () => {
    setIsRewinding(false);
    setTutorialIndex(0);
    setStepIndex(0);
    setAwaitingDismiss(false);
  };

  // Replays only the step currently on screen: snap back to how things looked just before this
  // step ran (no transition), then a beat later snap forward again WITH transitions enabled, so
  // the slide/tap/glide animation visibly plays again from the start.
  const replayCurrentStep = () => {
    if (replayTimerRef.current != null) window.clearTimeout(replayTimerRef.current);
    setIsRewinding(true);
    replayTimerRef.current = window.setTimeout(() => {
      setIsRewinding(false);
      playTutorialSound(step?.sound);
    }, 70);
  };

  // Sound plays once when a step first appears — advancing is otherwise entirely manual (Got it).
  useEffect(() => {
    if (!step || awaitingDismiss) return;
    playTutorialSound(step.sound);
  }, [tutorialIndex, stepIndex, awaitingDismiss, step]);

  useEffect(() => {
    return () => { if (replayTimerRef.current != null) window.clearTimeout(replayTimerRef.current); };
  }, []);

  const rows = tutorial?.miniGrid.length ?? 0;
  const cols = tutorial?.miniGrid[0]?.length ?? 0;

  // The (single) arrow block that this tutorial demos, so we can render it as a sliding
  // sprite when a step wants to show it being moved remotely.
  const arrowCell = useMemo(() => {
    if (!tutorial) return null;
    for (let y = 0; y < tutorial.miniGrid.length; y++) {
      const row = tutorial.miniGrid[y];
      for (let x = 0; x < row.length; x++) {
        if (isArrowCell(row[x] as CellType)) return { x, y, type: row[x] as CellType };
      }
    }
    return null;
  }, [tutorial]);

  // The step whose POSITIONS actually get rendered — the previous step's while rewinding (so the
  // replay has something to animate back from), otherwise the current step.
  const prevStep = tutorial && stepIndex > 0 ? tutorial.steps[stepIndex - 1] ?? null : null;
  const displayStep = isRewinding ? prevStep : step;

  const transform = useMemo(() => {
    if (!displayStep?.cameraFocus) return "";
    const cx = (displayStep.cameraFocus.x + 0.5) * CELL_PX;
    const cy = (displayStep.cameraFocus.y + 0.5) * CELL_PX;
    return `translate(calc(50% - ${cx}px), calc(50% - ${cy}px)) scale(${displayStep.cameraZoom ?? 1})`;
  }, [displayStep]);

  const transitionMs = step?.slowMotion ? 900 : 320;
  // Instant (no transition) while snapping back for a replay; normal speed otherwise.
  const posTransition = isRewinding ? "none" : `left ${transitionMs}ms ease-in-out, top ${transitionMs}ms ease-in-out`;
  const transformTransition = isRewinding ? "none" : `transform ${transitionMs}ms ease-in-out`;

  if (!tutorial || !step) return null;

  return (
    <div className="absolute inset-0 z-[90] bg-black/80 backdrop-blur-sm">
      <button
        onClick={skip}
        aria-label="Close tutorial"
        title="Hide tutorial"
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-stone-300 hover:bg-white/15 hover:text-stone-50"
      >
        ×
      </button>
      {/* Scrolls independently of the (fixed-position) close button above — on short/portrait
          viewports the stacked title/caption/board/button content can be taller than the
          screen, and it was previously just clipped since this had no overflow handling. */}
      <div className="absolute inset-0 overflow-y-auto overscroll-contain">
        <div className="flex min-h-full w-full flex-col items-center justify-center px-4 py-14">
          <div className="flex w-full max-w-xl flex-col items-center">
            <div className="text-center">
              <div className="text-base font-black uppercase tracking-[0.22em] text-amber-300 sm:text-lg">{tutorial.title}</div>
              <div className="mt-2 text-lg font-medium leading-snug text-stone-50 sm:text-xl">{step.caption ?? tutorial.text}</div>
            </div>

            <div
              data-testid="tutorial-mini-grid"
              className="relative mt-4 w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl"
              style={{ height: isMobilePortrait ? "min(55vh, 520px)" : 220 }}
            >
              {step.uiCallout ? (
                <UiCallout label={step.uiCallout.label} />
              ) : (
                <div
                  className="absolute left-0 top-0"
                  style={{
                    width: cols * CELL_PX,
                    height: rows * CELL_PX,
                    transform,
                    transformOrigin: "top left",
                    transition: transformTransition,
                  }}
                >
                  {tutorial.miniGrid.map((row, y) =>
                    row.map((cellType, x) => {
                      const isHighlighted = displayStep?.highlightCells?.some((c) => c.x === x && c.y === y);
                      const isCrumblingRock = displayStep?.crumblingCells?.some((c) => c.x === x && c.y === y);
                      // When the arrow block is rendered as a sliding sprite (arrowAt), suppress
                      // its static grid icon so it isn't drawn twice.
                      const arrowSpriteActive = displayStep?.arrowAt && arrowCell;
                      const isMovedArrowCell =
                        arrowSpriteActive && arrowCell && x === arrowCell.x && y === arrowCell.y;
                      // While crumbling, render the void gap underneath the breaking rock tile
                      const bgCellType = isCrumblingRock ? 5 : cellType;
                      return (
                        <div
                          key={`${x}-${y}`}
                          className="absolute overflow-hidden"
                          style={{
                            left: x * CELL_PX,
                            top: y * CELL_PX,
                            width: CELL_PX,
                            height: CELL_PX,
                            boxShadow: isHighlighted ? "inset 0 0 0 3px #fde047, 0 0 18px 4px rgba(253,224,71,0.8)" : "inset 0 0 0 1px rgba(0,0,0,0.3)",
                            transition: "box-shadow 250ms ease-in-out",
                          }}
                        >
                          <TileBg type={bgCellType} uid={`tut-${x}-${y}`} />
                          {isCrumblingRock ? (
                            <>
                              <div className="absolute inset-0 z-[1]">
                                <RockCrumbleEffect />
                              </div>
                              <div className="absolute inset-0 z-[2] animate-crumble">
                                <CrackedRockTile uid={`tut-crumble-${x}-${y}`} />
                              </div>
                            </>
                          ) : (
                            !isMovedArrowCell && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <TileIcon type={cellType} />
                              </div>
                            )
                          )}
                        </div>
                      );
                    }),
                  )}

                  {/* Sliding arrow block — the whole tile (background + glyph), same as the real
                      game, so it reads as an actual block traveling, not just a floating icon. */}
                  {displayStep?.arrowAt && arrowCell && (
                    <div
                      className="absolute"
                      style={{
                        left: displayStep.arrowAt.x * CELL_PX,
                        top: displayStep.arrowAt.y * CELL_PX,
                        width: CELL_PX,
                        height: CELL_PX,
                        transition: posTransition,
                        pointerEvents: "none",
                      }}
                    >
                      <ArrowTile uid="tut-arrow-sprite" type={arrowCell.type} />
                    </div>
                  )}

                  {/* Character */}
                  {displayStep?.characterAt && (
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: displayStep.characterAt.x * CELL_PX,
                        top: displayStep.characterAt.y * CELL_PX,
                        width: CELL_PX,
                        height: CELL_PX,
                        transition: posTransition,
                      }}
                    >
                      <img src={dinotoonUrl} alt="" className="h-[85%] w-[85%] object-contain" style={{ imageRendering: "auto" }} />
                    </div>
                  )}

                  {/* Animated finger cursor */}
                  {displayStep?.fingerAt && (
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        left: displayStep.fingerAt.x * CELL_PX,
                        top: displayStep.fingerAt.y * CELL_PX,
                        width: CELL_PX,
                        height: CELL_PX,
                        transition: posTransition,
                      }}
                    >
                      <FingerCursor />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center gap-2">
              {queue.map((t, i) => (
                <div
                  key={t.id}
                  className={[
                    "h-1.5 w-6 rounded-full transition-colors",
                    i < tutorialIndex ? "bg-amber-300" : i === tutorialIndex ? "bg-amber-300/60" : "bg-white/15",
                  ].join(" ")}
                />
              ))}
            </div>

            {awaitingDismiss ? (
              <div className="mt-5 flex items-center gap-3">
                <Button
                  onClick={replay}
                  variant="outline"
                  size="lg"
                  className="gap-2 border-white/15 bg-white/5 text-stone-100 hover:bg-white/15"
                >
                  <RotateCcw className="h-4 w-4" />
                  Watch Again
                </Button>
                <Button
                  onClick={finish}
                  size="lg"
                  className="bg-amber-400 px-8 text-base font-black text-stone-950 hover:bg-amber-300"
                >
                  Got it!
                </Button>
              </div>
            ) : (
              <>
                <div className="mt-5 flex items-center gap-3">
                  <Button
                    onClick={replayCurrentStep}
                    disabled={isRewinding}
                    variant="outline"
                    size="lg"
                    className="gap-2 border-white/15 bg-white/5 text-stone-100 hover:bg-white/15"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Replay
                  </Button>
                  <Button
                    onClick={advance}
                    size="lg"
                    className="bg-amber-400 px-8 text-base font-black text-stone-950 hover:bg-amber-300"
                  >
                    Got it
                  </Button>
                </div>
                <Button
                  onClick={skip}
                  variant="ghost"
                  size="sm"
                  className="mt-3 text-sm text-stone-300 hover:bg-white/10 hover:text-stone-50"
                >
                  Skip
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
