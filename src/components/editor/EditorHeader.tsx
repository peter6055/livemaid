import { DiagramDocument } from "@/lib/api/storage";
import { useTheme } from "next-themes";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Loader2, Menu, LayoutTemplate, Download } from "lucide-react";

interface EditorHeaderProps {
  doc: DiagramDocument | null;
  saving: boolean;
  onNavigate: (url: string, message: string) => void;
  onDuplicate: () => void;
  onNewDiagram: () => void;
  onRename: () => void;
  onExport: () => void;
}

export function EditorHeader({
  doc,
  saving,
  onNavigate,
  onDuplicate,
  onNewDiagram,
  onRename,
  onExport
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
            <DropdownMenuItem onClick={onNewDiagram} className="focus:bg-accent focus:text-accent-foreground cursor-pointer">New Diagram</DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate} className="focus:bg-accent focus:text-accent-foreground cursor-pointer">Duplicate</DropdownMenuItem>
            <DropdownMenuItem onClick={onRename} className="focus:bg-accent focus:text-accent-foreground cursor-pointer">Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.preventDefault(); setTheme(theme === "dark" ? "light" : "dark"); }} className="flex justify-between items-center w-full cursor-pointer focus:bg-accent focus:text-accent-foreground">
              <span>Dark Mode</span>
              <div className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${theme === 'dark' ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                <div className={`w-3 h-3 bg-white rounded-full transition-transform absolute ${theme === 'dark' ? 'left-4' : 'left-1'}`} />
              </div>
            </DropdownMenuItem>
            <a href="/" onClick={(e) => { e.preventDefault(); onNavigate('/', 'Returning to Projects...'); }}><DropdownMenuItem className="focus:bg-accent focus:text-accent-foreground cursor-pointer">Dashboard</DropdownMenuItem></a>
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
                className="cursor-pointer hover:underline text-indigo-500" 
                onDoubleClick={onRename} 
                title="Double click to rename"
              >
                {doc?.name || "Untitled"}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-3 text-sm font-medium mr-4">
        <Button variant="ghost" size="sm" onClick={onExport} className="flex items-center gap-2 mr-2 text-foreground hover:bg-accent h-9 border border-border">
          <Download className="w-4 h-4" />
          <span>Export</span>
        </Button>
        {saving ? (
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
