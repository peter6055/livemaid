"use client";

import { useState } from "react";
import {
  Folder as FolderIcon,
  FolderOpen,
  ChevronRight,
  Home,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { Folder } from "@/components/FolderCard";

interface FolderTreeProps {
  folders: Folder[];
  currentFolderId: string | null;
  onSelect: (id: string | null) => void;
  onDropDiagram: (diagramId: string, folderId: string | null) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  isDemo?: boolean;
}

function TreeNode({
  folder,
  folders,
  currentFolderId,
  expanded,
  toggleExpand,
  onSelect,
  onDropDiagram,
  onRename,
  onDelete,
  isDemo,
  depth,
}: {
  folder: Folder;
  folders: Folder[];
  currentFolderId: string | null;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (id: string | null) => void;
  onDropDiagram: (diagramId: string, folderId: string | null) => void;
  onRename?: (id: string, name: string) => void;
  onDelete?: (id: string) => void;
  isDemo?: boolean;
  depth: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const children = folders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = currentFolderId === folder.id;
  const showMenu = !isDemo && (onRename || onDelete);

  return (
    <div>
      <div
        onClick={() => onSelect(folder.id)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-livemaid-diagram")) {
            e.preventDefault();
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          const diagramId = e.dataTransfer.getData("application/x-livemaid-diagram");
          setDragOver(false);
          if (diagramId) {
            e.preventDefault();
            onDropDiagram(diagramId, folder.id);
          }
        }}
        style={{ paddingLeft: `${0.5 + depth * 0.85}rem` }}
        className={`group flex items-center gap-1.5 rounded-md py-1.5 pr-1 text-sm cursor-pointer transition-colors ${
          isActive
            ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium"
            : "text-foreground/80 hover:bg-accent hover:text-foreground"
        } ${dragOver ? "ring-2 ring-indigo-500/50 bg-indigo-500/10" : ""}`}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) toggleExpand(folder.id);
          }}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${hasChildren ? "hover:bg-foreground/10" : "invisible"}`}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
        {isActive ? (
          <FolderOpen className="h-4 w-4 shrink-0" />
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0" />
        )}
        <span className="truncate flex-1">{folder.name}</span>
        {showMenu && (
          <div
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    aria-label="Folder actions"
                  />
                }
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                {onRename && (
                  <DropdownMenuItem
                    onClick={() => onRename(folder.id, folder.name)}
                    className="cursor-pointer gap-2"
                  >
                    <Pencil className="h-4 w-4" /> Rename
                  </DropdownMenuItem>
                )}
                {onRename && onDelete && <DropdownMenuSeparator />}
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(folder.id)}
                    className="cursor-pointer gap-2 text-red-500 focus:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
      {hasChildren && isOpen && (
        <div>
          {children.map((child) => (
            <TreeNode
              key={child.id}
              folder={child}
              folders={folders}
              currentFolderId={currentFolderId}
              expanded={expanded}
              toggleExpand={toggleExpand}
              onSelect={onSelect}
              onDropDiagram={onDropDiagram}
              onRename={onRename}
              onDelete={onDelete}
              isDemo={isDemo}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({
  folders,
  currentFolderId,
  onSelect,
  onDropDiagram,
  onRename,
  onDelete,
  isDemo,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [rootDragOver, setRootDragOver] = useState(false);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const roots = folders
    .filter((f) => (f.parentId ?? null) === null)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-0.5">
      {/* Workspace root */}
      <div
        onClick={() => onSelect(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("application/x-livemaid-diagram")) {
            e.preventDefault();
            setRootDragOver(true);
          }
        }}
        onDragLeave={() => setRootDragOver(false)}
        onDrop={(e) => {
          const diagramId = e.dataTransfer.getData("application/x-livemaid-diagram");
          setRootDragOver(false);
          if (diagramId) {
            e.preventDefault();
            onDropDiagram(diagramId, null);
          }
        }}
        className={`flex items-center gap-1.5 rounded-md py-1.5 pl-2 pr-2 text-sm cursor-pointer transition-colors ${
          currentFolderId === null
            ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 font-medium"
            : "text-foreground/80 hover:bg-accent hover:text-foreground"
        } ${rootDragOver ? "ring-2 ring-indigo-500/50 bg-indigo-500/10" : ""}`}
      >
        <Home className="h-4 w-4 shrink-0" />
        <span className="truncate">Workspace</span>
      </div>

      {roots.map((folder) => (
        <TreeNode
          key={folder.id}
          folder={folder}
          folders={folders}
          currentFolderId={currentFolderId}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onSelect={onSelect}
          onDropDiagram={onDropDiagram}
          onRename={onRename}
          onDelete={onDelete}
          isDemo={isDemo}
          depth={0}
        />
      ))}
    </div>
  );
}
