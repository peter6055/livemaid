"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { DiagramCard, DiagramDocument } from "@/components/DiagramCard";
import { FolderCard, Folder } from "@/components/FolderCard";
import { FolderTree } from "@/components/FolderTree";
import { CreateDiagramDialog, type CreateDiagramPayload } from "@/components/CreateDiagramDialog";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import {
  Plus,
  LayoutTemplate,
  Menu,
  Loader2,
  Moon,
  Search,
  X,
  FolderPlus,
  ChevronRight,
  ArrowDownUp,
  Home,
  Sun,
  Clock,
  FileText,
  LayoutGrid,
  List,
  Settings,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { useUserPreferences } from "@/hooks/useUserPreferences";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

import { SettingsDialog } from "@/components/SettingsDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Input } from "@/components/ui/input";
import { DemoBanner } from "@/components/DemoBanner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Feature flag: nested (folder-inside-folder) support. Disabled for now — folders are created at
// the workspace root only and folders themselves can't be moved into other folders. The data model
// (Folder.parentId) and all backend routes (cycle/descendant guards, cascade-reparent on delete)
// already fully support nesting, so flipping this to `true` re-enables it without further changes:
// new folders inherit the current folder as parent and the folder "Move to" menu reappears.
const ALLOW_NESTED_FOLDERS = false;

export default function Dashboard({
  isDemo = false,
  appVersion,
  rawVersion,
}: {
  isDemo?: boolean;
  appVersion?: string;
  rawVersion?: string;
}) {
  const { setTheme, resolvedTheme } = useTheme();
  // next-themes resolves the active theme only on the client, so theme-dependent UI must wait until
  // after mount to avoid a server/client hydration mismatch (server has no theme, client does).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isDark = resolvedTheme === "dark";
  const [settingsOpen, setSettingsOpen] = useState(false);

  const openSettings = () => setSettingsOpen(true);
  const closeSettings = () => setSettingsOpen(false);
  const [diagrams, setDiagrams] = useState<DiagramDocument[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const { prefs: userPrefs, hydrated, update: setUserPref } = useUserPreferences();
  const { viewMode, sortBy, currentFolderId: savedFolderId } = userPrefs;
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderLoading, setFolderLoading] = useState(false);
  const folderSwitchTimer = useRef<NodeJS.Timeout | null>(null);
  // `searchInput` is the raw, instant value bound to the text field; `searchQuery` is the DEBOUNCED
  // value that actually drives filtering. `searchLoading` is true during the debounce window so the
  // grid shows a brief loading state instead of filtering on every keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimer = useRef<NodeJS.Timeout | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [displayCount, setDisplayCount] = useState(12);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [quickView, setQuickView] = useState<"all" | "recent" | "starred" | null>(null);

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState("");
  const [renameName, setRenameName] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  // Folder dialog states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [createFolderName, setCreateFolderName] = useState("");

  const [isRenameFolderOpen, setIsRenameFolderOpen] = useState(false);
  const [renameFolderId, setRenameFolderId] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  const [isDeleteFolderOpen, setIsDeleteFolderOpen] = useState(false);
  const [deleteFolderId, setDeleteFolderId] = useState("");

  // Breadcrumb drag-over target (for the move-back-to-folder drop zones in the header breadcrumb).
  const [breadcrumbDragOverId, setBreadcrumbDragOverId] = useState<string | null>(null);

  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Clear highlight when the view context changes so a stale ID doesn't linger
  useEffect(() => {
    if (highlightedId) setHighlightedId(null);
  }, [currentFolderId, searchQuery, quickView]);
  const [isMoveConfirmOpen, setIsMoveConfirmOpen] = useState(false);
  const [pendingMoveId, setPendingMoveId] = useState("");
  const [pendingMoveFolderId, setPendingMoveFolderId] = useState<string | null>(null);
  const [pendingMoveDiagramName, setPendingMoveDiagramName] = useState("");
  const [pendingMoveTargetName, setPendingMoveTargetName] = useState("");

  // True once the initial folder has been hydrated from the URL, so the URL-sync effect below
  // doesn't clear `?folder=` on the very first render (before hydration runs).
  const didHydrateFolderRef = useRef(false);

  useEffect(() => {
    fetchData();
  }, []);

  // Hydrate the current folder from the URL (`?folder=<id>`) on mount so deep-links and page
  // refreshes restore the folder view. If no URL param is present, restore from saved preferences.
  // Done in an effect (client-only) rather than a lazy initial state to avoid SSR/hydration
  // mismatch. If the folder no longer exists, the existing validation effect falls back to root
  // and the URL is cleared by the sync effect below.
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("folder");
    if (f) {
      setCurrentFolderId(f);
    } else if (savedFolderId && hydrated) {
      setCurrentFolderId(savedFolderId);
    }
    didHydrateFolderRef.current = true;
  }, [hydrated, savedFolderId]);

  // Keep the URL in sync with the selected folder using replaceState (no Next navigation / re-fetch
  // and no history spam — folder switches stay bookmarkable/refresh-safe without polluting history).
  // Also persist the selection to user preferences so it survives browser restart.
  useEffect(() => {
    if (!didHydrateFolderRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (currentFolderId) params.set("folder", currentFolderId);
    else params.delete("folder");
    const qs = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    setUserPref("currentFolderId", currentFolderId);
  }, [currentFolderId, setUserPref]);

  const fetchData = async () => {
    try {
      const startTime = Date.now();
      const [diagRes, folderRes] = await Promise.all([
        fetch("/api/diagrams"),
        fetch("/api/folders"),
      ]);
      if (!diagRes.ok) throw new Error("Failed to fetch");
      const { items } = await diagRes.json();
      const folderData = folderRes.ok ? await folderRes.json() : [];

      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 600) {
        await new Promise((resolve) => setTimeout(resolve, 600 - elapsedTime));
      }
      setDiagrams(items);
      setFolders(folderData);
    } catch (error) {
      toast.error("Failed to load diagrams");
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = () => {
    setCreateName("Untitled Diagram");
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (payload: CreateDiagramPayload) => {
    if (!payload.name.trim()) return;
    setIsCreateOpen(false);

    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: payload.name,
          type: payload.type,
          templateId: payload.templateId,
          code: payload.code,
          folderId: currentFolderId,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      const newDoc = await res.json();
      setDiagrams((prev) => [newDoc, ...prev]);
      window.open(`/editor/${newDoc.id}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error("Failed to create diagram");
    }
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleteOpen(false);
    try {
      const res = await fetch(`/api/diagrams/${deleteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setDiagrams(diagrams.filter((d) => d.id !== deleteId));
      toast.success("Diagram deleted");
    } catch (error) {
      toast.error("Failed to delete diagram");
    }
  };

  const openRenameDialog = (id: string, currentName: string) => {
    setRenameId(id);
    setRenameName(currentName);
    setIsRenameOpen(true);
  };

  const handleRenameSubmit = async () => {
    if (!renameName.trim()) return;
    setIsRenameOpen(false);

    try {
      const res = await fetch(`/api/diagrams/${renameId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName }),
      });
      if (!res.ok) throw new Error("Failed to rename");

      setDiagrams(
        diagrams.map((d) =>
          d.id === renameId ? { ...d, name: renameName, updatedAt: new Date().toISOString() } : d,
        ),
      );
      toast.success("Diagram renamed");
    } catch (error) {
      toast.error("Failed to rename diagram");
    }
  };

  // ---- Folder handlers ----------------------------------------------------

  const openCreateFolderDialog = () => {
    setCreateFolderName("New Folder");
    setIsCreateFolderOpen(true);
  };

  const handleCreateFolderSubmit = async () => {
    if (!createFolderName.trim()) return;
    setIsCreateFolderOpen(false);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nesting disabled → always create at root. When ALLOW_NESTED_FOLDERS is enabled, new
        // folders are created inside the folder the user is currently viewing.
        body: JSON.stringify({
          name: createFolderName,
          parentId: ALLOW_NESTED_FOLDERS ? currentFolderId : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create folder");
      const newFolder = await res.json();
      setFolders((prev) => [...prev, newFolder]);
      toast.success("Folder created");
    } catch {
      toast.error("Failed to create folder");
    }
  };

  const openRenameFolderDialog = (id: string, currentName: string) => {
    setRenameFolderId(id);
    setRenameFolderName(currentName);
    setIsRenameFolderOpen(true);
  };

  const handleRenameFolderSubmit = async () => {
    if (!renameFolderName.trim()) return;
    setIsRenameFolderOpen(false);
    try {
      const res = await fetch(`/api/folders/${renameFolderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameFolderName }),
      });
      if (!res.ok) throw new Error("Failed to rename folder");
      setFolders((prev) =>
        prev.map((f) => (f.id === renameFolderId ? { ...f, name: renameFolderName } : f)),
      );
      toast.success("Folder renamed");
    } catch {
      toast.error("Failed to rename folder");
    }
  };

  const openDeleteFolderDialog = (id: string) => {
    setDeleteFolderId(id);
    setIsDeleteFolderOpen(true);
  };

  const handleDeleteFolderConfirm = async () => {
    setIsDeleteFolderOpen(false);
    try {
      const res = await fetch(`/api/folders/${deleteFolderId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete folder");
      // Folder delete reparents contents to the deleted folder's parent — refetch to resync.
      await fetchData();
      toast.success("Folder deleted");
    } catch {
      toast.error("Failed to delete folder");
    }
  };

  const handleMoveFolder = async (id: string, parentId: string | null) => {
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to move folder");
      }
      setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, parentId } : f)));
      toast.success("Folder moved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to move folder");
    }
  };

  const handleMoveDiagram = async (id: string, folderId: string | null) => {
    try {
      const res = await fetch(`/api/diagrams/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) throw new Error("Failed to move diagram");
      setDiagrams((prev) => prev.map((d) => (d.id === id ? { ...d, folderId } : d)));
      const dest = folderId
        ? (folders.find((f) => f.id === folderId)?.name ?? "folder")
        : "Workspace";
      toast.success(`Moved to ${dest}`);
    } catch {
      toast.error("Failed to move diagram");
    }
  };

  const handleDuplicateDiagram = async (id: string) => {
    if (isDemo) {
      toast.info("Demo mode — this is read only, changes won't be saved");
      return;
    }
    try {
      const sourceRes = await fetch(`/api/diagrams/${id}`);
      if (!sourceRes.ok) throw new Error("Source diagram not found");
      const source = await sourceRes.json();
      const createRes = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${source.name} (Copy)`,
          code: source.code,
          type: source.type,
          folderId: source.folderId ?? null,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to duplicate diagram");
      const newDiagram = await createRes.json();
      setDiagrams((prev) => [newDiagram, ...prev]);
      setHighlightedId(newDiagram.id);
      setTimeout(() => setHighlightedId(null), 1500);
      toast.success("Diagram duplicated");
    } catch {
      toast.error("Failed to duplicate diagram");
    }
  };

  const handleToggleDiagramStar = async (id: string, starred: boolean) => {
    if (isDemo) {
      toast.info("Demo mode — this is read only, changes won't be saved");
      return;
    }
    const starredAt = starred ? new Date().toISOString() : null;
    const previous = diagrams;
    setDiagrams((prev) => prev.map((d) => (d.id === id ? { ...d, starred, starredAt } : d)));
    try {
      const res = await fetch(`/api/diagrams/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred, starredAt }),
      });
      if (!res.ok) throw new Error("Failed to update star");
      const updated = await res.json();
      setDiagrams((prev) => prev.map((d) => (d.id === id ? updated : d)));
    } catch {
      setDiagrams(previous);
      toast.error("Failed to update diagram star");
    }
  };

  const handleToggleFolderStar = async (id: string, starred: boolean) => {
    if (isDemo) {
      toast.info("Demo mode — this is read only, changes won't be saved");
      return;
    }
    const starredAt = starred ? new Date().toISOString() : null;
    const previous = folders;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, starred, starredAt } : f)));
    try {
      const res = await fetch(`/api/folders/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred, starredAt }),
      });
      if (!res.ok) throw new Error("Failed to update star");
      const updated = await res.json();
      setFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
    } catch {
      setFolders(previous);
      toast.error("Failed to update folder star");
    }
  };

  // Open the move-confirmation dialog (non-demo only). Captures the target names so the dialog
  // can display them before the user confirms.
  const requestMoveDiagram = (id: string, folderId: string | null) => {
    const diagramName = diagrams.find((d) => d.id === id)?.name ?? "diagram";
    const targetName = folderId
      ? (folders.find((f) => f.id === folderId)?.name ?? "folder")
      : "Workspace";
    setPendingMoveId(id);
    setPendingMoveFolderId(folderId);
    setPendingMoveDiagramName(diagramName);
    setPendingMoveTargetName(targetName);
    setIsMoveConfirmOpen(true);
  };

  const handleMoveDiagramConfirm = async () => {
    setIsMoveConfirmOpen(false);
    await handleMoveDiagram(pendingMoveId, pendingMoveFolderId);
  };

  // Unified handler for diagram drops onto a folder target (FolderCard / FolderTree).
  // In demo mode shows an informational toast instead of performing the move.
  const handleFolderDrop = (diagramId: string, folderId: string | null) => {
    if (isDemo) {
      toast.info("Demo mode — this is read only, changes won't be saved");
      return;
    }
    requestMoveDiagram(diagramId, folderId);
  };

  // ---- Derived data -------------------------------------------------------

  const isSearching = searchQuery.trim().length > 0;

  // Debounce the search: typing updates `searchInput` instantly, but the actual filter
  // (`searchQuery`) only updates ~450ms after the user stops typing. During that window
  // `searchLoading` shows a spinner + skeletons so the result swap feels like a deliberate fetch
  // rather than a jittery per-keystroke filter. Clearing the field applies immediately (no delay).
  const SEARCH_DEBOUNCE_MS = 450;
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (searchInput === searchQuery) {
      setSearchLoading(false);
      return;
    }
    if (searchInput.trim() === "") {
      // Instant clear — no spinner.
      setSearchQuery("");
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    searchTimer.current = setTimeout(() => {
      setSearchQuery(searchInput);
      setSearchLoading(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchInput, searchQuery]);

  // Apply (or clear) the search field and its debounced value together. Used by folder navigation
  // and the "clear" affordances so they reset both the input and the applied filter atomically.
  const resetSearch = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchInput("");
    setSearchQuery("");
    setSearchLoading(false);
  };

  useEffect(() => {
    const handleSearchShortcut = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === "Escape" && document.activeElement === searchInputRef.current) {
        if (searchInput.trim() || searchQuery.trim()) {
          e.preventDefault();
          if (searchTimer.current) clearTimeout(searchTimer.current);
          setSearchInput("");
          setSearchQuery("");
          setSearchLoading(false);
        } else {
          searchInputRef.current?.blur();
        }
      }
    };

    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, [searchInput, searchQuery]);

  // Breadcrumb ancestor chain for the current folder (root → … → current).
  const breadcrumb = useMemo(() => {
    const chain: Folder[] = [];
    let cursor = currentFolderId;
    const byId = new Map(folders.map((f) => [f.id, f]));
    const guard = new Set<string>();
    while (cursor && byId.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      const f = byId.get(cursor)!;
      chain.unshift(f);
      cursor = f.parentId;
    }
    return chain;
  }, [currentFolderId, folders]);

  // If the current folder was deleted (reparented away), fall back to root. Guarded by `!loading`
  // so it never fires while folders are still being fetched — otherwise a folder hydrated from the
  // URL (`?folder=`) on a fresh load would be wiped before its folder list arrives.
  useEffect(() => {
    if (!loading && currentFolderId && !folders.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [folders, currentFolderId, loading]);

  // Flattened move-target list (Workspace root + every folder, depth-indented).
  const moveTargets = useMemo(() => {
    const targets: { id: string | null; name: string; depth: number }[] = [
      { id: null, name: "Workspace (root)", depth: 0 },
    ];
    const childrenOf = (pid: string | null) =>
      folders.filter((f) => f.parentId === pid).sort((a, b) => a.name.localeCompare(b.name));
    const walk = (pid: string | null, depth: number) => {
      for (const f of childrenOf(pid)) {
        targets.push({ id: f.id, name: f.name, depth });
        walk(f.id, depth + 1);
      }
    };
    walk(null, 1);
    return targets;
  }, [folders]);

  const childCountOf = (folderId: string) => {
    const subFolders = folders.filter((f) => f.parentId === folderId).length;
    const docs = diagrams.filter((d) => (d.folderId ?? null) === folderId).length;
    return subFolders + docs;
  };

  // Recently-edited diagrams for the sidebar "Recent" section (most recent first).
  const recentDiagrams = useMemo(() => {
    return [...diagrams]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [diagrams]);

  // Switch the current folder with a brief loading transition. Even though folder contents are
  // already in client state (so switching is instant), a short skeleton avoids a jarring flash and
  // reassures the user that content is being prepared — matching the perceived-load pattern used
  // elsewhere. Clearing the search keeps the destination folder's contents in scope.
  const navigateToFolder = (id: string | null) => {
    if (id === currentFolderId && searchInput.trim() === "" && searchQuery.trim() === "") return;
    resetSearch();
    setFolderLoading(true);
    setQuickView(null);
    setCurrentFolderId(id);
    if (folderSwitchTimer.current) clearTimeout(folderSwitchTimer.current);
    folderSwitchTimer.current = setTimeout(() => setFolderLoading(false), 350);
  };

  const selectQuickView = (view: "all" | "recent" | "starred") => {
    resetSearch();
    setFolderLoading(true);
    setQuickView(view);
    setCurrentFolderId(null);
    if (folderSwitchTimer.current) clearTimeout(folderSwitchTimer.current);
    folderSwitchTimer.current = setTimeout(() => setFolderLoading(false), 350);
  };

  // Clean up the folder-switch timer on unmount.
  useEffect(
    () => () => {
      if (folderSwitchTimer.current) clearTimeout(folderSwitchTimer.current);
    },
    [],
  );

  // Folders shown in the current view. Searching filters within that same view so the search scope
  // matches the selected sidebar/folder context.
  const visibleFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const inScope =
      quickView === "starred"
        ? folders.filter((f) => f.starred)
        : quickView === "recent"
          ? []
          : quickView === "all"
            ? folders
            : folders.filter((f) => (f.parentId ?? null) === currentFolderId);
    const list = isSearching ? inScope.filter((f) => f.name.toLowerCase().includes(q)) : inScope;
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [folders, currentFolderId, isSearching, searchQuery, quickView]);

  const filteredDiagrams = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const inScope =
      quickView === "starred"
        ? diagrams.filter((d) => d.starred)
        : quickView === "recent"
          ? [...diagrams]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .slice(0, 20)
          : quickView === "all"
            ? diagrams
            : // The workspace behaves like a file-explorer root: it shows the folders plus only the
              // diagrams that live directly at this level (unfiled at root, or owned by the current
              // folder). Diagrams moved into a folder leave the root view and surface inside that folder.
              diagrams.filter((d) => (d.folderId ?? null) === currentFolderId);
    const sorted = isSearching
      ? inScope.filter((d) => d.name.toLowerCase().includes(q))
      : [...inScope];
    if (sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === "created") {
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else {
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }
    return sorted;
  }, [diagrams, searchQuery, isSearching, currentFolderId, sortBy, quickView]);

  // Lazy-load: show 12 items at a time, reveal next batch via IntersectionObserver.
  const LAZY_BATCH = 12;
  const LAZY_DELAY_MS = 1500;
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setDisplayCount(12);
    setLoadingMore(false);
    if (loadMoreTimer.current) clearTimeout(loadMoreTimer.current);
  }, [currentFolderId, searchQuery, sortBy, quickView]);

  const displayedDiagrams = useMemo(() => {
    return filteredDiagrams.slice(0, displayCount);
  }, [filteredDiagrams, displayCount]);

  useEffect(() => {
    if (loading || folderLoading || searchLoading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore && displayCount < filteredDiagrams.length) {
          setLoadingMore(true);
          if (loadMoreTimer.current) clearTimeout(loadMoreTimer.current);
          loadMoreTimer.current = setTimeout(() => {
            setDisplayCount((prev) => Math.min(prev + LAZY_BATCH, filteredDiagrams.length));
            setLoadingMore(false);
          }, LAZY_DELAY_MS);
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [displayCount, filteredDiagrams.length, loadingMore, loading, folderLoading, searchLoading]);

  useEffect(
    () => () => {
      if (loadMoreTimer.current) clearTimeout(loadMoreTimer.current);
    },
    [],
  );

  // Clean up the search debounce timer on unmount.
  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const headerTitle =
    quickView === "all"
      ? "All Files"
      : quickView === "recent"
        ? "Recent Diagrams"
        : quickView === "starred"
          ? "Starred Items"
          : currentFolderId
            ? (breadcrumb[breadcrumb.length - 1]?.name ?? "Your Diagrams")
            : "Your Diagrams";

  const quickViewBreadcrumb =
    quickView === "all"
      ? "All Files"
      : quickView === "recent"
        ? "Recent"
        : quickView === "starred"
          ? "Starred"
          : null;

  const searchPlaceholder =
    quickView === "all"
      ? "Search all files"
      : quickView === "recent"
        ? "Search recent diagrams"
        : quickView === "starred"
          ? "Search starred items"
          : currentFolderId
            ? `Search in ${headerTitle}`
            : "Search workspace";
  const searchResultCount = visibleFolders.length + filteredDiagrams.length;
  const searchResultLabel = `${searchResultCount} result${searchResultCount === 1 ? "" : "s"}`;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Demo-mode notification bar — full-width, sticky to the very top above the sidebar + content. */}
      {isDemo && (
        <div className="sticky top-0 z-50">
          <DemoBanner />
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* ---- Left Sidebar ---- */}
        <aside
          className={`hidden md:flex w-80 shrink-0 flex-col border-r border-border bg-background/60 sticky ${isDemo ? "top-[41px] h-[calc(100vh-41px)]" : "top-0 h-screen"}`}
        >
          {/* Brand */}
          <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border shrink-0">
            <BrandLogo className="w-8 h-8 rounded-lg" />
            <span className="font-semibold text-lg tracking-tight">LiveMaid</span>
          </div>

          {/* Sidebar navigation: Recent + Folders */}
          <div className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-5">
            {/* Quick views */}
            <div>
              <div className="flex items-center gap-1.5 px-2 mb-2">
                <LayoutGrid className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Quick views
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {[
                  { id: "all" as const, label: "All Files", icon: FileText },
                  { id: "recent" as const, label: "Recent", icon: Clock },
                  { id: "starred" as const, label: "Starred", icon: Star },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => selectQuickView(item.id)}
                      className={`flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm transition-colors text-left ${quickView === item.id ? "bg-accent text-foreground" : "text-foreground/80 hover:bg-accent hover:text-foreground"}`}
                    >
                      <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Recent */}
            <div>
              <div className="flex items-center gap-1.5 px-2 mb-2">
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent
                </span>
              </div>
              {recentDiagrams.length === 0 ? (
                <p className="px-2 text-xs text-muted-foreground/70">No diagrams yet</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {recentDiagrams.map((d) => (
                    <a
                      key={d.id}
                      href={`/editor/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/x-livemaid-diagram", d.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      title={d.name}
                      className="flex items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors text-left"
                    >
                      <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{d.name}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>

            {/* Folders */}
            <div>
              <div className="border-t border-border -mx-2 mb-4" />
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <FolderPlus className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Folders
                  </span>
                </div>
                {!isDemo && (
                  <button
                    onClick={openCreateFolderDialog}
                    title="New folder"
                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <FolderPlus className="w-4 h-4" />
                  </button>
                )}
              </div>
              <FolderTree
                folders={folders}
                currentFolderId={currentFolderId}
                onSelect={(id) => navigateToFolder(id)}
                onDropDiagram={handleFolderDrop}
                onRename={openRenameFolderDialog}
                onDelete={openDeleteFolderDialog}
                isDemo={isDemo}
              />
            </div>
          </div>

          {/* Sidebar footer: settings + version */}
          <div className="border-t border-border p-3 shrink-0">
            <button
              onClick={openSettings}
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground/80 hover:bg-accent hover:text-foreground transition-colors w-full text-left"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <div className="mt-1.5 px-2 text-sm text-muted-foreground/70 select-none flex items-center justify-between">
              <span>Version</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="font-mono">{appVersion ?? "0.0.0"}</span>
                <a
                  href={`https://github.com/peter6055/livemaid/releases/tag/v${rawVersion ?? appVersion ?? "0.0.0"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-muted-foreground transition-colors"
                >
                  Changelogs
                </a>
              </span>
            </div>
          </div>
        </aside>

        {/* ---- Right Main Area ---- */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mobile top bar (sidebar hidden) */}
          <nav className="md:hidden h-16 border-b border-border bg-background flex items-center px-4 shrink-0 sticky top-0 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="mr-2" />}>
                <Menu className="w-5 h-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                {!isDemo && (
                  <DropdownMenuItem
                    onClick={openCreateFolderDialog}
                    className="cursor-pointer gap-2"
                  >
                    <FolderPlus className="w-4 h-4" /> New Folder
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    setTheme(isDark ? "light" : "dark");
                  }}
                  className="cursor-pointer gap-2"
                >
                  <Moon className="w-4 h-4" /> Toggle Theme
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    openSettings();
                  }}
                  className="cursor-pointer gap-2"
                >
                  <Settings className="w-4 h-4" /> Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <BrandLogo className="w-8 h-8 mr-2 rounded-lg" />
            <span className="font-semibold text-lg tracking-tight">LiveMaid</span>
          </nav>

          {/* Main Content */}
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-10 py-5 md:py-7 flex-grow">
            <div className="mb-6 border-b border-border pb-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
                  <div className="min-w-0">
                    <nav className="mb-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground flex-wrap">
                      <button
                        onClick={() => navigateToFolder(null)}
                        onDragOver={(e) => {
                          if (e.dataTransfer.types.includes("application/x-livemaid-diagram")) {
                            e.preventDefault();
                            setBreadcrumbDragOverId("__root__");
                          }
                        }}
                        onDragLeave={() => setBreadcrumbDragOverId(null)}
                        onDrop={(e) => {
                          const diagramId = e.dataTransfer.getData(
                            "application/x-livemaid-diagram",
                          );
                          setBreadcrumbDragOverId(null);
                          if (diagramId) {
                            e.preventDefault();
                            handleFolderDrop(diagramId, null);
                          }
                        }}
                        className={`flex items-center gap-1 rounded-full px-2 py-1 transition-colors hover:bg-accent hover:text-foreground ${currentFolderId === null && !quickView ? "text-foreground" : ""} ${breadcrumbDragOverId === "__root__" ? "ring-2 ring-indigo-500/50 bg-indigo-500/10" : ""}`}
                      >
                        <Home className="w-3.5 h-3.5" /> Workspace
                      </button>
                      {quickViewBreadcrumb && (
                        <span className="flex min-w-0 items-center gap-1">
                          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                          <span className="truncate rounded-full bg-accent px-2 py-1 text-foreground">
                            {quickViewBreadcrumb}
                          </span>
                        </span>
                      )}
                      {!quickView &&
                        breadcrumb.map((f) => (
                          <span key={f.id} className="flex min-w-0 items-center gap-1">
                            <ChevronRight className="w-3.5 h-3.5 opacity-50" />
                            <button
                              onClick={() => navigateToFolder(f.id)}
                              onDragOver={(e) => {
                                if (
                                  e.dataTransfer.types.includes("application/x-livemaid-diagram")
                                ) {
                                  e.preventDefault();
                                  setBreadcrumbDragOverId(f.id);
                                }
                              }}
                              onDragLeave={() => setBreadcrumbDragOverId(null)}
                              onDrop={(e) => {
                                const diagramId = e.dataTransfer.getData(
                                  "application/x-livemaid-diagram",
                                );
                                setBreadcrumbDragOverId(null);
                                if (diagramId) {
                                  e.preventDefault();
                                  handleFolderDrop(diagramId, f.id);
                                }
                              }}
                              className={`max-w-[180px] truncate rounded-full px-2 py-1 transition-colors hover:bg-accent hover:text-foreground ${f.id === currentFolderId ? "bg-accent text-foreground" : ""} ${breadcrumbDragOverId === f.id ? "ring-2 ring-indigo-500/50 bg-indigo-500/10" : ""}`}
                            >
                              {f.name}
                            </button>
                          </span>
                        ))}
                    </nav>

                    <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
                      {headerTitle}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <div className="hidden items-center gap-2 sm:flex">
                      {!isDemo && (
                        <Button
                          onClick={openCreateFolderDialog}
                          variant="outline"
                          className="h-10 w-[168px] justify-center gap-2 whitespace-nowrap"
                        >
                          <FolderPlus className="w-4 h-4" />
                          New Folder
                        </Button>
                      )}

                      {isDemo ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <Button
                                disabled
                                className="bg-[#7a3dff]/40 text-white rounded-lg h-10 w-[168px] justify-center gap-2 text-sm font-medium whitespace-nowrap pointer-events-none opacity-60"
                              >
                                <Plus className="w-5 h-5" />
                                New Diagram
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Read-only in demo mode</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <Button
                          onClick={openCreateDialog}
                          className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white rounded-lg h-10 w-[168px] justify-center gap-2 text-sm font-medium shadow-sm transition-all hover:shadow-md whitespace-nowrap"
                        >
                          <Plus className="w-5 h-5" />
                          New Diagram
                        </Button>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button className="h-10 gap-2 bg-[#7a3dff] text-white hover:bg-[#6b33e6] sm:hidden" />
                        }
                      >
                        <Plus className="w-4 h-4" />
                        Create
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        {!isDemo && (
                          <DropdownMenuItem
                            onClick={openCreateFolderDialog}
                            className="cursor-pointer gap-2"
                          >
                            <FolderPlus className="w-4 h-4" /> New Folder
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={openCreateDialog}
                          disabled={isDemo}
                          className="cursor-pointer gap-2"
                        >
                          <Plus className="w-4 h-4" /> New Diagram
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                <div className="flex w-full min-w-0 flex-wrap items-start gap-3 sm:flex-nowrap">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                      <Input
                        ref={searchInputRef}
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder={searchPlaceholder}
                        aria-label="Search dashboard"
                        className="h-10 pl-9 pr-9"
                      />
                      {searchLoading ? (
                        <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
                      ) : searchInput ? (
                        <button
                          onClick={resetSearch}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      ) : null}
                    </div>
                    {(searchInput.trim() || isSearching) && (
                      <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                        {searchLoading
                          ? `Searching ${headerTitle.toLowerCase()}...`
                          : `${searchResultLabel} for "${searchQuery || searchInput}"`}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap sm:pt-0.5">
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 p-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              className="h-8 gap-2 px-2.5 text-sm whitespace-nowrap"
                              aria-label="Sort diagrams"
                            />
                          }
                        >
                          <ArrowDownUp className="w-4 h-4" />
                          <span className="hidden sm:inline">
                            {sortBy === "edited"
                              ? "Last edited"
                              : sortBy === "created"
                                ? "Date created"
                                : "Name"}
                          </span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => setUserPref("sortBy", "edited")}
                            className="cursor-pointer"
                          >
                            Last edited
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setUserPref("sortBy", "created")}
                            className="cursor-pointer"
                          >
                            Date created
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setUserPref("sortBy", "name")}
                            className="cursor-pointer"
                          >
                            Name
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      <div className="h-5 w-px bg-border" />
                      <button
                        type="button"
                        onClick={() => setUserPref("viewMode", "grid")}
                        aria-label="Grid view"
                        aria-pressed={viewMode === "grid"}
                        title="Grid view"
                        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                          viewMode === "grid"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <LayoutGrid className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setUserPref("viewMode", "list")}
                        aria-label="List view"
                        aria-pressed={viewMode === "list"}
                        title="List view"
                        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                          viewMode === "list"
                            ? "bg-background text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {loading || folderLoading || searchLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card
                    key={i}
                    className="flex flex-col h-full bg-background border-border shadow-sm"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between w-full">
                        <Skeleton className="h-6 w-2/3 rounded-md bg-zinc-200/60 dark:bg-zinc-800/60" />
                        <div className="flex gap-1">
                          <Skeleton className="h-8 w-8 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60" />
                          <Skeleton className="h-8 w-8 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60" />
                        </div>
                      </div>
                      <div className="flex items-center mt-2 gap-2">
                        <Skeleton className="h-3.5 w-4 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60" />
                        <Skeleton className="h-4 w-1/4 rounded bg-zinc-200/60 dark:bg-zinc-800/60" />
                      </div>
                    </CardHeader>
                    <CardContent className="flex-grow">
                      <div className="w-full h-32 bg-white rounded-md border border-border flex items-center justify-center overflow-hidden relative">
                        {/* High fidelity animated flowchart node shapes inside skeleton */}
                        <div className="flex items-center justify-center gap-3 w-full h-full px-4 opacity-50 dark:opacity-40 animate-pulse">
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
                      </div>
                    </CardContent>
                    <CardFooter className="pt-3 border-t border-border text-xs text-muted-foreground flex items-center mt-2">
                      <Skeleton className="h-3.5 w-24 bg-zinc-200/60 dark:bg-zinc-800/60" />
                    </CardFooter>
                  </Card>
                ))}
              </div>
            ) : filteredDiagrams.length === 0 && visibleFolders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-lg bg-background/50 backdrop-blur-sm">
                <div className="bg-muted p-4 rounded-full mb-4">
                  <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {diagrams.length === 0
                    ? "No diagrams yet"
                    : isSearching
                      ? `No results found for "${searchQuery}"`
                      : "No diagrams found"}
                </h3>
                <p className="text-muted-foreground text-sm mb-6 max-w-xs text-center">
                  {diagrams.length === 0
                    ? "Get started by creating your first diagram. Choose a template above or create from scratch."
                    : isSearching
                      ? "Try a different name, diagram type, or folder."
                      : "Try a different search term or create a new diagram."}
                </p>
                <div className="flex gap-3">
                  {isDemo ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger render={<span className="inline-flex" />}>
                          <Button
                            disabled
                            className="bg-[#7a3dff]/40 text-white rounded-lg px-6 shadow-sm pointer-events-none opacity-60"
                          >
                            Create Diagram
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Read-only in demo mode</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Button
                      onClick={openCreateDialog}
                      className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white rounded-lg px-6 shadow-sm"
                    >
                      Create Diagram
                    </Button>
                  )}
                  {diagrams.length > 0 && (
                    <Button variant="outline" onClick={resetSearch}>
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {visibleFolders.length > 0 && (
                  <div className="mb-8">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                      Folders{" "}
                      <span className="text-muted-foreground/60">({visibleFolders.length})</span>
                    </h2>
                    <div
                      className={
                        viewMode === "list"
                          ? "flex flex-col gap-2"
                          : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                      }
                    >
                      {visibleFolders.map((folder) => (
                        <FolderCard
                          key={folder.id}
                          folder={folder}
                          childCount={childCountOf(folder.id)}
                          onOpen={(id) => navigateToFolder(id)}
                          onRename={openRenameFolderDialog}
                          onDelete={openDeleteFolderDialog}
                          onMove={handleMoveFolder}
                          onToggleStar={handleToggleFolderStar}
                          onDropDiagram={handleFolderDrop}
                          moveTargets={moveTargets}
                          canMove={ALLOW_NESTED_FOLDERS}
                          isDemo={isDemo}
                          view={viewMode}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/** Diagrams section header (only shown when folders are also visible) */}
                {filteredDiagrams.length > 0 && visibleFolders.length > 0 && (
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Diagrams{" "}
                    <span className="text-muted-foreground/60">({filteredDiagrams.length})</span>
                  </h2>
                )}
                {filteredDiagrams.length > 0 && (
                  <div
                    className={
                      viewMode === "list"
                        ? "flex flex-col gap-2"
                        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    }
                  >
                    {displayedDiagrams.map((diagram) => (
                      <DiagramCard
                        key={diagram.id}
                        diagram={diagram}
                        onRename={openRenameDialog}
                        onDelete={openDeleteDialog}
                        onDuplicate={handleDuplicateDiagram}
                        onMove={requestMoveDiagram}
                        onToggleStar={handleToggleDiagramStar}
                        highlighted={diagram.id === highlightedId}
                        moveTargets={moveTargets}
                        isDemo={isDemo}
                        view={viewMode}
                      />
                    ))}
                  </div>
                )}
                {displayCount < filteredDiagrams.length && (
                  <div ref={sentinelRef} className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <CreateDiagramDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        defaultName={createName || "Untitled Diagram"}
        onCreate={handleCreateSubmit}
      />

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameSubmit} className="bg-black text-white hover:bg-zinc-800">
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Alert Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your diagram.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={createFolderName}
              onChange={(e) => setCreateFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolderSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolderSubmit}
              className="bg-black text-white hover:bg-zinc-800"
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={isRenameFolderOpen} onOpenChange={setIsRenameFolderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={renameFolderName}
              onChange={(e) => setRenameFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleRenameFolderSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolderSubmit}
              className="bg-black text-white hover:bg-zinc-800"
            >
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Folder Alert Dialog */}
      <AlertDialog open={isDeleteFolderOpen} onOpenChange={setIsDeleteFolderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this folder?</AlertDialogTitle>
            <AlertDialogDescription>
              The folder will be deleted. Any diagrams and subfolders inside it will be moved up to
              the parent location — nothing is lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolderConfirm}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Move Diagram Confirmation Dialog */}
      <AlertDialog open={isMoveConfirmOpen} onOpenChange={setIsMoveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move diagram?</AlertDialogTitle>
            <AlertDialogDescription>
              Move &ldquo;{pendingMoveDiagramName}&rdquo; to &ldquo;{pendingMoveTargetName}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleMoveDiagramConfirm}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
