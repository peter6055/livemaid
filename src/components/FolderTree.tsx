"use client";

import { useState } from "react";
import { Folder as FolderIcon, FolderOpen, ChevronRight, Home } from "lucide-react";
import type { Folder } from "@/components/FolderCard";

interface FolderTreeProps {
  folders: Folder[];
  currentFolderId: string | null;
  onSelect: (id: string | null) => void;
  onDropDiagram: (diagramId: string, folderId: string | null) => void;
}

function TreeNode({
  folder,
  folders,
  currentFolderId,
  expanded,
  toggleExpand,
  onSelect,
  onDropDiagram,
  depth,
}: {
  folder: Folder;
  folders: Folder[];
  currentFolderId: string | null;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onSelect: (id: string | null) => void;
  onDropDiagram: (diagramId: string, folderId: string | null) => void;
  depth: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const children = folders
    .filter((f) => f.parentId === folder.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const hasChildren = children.length > 0;
  const isOpen = expanded.has(folder.id);
  const isActive = currentFolderId === folder.id;

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
        className={`group flex items-center gap-1.5 rounded-md py-1.5 pr-2 text-sm cursor-pointer transition-colors ${
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
        <span className="truncate">{folder.name}</span>
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
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTree({ folders, currentFolderId, onSelect, onDropDiagram }: FolderTreeProps) {
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
        <span className="truncate">All Diagrams</span>
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
          depth={0}
        />
      ))}
    </div>
  );
}
