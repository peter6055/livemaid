"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, GripVertical } from "lucide-react";
import type { ParsedClass, ClassEdits } from "@/lib/diagrams/classDiagram";
import { validateClassAttribute, validateClassMethod } from "@/lib/diagrams/classDiagram";

interface ClassPropertyPanelProps {
  /** The parsed class currently selected on the canvas, or null when no class is selected. */
  selectedClass: ParsedClass | null;
  /** Commit edits back to the Mermaid code (debounced for members, immediate for name). */
  onApply: (edits: ClassEdits) => void;
  /** Close the panel (deselects the class). */
  onClose: () => void;
  /**
   * Report whether the panel currently holds invalid attribute/method rows. The parent uses this to
   * block deselection (closing the panel) while validation is failing.
   */
  onValidityChange?: (hasErrors: boolean) => void;
}

type MemberSection = "attributes" | "methods";

/** Per-section validator — attributes and methods are validated by SEPARATE rule sets. */
const validateRow = (section: MemberSection, value: string): string | null =>
  section === "attributes" ? validateClassAttribute(value) : validateClassMethod(value);

/**
 * Contextual right-sidebar property panel for editing a UML class (the PRD's "better approach":
 * inline-free, non-blocking, structured editing). Edits are two-way bound to the code editor.
 *
 * Attributes and Methods are rendered as a structured key/value table grid — each member lives in
 * its own borderless input row, grouped by section. Pressing Enter inserts a blank row below;
 * Backspace on an empty row removes it. All edits sync live to the Mermaid `class {}` block and the
 * rendered canvas; conversely, editing the code re-seeds the grid rows.
 *
 * Binding model:
 *  - Local controlled state is the source of truth while the panel is open and focused.
 *  - Members/annotation commit on a short debounce (live-ish updates without re-render churn).
 *  - The class name commits on blur / Enter only (renaming re-keys the selection).
 *  - When the selection switches to a different class, or the code changes externally while no
 *    field is focused, the local state re-seeds from props (keeps code ↔ panel in sync).
 */
export function ClassPropertyPanel({
  selectedClass,
  onApply,
  onClose,
  onValidityChange,
}: ClassPropertyPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState("");
  const [annotation, setAnnotation] = useState("");
  const [attributes, setAttributes] = useState<string[]>([""]);
  const [methods, setMethods] = useState<string[]>([""]);

  // Per-section input element refs (index-aligned) for programmatic focus after row add/remove.
  const inputRefs = useRef<Record<MemberSection, Array<HTMLInputElement | null>>>({
    attributes: [],
    methods: [],
  });
  const pendingFocus = useRef<{ section: MemberSection; index: number } | null>(null);
  const [focusTick, setFocusTick] = useState(0);

  // Drag-to-reorder state for member rows (the dot handle is the drag grip).
  const [dragRow, setDragRow] = useState<{ section: MemberSection; from: number } | null>(null);
  const [dragOverRow, setDragOverRow] = useState<{ section: MemberSection; index: number } | null>(
    null,
  );

  const className = selectedClass?.name ?? null;

  // Per-section validation (attributes and methods use SEPARATE rule sets). Index-aligned with the
  // rendered rows so each invalid row can surface its own inline error.
  const attributeErrors = attributes.map((row) => validateRow("attributes", row));
  const methodErrors = methods.map((row) => validateRow("methods", row));
  const hasErrors = attributeErrors.some(Boolean) || methodErrors.some(Boolean);

  // Seed/re-seed local state from props. When the SELECTED CLASS changes identity, always re-seed
  // (the previous class's local edits/errors no longer apply). For an external code change to the
  // SAME class, suppress the re-seed while the panel is focused (don't clobber in-progress typing)
  // or while there are local validation errors (a debounced commit landing mid-fix must never
  // silently discard the invalid row the user is correcting).
  const prevClassNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedClass) return;
    const classChanged = prevClassNameRef.current !== className;
    const panelHasFocus = !!rootRef.current?.contains(document.activeElement);
    if (!classChanged && (panelHasFocus || hasErrors)) return;
    prevClassNameRef.current = className;
    setName(selectedClass.name);
    setAnnotation(selectedClass.annotation);
    setAttributes(selectedClass.attributes.length ? selectedClass.attributes : [""]);
    setMethods(selectedClass.methods.length ? selectedClass.methods : [""]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, selectedClass?.annotation, selectedClass?.attributes, selectedClass?.methods]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  // Apply a requested focus (e.g. after inserting/removing a row) once the new inputs are mounted.
  useEffect(() => {
    const pf = pendingFocus.current;
    if (!pf) return;
    const el = inputRefs.current[pf.section]?.[pf.index];
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    pendingFocus.current = null;
  }, [focusTick]);

  // Report validity upward so the parent can block deselection (closing the panel) while invalid.
  // Reset to valid on unmount so a stale error state can never permanently wedge the deselect guard.
  useEffect(() => {
    onValidityChange?.(hasErrors);
  }, [hasErrors, onValidityChange]);
  useEffect(() => () => onValidityChange?.(false), [onValidityChange]);

  if (!selectedClass) return null;

  // Drop blank rows AND rows that fail their section's validator so invalid text never reaches the
  // Mermaid code (which would break rendering); the invalid rows stay in the panel until fixed.
  const cleanRows = (section: MemberSection, rows: string[]) =>
    rows.map((s) => s.trim()).filter((s) => s && !validateRow(section, s));

  const commit = (override?: {
    annotation?: string;
    attributes?: string[];
    methods?: string[];
  }) => {
    onApply({
      annotation: override?.annotation ?? annotation,
      attributes: cleanRows("attributes", override?.attributes ?? attributes),
      methods: cleanRows("methods", override?.methods ?? methods),
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
      attributes: cleanRows("attributes", attributes),
      methods: cleanRows("methods", methods),
    });
  };

  const getRows = (section: MemberSection) => (section === "attributes" ? attributes : methods);
  const setRows = (section: MemberSection, rows: string[]) =>
    (section === "attributes" ? setAttributes : setMethods)(rows);
  const overrideFor = (section: MemberSection, rows: string[]) =>
    section === "attributes" ? { attributes: rows } : { methods: rows };
  const requestFocus = (section: MemberSection, index: number) => {
    pendingFocus.current = { section, index };
    setFocusTick((t) => t + 1);
  };

  const handleRowChange = (section: MemberSection, index: number, value: string) => {
    const next = [...getRows(section)];
    next[index] = value;
    setRows(section, next);
    debouncedCommit(overrideFor(section, next));
  };

  // Enter inserts a blank row below (and focuses it); Backspace on an already-empty row removes it.
  const handleRowKeyDown = (
    section: MemberSection,
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    const rows = getRows(section);
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...rows];
      next.splice(index + 1, 0, "");
      setRows(section, next);
      requestFocus(section, index + 1);
    } else if (e.key === "Backspace" && rows[index] === "" && rows.length > 1) {
      e.preventDefault();
      const next = [...rows];
      next.splice(index, 1);
      setRows(section, next);
      requestFocus(section, Math.max(0, index - 1));
      debouncedCommit(overrideFor(section, next));
    }
  };

  // Reorder a row within its section (immediate commit so it is a single undo step).
  const reorderRows = (section: MemberSection, from: number, to: number) => {
    if (from === to) return;
    const rows = [...getRows(section)];
    const [moved] = rows.splice(from, 1);
    rows.splice(to, 0, moved);
    setRows(section, rows);
    commit(overrideFor(section, rows));
  };

  // Delete a row via the trash button; keep at least one (blank) row so the section stays editable.
  const deleteRow = (section: MemberSection, index: number) => {
    const next = getRows(section).filter((_, i) => i !== index);
    const finalRows = next.length ? next : [""];
    setRows(section, finalRows);
    commit(overrideFor(section, finalRows));
  };

  const fieldClass =
    "w-full rounded-md border border-border bg-slate-50 dark:bg-[#0a0913] px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors";

  const renderSection = (
    section: MemberSection,
    label: string,
    placeholder: string,
    last = false,
  ) => {
    const rows = getRows(section);
    const errors = section === "attributes" ? attributeErrors : methodErrors;
    // Keep the ref array in sync with the rendered rows (drop stale tail entries after deletes).
    inputRefs.current[section].length = rows.length;
    return (
      <div className={`flex ${last ? "" : "border-b border-border"}`}>
        <div className="w-36 shrink-0 border-r border-border bg-muted/50 px-3 py-2.5 text-sm font-medium text-foreground">
          {label}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          {rows.map((row, i) => {
            const isDropTarget =
              dragOverRow?.section === section &&
              dragOverRow.index === i &&
              dragRow?.section === section &&
              dragRow.from !== i;
            const rowError = errors[i];
            return (
              <div
                // Index keys are intentional: row focus is managed explicitly via inputRefs.
                key={`${section}-${i}`}
                className="border-b border-border last:border-b-0"
              >
                <div
                  data-member-row
                  onDragOver={(e) => {
                    if (!dragRow || dragRow.section !== section) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOverRow?.section !== section || dragOverRow.index !== i) {
                      setDragOverRow({ section, index: i });
                    }
                  }}
                  onDrop={(e) => {
                    if (!dragRow || dragRow.section !== section) return;
                    e.preventDefault();
                    reorderRows(section, dragRow.from, i);
                    setDragRow(null);
                    setDragOverRow(null);
                  }}
                  className={`group flex items-center hover:bg-accent/40 ${isDropTarget ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/60" : ""
                    } ${rowError ? "bg-red-500/5 ring-1 ring-inset ring-red-500/50" : ""} ${dragRow?.section === section && dragRow.from === i ? "opacity-40" : ""
                    }`}
                >
                  <input
                    ref={(el) => {
                      inputRefs.current[section][i] = el;
                    }}
                    value={row}
                    onChange={(e) => handleRowChange(section, i, e.target.value)}
                    onKeyDown={(e) => handleRowKeyDown(section, i, e)}
                    onBlur={() => commit()}
                    placeholder={placeholder}
                    spellCheck={false}
                    aria-invalid={!!rowError}
                    className={`min-w-0 flex-1 bg-transparent px-3 py-2 font-mono text-sm outline-none placeholder:text-muted-foreground/60 ${rowError ? "text-red-600 dark:text-red-400" : "text-foreground"
                      }`}
                  />
                  <div className="flex shrink-0 items-center gap-0.5 pr-1.5">
                    <button
                      type="button"
                      onClick={() => deleteRow(section, i)}
                      onMouseDown={(e) => e.preventDefault()}
                      title="Delete row"
                      aria-label="Delete row"
                      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-red-500 focus:opacity-100 focus-visible:outline-none group-hover:opacity-100 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        setDragRow({ section, from: i });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                        const rowEl = (e.currentTarget as HTMLElement).closest("[data-member-row]");
                        if (rowEl) e.dataTransfer.setDragImage(rowEl as Element, 20, 16);
                      }}
                      onDragEnd={() => {
                        setDragRow(null);
                        setDragOverRow(null);
                      }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      className="flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/60 transition-colors active:cursor-grabbing focus-visible:outline-none group-hover:text-indigo-500 dark:group-hover:text-indigo-400"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {rowError && (
                  <p className="px-3 pb-1.5 text-xs leading-snug text-red-600 dark:text-red-400">
                    {rowError}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };
  // Closing is blocked while any row is invalid — focus the first offending row instead so the user
  // is taken straight to what needs fixing. The parent ALSO blocks outside-click deselection via the
  // reported `onValidityChange`, so this guards the explicit (X button) close path symmetrically.
  const handleCloseAttempt = () => {
    if (hasErrors) {
      const section: MemberSection = attributeErrors.some(Boolean) ? "attributes" : "methods";
      const errs = section === "attributes" ? attributeErrors : methodErrors;
      const idx = errs.findIndex(Boolean);
      inputRefs.current[section]?.[idx]?.focus();
      return;
    }
    onClose();
  };

  return (
    <div
      ref={rootRef}
      data-class-property-panel
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-20 right-3 z-30 flex max-h-[82vh] w-96 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-white p-5 text-foreground shadow-xl dark:bg-[#100f1b]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-foreground">Class Properties</span>
        </div>
        <button
          type="button"
          onClick={handleCloseAttempt}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close properties panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {hasErrors && (
        <p
          role="alert"
          className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs leading-snug text-red-600 dark:text-red-400"
        >
          Fix the highlighted attribute/method{" "}
          {attributeErrors.some(Boolean) && methodErrors.some(Boolean) ? "rows" : "row"} before
          closing this panel.
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">Class name</span>
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

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">Annotation</span>
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

      {/* Structured member grid: left column groups by section, right column holds borderless rows. */}
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex border-b border-border bg-muted/70 text-sm font-semibold text-muted-foreground">
          <div className="w-36 shrink-0 whitespace-nowrap border-r border-border px-3 py-2">
            Class Property
          </div>
          <div className="flex-1 px-3 py-2">Value</div>
        </div>
        {renderSection("attributes", "Attributes", "+String name")}
        {renderSection("methods", "Methods", "+method() void", true)}
      </div>

      <p className="text-xs leading-snug text-muted-foreground">
        Click a row to edit. Press <span className="font-mono">Enter</span> to add a row,{" "}
        <span className="font-mono">Backspace</span> on an empty row to remove it. Use{" "}
        <span className="font-mono">+ - # ~</span> for visibility; include{" "}
        <span className="font-mono">()</span> for methods.
      </p>
    </div>
  );
}
