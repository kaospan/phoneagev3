import { useEffect, useMemo, useRef, useState } from "react";
import { Lock, Star } from "lucide-react";
import dinotoonUrl from "@/assets/dinotoon.png";
import { themes } from "@/data/levels";
import { cn } from "@/lib/utils";
import { DOT_SIZE, buildCampaignPathD, buildCampaignPathPoints, contentHeightForCount } from "@/lib/campaignPathGeometry";
import { Button } from "@/components/ui/button";
import type { CampaignDialogLevel } from "./CampaignDialog";

const WALK_DELAY_MS = 500;
const WALK_DURATION_MS = 1300;

interface DinoPos {
  xFrac: number;
  y: number;
}

interface CampaignJourneyOverlayProps {
  levels: CampaignDialogLevel[];
  /** Level whose node the dino starts standing on. */
  dinoAtLevelId: number;
  /** If set, the dino walks from `dinoAtLevelId` to this level's node, then `onDone` fires. */
  walkToLevelId?: number;
  title: string;
  subtitle?: string;
  /** Shows a call-to-action button instead of auto-advancing (used for the pre-level-1 intro). */
  ctaLabel?: string;
  onCta?: () => void;
  /** Fires once the walk animation completes, or immediately if the player taps to skip it. */
  onDone?: () => void;
}

/**
 * Full-screen "storybook" view of the campaign snake path, shared by the pre-level-1 intro
 * and the between-levels transition. Reuses the exact same path geometry as CampaignMapPath
 * so the drawn path always matches the level browser.
 */
export function CampaignJourneyOverlay({
  levels,
  dinoAtLevelId,
  walkToLevelId,
  title,
  subtitle,
  ctaLabel,
  onCta,
  onDone,
}: CampaignJourneyOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const doneFiredRef = useRef(false);

  const points = useMemo(() => buildCampaignPathPoints(levels), [levels]);
  const pathD = useMemo(() => buildCampaignPathD(points), [points]);
  const contentHeight = contentHeightForCount(levels.length);

  const atPoint = points.find((p) => p.item.id === dinoAtLevelId) ?? null;
  const toPoint = walkToLevelId != null ? points.find((p) => p.item.id === walkToLevelId) ?? null : null;

  const [dinoPos, setDinoPos] = useState<DinoPos | null>(() => (atPoint ? { xFrac: atPoint.xFrac, y: atPoint.y } : null));
  const [isWalking, setIsWalking] = useState(false);
  const [facingLeft, setFacingLeft] = useState(false);
  const walkPathRef = useRef<Array<{ xFrac: number; y: number }> | null>(null);
  const walkStepRef = useRef(0);
  const [segmentDuration, setSegmentDuration] = useState(WALK_DURATION_MS);

  const fireDone = () => {
    if (doneFiredRef.current) return;
    doneFiredRef.current = true;
    onDone?.();
  };

  // Scroll so both the start and end nodes are in view, then (in walk mode) kick off the
  // dino's walk after a short beat so the player registers where it's starting from.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !atPoint) return;
    const targetY = toPoint ? (atPoint.y + toPoint.y) / 2 : atPoint.y;
    node.scrollTop = Math.max(0, targetY - node.clientHeight / 2);

    if (!toPoint) return;

    // Follow the actual snake path through all intermediate nodes (not a straight line)
    const startIdx = points.findIndex((p) => p.item.id === dinoAtLevelId);
    const endIdx = points.findIndex((p) => p.item.id === walkToLevelId);
    if (startIdx < 0 || endIdx < 0) return;

    const pathSlice =
      startIdx <= endIdx
        ? points.slice(startIdx, endIdx + 1)
        : points.slice(endIdx, startIdx + 1).reverse();

    const path = pathSlice.map((p) => ({ xFrac: p.xFrac, y: p.y }));
    walkPathRef.current = path;
    walkStepRef.current = 1;
    doneFiredRef.current = false;
    setSegmentDuration(Math.max(250, WALK_DURATION_MS / Math.max(1, path.length - 1)));

    const timer = setTimeout(() => {
      setIsWalking(true);
      if (path.length > 1) {
        setFacingLeft(path[1].xFrac < path[0].xFrac);
        setDinoPos({ xFrac: path[1].xFrac, y: path[1].y });
      } else {
        fireDone();
      }
    }, WALK_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dinoAtLevelId, walkToLevelId]);

  // Fallback in case transitionend doesn't fire (e.g. reduced-motion browsers skip the transition).
  useEffect(() => {
    if (!toPoint) return;
    const timer = setTimeout(fireDone, WALK_DELAY_MS + WALK_DURATION_MS + 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dinoAtLevelId, walkToLevelId]);

  return (
    <div
      className="absolute inset-0 z-[90] flex flex-col overflow-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at 15% 8%, rgba(245,158,11,0.10), transparent 32%), radial-gradient(circle at 85% 92%, rgba(56,189,248,0.08), transparent 34%), linear-gradient(180deg, #1c1512 0%, #120d0a 100%)",
      }}
      onClick={toPoint ? fireDone : undefined}
      role={toPoint ? "button" : undefined}
      title={toPoint ? "Tap to skip" : undefined}
    >
      <div className="shrink-0 px-5 pb-2 pt-6 text-center sm:pt-10">
        <div className="text-xl font-black uppercase tracking-[0.14em] text-stone-50 sm:text-2xl">{title}</div>
        {subtitle && <div className="mt-1 text-sm text-stone-300 sm:text-base">{subtitle}</div>}
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="relative mx-auto w-full max-w-md" style={{ height: contentHeight }}>
          <svg
            className="absolute inset-0 h-full w-full overflow-visible"
            viewBox={`0 0 100 ${contentHeight}`}
            preserveAspectRatio="none"
            aria-hidden
          >
            <path
              d={pathD}
              fill="none"
              stroke="rgba(120,90,55,0.9)"
              strokeWidth={10}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={pathD}
              fill="none"
              stroke="rgba(252,211,77,0.55)"
              strokeWidth={3}
              strokeDasharray="2 14"
              strokeLinecap="round"
              className="animate-map-trail-flow"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {points.map(({ item: level, xFrac, y }) => {
            const accentColor = themes[level.theme ?? "default"]?.arrow ?? "#d4a574";
            return (
              <div
                key={level.id}
                className="absolute flex flex-col items-center justify-center rounded-full border-2 text-sm font-black shadow-lg"
                style={{
                  left: `${xFrac * 100}%`,
                  top: y,
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  transform: "translate(-50%, -50%)",
                  background: level.isCompleted
                    ? `linear-gradient(135deg, ${accentColor}, #7a5618)`
                    : level.isUnlocked
                      ? "rgba(28,21,17,0.92)"
                      : "rgba(20,15,12,0.85)",
                  borderColor: level.isUnlocked ? accentColor : "rgba(255,255,255,0.15)",
                  opacity: level.isUnlocked ? 1 : 0.5,
                }}
              >
                {level.isCompleted ? (
                  <Star className="h-5 w-5 text-stone-950" fill="currentColor" />
                ) : level.isUnlocked ? (
                  <span className="text-stone-50">{level.id}</span>
                ) : (
                  <Lock className="h-4 w-4 text-stone-500" />
                )}
              </div>
            );
          })}

          {dinoPos && (
            <div
              className={cn("absolute z-10", isWalking && "animate-bounce")}
              style={{
                left: `${dinoPos.xFrac * 100}%`,
                top: dinoPos.y,
                width: DOT_SIZE * 1.4,
                height: DOT_SIZE * 1.4,
                transform: "translate(-50%, -66%)",
                transition: `left ${segmentDuration}ms ease-in-out, top ${segmentDuration}ms ease-in-out`,
              }}
              onTransitionEnd={(e) => {
                if (e.propertyName === "left") {
                  const path = walkPathRef.current;
                  if (!path) {
                    fireDone();
                    return;
                  }
                  walkStepRef.current += 1;
                  if (walkStepRef.current < path.length) {
                    const next = path[walkStepRef.current];
                    if (dinoPos) {
                      setFacingLeft(next.xFrac < dinoPos.xFrac);
                    }
                    setDinoPos({ xFrac: next.xFrac, y: next.y });
                  } else {
                    fireDone();
                  }
                }
              }}
            >
              <img
                src={dinotoonUrl}
                alt=""
                className="h-full w-full object-contain drop-shadow-[0_8px_14px_rgba(0,0,0,0.7)]"
                style={{ transform: facingLeft ? "scaleX(-1)" : undefined }}
              />
            </div>
          )}
        </div>
      </div>

      {ctaLabel && onCta && (
        <div className="shrink-0 px-5 pb-8 pt-3 text-center sm:pb-10">
          <Button
            onClick={onCta}
            size="lg"
            className="h-16 min-w-[16rem] rounded-[24px] border-4 border-amber-100/80 bg-emerald-500 px-10 text-xl font-black uppercase tracking-[0.1em] text-emerald-950 shadow-[0_12px_0_rgba(18,83,49,0.75),0_20px_50px_rgba(0,0,0,0.5)] hover:bg-emerald-400"
          >
            {ctaLabel}
          </Button>
        </div>
      )}

      {toPoint && (
        <div className="shrink-0 px-5 pb-6 text-center text-xs font-bold uppercase tracking-[0.16em] text-stone-400 sm:pb-8">
          Tap to skip
        </div>
      )}
    </div>
  );
}

export default CampaignJourneyOverlay;
