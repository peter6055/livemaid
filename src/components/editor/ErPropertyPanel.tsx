"use client";

import { useEffect, useRef, useState } from "react";
import { X, Trash2, GripVertical, ChevronDown, Check, Plus } from "lucide-react";
import type { ParsedEntity, EntityEdits, ParsedAttribute } from "@/lib/diagrams/erDiagram";
import {
  validateEntityAttribute,
  validateAttributeType,
  validateAttributeName,
  parseAttributeParts,
  serializeAttributeParts,
  normalizeAttributeKeys,
  ER_KEY_OPTIONS,
} from "@/lib/diagrams/erDiagram";

interface ErPropertyPanelProps {
  /** The parsed entity currently selected on the canvas, or null when none is selected. */
  selectedEntity: ParsedEntity | null;
  /** Commit edits back to the Mermaid code (debounced for typing, immediate for discrete actions). */
  onApply: (edits: EntityEdits) => void;
  /** Close the panel (deselects the entity). */
  onClose: () => void;
  /** Report whether the panel holds invalid attribute rows (parent blocks deselect while invalid). */
  onValidityChange?: (hasErrors: boolean) => void;
}

const emptyRow = (): ParsedAttribute => ({ type: "", name: "", keys: "", comment: "" });

/* -------------------------------------------------------------------------- */
/* Auto-growing single-logical-line text field. Renders a <textarea> that wraps */
/* long content onto the next line and grows its height to fit (so nothing is   */
/* clipped). Enter is suppressed so values stay newline-free; Enter/blur commit. */
/* Declared at module level to satisfy react-hooks/static-components.           */
/* -------------------------------------------------------------------------- */

function GridTextarea({
  value,
  invalid,
  mono = true,
  placeholder,
  onChange,
  onBlur,
}: {
  value: string;
  invalid?: boolean;
  mono?: boolean;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content (height = scrollHeight) on every value change.
  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(resize, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      onChange={(e) => {
        onChange(e.target.value.replace(/\n/g, ""));
        resize();
      }}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      placeholder={placeholder}
      spellCheck={false}
      aria-invalid={invalid}
      className={`block min-w-0 flex-1 resize-none overflow-hidden break-words bg-transparent px-2.5 py-2.5 align-top text-sm leading-snug outline-none placeholder:text-muted-foreground/60 ${
        mono ? "font-mono" : ""
      } ${invalid ? "text-red-600 dark:text-red-400" : "text-foreground"}`}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Keys field — a multi-select dropdown (PK / FK / UK). Mermaid allows multiple */
/* key constraints on one attribute (e.g. `PK, FK`), so this toggles each one.  */
/* -------------------------------------------------------------------------- */

function KeysDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const selected = new Set(
    value
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const toggle = (k: string) => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    onChange(normalizeAttributeKeys([...next].join(",")));
  };

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ left: r.left, top: r.bottom + 4, width: Math.max(r.width, 176) });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="h-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          if (open) setOpen(false);
          else openMenu();
        }}
        className={`flex h-full w-full items-center justify-between gap-1 px-2.5 py-2 text-left text-sm outline-none ${
          value ? "font-mono text-foreground" : "text-muted-foreground/60"
        }`}
      >
        <span className="truncate">{value || "Keys"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      </button>
      {open && pos && (
        <div
          className="fixed z-[70] rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-xl"
          style={{ left: pos.left, top: pos.top, width: pos.width }}
        >
          {ER_KEY_OPTIONS.map((opt) => {
            const on = selected.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground hover:bg-accent"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    on ? "border-indigo-500 bg-indigo-500 text-white" : "border-border"
                  }`}
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="flex-1">{opt.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{opt.value}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Contextual right-sidebar property panel for editing an ER entity (mirrors the class diagram's
 * "better approach": inline-free, non-blocking, structured editing). Two-way bound to the code.
 *
 * Each attribute is edited as FOUR structured fields — **Data Type** (an editable dropdown of
 * predefined types), **Name**, **Keys** (a PK/FK/UK multi-select dropdown), and **Comment** — which
 * serialize to the Mermaid attribute line `type name [keys] ["comment"]`. Typing commits on a short
 * debounce; discrete actions (dropdown pick, keys toggle, add/delete/reorder) commit immediately.
 * Invalid rows show a red ring and are NEVER committed to code (the diagram stays renderable).
 */
export function ErPropertyPanel({
  selectedEntity,
  onApply,
  onClose,
  onValidityChange,
}: ErPropertyPanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [name, setName] = useState("");
  const [alias, setAlias] = useState("");
  const [rows, setRows] = useState<ParsedAttribute[]>([emptyRow()]);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const entityName = selectedEntity?.name ?? null;

  // Per-row validity (reuses the single source of truth on the serialized line). `rowErrors` drives
  // the inline message + commit-drop + close guard; `typeFieldErrors`/`nameFieldErrors` drive the
  // per-field red highlight so the user sees WHICH field (Data Type vs Name) breaks the grammar.
  const rowErrors = rows.map((r) => validateEntityAttribute(serializeAttributeParts(r)));
  const typeFieldErrors = rows.map((r) => validateAttributeType(r.type));
  const nameFieldErrors = rows.map((r) => validateAttributeName(r.name));
  const hasErrors = rowErrors.some(Boolean);

  // Seed/re-seed from props. Always re-seed when the selected entity changes identity; for an
  // external code change to the SAME entity, suppress the re-seed while the panel is focused (don't
  // clobber in-progress typing) or while there are local validation errors.
  const prevNameRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedEntity) return;
    const changed = prevNameRef.current !== entityName;
    const panelHasFocus = !!rootRef.current?.contains(document.activeElement);
    if (!changed && (panelHasFocus || hasErrors)) return;
    prevNameRef.current = entityName;
    setName(selectedEntity.name);
    setAlias(selectedEntity.alias);
    setRows(
      selectedEntity.attributes.length
        ? selectedEntity.attributes.map(parseAttributeParts)
        : [emptyRow()],
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityName, selectedEntity?.alias, selectedEntity?.attributes]);

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    [],
  );

  useEffect(() => {
    onValidityChange?.(hasErrors);
  }, [hasErrors, onValidityChange]);
  useEffect(() => () => onValidityChange?.(false), [onValidityChange]);

  if (!selectedEntity) return null;

  // Drop blank AND invalid rows so malformed attributes never reach the code (which would break
  // rendering); the invalid rows stay visible in the panel until the user fixes them.
  const cleanRows = (rs: ParsedAttribute[]) =>
    rs
      .map(serializeAttributeParts)
      .map((s) => s.trim())
      .filter((s) => s && !validateEntityAttribute(s));

  const flushTimer = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };

  const commit = (override?: { alias?: string; rows?: ParsedAttribute[] }) => {
    onApply({
      alias: override?.alias ?? alias,
      attributes: cleanRows(override?.rows ?? rows),
    });
  };

  const debouncedCommit = (override?: { alias?: string; rows?: ParsedAttribute[] }) => {
    flushTimer();
    debounceRef.current = setTimeout(() => commit(override), 400);
  };

  // Commit the latest state immediately (used on field blur, so a quick close never loses an edit).
  const flush = () => {
    flushTimer();
    commit();
  };

  const commitName = () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === selectedEntity.name) return;
    onApply({ newName: trimmed, alias, attributes: cleanRows(rows) });
  };

  // Update one field of one row. `immediate` (dropdown picks / keys toggles) commits at once;
  // otherwise the change is debounced (typing).
  const updateRow = (i: number, patch: Partial<ParsedAttribute>, immediate = false) => {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    setRows(next);
    if (immediate) {
      flushTimer();
      commit({ rows: next });
    } else {
      debouncedCommit({ rows: next });
    }
  };

  const addRow = () => {
    // A blank row serializes to "" and is filtered on commit, so no commit is needed here.
    setRows([...rows, emptyRow()]);
  };

  const deleteRow = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    const finalRows = next.length ? next : [emptyRow()];
    setRows(finalRows);
    flushTimer();
    commit({ rows: finalRows });
  };

  const reorderRows = (from: number, to: number) => {
    if (from === to) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setRows(next);
    flushTimer();
    commit({ rows: next });
  };

  const fieldClass =
    "w-full rounded-md border border-border bg-slate-50 dark:bg-[#0a0913] px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition-colors";

  const handleCloseAttempt = () => {
    // Block closing while a row is invalid (the parent also blocks outside-click deselect).
    if (hasErrors) return;
    onClose();
  };

  // Shared column widths so the header and every row align.
  const colType = "w-28 shrink-0";
  const colName = "w-44 shrink-0";
  const colKeys = "w-40 shrink-0";
  const colComment = "flex-1 min-w-[10rem]";
  const colActions = "w-[3.25rem] shrink-0";

  return (
    <div
      ref={rootRef}
      data-er-property-panel
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-3 top-20 z-30 flex max-h-[82vh] w-[34rem] max-w-[calc(100vw-1.5rem)] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-white p-5 text-foreground shadow-xl dark:bg-[#100f1b]"
    >
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-foreground">Entity Properties</span>
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
          Fix the highlighted attribute row before closing this panel.
        </p>
      )}

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-muted-foreground">Entity name</span>
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
            placeholder="ENTITY"
          />
        </label>
      </div>

      {/* Structured attribute grid: Data Type | Name | Keys | Comment + row actions. */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <div className="min-w-max">
          <div className="flex border-b border-border bg-muted/70 text-sm font-semibold text-muted-foreground">
            <div className={colActions} />
            <div className={`${colType} whitespace-nowrap border-r border-border px-2.5 py-2`}>
              Data Type
            </div>
            <div className={`${colName} border-r border-border px-2.5 py-2`}>Name</div>
            <div className={`${colKeys} border-r border-border px-2.5 py-2`}>Keys</div>
            <div className={`${colComment} border-r border-border px-2.5 py-2`}>Comment</div>
          </div>

          {rows.map((row, i) => {
            const isDropTarget = dragOver === i && dragFrom !== null && dragFrom !== i;
            const rowError = rowErrors[i];
            // Highlight the specific field at fault: its own grammar error, OR (when the other field
            // is filled but this one is blank) the "needs a type and a name" rule.
            const typeInvalid =
              !!typeFieldErrors[i] || (row.name.trim() !== "" && row.type.trim() === "");
            const nameInvalid =
              !!nameFieldErrors[i] || (row.type.trim() !== "" && row.name.trim() === "");
            return (
              <div key={`attr-${i}`} className="border-b border-border last:border-b-0">
                <div
                  data-member-row
                  onDragOver={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragOver !== i) setDragOver(i);
                  }}
                  onDrop={(e) => {
                    if (dragFrom === null) return;
                    e.preventDefault();
                    reorderRows(dragFrom, i);
                    setDragFrom(null);
                    setDragOver(null);
                  }}
                  className={`group flex items-stretch ${
                    isDropTarget ? "bg-indigo-500/10 ring-1 ring-inset ring-indigo-500/60" : ""
                  } ${rowError ? "bg-red-500/5 ring-1 ring-inset ring-red-500/50" : "hover:bg-accent/40"} ${
                    dragFrom === i ? "opacity-40" : ""
                  }`}
                >
                  <div className={`${colActions} flex items-center justify-start gap-0.5 pl-1.5`}>
                    <button
                      type="button"
                      onClick={() => deleteRow(i)}
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
                        setDragFrom(i);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", String(i));
                        const rowEl = (e.currentTarget as HTMLElement).closest("[data-member-row]");
                        if (rowEl) e.dataTransfer.setDragImage(rowEl as Element, 20, 16);
                      }}
                      onDragEnd={() => {
                        setDragFrom(null);
                        setDragOver(null);
                      }}
                      title="Drag to reorder"
                      aria-label="Drag to reorder"
                      className="flex h-6 w-5 cursor-grab items-center justify-center text-muted-foreground/60 transition-colors active:cursor-grabbing focus-visible:outline-none group-hover:text-indigo-500 dark:group-hover:text-indigo-400"
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                  </div>
                  <div className={`${colType} flex items-stretch border-r border-border`}>
                    <GridTextarea
                      value={row.type}
                      invalid={typeInvalid}
                      placeholder="type"
                      onChange={(v) => updateRow(i, { type: v })}
                      onBlur={flush}
                    />
                  </div>
                  <div className={`${colName} flex items-stretch border-r border-border`}>
                    <GridTextarea
                      value={row.name}
                      invalid={nameInvalid}
                      placeholder="name"
                      onChange={(v) => updateRow(i, { name: v })}
                      onBlur={flush}
                    />
                  </div>
                  <div className={`${colKeys} border-r border-border`}>
                    <KeysDropdown
                      value={row.keys}
                      onChange={(v) => updateRow(i, { keys: v }, true)}
                    />
                  </div>
                  <div className={`${colComment} flex items-stretch border-r border-border`}>
                    <GridTextarea
                      value={row.comment}
                      mono={false}
                      placeholder="comment"
                      onChange={(v) => updateRow(i, { comment: v })}
                      onBlur={flush}
                    />
                  </div>
                </div>
                {rowError && (
                  <p className="px-2.5 pb-1.5 text-xs leading-snug text-red-600 dark:text-red-400">
                    {rowError}
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={addRow}
            className="flex w-full items-center justify-center gap-1.5 bg-muted/40 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add attribute
          </button>
        </div>
      </div>

      <p className="text-xs leading-snug text-muted-foreground">
        Each attribute has a <span className="font-medium text-foreground">Data Type</span> (pick a
        common type or type a custom one — it must start with a letter and use only letters, digits,{" "}
        <span className="font-mono">_ - ( ) [ ]</span>), a{" "}
        <span className="font-medium text-foreground">Name</span> (same rule, optionally prefixed
        with <span className="font-mono">*</span> for a primary key), optional{" "}
        <span className="font-mono">PK</span>/<span className="font-mono">FK</span>/
        <span className="font-mono">UK</span>{" "}
        <span className="font-medium text-foreground">Keys</span>, and an optional{" "}
        <span className="font-medium text-foreground">Comment</span>.
      </p>
    </div>
  );
}
