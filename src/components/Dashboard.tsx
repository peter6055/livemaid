"use client";

import { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { DiagramCard, DiagramDocument } from '@/components/DiagramCard';
import { Button } from '@/components/ui/button';
import { Plus, LayoutTemplate, Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
  const [loading, setLoading] = useState(true);
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
      const res = await fetch('/api/diagrams');
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
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
      router.push(`/editor/${newDoc.id}`);
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

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      {/* Top Nav */}
      <nav className="h-16 border-b border-border bg-background flex items-center px-4 shrink-0 sticky top-0 z-10">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="mr-2 text-zinc-700 hover:text-zinc-900 hover:bg-slate-100" />}>
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={openCreateDialog}>New Diagram</DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.preventDefault(); setTheme(theme === "dark" ? "light" : "dark"); }} className="flex justify-between items-center w-full cursor-pointer">
                <span>Dark Mode</span>
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

      {/* Main Content */}
      <div className="max-w-6xl mx-auto w-full px-8 py-12 flex-grow">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
              Your Diagrams
            </h1>
            <p className="text-muted-foreground text-lg">Create, edit, and manage your visual workspaces.</p>
          </div>
          <Button onClick={openCreateDialog} className="bg-black hover:bg-zinc-800 text-white rounded-full px-6 py-6 text-base font-medium shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
            <Plus className="w-5 h-5 mr-2" />
            New Diagram
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64 text-muted-foreground">Loading diagrams...</div>
        ) : diagrams.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-border rounded-lg bg-background hover:bg-accent transition-colors">
            <div className="bg-muted p-3 rounded-full mb-4">
              <LayoutTemplate className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground">No diagrams yet</h3>
            <p className="text-muted-foreground text-sm mb-4">Create your first diagram to get started.</p>
            <Button onClick={openCreateDialog} className="bg-black hover:bg-zinc-800 text-white rounded-full px-6 shadow-sm">
              Create Diagram
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {diagrams.map(diagram => (
              <DiagramCard 
                key={diagram.id} 
                diagram={diagram} 
                onRename={openRenameDialog}
                onDelete={openDeleteDialog}
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
