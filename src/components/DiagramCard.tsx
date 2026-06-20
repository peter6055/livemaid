"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileEdit,
  Trash2,
  Clock,
  GitCommitVertical,
  Repeat2,
  Code2,
  MoreVertical,
  FolderInput,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useRef } from "react";
import { determineDiagramType, diagramTypeLabel } from "@/lib/diagrams/utils";
import { useMermaidPreview } from "@/hooks/useMermaidPreview";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

function StableSvgHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = html;
  }, [html]);
  return <div ref={ref} className={className} />;
}

export interface DiagramDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  type: string;
  code?: string;
  folderId?: string | null;
}

export function DiagramCard({
  diagram,
  onRename,
  onDelete,
  onNavigate,
  onMove,
  moveTargets,
  isDemo = false,
  view = "grid",
}: {
  diagram: DiagramDocument;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (url: string) => void;
  onMove?: (id: string, folderId: string | null) => void;
  moveTargets?: { id: string | null; name: string; depth: number }[];
  isDemo?: boolean;
  view?: "grid" | "list";
}) {
  const {
    svg: svgContent,
    loading: isCompiling,
    error: previewError,
  } = useMermaidPreview(diagram.code, diagram.id);
  const showPreviewLoader = Boolean(diagram.code) && isCompiling;

  const parsedType = diagram.code ? determineDiagramType(diagram.code) : diagram.type;
  const isSupported =
    parsedType === "graph" ||
    parsedType === "flowchart" ||
    parsedType === "sequence" ||
    parsedType === "classDiagram" ||
    parsedType === "erDiagram" ||
    parsedType === "stateDiagram";

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-livemaid-diagram", diagram.id);
    e.dataTransfer.effectAllowed = "move";
  };

  // Action buttons (edit / move / delete) shared between the grid card and the list row.
  const actions = isDemo ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground/40 pointer-events-none"
            disabled
          >
            <FileEdit className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Read-only in demo mode</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex cursor-not-allowed" />}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-300/50 pointer-events-none"
            disabled
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Read-only in demo mode</TooltipContent>
      </Tooltip>
      {onMove && moveTargets && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
              />
            }
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer gap-2">
                <FolderInput className="h-4 w-4" /> Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {moveTargets
                  .filter((t) => t.id !== (diagram.folderId ?? null))
                  .map((t) => (
                    <DropdownMenuItem
                      key={t.id ?? "root"}
                      onClick={() =>
                        toast.info("Demo mode — this is read only, changes won't be saved")
                      }
                      className="cursor-pointer overflow-hidden"
                      style={{ paddingLeft: `${0.5 + t.depth * 0.75}rem` }}
                    >
                      <span className="truncate">{t.name}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </TooltipProvider>
  ) : (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
        onClick={() => onRename(diagram.id, diagram.name)}
      >
        <FileEdit className="h-4 w-4" />
      </Button>
      {onMove && moveTargets && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent"
              />
            }
          >
            <MoreVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="cursor-pointer gap-2">
                <FolderInput className="h-4 w-4" /> Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {moveTargets
                  .filter((t) => t.id !== (diagram.folderId ?? null))
                  .map((t) => (
                    <DropdownMenuItem
                      key={t.id ?? "root"}
                      onClick={() => onMove(diagram.id, t.id)}
                      className="cursor-pointer overflow-hidden"
                      style={{ paddingLeft: `${0.5 + t.depth * 0.75}rem` }}
                    >
                      <span className="truncate">{t.name}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
        onClick={() => onDelete(diagram.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </>
  );

  // Type label + two-way / code-only capability badge, shared between layouts.
  const typeBadge = (
    <>
      <GitCommitVertical className="h-3 w-3" />
      <span>{diagramTypeLabel(parsedType)}</span>
      {isSupported && (
        <div className="flex items-center gap-0.5 bg-indigo-500/10 dark:bg-indigo-400/10 px-1.5 py-0.5 rounded">
          <Repeat2 className="h-2.5 w-2.5 text-indigo-600 dark:text-indigo-400" />
          <span className="text-[10px] font-medium text-indigo-700 dark:text-indigo-300">
            2-way
          </span>
        </div>
      )}
      {!isSupported && (
        <div className="flex items-center gap-0.5 bg-slate-500/10 dark:bg-slate-400/10 px-1.5 py-0.5 rounded">
          <Code2 className="h-2.5 w-2.5 text-slate-600 dark:text-slate-400" />
          <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
            Code Only
          </span>
        </div>
      )}
    </>
  );

  const editedLabel = `Edited ${formatDistanceToNow(new Date(diagram.updatedAt), {
    addSuffix: true,
  })}`;

  // ---- List view: a compact horizontal row -------------------------------
  if (view === "list") {
    return (
      <Card
        draggable={!!onMove}
        onDragStart={handleDragStart}
        onClick={() => onNavigate(`/editor/${diagram.id}`)}
        style={{ contentVisibility: "auto", containIntrinsicSize: "auto 60px" }}
        className="flex flex-row items-center gap-4 px-4 py-3 bg-background border-border hover:border-accent-foreground/30 hover:shadow-md transition-all duration-200 group cursor-pointer"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <GitCommitVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{diagram.name}</p>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            {typeBadge}
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex">
          <Clock className="h-3 w-3 mr-1" />
          {editedLabel}
        </div>
        <div
          className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </Card>
    );
  }

  // ---- Grid view (default): the full preview card ------------------------
  return (
    <Card
      draggable={!!onMove}
      onDragStart={handleDragStart}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 300px" }}
      className="flex flex-col h-full bg-background border-border hover:border-accent-foreground/30 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 group cursor-pointer"
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 min-h-8 w-full overflow-hidden">
          <CardTitle className="text-lg font-medium text-foreground truncate flex-1 min-w-0">
            {diagram.name}
          </CardTitle>
          <div className="flex opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
            {actions}
          </div>
        </div>
        <div className="flex items-center text-xs text-muted-foreground mt-1 gap-2 flex-wrap">
          {typeBadge}
        </div>
      </CardHeader>
      <CardContent className="flex-grow">
        <a
          href={`/editor/${diagram.id}`}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(`/editor/${diagram.id}`);
          }}
        >
          <div className="w-full h-32 bg-white rounded-md border border-border flex items-center justify-center cursor-pointer group-hover:border-accent-foreground/30 transition-colors overflow-hidden relative">
            {showPreviewLoader ? (
              <div className="w-full h-full flex items-center justify-center gap-3 px-4 animate-pulse opacity-50 dark:opacity-40">
                {/* Node 1: Start (stadium) */}
                <div className="h-7 w-12 rounded-full border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-6 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
                </div>
                {/* Connector Arrow 1 */}
                <div className="h-[2px] flex-grow max-w-[24px] bg-zinc-200 dark:bg-zinc-800 shrink-0 relative flex items-center justify-end">
                  <div className="absolute right-0 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-zinc-300 dark:border-l-zinc-700" />
                </div>
                {/* Node 2: Decision (diamond) */}
                <div className="h-8 w-8 rotate-45 border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <div className="-rotate-45 h-2 w-2 bg-zinc-200 dark:bg-zinc-700 rounded-sm" />
                </div>
                {/* Connector Arrow 2 */}
                <div className="h-[2px] flex-grow max-w-[24px] bg-zinc-200 dark:bg-zinc-800 shrink-0 relative flex items-center justify-end">
                  <div className="absolute right-0 w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[5px] border-l-zinc-300 dark:border-l-zinc-700" />
                </div>
                {/* Node 3: End (rectangle) */}
                <div className="h-7 w-12 rounded border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <div className="h-1.5 w-6 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
                </div>
              </div>
            ) : svgContent ? (
              <StableSvgHtml
                html={svgContent}
                className="w-full h-full object-contain flex items-center justify-center opacity-70 pointer-events-none transform scale-50 text-zinc-900"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 px-4 text-center">
                <span className="text-zinc-500 text-xs font-medium">Preview unavailable</span>
                <span className="max-w-[12rem] text-[11px] leading-4 text-zinc-400">
                  {previewError
                    ? "Mermaid syntax could not be rendered."
                    : "Preview is not available."}
                </span>
              </div>
            )}
          </div>
        </a>
      </CardContent>
      <CardFooter className="pt-3 border-t border-border text-xs text-muted-foreground flex items-center mt-2">
        <Clock className="h-3 w-3 mr-1" />
        Edited {formatDistanceToNow(new Date(diagram.updatedAt), { addSuffix: true })}
      </CardFooter>
    </Card>
  );
}
