import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SearchStats } from "@/lib/algorithms-lab";
import { formatBytes, formatCount, formatRuntime } from "./formatters";

export interface StatsPanelProps {
  algorithmName: string;
  stats: SearchStats;
  levelId?: number;
}

const Stat: React.FC<{ label: string; value: string; emphasize?: boolean }> = ({ label, value, emphasize }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className={emphasize ? "font-mono text-lg font-semibold" : "font-mono text-sm"}>{value}</span>
  </div>
);

export const StatsPanel: React.FC<StatsPanelProps> = ({ algorithmName, stats, levelId }) => {
  const solvedLabel = stats.solved === null ? "Running…" : stats.solved ? "Solved" : "Not solved";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{algorithmName}</span>
          <div className="flex flex-col items-end gap-0.5">
            {levelId !== undefined && (
              <span className="text-[11px] font-mono text-muted-foreground">Level number: {levelId}</span>
            )}
            <Badge variant={stats.solved ? "default" : stats.solved === false ? "destructive" : "secondary"}>
              {solvedLabel}
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Stat
          label="Solution"
          value={stats.moves !== null ? `${formatCount(stats.moves)} moves` : "—"}
          emphasize
        />
        <Stat label="Expanded" value={`${formatCount(stats.expanded)} states`} emphasize />
        <Stat label="Runtime" value={formatRuntime(stats.elapsedMs)} emphasize />
        <Stat label="Generated" value={formatCount(stats.generated)} />
        <Stat label="Rejected" value={formatCount(stats.rejected)} />
        <Stat label="Frontier (max)" value={`${formatCount(stats.frontierSize)} (${formatCount(stats.maxFrontierSize)})`} />
        <Stat label="Search depth" value={formatCount(stats.currentDepth)} />
        <Stat label="Optimal solution" value={stats.optimalGuaranteed ? "Guaranteed" : "Not guaranteed"} />
        <Stat label="Approx. memory" value={formatBytes(stats.approxMemoryBytes)} />
      </CardContent>
    </Card>
  );
};

export default StatsPanel;
