import { DiagramDocument } from "@/lib/api/storage";
import { useTheme } from "next-themes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Loader2, Menu, LayoutTemplate, Download, History, PlusSquare, Copy, PencilLine, Moon, LayoutDashboard } from "lucide-react";

interface EditorHeaderProps {
  doc: DiagramDocument | null;
  saving: boolean;
  isDemo?: boolean;
  onNavigate: (url: string, message: string) => void;
  onDuplicate: () => void;
  onNewDiagram: () => void;
  onRename: () => void;
  onExport: () => void;
  onVersionHistory: () => void;
}

export function EditorHeader({
  doc,
  saving,
  isDemo = false,
  onNavigate,
  onDuplicate,
  onNewDiagram,
  onRename,
  onExport,
  onVersionHistory
}: EditorHeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="h-14 border-b border-border bg-background dark:bg-[#121212] flex items-center px-4 justify-between shrink-0 z-20">
      <div className="flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="mr-2 text-foreground hover:bg-accent" />}>
            <Menu className="w-5 h-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48 bg-background border-border">
            {!isDemo && (
              <DropdownMenuItem onClick={onNewDiagram} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <PlusSquare className="w-4 h-4" />
                <span>New Diagram</span>
              </DropdownMenuItem>
            )}
            {!isDemo && (
              <DropdownMenuItem onClick={onDuplicate} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <Copy className="w-4 h-4" />
                <span>Duplicate</span>
              </DropdownMenuItem>
            )}
            {!isDemo && (
              <DropdownMenuItem onClick={onRename} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <PencilLine className="w-4 h-4" />
                <span>Rename</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onVersionHistory} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
              <History className="w-4 h-4" />
              <span>Version History</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setTheme(theme === "dark" ? "light" : "dark"); }} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex justify-between items-center w-full">
              <span className="flex items-center gap-2">
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </span>
              <div className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform absolute ${theme === 'dark' ? 'left-4' : 'left-1'}`} />
              </div>
            </DropdownMenuItem>
            <a href="/" onClick={(e) => { e.preventDefault(); onNavigate('/', 'Returning to Projects...'); }}>
              <DropdownMenuItem className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard</span>
              </DropdownMenuItem>
            </a>
          </DropdownMenuContent>
        </DropdownMenu>
        <a href="/" onClick={(e) => { e.preventDefault(); onNavigate('/', 'Returning to Projects...'); }}>
          <div className="bg-[#7a3dff] p-1.5 rounded-lg mr-3 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity w-9 h-9">
            <LayoutTemplate className="w-5 h-5 text-white" />
          </div>
        </a>
        
        <div className="flex flex-col mr-6 border-r border-border pr-6">
          <span className="font-bold text-sm leading-tight text-foreground tracking-tight">LiveMaid</span>
          <span className="text-[10px] text-muted-foreground leading-tight tracking-wider uppercase font-medium">Code Your Thoughts</span>
        </div>

        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<a href="/" onClick={(e) => { e.preventDefault(); onNavigate('/', 'Returning to Projects...'); }} />}>
                Projects
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage 
                className={isDemo ? "text-foreground" : "cursor-pointer hover:underline text-indigo-500"}
                onDoubleClick={isDemo ? undefined : onRename}
                title={isDemo ? undefined : "Double click to rename"}
              >
                {doc?.name || "Untitled"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-3 text-sm font-medium mr-4">
        <Button variant="ghost" size="sm" onClick={onExport} className="flex items-center gap-2 text-foreground hover:bg-accent h-9 border border-border">
          <Download className="w-4 h-4" />
          <span>Export</span>
        </Button>
        <button
          type="button"
          onClick={onVersionHistory}
          className="flex h-9 items-center gap-2 rounded-md border border-border px-3 text-foreground transition-colors hover:bg-accent"
          aria-label="Open version history"
        >
          <History className="w-4 h-4" />
          <span>History</span>
        </button>
        {isDemo ? (
          <span className="flex items-center text-amber-600 dark:text-amber-400">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 mr-1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/><path d="M9 17h6"/></svg>
            Read Only
          </span>
        ) : saving ? (
          <span className="flex items-center text-muted-foreground">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Saving...
          </span>
        ) : (
          <span className="flex items-center text-emerald-600">
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 mr-1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            Saved
          </span>
        )}
      </div>
    </header>
  );
}
