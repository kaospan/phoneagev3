import React from "react";
import { Check, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FRONTIER_KIND_LABEL, type AlgorithmDescriptor } from "@/lib/algorithms-lab";
import type { CurrentNodeInfo } from "./useSearchRunner";
import { FrontierDiagram } from "./FrontierDiagram";

export interface ExplanationPanelProps {
  algorithm: AlgorithmDescriptor;
  currentNode: CurrentNodeInfo | null;
}

export const ExplanationPanel: React.FC<ExplanationPanelProps> = ({ algorithm, currentNode }) => {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Why {algorithm.name} does this</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-relaxed text-muted-foreground">{algorithm.explanation}</p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">Advantages</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {algorithm.advantages.map((advantage) => (
                <li key={advantage} className="flex items-start gap-1.5">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  <span>{advantage}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">Trade-offs</p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              {algorithm.disadvantages.map((disadvantage) => (
                <li key={disadvantage} className="flex items-start gap-1.5">
                  <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>{disadvantage}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            How it picks what to explore next
          </p>
          <div className="flex justify-center rounded-md border bg-muted/20 p-3">
            <FrontierDiagram kind={algorithm.frontierKind} />
          </div>
          <p className="text-center text-xs text-muted-foreground">{FRONTIER_KIND_LABEL[algorithm.frontierKind]}</p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">The numbers, explained</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{algorithm.equationsNote}</p>
        </div>

        <div className="rounded-md border bg-muted/40 p-3 font-mono text-sm">
          {currentNode ? (
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span>
                g(n) = <span className="font-semibold">{currentNode.g}</span>
              </span>
              {algorithm.usesHeuristic && (
                <>
                  <span>
                    h(n) = <span className="font-semibold">{currentNode.h ?? "—"}</span>
                  </span>
                  <span>
                    f(n) = <span className="font-semibold">{currentNode.f ?? "—"}</span>
                  </span>
                </>
              )}
              {currentNode.temperature !== undefined && (
                <span>
                  T = <span className="font-semibold">{currentNode.temperature.toFixed(2)}</span>
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">Step the search to see the live numbers for the current state.</span>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">The algorithm, in code</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/20 p-3 font-mono text-xs leading-relaxed text-foreground/90">
            {algorithm.pseudocode.join("\n")}
          </pre>
        </div>

        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Used in practice</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {algorithm.realWorldUses.map((use) => (
              <li key={use}>{use}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default ExplanationPanel;
