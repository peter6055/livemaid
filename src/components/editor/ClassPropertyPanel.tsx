"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ParsedClass, ClassEdits } from "@/lib/diagrams/classDiagram";

interface ClassPropertyPanelProps {
  /** The parsed class currently selected on the canvas, or null when no class is selected. */
  selectedClass: ParsedClass | null;
  /** Commit edits back to the Mermaid code (debounced for members, immediate for name). */
  onApply: (edits: ClassEdits) => void;
  /** Close the panel (deselects the class). */
  onClose: () => void;
}

/**
 * Contextual right-sidebar property panel for editing a UML class (the PRD's "better approach":
 * inline-free, non-blocking, structured editing). Edits are two-way bound to the code editor.
 *
 * Binding model:
 *  - Local controlled state is the source of truth while the panel is open and focused.
 *  - Members/annotation commit on a short debounce (live-ish updates without re-render churn).
 *  - The class name commits on blur / Enter only (renaming re-keys the selection).
 *  - When the selection switches to a different class, or the code changes externally while no
 *    field is focused, the local state re-seeds from props (keeps code ↔ panel in sync).
 */
export function ClassPropertyPanel({ selectedClass, onApply, onClose }: ClassPropertyPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [attributes, setAttributes] = useState("");
  const [methods, setMethods] = useState("");

  const className = selectedClass?.name ?? null;

  // Seed/re-seed local state from props when the selected class changes, or when the code changes
  // externally while the panel is not focused (avoid clobbering in-progress typing).
  useEffect(() => {
    if (!selectedClass) return;
    const panelHasFocus = !!rootRef.current?.contains(document.activeElement);
    if (panelHasFocus) return;
    setName(selectedClass.name);
    setAnnotation(selectedClass.annotation);
    setAttributes(selectedClass.attributes.join("\n"));
    setMethods(selectedClass.methods.join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, selectedClass?.annotation, selectedClass?.attributes, selectedClass?.methods]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  if (!selectedClass) return null;

  const toLines = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

  const commit = (override?: Partial<{ annotation: string; attributes: string; methods: string }>) => {
    onApply({
      annotation: override?.annotation ?? annotation,
      attributes: toLines(override?.attributes ?? attributes),
      methods: toLines(override?.methods ?? methods),
    });
  };

  const debouncedCommit = (override?: Parameters<typeof commit>[0]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(override), 400);
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === selectedClass.name) return;
    onApply({
      newName: trimmed,
      annotation,
      attributes: toLines(attributes),
      methods: toLines(methods),
    });
  };

  const fieldClass =
    "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors";

  return (
    <div
      ref={rootRef}
      data-class-property-panel
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-20 right-3 z-30 flex w-72 flex-col gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-xl backdrop-blur-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Class Properties</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close properties panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Class name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitName();
            }
          }}
          className={fieldClass}
          placeholder="ClassName"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Annotation</span>
        <input
          value={annotation}
          onChange={(e) => {
            setAnnotation(e.target.value);
            debouncedCommit({ annotation: e.target.value });
          }}
          onBlur={() => commit()}
          className={fieldClass}
          placeholder="e.g. interface, abstract, enumeration"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Attributes</span>
        <textarea
          value={attributes}
          onChange={(e) => {
            setAttributes(e.target.value);
            debouncedCommit({ attributes: e.target.value });
          }}
          onBlur={() => commit()}
          rows={4}
          className={`${fieldClass} resize-y font-mono leading-relaxed`}
          placeholder={"+String name\n-int age"}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Methods</span>
        <textarea
          value={methods}
          onChange={(e) => {
            setMethods(e.target.value);
            debouncedCommit({ methods: e.target.value });
          }}
          onBlur={() => commit()}
          rows={4}
          className={`${fieldClass} resize-y font-mono leading-relaxed`}
          placeholder={"+makeSound() void\n+move(int x) bool"}
        />
      </label>

      <p className="text-[11px] leading-snug text-muted-foreground">
        One member per line. Use <span className="font-mono">+ - # ~</span> for visibility; include{" "}
        <span className="font-mono">()</span> for methods.
      </p>
    </div>
  );
}
