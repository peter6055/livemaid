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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DIAGRAM_CATALOG,
  DIAGRAM_TEMPLATES,
  getDiagramCatalogItem,
  type DiagramCatalogItem,
} from "@/lib/diagrams/catalog";

export interface CreateDiagramPayload {
  name: string;
  type: string;
  templateId?: string;
  code?: string;
}

interface CreateDiagramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreate: (payload: CreateDiagramPayload) => void | Promise<void>;
}

const PRIMARY_TYPES = [
  "flowchart",
  "sequence",
  "classDiagram",
  "erDiagram",
  "stateDiagram",
  "mindmap",
];

const ICONS = {
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
} as const;

function getOptionIcon(id: string) {
  return ICONS[id as keyof typeof ICONS] ?? Braces;
}

function getStarterTemplate(type: string) {
  return DIAGRAM_TEMPLATES.find((template) => template.type === type) ?? null;
}

function BlueprintPreview({ selected }: { selected: DiagramCatalogItem }) {
  const isSequence = selected.id === "sequence";
  const isData = selected.id === "classDiagram" || selected.id === "erDiagram";
  const isState = selected.id === "stateDiagram";
  const isMindmap = selected.id === "mindmap";

  return (
    <div className="relative min-h-24 overflow-hidden rounded-xl border border-blue-200 bg-white shadow-inner dark:border-slate-700 dark:bg-slate-950">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.12)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.12)_1px,transparent_1px)] bg-[size:18px_18px]" />
      <div className="relative flex h-full min-h-24 items-center justify-center px-4 text-blue-700 dark:text-blue-300">
        {isSequence ? (
          <div className="grid w-full max-w-sm grid-cols-3 gap-4 text-[10px] font-semibold uppercase tracking-wide">
            {["User", "LiveMaid", "Mermaid"].map((label) => (
              <div key={label} className="flex flex-col items-center gap-2">
                <div className="rounded-full border border-current bg-white px-2 py-1 dark:bg-slate-950">
                  {label}
                </div>
                <div className="h-12 border-l border-dashed border-current/50" />
              </div>
            ))}
          </div>
        ) : isData ? (
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide">
            <div className="rounded border border-current bg-white px-4 py-3 dark:bg-slate-950">
              Entity
            </div>
            <div className="h-px w-12 bg-current" />
            <div className="rounded border border-current bg-white px-4 py-3 dark:bg-slate-950">
              Field
            </div>
          </div>
        ) : isState ? (
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide">
            <div className="h-4 w-4 rounded-full bg-current" />
            <div className="h-px w-10 bg-current" />
            <div className="rounded-full border border-current bg-white px-4 py-2 dark:bg-slate-950">
              Active
            </div>
            <div className="h-px w-10 bg-current" />
            <div className="rounded-full border border-current bg-white px-4 py-2 dark:bg-slate-950">
              Done
            </div>
          </div>
        ) : isMindmap ? (
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide">
            <div className="rounded-full border border-current bg-white px-4 py-2 dark:bg-slate-950">
              Idea
            </div>
            <div className="grid gap-2">
              <div className="rounded-full border border-current bg-white px-3 py-1 dark:bg-slate-950">
                Branch
              </div>
              <div className="rounded-full border border-current bg-white px-3 py-1 dark:bg-slate-950">
                Branch
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wide">
            <div className="rounded-full border border-current bg-white px-4 py-2 dark:bg-slate-950">
              Start
            </div>
            <div className="h-px w-10 bg-current" />
            <div className="h-10 w-10 rotate-45 border border-current bg-white dark:bg-slate-950" />
            <div className="h-px w-10 bg-current" />
            <div className="rounded border border-current bg-white px-4 py-2 dark:bg-slate-950">
              End
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CreateDiagramDialog({
  open,
  onOpenChange,
  defaultName = "Untitled Diagram",
  onCreate,
}: CreateDiagramDialogProps) {
  const [name, setName] = useState(defaultName);
  const [selectedId, setSelectedId] = useState(PRIMARY_TYPES[0]);

  const { twoWayOptions, codeOnlyOptions } = useMemo(() => {
    const catalog = DIAGRAM_CATALOG.filter((item) => item.id !== "blank");
    return {
      twoWayOptions: catalog.filter((item) => item.capability === "two-way"),
      codeOnlyOptions: catalog.filter((item) => item.capability === "code-only"),
    };
  }, []);
  const selected = getDiagramCatalogItem(selectedId);
  const selectedTemplate = getStarterTemplate(selected.id);
  const canCreate = name.trim().length > 0;

  const reset = () => {
    setName(defaultName);
    setSelectedId(PRIMARY_TYPES[0]);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  const submit = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    await onCreate({
      name: trimmedName,
      type: selectedTemplate?.type ?? selected.id,
      templateId: selectedTemplate?.id,
      code: selectedTemplate ? undefined : selected.defaultCode,
    });
    reset();
  };

  const renderOption = (item: DiagramCatalogItem) => {
    const Icon = getOptionIcon(item.id);
    const active = selectedId === item.id;

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setSelectedId(item.id)}
        className={`group rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background h-full ${
          active
            ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
            : "border-border bg-card hover:border-indigo-300 hover:bg-accent/50"
        }`}
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              active
                ? "bg-indigo-500 text-white"
                : "bg-muted text-muted-foreground group-hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <span className="block text-sm font-semibold text-foreground">{item.label}</span>
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Create diagram</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 overflow-y-auto py-4 pr-1 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <div>
              <label htmlFor="create-diagram-name" className="text-sm font-medium text-foreground">
                Diagram name
              </label>
              <Input
                id="create-diagram-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Untitled Diagram"
                className="mt-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void submit();
                }}
              />
            </div>

            <div>
              <p className="text-sm font-medium text-foreground">What are you trying to map?</p>

              <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Editable on canvas
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {twoWayOptions.map((item) => renderOption(item))}
              </div>

              <p className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Code-only
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {codeOnlyOptions.map((item) => renderOption(item))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedId("blank")}
              className={`w-full rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                selectedId === "blank"
                  ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                  : "border-border bg-card hover:border-indigo-300 hover:bg-accent/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    selectedId === "blank"
                      ? "bg-indigo-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Braces className="h-4 w-4" />
                </span>
                <span className="block text-sm font-semibold text-foreground">
                  Start from blank
                </span>
              </div>
            </button>
          </div>

          <aside className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <BlueprintPreview selected={selected} />
            <div>
              <p className="text-sm font-semibold text-foreground">{selected.label}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {selected.capability === "two-way"
                  ? "Editable on the canvas and in Mermaid code."
                  : "Opens in LiveMaid as a Mermaid code workspace."}
              </p>
            </div>
          </aside>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={!canCreate}
            className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white"
          >
            Create diagram
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
