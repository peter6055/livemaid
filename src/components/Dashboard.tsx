"use client";

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { DiagramCard, DiagramDocument } from '@/components/DiagramCard';
import { Button } from '@/components/ui/button';
import { Plus, LayoutTemplate, Menu, Loader2, PlusSquare, Moon, Search, GitBranch, MessageSquare } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

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

export default function Dashboard() {
  const { theme, setTheme } = useTheme();
  const [diagrams, setDiagrams] = useState<DiagramDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const router = useRouter();

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");

  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState("");
  const [renameName, setRenameName] = useState("");

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteId, setDeleteId] = useState("");

  useEffect(() => {
    fetchDiagrams();
  }, []);

  const fetchDiagrams = async () => {
    try {
      const startTime = Date.now();
      const res = await fetch('/api/diagrams');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      
      const elapsedTime = Date.now() - startTime;
      if (elapsedTime < 600) {
        await new Promise(resolve => setTimeout(resolve, 600 - elapsedTime));
      }
      setDiagrams(data);
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

  const handleCreateSubmit = async () => {
    if (!createName.trim()) return;
    setIsCreateOpen(false);

    try {
      const res = await fetch('/api/diagrams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName, type: 'flowchart' })
      });
      if (!res.ok) throw new Error('Failed to create');
      const newDoc = await res.json();
      handleNavigate(`/editor/${newDoc.id}`);
    } catch (error) {
      toast.error("Failed to create diagram");
    }
  };

  const openDeleteDialog = (id: string) => {
    setDeleteId(id);
    setIsDeleteOpen(true);
  };

  const handleNavigate = (url: string) => {
    setIsNavigating(true);
    setTimeout(() => {
      router.push(url);
    }, 400);
  };

  const handleDeleteConfirm = async () => {
    setIsDeleteOpen(false);
    try {
      const res = await fetch(`/api/diagrams/${deleteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setDiagrams(diagrams.filter(d => d.id !== deleteId));
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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameName })
      });
      if (!res.ok) throw new Error('Failed to rename');
      
      setDiagrams(diagrams.map(d => 
        d.id === renameId ? { ...d, name: renameName, updatedAt: new Date().toISOString() } : d
      ));
      toast.success("Diagram renamed");
    } catch (error) {
      toast.error("Failed to rename diagram");
    }
  };

  const filteredDiagrams = diagrams.filter((diagram) =>
    diagram.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Nav */}
      <nav className="h-16 border-b border-border bg-background dark:bg-[#121212] flex items-center px-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="mr-2 text-zinc-700 hover:text-zinc-900 bg-slate-100 hover:bg-slate-200 dark:text-muted-foreground dark:hover:text-foreground dark:bg-[#1b1b1f] dark:hover:bg-[#252529]" />}>
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={openCreateDialog} className="cursor-pointer rounded-md px-3 py-2.5 text-[15px] focus:bg-accent focus:text-accent-foreground flex items-center gap-2">
                <PlusSquare className="w-4 h-4" />
                <span>New Diagram</span>
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
            </DropdownMenuContent>
          </DropdownMenu>
          
          <div className="bg-[#7a3dff] p-1.5 rounded-lg mr-3">
            <LayoutTemplate className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-xl tracking-tight mr-4">LiveMaid</span>
          <span className="text-sm font-medium text-muted-foreground border-l border-border pl-4">The WYSIWYG Mermaid Editor</span>
        </div>
      </nav>

      {isNavigating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
            <p className="text-lg font-medium text-foreground animate-pulse">Loading Workspace...</p>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto w-full px-8 py-12 flex-grow">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-12">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
              Your Diagrams
            </h1>
            <p className="text-muted-foreground text-lg">Create, edit, and manage your visual workspaces.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search diagrams"
                className="pl-9"
              />
            </div>
            <Button onClick={openCreateDialog} className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white rounded-lg px-6 py-6 text-base font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
              <Plus className="w-5 h-5 mr-2" />
              New Diagram
            </Button>
          </div>
        </div>

        {/* Supported Diagrams Intro */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 rounded-md p-4">
            <div className="flex items-start gap-2">
              <div className="bg-blue-500/20 p-1.5 rounded flex-shrink-0">
                <GitBranch className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-0.5">Flowchart</h3>
                <p className="text-xs text-muted-foreground">Nodes, connections & decision paths</p>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border border-purple-200/50 dark:border-purple-800/50 rounded-md p-4">
            <div className="flex items-start gap-2">
              <div className="bg-purple-500/20 p-1.5 rounded flex-shrink-0">
                <MessageSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-0.5">Sequence</h3>
                <p className="text-xs text-muted-foreground">Participant interactions & messages</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="flex flex-col h-full bg-background border-border shadow-sm">
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
        ) : filteredDiagrams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-lg bg-background hover:bg-accent transition-colors">
            <div className="bg-muted p-3 rounded-full mb-4">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">{diagrams.length === 0 ? 'No diagrams yet' : 'No diagrams found'}</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {diagrams.length === 0 ? 'Create your first diagram to get started.' : 'Try a different search term.'}
            </p>
            {diagrams.length === 0 ? (
              <Button onClick={openCreateDialog} className="bg-[#7a3dff] hover:bg-[#6b33e6] text-white rounded-lg px-6 shadow-sm">
                Create Diagram
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setSearchQuery("")}>
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredDiagrams.map(diagram => (
              <DiagramCard 
                key={diagram.id} 
                diagram={diagram} 
                onRename={openRenameDialog}
                onDelete={openDeleteDialog}
                onNavigate={handleNavigate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={createName} 
              onChange={(e) => setCreateName(e.target.value)} 
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} className="bg-black text-white hover:bg-zinc-800">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameSubmit} className="bg-black text-white hover:bg-zinc-800">Rename</Button>
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
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-500 hover:bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
