import { DiagramDocument, Folder } from "@/lib/api/storage";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Loader2,
  Menu,
  Download,
  History,
  PlusSquare,
  Copy,
  PencilLine,
  Moon,
  LayoutDashboard,
  Activity,
} from "lucide-react";
import { useTelemetry } from "@/lib/telemetry/telemetryProvider";

interface EditorHeaderProps {
  doc: DiagramDocument | null;
  folders?: Folder[];
  saving: boolean;
  isDemo?: boolean;
  onNavigate: (url: string, message: string) => void;
  onDuplicate: () => string | null;
  onNewDiagram: () => void;
  onRename: () => void;
  onRenameInline?: (name: string) => void;
  onExport: () => void;
  onVersionHistory: () => void;
  onComments: () => void;
}

export function EditorHeader({
  doc,
  folders = [],
  saving,
  isDemo = false,
  onNavigate,
  onDuplicate,
  onNewDiagram,
  onRename,
  onRenameInline,
  onExport,
  onVersionHistory,
  onComments,
}: EditorHeaderProps) {
  // `resolvedTheme` (NOT `theme`): `theme` is the literal setting ("system") on a fresh load, so it
  // doesn't reflect the actual dark/light in effect. Use the resolved value so the toggle's state
  // and action stay correct even before the user has explicitly picked a theme.
  const { resolvedTheme, setTheme } = useTheme();
  const { enabled: telemetryEnabled, setEnabled: setTelemetryEnabled } = useTelemetry();
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Build the chain of folders from the workspace root down to the diagram's folder.
  const folderChain: Folder[] = (() => {
    const byId = new Map(folders.map((f) => [f.id, f]));
    const chain: Folder[] = [];
    const seen = new Set<string>();
    let cursor = doc?.folderId ?? null;
    while (cursor && byId.has(cursor) && !seen.has(cursor)) {
      seen.add(cursor);
      const folder = byId.get(cursor)!;
      chain.unshift(folder);
      cursor = folder.parentId;
    }
    return chain;
  })();

  const startEditingName = () => {
    if (isDemo || !onRenameInline) return;
    setDraftName(doc?.name || "");
    setIsEditingName(true);
  };

  const commitName = () => {
    if (!isEditingName) return;
    setIsEditingName(false);
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== (doc?.name || "")) {
      onRenameInline?.(trimmed);
    }
  };

  const cancelEditingName = () => {
    setIsEditingName(false);
    setDraftName(doc?.name || "");
  };

  const handleNewDiagramInNewTab = async () => {
    if (!doc) return;
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Diagram",
          code: `graph TD\n    A[Start] --> B[End]`,
        }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        window.open(`/editor/${newDiagram.id}`, "_blank", "noopener,noreferrer");
      }
    } catch {
      // fallback to the existing dialog flow
      onNewDiagram();
    }
  };

  const prepareDuplicateLink = (anchor: HTMLAnchorElement) => {
    if (anchor.dataset.duplicatePrepared === "true") return true;
    const duplicateUrl = onDuplicate();
    if (duplicateUrl) {
      anchor.href = duplicateUrl;
      anchor.dataset.duplicatePrepared = "true";
      return true;
    }
    return false;
  };

  const actionButtonClass =
    "flex h-9 w-[140px] items-center justify-center gap-2 rounded-md border border-border px-3 text-foreground transition-colors hover:bg-accent";

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  return (
    <header className="h-14 border-b border-border bg-background flex items-center px-4 justify-between shrink-0 z-20">
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="mr-2 text-foreground hover:bg-accent"
              />
            }
          >
            <Menu className="w-5 h-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-background border-border">
            {!isDemo && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  handleNewDiagramInNewTab();
                }}
                className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2"
              >
                <PlusSquare className="w-4 h-4" />
                <span>New Diagram</span>
              </DropdownMenuItem>
            )}
            {!isDemo && (
              <a
                href="/"
                target="_blank"
                rel="noopener noreferrer"
                onMouseDown={(e) => {
                  prepareDuplicateLink(e.currentTarget);
                }}
                onFocus={(e) => {
                  prepareDuplicateLink(e.currentTarget);
                }}
                onClick={(e) => {
                  if (!prepareDuplicateLink(e.currentTarget)) {
                    e.preventDefault();
                  }
                }}
              >
                <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                  <Copy className="w-4 h-4" />
                  <span>Duplicate</span>
                </DropdownMenuItem>
              </a>
            )}
            {!isDemo && (
              <DropdownMenuItem
                onClick={onRename}
                className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2"
              >
                <PencilLine className="w-4 h-4" />
                <span>Rename</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={onVersionHistory}
              className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2"
            >
              <History className="w-4 h-4" />
              <span>Version History</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
              }}
              className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex justify-between items-center w-full"
            >
              <span className="flex items-center gap-2">
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </span>
              <div
                className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${resolvedTheme === "dark" ? "bg-indigo-500" : "bg-slate-300"}`}
              >
                <div
                  className={`w-3 h-3 bg-white rounded-full transition-transform absolute ${resolvedTheme === "dark" ? "left-4" : "left-1"}`}
                />
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setTelemetryEnabled(!telemetryEnabled);
              }}
              className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex justify-between items-center w-full"
            >
              <span className="flex items-center gap-2">
                <Activity className="w-4 h-4" />
                <span>Telemetry</span>
              </span>
              <div
                className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${telemetryEnabled ? "bg-indigo-500" : "bg-slate-300"}`}
              >
                <div
                  className={`w-3 h-3 bg-white rounded-full transition-transform absolute ${telemetryEnabled ? "left-4" : "left-1"}`}
                />
              </div>
            </DropdownMenuItem>
            <Link
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate("/", "Returning to Workspace...");
              }}
            >
              <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
            </Link>
          </DropdownMenuContent>
        </DropdownMenu>
        <Link
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigate("/", "Returning to Workspace...");
          }}
        >
          <BrandLogo className="w-9 h-9 mr-3 cursor-pointer rounded-lg transition-opacity hover:opacity-90" />
        </Link>

        <span className="font-semibold text-xl tracking-tight mr-6 text-foreground whitespace-nowrap">
          LiveMaid
        </span>

        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink
                render={
                  <Link
                    href="/"
                    onClick={(e) => {
                      e.preventDefault();
                      onNavigate("/", "Returning to Workspace...");
                    }}
                  />
                }
              >
                Workspace
              </BreadcrumbLink>
            </BreadcrumbItem>
            {folderChain.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1.5">
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink
                    render={
                      <Link
                        href={`/?folder=${folder.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onNavigate(`/?folder=${folder.id}`, "Returning to Workspace...");
                        }}
                      />
                    }
                  >
                    {folder.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </span>
            ))}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {isEditingName ? (
                <input
                  ref={nameInputRef}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={commitName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitName();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEditingName();
                    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
                      e.preventDefault();
                      nameInputRef.current?.select();
                    }
                  }}
                  className="h-7 min-w-[8rem] max-w-[20rem] rounded-md border border-border bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  aria-label="Rename diagram"
                />
              ) : (
                <span className="group flex items-center gap-1.5">
                  <BreadcrumbPage
                    className={
                      isDemo ? "text-foreground" : "cursor-pointer hover:underline text-indigo-500"
                    }
                    onClick={isDemo ? undefined : startEditingName}
                    title={isDemo ? undefined : "Click to rename"}
                  >
                    {doc?.name || "Untitled"}
                  </BreadcrumbPage>
                  {!isDemo && onRenameInline && (
                    <button
                      type="button"
                      onClick={startEditingName}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                      aria-label="Rename diagram"
                      title="Rename diagram"
                    >
                      <PencilLine className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              )}
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-3 text-sm font-medium mr-4">
        <button
          type="button"
          onClick={onExport}
          className={actionButtonClass}
          aria-label="Export diagram"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>
        <button
          type="button"
          onClick={onVersionHistory}
          className={actionButtonClass}
          aria-label="Open version history"
        >
          <History className="w-4 h-4" />
          <span>History</span>
        </button>
        <button
          type="button"
          onClick={onComments}
          className={actionButtonClass}
          aria-label="Open comments"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15a4 4 0 0 1-4 4H8l-5 4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
          </svg>
          <span>Comments</span>
        </button>
        {isDemo ? (
          <span className="flex items-center text-amber-600 dark:text-amber-400">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-4 h-4 mr-1.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z" />
              <path d="M9 21h6" />
              <path d="M9 17h6" />
            </svg>
            Read Only
          </span>
        ) : saving ? (
          <span className="flex items-center text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </span>
        ) : (
          <span className="flex items-center text-emerald-600">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-4 h-4 mr-1.5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Saved
          </span>
        )}
      </div>
    </header>
  );
}
