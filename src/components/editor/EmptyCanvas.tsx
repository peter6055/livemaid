"use client";

import { useMemo, useState } from "react";
import {
  Binary,
  Boxes,
  Braces,
  GitBranch,
  ListTree,
  Network,
  PieChart,
  Route,
  Share2,
  Table2,
  TimerReset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DIAGRAM_CATALOG,
  DIAGRAM_TEMPLATES,
  getDiagramCatalogItem,
} from "@/lib/diagrams/catalog";

const ICONS: Record<string, React.FC<{ className?: string }>> = {
  flowchart: Route,
  sequence: Share2,
  classDiagram: Boxes,
  erDiagram: Table2,
  stateDiagram: Binary,
  mindmap: ListTree,
  blank: Braces,
  gantt: TimerReset,
  pie: PieChart,
  timeline: Network,
  journey: GitBranch,
  gitGraph: GitBranch,
  requirementDiagram: Braces,
  C4Context: Network,
};

function getIcon(id: string) {
  return ICONS[id] ?? Braces;
}

interface EmptyCanvasProps {
  handleCodeChange?: (code: string) => void;
}

export function EmptyCanvas({ handleCodeChange }: EmptyCanvasProps) {
  const [selectedId, setSelectedId] = useState("flowchart");

  const { twoWayOptions, codeOnlyOptions } = useMemo(() => {
    const catalog = DIAGRAM_CATALOG.filter((item) => item.id !== "blank");
    return {
      twoWayOptions: catalog.filter((item) => item.capability === "two-way"),
      codeOnlyOptions: catalog.filter((item) => item.capability === "code-only"),
    };
  }, []);

  const selected = getDiagramCatalogItem(selectedId);
  const template = DIAGRAM_TEMPLATES.find((t) => t.type === selectedId);

  const handleInsert = () => {
    if (!handleCodeChange) return;
    if (template) {
      handleCodeChange(template.code);
    } else if (selected) {
      handleCodeChange(selected.defaultCode);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 overflow-y-auto">
      <div className="w-full max-w-2xl space-y-6 py-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-slate-900">Start this diagram</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose a starter, paste Mermaid code, or begin blank.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Editable on canvas
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {twoWayOptions.map((item) => {
              const Icon = getIcon(item.id);
              const active = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`group rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background h-full ${
                    active
                      ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                      : "border-slate-200 bg-white hover:border-indigo-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        active
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-100 text-slate-500 group-hover:text-slate-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
            Code only
          </p>
          <div className="flex flex-wrap gap-2">
            {codeOnlyOptions.map((item) => {
              const Icon = getIcon(item.id);
              const active = selectedId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    active
                      ? "border-indigo-400 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-slate-800"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-center">
          <Button onClick={handleInsert}>Insert {selected.label} starter</Button>
        </div>
      </div>
    </div>
  );
}
