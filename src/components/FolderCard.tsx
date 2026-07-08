"use client";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Folder as FolderIcon,
  MoreVertical,
  FolderInput,
  Pencil,
  Trash2,
  FolderOpen,
  Star,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  starred?: boolean;
  starredAt?: string | null;
}

export function FolderCard({
  folder,
  childCount,
  onOpen,
  onRename,
  onDelete,
  onMove,
  onToggleStar,
  onDropDiagram,
  moveTargets,
  canMove = true,
  isDemo = false,
  view = "grid",
}: {
  folder: Folder;
  childCount: number;
  onOpen: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, parentId: string | null) => void;
  onToggleStar?: (id: string, starred: boolean) => void;
  onDropDiagram: (diagramId: string, folderId: string) => void;
  moveTargets: { id: string | null; name: string; depth: number }[];
  canMove?: boolean;
  isDemo?: boolean;
  view?: "grid" | "list";
}) {
  const [isDragOver, setIsDragOver] = useState(false);

  const dropProps = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes("application/x-livemaid-diagram")) {
        e.preventDefault();
        setIsDragOver(true);
      }
    },
    onDragLeave: () => setIsDragOver(false),
    onDrop: (e: React.DragEvent) => {
      const diagramId = e.dataTransfer.getData("application/x-livemaid-diagram");
      setIsDragOver(false);
      if (diagramId) {
        e.preventDefault();
        onDropDiagram(diagramId, folder.id);
      }
    },
  };

  // Three-dot actions menu, shared between the grid card and the list row.
  const menu = !isDemo && (
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
        {onToggleStar && (
          <DropdownMenuItem
            onClick={() => onToggleStar(folder.id, !folder.starred)}
            className="cursor-pointer gap-2"
          >
            <Star className={`h-4 w-4 ${folder.starred ? "fill-amber-500 text-amber-500" : ""}`} />
            {folder.starred ? "Unstar" : "Star"}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onOpen(folder.id)} className="cursor-pointer gap-2">
          <FolderOpen className="h-4 w-4" /> Open
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onRename(folder.id, folder.name)}
          className="cursor-pointer gap-2"
        >
          <Pencil className="h-4 w-4" /> Rename
        </DropdownMenuItem>
        {canMove && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer gap-2">
              <FolderInput className="h-4 w-4" /> Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              {moveTargets
                .filter((t) => t.id !== folder.id && t.id !== folder.parentId)
                .map((t) => (
                  <DropdownMenuItem
                    key={t.id ?? "root"}
                    onClick={() => onMove(folder.id, t.id)}
                    className="cursor-pointer overflow-hidden"
                    style={{ paddingLeft: `${0.5 + t.depth * 0.75}rem` }}
                  >
                    <span className="truncate">{t.name}</span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => onDelete(folder.id)}
          className="cursor-pointer gap-2 text-red-500 focus:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const countLabel =
    childCount === 0 ? "Empty" : `${childCount} item${childCount === 1 ? "" : "s"}`;
  const starButton = onToggleStar && !isDemo && (
    <Button
      variant="ghost"
      size="icon"
      className={`h-8 w-8 ${folder.starred ? "text-amber-500 hover:text-amber-400" : "text-muted-foreground hover:text-foreground"} hover:bg-accent`}
      aria-label={folder.starred ? "Unstar folder" : "Star folder"}
      onClick={(e) => {
        e.stopPropagation();
        onToggleStar(folder.id, !folder.starred);
      }}
    >
      <Star className={`h-4 w-4 ${folder.starred ? "fill-current" : ""}`} />
    </Button>
  );

  // ---- List view: a compact horizontal row -------------------------------
  if (view === "list") {
    return (
      <Card
        onClick={() => onOpen(folder.id)}
        {...dropProps}
        className={`group flex flex-row items-center gap-4 px-4 py-3 cursor-pointer bg-background border-border transition-all duration-200 hover:border-accent-foreground/30 hover:shadow-md ${
          isDragOver ? "border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-500/5" : ""
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
          <FolderIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{folder.name}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{countLabel}</p>
        </div>
        <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
          {starButton}
          <div className="opacity-0 transition-opacity group-hover:opacity-100">{menu}</div>
        </div>
      </Card>
    );
  }

  // ---- Grid view (default) ----------------------------------------------
  return (
    <Card
      onClick={() => onOpen(folder.id)}
      {...dropProps}
      className={`group relative flex flex-col items-center justify-center text-center gap-3 p-6 h-full min-h-[140px] cursor-pointer bg-background border-border transition-all duration-200 hover:border-accent-foreground/30 hover:shadow-lg hover:-translate-y-1 ${
        isDragOver ? "border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-500/5" : ""
      }`}
    >
      {/* Top-right actions: keep the star fixed; reveal the menu to its left on hover. */}
      {!isDemo && (
        <>
          <div className="absolute top-2 right-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {starButton}
          </div>
          <div
            className="absolute top-2 right-10 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            {menu}
          </div>
        </>
      )}

      {/* Centered folder icon + name */}
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
        <FolderIcon className="h-7 w-7" />
      </div>
      <div className="min-w-0 w-full">
        <p className="truncate text-base font-medium text-foreground">{folder.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{countLabel}</p>
      </div>
    </Card>
  );
}
