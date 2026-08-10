import React from "react";
import type { FrontierKind } from "@/lib/algorithms-lab";

export interface FrontierDiagramProps {
  kind: FrontierKind;
}

const BOX = 34;
const GAP = 8;
const N = 5;

/** A neutral box, or the accent-highlighted "next to come out" box. */
const Box: React.FC<{ x: number; y: number; highlight?: boolean; muted?: boolean; label?: string }> = ({
  x,
  y,
  highlight,
  muted,
  label,
}) => (
  <g opacity={muted ? 0.4 : 1}>
    <rect
      x={x}
      y={y}
      width={BOX}
      height={BOX}
      rx={6}
      className={highlight ? "fill-primary/25 stroke-primary" : "fill-muted/40 stroke-border"}
      strokeWidth={1.5}
    />
    {muted && <line x1={x + 4} y1={y + BOX - 4} x2={x + BOX - 4} y2={y + 4} className="stroke-destructive" strokeWidth={1.5} />}
    {label && (
      <text x={x + BOX / 2} y={y + BOX / 2 + 4} textAnchor="middle" className="fill-muted-foreground text-[10px] font-mono">
        {label}
      </text>
    )}
  </g>
);

const Arrow: React.FC<{ x1: number; y1: number; x2: number; y2: number }> = ({ x1, y1, x2, y2 }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-muted-foreground" strokeWidth={1.5} markerEnd="url(#arrowhead)" />
);

const ArrowheadDefs: React.FC = () => (
  <defs>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
      <path d="M0,0 L8,4 L0,8 Z" className="fill-muted-foreground" />
    </marker>
  </defs>
);

/** A small illustrative diagram of the abstract frontier structure each algorithm uses —
 *  not tied to live search data, just teaching the shape of the underlying data structure. */
export const FrontierDiagram: React.FC<FrontierDiagramProps> = ({ kind }) => {
  const width = N * BOX + (N - 1) * GAP + 80;

  if (kind === "queue") {
    const height = 90;
    const y = 20;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-md" role="img" aria-label="Queue diagram">
        <ArrowheadDefs />
        {Array.from({ length: N }).map((_, i) => (
          <Box key={i} x={40 + i * (BOX + GAP)} y={y} highlight={i === 0} />
        ))}
        <Arrow x1={width - 4} y1={y + BOX / 2} x2={40 + (N - 1) * (BOX + GAP) + BOX + 6} y2={y + BOX / 2} />
        <Arrow x1={36} y1={y + BOX / 2} x2={4} y2={y + BOX / 2} />
        <text x={width - 4} y={y - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">new</text>
        <text x={4} y={y - 6} textAnchor="start" className="fill-primary text-[10px] font-semibold">next out</text>
      </svg>
    );
  }

  if (kind === "stack") {
    const height = N * BOX + (N - 1) * GAP + 40;
    const x = width / 2 - BOX / 2;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-[180px]" role="img" aria-label="Stack diagram">
        <ArrowheadDefs />
        {Array.from({ length: N }).map((_, i) => (
          <Box key={i} x={x} y={20 + i * (BOX + GAP)} highlight={i === 0} />
        ))}
        <Arrow x1={x + BOX + 24} y1={4} x2={x + BOX + 24} y2={18} />
        <text x={x + BOX + 28} y={12} textAnchor="start" className="fill-muted-foreground text-[10px]">push / pop</text>
        <text x={x - 8} y={20 + BOX / 2 + 4} textAnchor="end" className="fill-primary text-[10px] font-semibold">top</text>
      </svg>
    );
  }

  if (kind === "priority-h" || kind === "priority-f") {
    const height = 90;
    const y = 20;
    const scoreLabel = kind === "priority-h" ? "h" : "f";
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-md" role="img" aria-label="Priority queue diagram">
        <ArrowheadDefs />
        {Array.from({ length: N }).map((_, i) => (
          <Box key={i} x={40 + i * (BOX + GAP)} y={y} highlight={i === 0} label={`${scoreLabel}=${i}`} />
        ))}
        <Arrow x1={36} y1={y + BOX / 2} x2={4} y2={y + BOX / 2} />
        <text x={4} y={y - 6} textAnchor="start" className="fill-primary text-[10px] font-semibold">
          smallest {scoreLabel}(n) out first
        </text>
        <text x={40 + (N - 1) * (BOX + GAP) + BOX} y={y - 6} textAnchor="end" className="fill-muted-foreground text-[10px]">
          sorted by score
        </text>
      </svg>
    );
  }

  if (kind === "iterative-deepening") {
    const small = 20;
    const gap = 4;
    const colGap = 26;
    const passes = [1, 2, 3];
    const colX = (i: number) => 30 + i * (small * 3 + colGap);
    const baseline = 90;
    const height = 110;
    const w = colX(passes.length - 1) + small * 3 + 30;
    return (
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full max-w-md" role="img" aria-label="Iterative deepening diagram">
        <ArrowheadDefs />
        {passes.map((passHeight, i) => {
          const x = colX(i);
          return (
            <g key={i}>
              {Array.from({ length: passHeight }).map((_, row) => (
                <Box
                  key={row}
                  x={x}
                  y={baseline - (row + 1) * (small + gap)}
                  highlight={row === passHeight - 1}
                />
              ))}
              <text x={x + small / 2} y={baseline + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
                pass {i + 1}
              </text>
              {i < passes.length - 1 && (
                <Arrow x1={x + small + 4} y1={baseline - small} x2={x + small + colGap - 6} y2={baseline - small} />
              )}
            </g>
          );
        })}
        <text x={w / 2} y={16} textAnchor="middle" className="fill-primary text-[10px] font-semibold">
          each pass restarts one level deeper
        </text>
      </svg>
    );
  }

  if (kind === "beam") {
    const kept = 3;
    const pruned = 3;
    const height = 90;
    const y = 20;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full max-w-md" role="img" aria-label="Beam search diagram">
        <ArrowheadDefs />
        {Array.from({ length: kept }).map((_, i) => (
          <Box key={`kept-${i}`} x={40 + i * (BOX + GAP)} y={y} highlight />
        ))}
        {Array.from({ length: pruned }).map((_, i) => (
          <Box key={`pruned-${i}`} x={40 + (kept + i) * (BOX + GAP)} y={y} muted />
        ))}
        <text x={40 + (kept * (BOX + GAP)) / 2 - GAP / 2} y={y - 6} textAnchor="middle" className="fill-primary text-[10px] font-semibold">
          kept
        </text>
        <text
          x={40 + kept * (BOX + GAP) + (pruned * (BOX + GAP)) / 2 - GAP / 2}
          y={y - 6}
          textAnchor="middle"
          className="fill-muted-foreground text-[10px]"
        >
          pruned — gone for good
        </text>
      </svg>
    );
  }

  if (kind === "single-state") {
    const height = 90;
    const y = 28;
    const currentX = 20;
    const neighborsX = currentX + BOX + 46;
    const small = 22;
    const smallGap = 6;
    const neighborCount = 4;
    const bestIndex = 1;
    const w = neighborsX + neighborCount * (small + smallGap) + 20;
    return (
      <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full max-w-md" role="img" aria-label="Single-state diagram">
        <ArrowheadDefs />
        <Box x={currentX} y={y + (BOX - BOX) / 2} highlight label="now" />
        <Arrow x1={currentX + BOX + 4} y1={y + BOX / 2} x2={neighborsX - 4} y2={y + BOX / 2} />
        {Array.from({ length: neighborCount }).map((_, i) => (
          <Box key={i} x={neighborsX + i * (small + smallGap)} y={y + (BOX - small) / 2} highlight={i === bestIndex} muted={i !== bestIndex} />
        ))}
        <text x={currentX + BOX / 2} y={y - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">current</text>
        <text
          x={neighborsX + bestIndex * (small + smallGap) + small / 2}
          y={y - 8}
          textAnchor="middle"
          className="fill-primary text-[10px] font-semibold"
        >
          best → becomes current
        </text>
      </svg>
    );
  }

  // annealing: temperature cools over time, so accepting a worse move gets rarer.
  const w = 260;
  const height = 100;
  const chartLeft = 24;
  const chartRight = w - 16;
  const chartTop = 20;
  const chartBottom = 62;
  const curve = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    const x = chartLeft + t * (chartRight - chartLeft);
    const yFrac = Math.exp(-3 * t);
    const yy = chartBottom - yFrac * (chartBottom - chartTop);
    return `${x},${yy}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full max-w-xs" role="img" aria-label="Simulated annealing diagram">
      <line x1={chartLeft} y1={chartBottom} x2={chartRight} y2={chartBottom} className="stroke-border" strokeWidth={1.5} />
      <polyline points={curve} className="fill-none stroke-primary" strokeWidth={2} />
      <text x={chartLeft} y={14} textAnchor="start" className="fill-primary text-[10px] font-semibold">hot — accepts freely</text>
      <text x={chartRight} y={14} textAnchor="end" className="fill-muted-foreground text-[10px]">cold — accepts rarely</text>
      <text x={(chartLeft + chartRight) / 2} y={chartBottom + 16} textAnchor="middle" className="fill-muted-foreground text-[10px]">
        temperature, cooling over time
      </text>
    </svg>
  );
};

export default FrontierDiagram;
