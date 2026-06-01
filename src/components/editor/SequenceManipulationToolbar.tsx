import { useRef, useEffect, useState } from "react";
import { ArrowLeftRight, Link2, Pencil, SquarePen, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface SequenceManipulationToolbarProps {
  selectedNodeId: string | null;
  scale: number;
  onEditLabel: (e: React.MouseEvent) => void;
  onAddNote: (position: "left" | "right" | "over") => void;
  onMoveNote: (position: "left" | "right" | "over") => void;
  onLinkNote: () => void;
  onDeleteNode: () => void;
}

export function SequenceManipulationToolbar({
  selectedNodeId,
  scale,
  onEditLabel,
  onAddNote,
  onMoveNote,
  onLinkNote,
  onDeleteNode,
}: SequenceManipulationToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isNoteSelected = Boolean(selectedNodeId?.startsWith("SEQ_NOTE_"));
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [notePosition, setNotePosition] = useState<"left" | "right" | "over">("right");

  const handleConfirmAddNote = () => {
    onAddNote(notePosition);
    setNoteDialogOpen(false);
    setNotePosition("right");
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const stopNativePropagation = (e: Event) => e.stopPropagation();
    el.addEventListener("mousedown", stopNativePropagation);
    el.addEventListener("pointerdown", stopNativePropagation);
    el.addEventListener("touchstart", stopNativePropagation);
    return () => {
      el.removeEventListener("mousedown", stopNativePropagation);
      el.removeEventListener("pointerdown", stopNativePropagation);
      el.removeEventListener("touchstart", stopNativePropagation);
    };
  }, []);

  const btnCls = "pointer-events-auto flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent hover:text-accent-foreground text-foreground transition-colors";

  return (
    <div
      ref={containerRef}
      data-scale-lock
      data-base-transform="translateX(-50%) translateY(-100%)"
      className="absolute left-1/2 pointer-events-auto z-30 origin-bottom"
      style={{
        top: `calc(-10px * var(--zoom-inverse-scale, ${1 / scale}))`,
        transform: `translateX(-50%) translateY(-100%) scale(var(--zoom-inverse-scale, ${1 / scale}))`
      }}
    >
      <div className="flex items-center gap-1 bg-background border border-border rounded-xl shadow-lg px-2 py-1">
        {!isNoteSelected && (
          <>
            <button className={btnCls} onClick={onEditLabel} title="Rename">
              <Pencil className="w-3.5 h-3.5" />
            </button>

            <button className={btnCls} onClick={() => setNoteDialogOpen(true)} title="Note">
              <SquarePen className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />
          </>
        )}

        {isNoteSelected && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <button className={btnCls} title="Change position">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
              } />
              <DropdownMenuContent align="center" sideOffset={8} className="min-w-44">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Note</div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onMoveNote("left")}>Move note to the left</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMoveNote("right")}>Move note to the right</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMoveNote("over")}>Move note over</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button className={btnCls} onClick={onLinkNote} title="Link/Connect">
              <Link2 className="w-3.5 h-3.5" />
            </button>

            <div className="w-px h-4 bg-border mx-0.5" />
          </>
        )}

        <button className={`${btnCls} hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30`} onClick={onDeleteNode} title="Delete">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
            <DialogDescription>
              Choose where to place the note in relation to the sequence.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <p className="text-sm text-muted-foreground mb-3">Position</p>
            <Button
              variant={notePosition === "left" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setNotePosition("left")}
            >
              Note to the left
            </Button>
            <Button
              variant={notePosition === "right" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setNotePosition("right")}
            >
              Note to the right
            </Button>
            <Button
              variant={notePosition === "over" ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setNotePosition("over")}
            >
              Note over
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAddNote}>
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
