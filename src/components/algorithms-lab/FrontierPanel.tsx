import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { RejectReason, SearchEvent } from "@/lib/algorithms-lab";

export interface FrontierPanelProps {
  events: SearchEvent[];
  usesHeuristic: boolean;
}

const EVENT_STYLES: Record<SearchEvent["type"], { label: string; className: string }> = {
  generate: { label: "generated", className: "text-amber-500" },
  expand: { label: "expanded", className: "text-blue-500" },
  reject: { label: "rejected", className: "text-muted-foreground" },
  goal: { label: "goal!", className: "text-green-500 font-semibold" },
};

const REJECT_REASON_LABEL: Record<RejectReason, string> = {
  visited: "already visited",
  "worse-path": "found a cheaper path already",
  "beam-pruned": "didn't make the cut this layer",
  "annealing-rejected": "looked worse, and the cooled-down odds said no",
};

function eventDetail(event: SearchEvent): string {
  if (event.type === "generate") return event.description;
  if (event.type === "expand") return `depth ${event.depth}`;
  if (event.type === "reject") return `${event.description} — ${REJECT_REASON_LABEL[event.reason]}`;
  return `${event.actions.length} moves`;
}

function eventGhf(event: SearchEvent, usesHeuristic: boolean): string | null {
  if (!usesHeuristic) return null;
  if (event.type === "generate" || event.type === "expand") {
    if (event.h === undefined) return null;
    return `g=${event.g} h=${event.h} f=${event.f}`;
  }
  return null;
}

/** Shows the most recent search events (bounded ring buffer from useSearchRunner), most recent
 *  first — this is the "frontier / search information" log, not a literal dump of the frontier
 *  data structure, which can hold tens of thousands of entries on level 8-scale searches. */
export const FrontierPanel: React.FC<FrontierPanelProps> = ({ events, usesHeuristic }) => {
  const rows = [...events].reverse();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Recent search activity</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-64">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet — press Step or Play to start.</p>
          ) : (
            <ul className="space-y-1 pr-3 font-mono text-xs">
              {rows.map((event, i) => {
                const style = EVENT_STYLES[event.type];
                const ghf = eventGhf(event, usesHeuristic);
                return (
                  <li key={i} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/50 py-1 last:border-0">
                    <span className={cn("w-16 shrink-0", style.className)}>{style.label}</span>
                    <span className="flex-1 truncate text-foreground/90">{eventDetail(event)}</span>
                    {ghf && <span className="text-muted-foreground">{ghf}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default FrontierPanel;
