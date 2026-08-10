import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export interface ComparisonMetric {
  label: string;
  valueA: number;
  valueB: number;
  formatValue: (n: number) => string;
}

export interface MetricComparisonBarsProps {
  metrics: ComparisonMetric[];
  nameA: string;
  nameB: string;
}

/**
 * Categorical pair for the two compared algorithms — slots 1 & 2 (blue/orange) of the
 * documented default order, validated against this app's actual dark-brown surface
 * (`hsl(32 35% 18%)`) with `scripts/validate_palette.js --pairs all`: worst-pair CVD ΔE 26.8,
 * normal-vision ΔE 31.8 — both comfortably clear the ≥8 / ≥15 gates, contrast ≥3:1.
 */
const SERIES_A_COLOR = "#3987e5";
const SERIES_B_COLOR = "#d95926";
const MIN_VISIBLE_PERCENT = 2;

const ComparisonBar: React.FC<{
  value: number;
  max: number;
  color: string;
  formatValue: (n: number) => string;
  seriesName: string;
  metricLabel: string;
}> = ({ value, max, color, formatValue, seriesName, metricLabel }) => {
  const pct = max > 0 ? Math.max(value > 0 ? MIN_VISIBLE_PERCENT : 0, (value / max) * 100) : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2">
          <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted/30">
            <div
              className="h-4"
              style={{ width: `${pct}%`, backgroundColor: color, borderRadius: "0 4px 4px 0" }}
            />
          </div>
          <span className="w-20 shrink-0 text-right font-mono text-xs tabular-nums text-foreground/90">
            {formatValue(value)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {seriesName} — {metricLabel}: {formatValue(value)}
      </TooltipContent>
    </Tooltip>
  );
};

/**
 * Small-multiples comparison: one mini bar-pair panel per metric (each metric keeps its own
 * scale, since states/runtime/frontier-size are different units and shouldn't share an axis).
 * The text Table already rendered above this in CompareMode is this chart's accessibility
 * "table view" twin, so no separate toggle is needed here.
 */
export const MetricComparisonBars: React.FC<MetricComparisonBarsProps> = ({ metrics, nameA, nameB }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES_A_COLOR }} />
          {nameA}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES_B_COLOR }} />
          {nameB}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {metrics.map((metric) => {
          const max = Math.max(metric.valueA, metric.valueB, 1);
          return (
            <div key={metric.label} className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">{metric.label}</p>
              <ComparisonBar
                value={metric.valueA}
                max={max}
                color={SERIES_A_COLOR}
                formatValue={metric.formatValue}
                seriesName={nameA}
                metricLabel={metric.label}
              />
              <ComparisonBar
                value={metric.valueB}
                max={max}
                color={SERIES_B_COLOR}
                formatValue={metric.formatValue}
                seriesName={nameB}
                metricLabel={metric.label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MetricComparisonBars;
