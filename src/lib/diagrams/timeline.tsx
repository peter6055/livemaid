import { DiagramPlugin, EditorContext } from "./types";
import { Button } from "@/components/ui/button";
import { ArrowRight, Plus } from "lucide-react";

/**
 * Two-way Mermaid Timeline diagram plugin.
 *
 * Mermaid timeline grammar (see node_modules/.../timeline-definition-*.mjs):
 *   timeline [LR|TD]
 *   title <text>
 *   section <name>          (name may not contain `:`)
 *   <period> : <event> [: <event> ...]
 *   : <event> [: <event> ...]   (continuation line → events of the last period)
 *   %% comment
 *
 * The renderer assigns sequential ids `{diagramId}-node-{N}` (LR) or
 * `undefined-node-{N}` (TD) to every `g.timeline-node` in EXACTLY this order:
 * section nodes (if any), then per section — period nodes, then their event
 * nodes (or all period nodes + events when there are no sections). The DOM
 * index therefore maps 1:1 onto the source model via `timelineRenderOrder`.
 */

export type TimelineDirection = "LR" | "TD";
export type TimelineNodeKind = "section" | "period" | "event";

export interface TimelineEventNode {
  id: string;
  kind: "event";
  label: string;
  /** Physical line containing this event. */
  lineIndex: number;
  /** 0-based position of the event among all events of its period (source order). */
  eventIndex: number;
  /** 0-based position of the event on its physical line. */
  segmentIndex: number;
  periodId: string;
}

export interface TimelinePeriodNode {
  id: string;
  kind: "period";
  label: string;
  /** The period's own line (first line of the block). */
  lineIndex: number;
  /** Last line of the block (last continuation line, or `lineIndex`). */
  blockEndLineIndex: number;
  events: TimelineEventNode[];
  sectionId: string | null;
}

export interface TimelineSectionNode {
  id: string;
  kind: "section";
  label: string;
  lineIndex: number;
  periods: TimelinePeriodNode[];
}

export type TimelineNode = TimelineSectionNode | TimelinePeriodNode | TimelineEventNode;

export interface ParsedTimeline {
  headerLineIndex: number;
  direction: TimelineDirection;
  /** True when the header explicitly spells the direction (e.g. `timeline TD`). */
  directionTokenPresent: boolean;
  title: string | null;
  titleLineIndex: number;
  sections: TimelineSectionNode[];
  /** Periods that precede any section (rendered only when there are no sections). */
  defaultPeriods: TimelinePeriodNode[];
}

const PERIOD_ID_PREFIX = "TIMELINE_PERIOD_";
const SECTION_ID_PREFIX = "TIMELINE_SECTION_";
const EVENT_ID_PREFIX = "TIMELINE_EVENT_";

export function timelinePeriodId(lineIndex: number): string {
  return `${PERIOD_ID_PREFIX}${lineIndex}`;
}

export function timelineSectionId(lineIndex: number): string {
  return `${SECTION_ID_PREFIX}${lineIndex}`;
}

export function timelineEventId(lineIndex: number, eventIndex: number): string {
  return `${EVENT_ID_PREFIX}${lineIndex}_${eventIndex}`;
}

/** Resolve the source line(s) behind a timeline node id (for the code gutter highlight). */
export function timelineLinesFromNodeId(id: string | null | undefined): number[] {
  if (!id) return [];
  const section = id.match(/^TIMELINE_SECTION_(\d+)$/);
  if (section) return [Number(section[1])];
  const period = id.match(/^TIMELINE_PERIOD_(\d+)$/);
  if (period) return [Number(period[1])];
  const event = id.match(/^TIMELINE_EVENT_(\d+)_(\d+)$/);
  if (event) return [Number(event[1])];
  return [];
}

function splitFrontmatterLineCount(lines: string[]): number {
  if (lines[0]?.trim() !== "---") return 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === "---") return i + 1;
  }
  return 0;
}

function leadingIndent(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? "";
}

function stripInlineComment(text: string): string {
  return text.replace(/%%[^\n]*/, "").trim();
}

function isMetadataLine(trimmed: string): boolean {
  return (
    !trimmed ||
    trimmed.startsWith("%%") ||
    trimmed.startsWith("#") ||
    /^(accTitle|accDescr)\b/.test(trimmed)
  );
}

/** True when the line starts an event continuation (`: text`) in Mermaid's sense. */
function isContinuationLine(trimmed: string): boolean {
  return trimmed.startsWith(":");
}

/**
 * Split a period line into its period label and the event segments on that line.
 * Mirrors the Mermaid lexer: the period label ends at the first `:` (or `#`), and
 * events are separated by `: ` (a colon followed by whitespace).
 */
function splitPeriodAndEvents(text: string): { period: string; events: string[] } {
  const colonIndex = text.search(/[#:]/);
  const periodPart = colonIndex < 0 ? text : text.slice(0, colonIndex);
  const rest = colonIndex < 0 ? "" : text.slice(colonIndex + 1);
  const events: string[] = [];
  let cursor = 0;
  for (;;) {
    const sep = rest.indexOf(": ", cursor);
    const part = (sep < 0 ? rest.slice(cursor) : rest.slice(cursor, sep)).trim();
    if (part) events.push(stripInlineComment(part));
    if (sep < 0) break;
    cursor = sep + 2;
  }
  return { period: stripInlineComment(periodPart), events };
}

/** Events on a continuation line (starts with `:`). */
function splitContinuationEvents(text: string): string[] {
  const rest = text.replace(/^:\s*/, "");
  const events: string[] = [];
  let cursor = 0;
  for (;;) {
    const sep = rest.indexOf(": ", cursor);
    const part = (sep < 0 ? rest.slice(cursor) : rest.slice(cursor, sep)).trim();
    if (part) events.push(stripInlineComment(part));
    if (sep < 0) break;
    cursor = sep + 2;
  }
  return events;
}

/**
 * Split the event segments of a line, regardless of whether it is a period line
 * (`period : e1 : e2`) or a continuation line (`: e1 : e2`). Returns the segments
 * and a `rebuild` function that serializes the segments back preserving the
 * original line shape (bare period line when there are no events).
 */
function splitLineSegments(content: string): {
  segments: string[];
  rebuild: (segments: string[]) => string;
} {
  if (isContinuationLine(content)) {
    const segments = splitContinuationEvents(content);
    return {
      segments,
      rebuild: (next) => (next.length > 0 ? `: ${next.join(" : ")}` : `:`),
    };
  }
  const { period, events } = splitPeriodAndEvents(content);
  return {
    segments: events,
    rebuild: (next) => (next.length > 0 ? `${period} : ${next.join(" : ")}` : period),
  };
}

export function parseTimeline(code: string): ParsedTimeline {
  const lines = code.split("\n");
  const frontmatterEnd = splitFrontmatterLineCount(lines);
  const headerLineIndex = lines.findIndex(
    (line, index) => index >= frontmatterEnd && /^\s*timeline\b/.test(line),
  );
  if (headerLineIndex < 0) {
    return {
      headerLineIndex: -1,
      direction: "LR",
      directionTokenPresent: false,
      title: null,
      titleLineIndex: -1,
      sections: [],
      defaultPeriods: [],
    };
  }

  const headerMatch = lines[headerLineIndex].match(/^\s*timeline\b\s*(LR|TD)\b/i);
  const direction = (headerMatch?.[1]?.toUpperCase() as TimelineDirection | undefined) ?? "LR";
  const directionTokenPresent = Boolean(headerMatch);

  let title: string | null = null;
  let titleLineIndex = -1;

  const sections: TimelineSectionNode[] = [];
  const defaultPeriods: TimelinePeriodNode[] = [];
  let currentSection: TimelineSectionNode | null = null;
  let currentPeriod: TimelinePeriodNode | null = null;
  let currentPeriodEvents: TimelineEventNode[] = [];

  const flushPeriod = () => {
    if (!currentPeriod) return;
    currentPeriod.events = currentPeriodEvents;
    currentPeriod.blockEndLineIndex = Math.max(
      currentPeriod.lineIndex,
      ...currentPeriodEvents.map((event) => event.lineIndex),
    );
    if (currentSection) {
      currentSection.periods.push(currentPeriod);
    } else {
      defaultPeriods.push(currentPeriod);
    }
    currentPeriod = null;
    currentPeriodEvents = [];
  };

  const beginPeriod = (lineIndex: number, label: string, events: string[]) => {
    flushPeriod();
    currentPeriod = {
      id: timelinePeriodId(lineIndex),
      kind: "period",
      label,
      lineIndex,
      blockEndLineIndex: lineIndex,
      events: [],
      sectionId: currentSection?.id ?? null,
    };
    events.forEach((eventLabel, segmentIndex) => {
      currentPeriodEvents.push({
        id: timelineEventId(lineIndex, currentPeriodEvents.length),
        kind: "event",
        label: eventLabel,
        lineIndex,
        eventIndex: currentPeriodEvents.length,
        segmentIndex,
        periodId: currentPeriod!.id,
      });
    });
  };

  const beginContinuation = (lineIndex: number, events: string[]) => {
    if (!currentPeriod) return;
    events.forEach((eventLabel, segmentIndex) => {
      currentPeriodEvents.push({
        id: timelineEventId(lineIndex, currentPeriodEvents.length),
        kind: "event",
        label: eventLabel,
        lineIndex,
        eventIndex: currentPeriodEvents.length,
        segmentIndex,
        periodId: currentPeriod!.id,
      });
    });
  };

  for (let i = headerLineIndex + 1; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (isMetadataLine(trimmed)) continue;

    if (/^title\s+/i.test(trimmed)) {
      flushPeriod();
      currentSection = null;
      title = stripInlineComment(trimmed.replace(/^title\s+/i, ""));
      titleLineIndex = i;
      continue;
    }

    if (/^section\s+/i.test(trimmed)) {
      flushPeriod();
      const sectionName = splitPeriodAndEvents(trimmed.replace(/^section\s+/i, "")).period;
      currentSection = {
        id: timelineSectionId(i),
        kind: "section",
        label: sectionName,
        lineIndex: i,
        periods: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (isContinuationLine(trimmed)) {
      beginContinuation(i, splitContinuationEvents(trimmed));
      continue;
    }

    const { period, events } = splitPeriodAndEvents(trimmed);
    beginPeriod(i, period, events);
  }
  flushPeriod();

  return {
    headerLineIndex,
    direction,
    directionTokenPresent,
    title,
    titleLineIndex,
    sections,
    defaultPeriods,
  };
}

export function getTimelineNode(
  code: string,
  nodeId: string | null | undefined,
): TimelineNode | null {
  if (!nodeId) return null;
  const parsed = parseTimeline(code);
  for (const section of parsed.sections) {
    if (section.id === nodeId) return section;
    for (const period of section.periods) {
      if (period.id === nodeId) return period;
      const event = period.events.find((candidate) => candidate.id === nodeId);
      if (event) return event;
    }
  }
  for (const period of parsed.defaultPeriods) {
    if (period.id === nodeId) return period;
    const event = period.events.find((candidate) => candidate.id === nodeId);
    if (event) return event;
  }
  return null;
}

export function timelineNodeLabel(code: string, nodeId: string | null | undefined): string | null {
  return getTimelineNode(code, nodeId)?.label ?? null;
}

export function timelineHasNodes(code: string): boolean {
  const parsed = parseTimeline(code);
  return parsed.sections.length > 0 || parsed.defaultPeriods.length > 0;
}

/** Direction of the diagram (mirrors the Mermaid lexer default of LR). */
export function getTimelineDirection(code: string): TimelineDirection {
  return parseTimeline(code).direction;
}

export function setTimelineDirection(code: string, direction: TimelineDirection): string {
  const parsed = parseTimeline(code);
  if (parsed.headerLineIndex < 0) return code;
  const lines = code.split("\n");
  const raw = lines[parsed.headerLineIndex];
  const indent = leadingIndent(raw);
  const body = raw.trim();
  const tokenMatch = body.match(/^timeline\b\s*(LR|TD)\b/i);
  if (tokenMatch) {
    lines[parsed.headerLineIndex] = `${indent}timeline ${direction}`;
  } else {
    lines[parsed.headerLineIndex] = `${indent}timeline ${direction}`;
  }
  return lines.join("\n");
}

function ensureTimelineHeader(code: string): string {
  if (parseTimeline(code).headerLineIndex >= 0) return code;
  const trimmed = code.trimEnd();
  return trimmed ? `${trimmed}\ntimeline` : "timeline";
}

function uniqueLabel(code: string, base: string): string {
  const parsed = parseTimeline(code);
  const labels = new Set<string>();
  for (const section of parsed.sections) labels.add(section.label);
  for (const period of [...parsed.defaultPeriods, ...parsed.sections.flatMap((s) => s.periods)]) {
    labels.add(period.label);
    for (const event of period.events) labels.add(event.label);
  }
  let i = 1;
  while (labels.has(`${base} ${i}`)) i += 1;
  return `${base} ${i}`;
}

/**
 * Find the end of the period block: the last line that belongs to the period,
 * i.e. the period's own line or the last continuation line after it (before the
 * next period / section / title / EOF). Blank/comment lines inside the span are
 * treated as part of the block.
 */
function periodBlockEnd(lines: string[], periodLineIndex: number): number {
  let end = periodLineIndex;
  for (let i = periodLineIndex + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("%%") || trimmed.startsWith("#")) {
      end = i;
      continue;
    }
    if (isContinuationLine(trimmed)) {
      end = i;
      continue;
    }
    break;
  }
  return end;
}

/**
 * Insert a new period line (with one default event) above or below the target.
 * `placement` "above"/"below" refers to a vertical (new-period) insert.
 */
export function addTimelineEvent(
  code: string,
  targetNodeId: string,
  placement: "above" | "below",
): { code: string; nodeId: string } {
  const source = ensureTimelineHeader(code);
  const target = getTimelineNode(source, targetNodeId);
  if (!target) return { code, nodeId: targetNodeId };
  const lines = source.split("\n");

  const periodLine = target.kind === "event" ? target.lineIndex : target.lineIndex;
  const eventLabel = uniqueLabel(source, "New Event");
  const periodLabel = uniqueLabel(source, "New Period");
  const newLine = `    ${periodLabel} : ${eventLabel}`;

  let insertAt: number;
  if (placement === "above") {
    insertAt = periodLine;
  } else {
    insertAt = periodBlockEnd(lines, periodLine) + 1;
  }
  lines.splice(insertAt, 0, newLine);
  return { code: lines.join("\n"), nodeId: timelinePeriodId(insertAt) };
}

/** Append a new event into the period of `targetNodeId`, before or after the target event. */
export function addTimelineEventToPeriod(
  code: string,
  targetNodeId: string,
  placement: "before" | "after",
): { code: string; nodeId: string } {
  const source = ensureTimelineHeader(code);
  const target = getTimelineNode(source, targetNodeId);
  if (!target) return { code, nodeId: targetNodeId };
  if (target.kind === "section") return { code, nodeId: targetNodeId };
  const lines = source.split("\n");
  const eventLabel = uniqueLabel(source, "New Event");
  const newLine = `    : ${eventLabel}`;

  const insertAt =
    placement === "before"
      ? target.lineIndex
      : target.kind === "period"
        ? periodBlockEnd(lines, target.lineIndex) + 1
        : target.lineIndex + 1;
  lines.splice(insertAt, 0, newLine);
  return { code: lines.join("\n"), nodeId: timelineEventId(insertAt, 0) };
}

/** Append a new section (with one period + one event) at the end of the document. */
export function addTimelineSection(code: string): { code: string; nodeId: string } {
  const source = ensureTimelineHeader(code);
  const lines = source.split("\n");
  const sectionLabel = uniqueLabel(source, "New Section");
  const periodLabel = uniqueLabel(source, "New Period");
  const eventLabel = uniqueLabel(source, "New Event");
  const block = [`    section ${sectionLabel}`, `        ${periodLabel} : ${eventLabel}`];
  const insertAt = lines.length;
  lines.splice(insertAt, 0, ...block);
  return { code: lines.join("\n"), nodeId: timelineSectionId(insertAt) };
}

/** Add a new period (with one event) to the given section, above or below its existing periods. */
export function addTimelinePeriodToSection(
  code: string,
  sectionId: string,
  placement: "above" | "below",
): { code: string; nodeId: string } {
  const source = ensureTimelineHeader(code);
  const section = getTimelineNode(source, sectionId);
  if (!section || section.kind !== "section") return { code, nodeId: sectionId };
  const lines = source.split("\n");
  const periodLabel = uniqueLabel(source, "New Period");
  const eventLabel = uniqueLabel(source, "New Event");
  const newLine = `        ${periodLabel} : ${eventLabel}`;

  const firstPeriod = section.periods[0];
  const lastPeriod = section.periods[section.periods.length - 1];
  const insertAt =
    placement === "above"
      ? firstPeriod
        ? firstPeriod.lineIndex
        : section.lineIndex + 1
      : lastPeriod
        ? lastPeriod.blockEndLineIndex + 1
        : section.lineIndex + 1;
  lines.splice(insertAt, 0, newLine);
  return { code: lines.join("\n"), nodeId: timelinePeriodId(insertAt) };
}

/** Add a new period (with one event) immediately above/below the period of `nodeId` (event or
 *  period target), or at the first/last slot of a section target. Unlike `addTimelinePeriodToSection`
 *  (which always inserts at the section's edges), this anchors to the TARGET's own position so a
 *  mid-section event gets its new period directly above/below its own period. */
export function addTimelinePeriodNear(
  code: string,
  nodeId: string,
  placement: "above" | "below",
): { code: string; nodeId: string } {
  const source = ensureTimelineHeader(code);
  const target = getTimelineNode(source, nodeId);
  if (!target) return { code, nodeId };
  let period: TimelinePeriodNode | null = null;
  if (target.kind === "period") period = target;
  else if (target.kind === "event")
    period = getTimelineNode(source, target.periodId) as TimelinePeriodNode | null;
  else if (target.kind === "section")
    period =
      placement === "above"
        ? (target.periods[0] ?? null)
        : (target.periods[target.periods.length - 1] ?? null);
  const lines = source.split("\n");
  const periodLabel = uniqueLabel(source, "New Period");
  const eventLabel = uniqueLabel(source, "New Event");
  const inSection = period?.sectionId != null || target.kind === "section";
  const newLine = `${inSection ? "        " : "    "}${periodLabel} : ${eventLabel}`;
  const insertAt = !period
    ? target.kind === "section"
      ? target.lineIndex + 1
      : lines.length
    : placement === "above"
      ? period.lineIndex
      : period.blockEndLineIndex + 1;
  lines.splice(insertAt, 0, newLine);
  return { code: lines.join("\n"), nodeId: timelinePeriodId(insertAt) };
}

export function deleteTimelineNode(code: string, nodeId: string): string {
  const node = getTimelineNode(code, nodeId);
  if (!node) return code;
  const lines = code.split("\n");

  if (node.kind === "event") {
    const event = node;
    const raw = lines[event.lineIndex] ?? "";
    const period = getTimelineNode(code, event.periodId);
    if (!period || period.kind !== "period") return code;
    const eventsOnLine = period.events.filter(
      (candidate) => candidate.lineIndex === event.lineIndex,
    );
    if (eventsOnLine.length > 1) {
      const indent = leadingIndent(raw);
      const { segments, rebuild } = splitLineSegments(raw.trim());
      const next = [
        ...segments.slice(0, event.segmentIndex),
        ...segments.slice(event.segmentIndex + 1),
      ];
      lines[event.lineIndex] = `${indent}${rebuild(next)}`;
    } else if (event.segmentIndex === 0 && !isContinuationLine(raw.trim())) {
      // The period's first line and the event is its only event → reduce to a bare period.
      const indent = leadingIndent(raw);
      const periodPart = splitPeriodAndEvents(raw.trim()).period;
      lines[event.lineIndex] = `${indent}${periodPart}`;
    } else {
      // A lone event on a continuation line → remove the whole line.
      lines.splice(event.lineIndex, 1);
    }
    return lines.join("\n");
  }

  if (node.kind === "period") {
    const period = node;
    const start = period.lineIndex;
    const end = period.blockEndLineIndex;
    lines.splice(start, end - start + 1);
    return lines.join("\n");
  }

  // Section: remove the section line and every period block owned by it.
  const section = node;
  const toRemove: Array<{ start: number; end: number }> = [];
  toRemove.push({ start: section.lineIndex, end: section.lineIndex });
  for (const period of section.periods) {
    toRemove.push({ start: period.lineIndex, end: period.blockEndLineIndex });
  }
  toRemove.sort((a, b) => a.start - b.start);
  let offset = 0;
  for (const { start, end } of toRemove) {
    lines.splice(start - offset, end - start + 1);
    offset += end - start + 1;
  }
  return lines.join("\n");
}

export function renameTimelineNode(code: string, nodeId: string, label: string): string {
  const node = getTimelineNode(code, nodeId);
  if (!node) return code;
  const clean = label
    .replace(/[\r\n]+/g, " ")
    .replace(/[#:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return code;
  const lines = code.split("\n");
  const raw = lines[node.lineIndex] ?? "";
  const indent = leadingIndent(raw);
  const content = raw.trim();

  if (node.kind === "section") {
    lines[node.lineIndex] = `${indent}section ${clean}`;
  } else if (node.kind === "period") {
    const { period, events } = splitPeriodAndEvents(content);
    void period;
    const eventText = events.length > 0 ? ` : ${events.join(" : ")}` : "";
    lines[node.lineIndex] = `${indent}${clean}${eventText}`;
  } else {
    const event = node;
    const period = getTimelineNode(code, event.periodId);
    const eventsOnLine =
      period?.kind === "period" ? period.events.filter((c) => c.lineIndex === event.lineIndex) : [];
    if (eventsOnLine.length > 1) {
      const indent = leadingIndent(raw);
      const { segments, rebuild } = splitLineSegments(content);
      segments[event.segmentIndex] = clean;
      lines[node.lineIndex] = `${indent}${rebuild(segments)}`;
    } else if (isContinuationLine(content)) {
      lines[node.lineIndex] = `${indent}: ${clean}`;
    } else {
      const periodPart = splitPeriodAndEvents(content).period;
      lines[node.lineIndex] = `${indent}${periodPart} : ${clean}`;
    }
  }
  return lines.join("\n");
}

/**
 * Reorder / relocate timeline nodes by dragging. Supports:
 *  - event → event (before/after; same or different period)
 *  - event → period (append to the period)
 *  - period → period (before/after)
 *  - period → section (relocate into the section)
 *  - section → section (before/after)
 */
export function moveTimelineNode(
  code: string,
  sourceId: string,
  targetId: string,
  placement: "before" | "after",
): string {
  const source = getTimelineNode(code, sourceId);
  const target = getTimelineNode(code, targetId);
  if (!source || !target || sourceId === targetId) return code;
  const lines = code.split("\n");

  const removeLineBlock = (start: number, end: number): string[] => {
    return lines.splice(start, end - start + 1);
  };

  const insertLines = (index: number, block: string[]) => {
    lines.splice(index, 0, ...block);
  };

  if (source.kind === "section" && target.kind === "section") {
    const sourceStart = source.lineIndex;
    const sourceEnd = sectionBlockEnd(lines, source);
    const targetStart = target.lineIndex;
    const targetEnd = sectionBlockEnd(lines, target);
    if (sourceStart <= targetEnd && targetStart <= sourceEnd) return code;
    const block = removeLineBlock(sourceStart, sourceEnd);
    const delta = block.length;
    let insertAt = targetStart;
    if (placement === "after") insertAt = targetEnd + 1;
    if (sourceStart < insertAt) insertAt -= delta;
    insertLines(insertAt, block);
    return lines.join("\n");
  }

  if (source.kind === "period") {
    if (target.kind === "period") {
      const sourceStart = source.lineIndex;
      const sourceEnd = source.blockEndLineIndex;
      const targetStart = target.lineIndex;
      const targetEnd = target.blockEndLineIndex;
      if (sourceStart <= targetEnd && targetStart <= sourceEnd) return code;
      const block = removeLineBlock(sourceStart, sourceEnd);
      const delta = block.length;
      let insertAt = targetStart;
      if (placement === "after") insertAt = targetEnd + 1;
      if (sourceStart < insertAt) insertAt -= delta;
      insertLines(insertAt, block);
      return lines.join("\n");
    }
    if (target.kind === "section") {
      const targetSection = target;
      const lastPeriod = targetSection.periods[targetSection.periods.length - 1];
      const insertAt = lastPeriod ? lastPeriod.blockEndLineIndex + 1 : targetSection.lineIndex + 1;
      const block = removeLineBlock(source.lineIndex, source.blockEndLineIndex);
      insertLines(insertAt, block);
      return lines.join("\n");
    }
    return code;
  }

  // Event moves.
  if (source.kind !== "event") return code;
  if (target.kind !== "event" && target.kind !== "period") return code;
  const event = source;
  const targetPeriodId = target.kind === "event" ? target.periodId : target.id;
  const samePeriod = event.periodId === targetPeriodId;

  if (samePeriod) {
    // Reorder within the same period. Rebuild the block from the reordered MODEL event list
    // rather than swapping physical lines: physical line-swaps corrupt the block when the moved
    // event sits on the period header line (the label would move with it) or when a continuation
    // line lands above the header (malformed Mermaid). The period label stays on the first line,
    // the reordered events follow (first event on the period line, the rest as continuation lines).
    if (event.lineIndex === target.lineIndex) return code;
    const period = getTimelineNode(code, event.periodId);
    if (!period || period.kind !== "period") return code;
    const events = [...period.events].sort(
      (a, b) => a.lineIndex - b.lineIndex || a.segmentIndex - b.segmentIndex,
    );
    const fromIndex = events.findIndex((e) => e.id === event.id);
    const targetIndex = events.findIndex((e) => e.id === target.id);
    if (fromIndex < 0 || targetIndex < 0) return code;
    const next = [...events];
    const [moved] = next.splice(fromIndex, 1);
    const anchor = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
    next.splice(placement === "after" ? anchor + 1 : anchor, 0, moved);

    const raw = lines[period.lineIndex] ?? "";
    const indent = leadingIndent(raw);
    const periodPart = splitPeriodAndEvents(raw.trim()).period;
    const oldBlockLines = period.blockEndLineIndex - period.lineIndex + 1;
    const needed = next.length;
    if (needed < oldBlockLines) {
      lines.splice(period.lineIndex + needed, oldBlockLines - needed);
    } else if (needed > oldBlockLines) {
      lines.splice(period.lineIndex + oldBlockLines, 0, ...Array(needed - oldBlockLines).fill(""));
    }
    lines[period.lineIndex] =
      `${indent}${periodPart}` + (next.length > 0 ? ` : ${next[0].label}` : "");
    for (let i = 1; i < next.length; i += 1) {
      lines[period.lineIndex + i] = `${indent}: ${next[i].label}`;
    }
    return lines.join("\n");
  }

  // Cross-period move. Resolve the target period and remember its first line's
  // text so we can relocate it AFTER the source mutations shift line indices.
  const targetPeriod = getTimelineNode(code, targetPeriodId);
  if (!targetPeriod || targetPeriod.kind !== "period") return code;
  const targetTrim = (lines[targetPeriod.lineIndex] ?? "").trim();

  // Reduce the source event onto its own movable continuation line.
  const sourcePeriod = getTimelineNode(code, event.periodId);
  const sourcePeriodEvents = sourcePeriod?.kind === "period" ? sourcePeriod.events : [];
  const eventsOnLine = sourcePeriodEvents.filter((c) => c.lineIndex === event.lineIndex);
  const raw = lines[event.lineIndex] ?? "";
  const indent = leadingIndent(raw);
  const content = raw.trim();

  let movableStart = event.lineIndex;
  if (eventsOnLine.length > 1) {
    const { segments, rebuild } = splitLineSegments(content);
    const next = [
      ...segments.slice(0, event.segmentIndex),
      ...segments.slice(event.segmentIndex + 1),
    ];
    lines[event.lineIndex] = `${indent}${rebuild(next)}`;
    lines.splice(event.lineIndex + 1, 0, `    : ${event.label}`);
    movableStart = event.lineIndex + 1;
  } else if (!isContinuationLine(content)) {
    // The event is the only event on the period's first line: strip the period
    // label off so only the event moves.
    const periodPart = splitPeriodAndEvents(content).period;
    lines[event.lineIndex] = `${indent}${periodPart}`;
    lines.splice(event.lineIndex + 1, 0, `    : ${event.label}`);
    movableStart = event.lineIndex + 1;
  }

  const moved = removeLineBlock(movableStart, movableStart);

  // Recompute the target block position in the current (mutated) lines.
  const targetIndex = lines.findIndex((line) => line.trim() === targetTrim);
  if (targetIndex < 0) return code;
  const targetEnd = periodBlockEnd(lines, targetIndex);
  const insertAt = placement === "before" ? targetIndex + 1 : targetEnd + 1;
  insertLines(insertAt, moved);
  return lines.join("\n");
}

function sectionBlockEnd(lines: string[], section: TimelineSectionNode): number {
  let end = section.lineIndex;
  for (const period of section.periods) {
    end = Math.max(end, period.blockEndLineIndex);
  }
  // Extend over trailing blank/comment lines until the next structural line.
  for (let i = end + 1; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith("%%") || trimmed.startsWith("#")) {
      end = i;
      continue;
    }
    break;
  }
  return end;
}

/**
 * The order in which Mermaid draws timeline nodes — sections first (if any),
 * then per section (or globally) each period followed by its events.
 */
export interface TimelineRenderEntry {
  id: string;
  kind: TimelineNodeKind;
}

export function timelineRenderOrder(code: string): TimelineRenderEntry[] {
  const parsed = parseTimeline(code);
  const order: TimelineRenderEntry[] = [];
  const pushPeriod = (period: TimelinePeriodNode) => {
    order.push({ id: period.id, kind: "period" });
    for (const event of period.events) order.push({ id: event.id, kind: "event" });
  };
  if (parsed.sections.length > 0) {
    for (const section of parsed.sections) {
      order.push({ id: section.id, kind: "section" });
      for (const period of section.periods) pushPeriod(period);
    }
  } else {
    for (const period of parsed.defaultPeriods) pushPeriod(period);
  }
  return order;
}

function timelineNodeIndexFromSvgElement(element: Element): number | null {
  const group = element.closest("g.timeline-node");
  if (!group) return null;
  const path = group.querySelector("path.node-bkg");
  const rawId = path?.getAttribute("id") ?? "";
  const match = rawId.match(/(?:^|[-_])node-(\d+)$/);
  if (!match) return null;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : null;
}

export function timelineNodeIdFromSvgElement(
  code: string,
  container: Element,
  element: Element,
): string | null {
  const index = timelineNodeIndexFromSvgElement(element);
  if (index === null) return null;
  void container;
  return timelineRenderOrder(code)[index]?.id ?? null;
}

export function findTimelineSvgElementByNodeId(
  code: string,
  container: Element,
  nodeId: string,
): SVGElement | null {
  const order = timelineRenderOrder(code);
  const index = order.findIndex((entry) => entry.id === nodeId);
  if (index < 0) return null;
  const groups = Array.from(container.querySelectorAll("g.timeline-node"));
  for (const group of groups) {
    const path = group.querySelector("path.node-bkg");
    const rawId = path?.getAttribute("id") ?? "";
    const match = rawId.match(/(?:^|[-_])node-(\d+)$/);
    if (match && Number(match[1]) === index) return group as SVGElement;
  }
  return null;
}

function TimelineHeaderToolbar({ code, setCode }: EditorContext) {
  const parsed = parseTimeline(code);
  if (parsed.headerLineIndex < 0) return null;
  const hasNodes = timelineHasNodes(code);

  return (
    <>
      {hasNodes && (
        <button
          type="button"
          onClick={() =>
            setCode(setTimelineDirection(code, parsed.direction === "TD" ? "LR" : "TD"))
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Toggle diagram orientation (LR/TD)"
        >
          <ArrowRight className={`h-3.5 w-3.5 ${parsed.direction === "TD" ? "rotate-90" : ""}`} />
          <span>{parsed.direction === "TD" ? "Vertical" : "Horizontal"}</span>
        </button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-8 rounded-md px-2 text-foreground hover:bg-accent hover:text-accent-foreground"
        onClick={() => setCode(addTimelineSection(code).code)}
      >
        <Plus className="h-4 w-4" />
        <span className="text-sm font-medium">Add section</span>
      </Button>
    </>
  );
}

export const TimelinePlugin: DiagramPlugin = {
  id: "timeline",
  label: "Timeline",
  defaultCode: `timeline
    title Product Milestones
    2026 Q1 : Research
    2026 Q2 : Build
    2026 Q3 : Launch`,
  ToolbarComponent: TimelineHeaderToolbar,
};
