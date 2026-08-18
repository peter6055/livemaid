import { describe, expect, it } from "vitest";
import { timelineAddAxes } from "@/components/editor/TimelineNodeToolbar";
import {
  addTimelineEvent,
  addTimelineEventToPeriod,
  addTimelinePeriodNear,
  addTimelineSection,
  addTimelineSectionAt,
  deleteTimelineNode,
  getTimelineDirection,
  getTimelineTitle,
  moveTimelineNode,
  parseTimeline,
  removeTimelineTitle,
  renameTimelineNode,
  setTimelineDirection,
  timelineRenderOrder,
  upsertTimelineTitle,
  type TimelineNode,
} from "@/lib/diagrams/timeline";

const SAMPLE = `timeline
    title Product Milestones
    section Planning
        2026 Q1 : Research
        : Prototype : Pitch
        %% internal note
    section Build
        2026 Q2 : Build : Test
        2026 Q3 : Launch`;

function nodeId(parsed: ReturnType<typeof parseTimeline>, label: string): string | null {
  const find = (node: TimelineNode): string | null => {
    if ("label" in node && node.label === label) return node.id;
    if ("periods" in node) {
      for (const period of node.periods) {
        const found = find(period);
        if (found) return found;
      }
    }
    if ("events" in node) {
      for (const event of node.events) {
        const found = find(event);
        if (found) return found;
      }
    }
    return null;
  };
  for (const section of parsed.sections) {
    const found = find(section);
    if (found) return found;
  }
  for (const period of parsed.defaultPeriods) {
    const found = find(period);
    if (found) return found;
  }
  return null;
}

function byLabel(code: string, label: string): string {
  const id = nodeId(parseTimeline(code), label);
  if (!id) throw new Error(`node "${label}" not found`);
  return id;
}

describe("timeline parser", () => {
  it("parses header, title, direction, sections, periods and events", () => {
    const parsed = parseTimeline(SAMPLE);
    expect(parsed.headerLineIndex).toBe(0);
    expect(parsed.title).toBe("Product Milestones");
    expect(parsed.direction).toBe("LR");
    expect(parsed.directionTokenPresent).toBe(false);
    expect(parsed.sections).toHaveLength(2);

    const planning = parsed.sections[0];
    expect(planning.label).toBe("Planning");
    expect(planning.periods).toHaveLength(1);
    const q1 = planning.periods[0];
    expect(q1.label).toBe("2026 Q1");
    expect(q1.events.map((event) => event.label)).toEqual(["Research", "Prototype", "Pitch"]);
    expect(q1.events[0].lineIndex).toBe(3);
    expect(q1.events[1].lineIndex).toBe(4);
    expect(q1.events[2].lineIndex).toBe(4);
    expect(q1.events[2].segmentIndex).toBe(1);
    expect(q1.events.map((event) => event.eventIndex)).toEqual([0, 1, 2]);

    const build = parsed.sections[1];
    expect(build.periods.map((period) => period.label)).toEqual(["2026 Q2", "2026 Q3"]);
    expect(build.periods[0].events.map((event) => event.label)).toEqual(["Build", "Test"]);
    expect(build.periods[1].events.map((event) => event.label)).toEqual(["Launch"]);
  });

  it("skips comments, blank lines, and preserves frontmatter", () => {
    const parsed = parseTimeline(
      "---\nconfig:\n  theme: dark\n---\ntimeline TD\n    title T\n\n    %% note\n    2020 : A",
    );
    expect(parsed.headerLineIndex).toBe(4);
    expect(parsed.direction).toBe("TD");
    expect(parsed.directionTokenPresent).toBe(true);
    expect(parsed.defaultPeriods).toHaveLength(1);
    expect(parsed.defaultPeriods[0].events[0].label).toBe("A");
  });

  it("handles bare periods with no events", () => {
    const parsed = parseTimeline("timeline\n    2026 Q1");
    expect(parsed.defaultPeriods).toHaveLength(1);
    expect(parsed.defaultPeriods[0].label).toBe("2026 Q1");
    expect(parsed.defaultPeriods[0].events).toEqual([]);
  });

  it("treats periods without sections as default periods", () => {
    const parsed = parseTimeline("timeline\n    2026 Q1 : A\n    section S\n        2026 Q2 : B");
    expect(parsed.defaultPeriods).toHaveLength(1);
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].periods[0].label).toBe("2026 Q2");
  });

  it("truncates labels at inline %% comments", () => {
    const parsed = parseTimeline("timeline\n    2026 Q1 : Research %% note\n    : More %% x");
    expect(parsed.defaultPeriods[0].events.map((event) => event.label)).toEqual([
      "Research",
      "More",
    ]);
  });

  it("computes the renderer draw order", () => {
    expect(timelineRenderOrder(SAMPLE).map((entry) => entry.kind)).toEqual([
      "section",
      "period",
      "event",
      "event",
      "event",
      "section",
      "period",
      "event",
      "event",
      "period",
      "event",
    ]);
    const noSections = timelineRenderOrder("timeline\n    2026 Q1 : A\n    2026 Q2 : B : C");
    expect(noSections.map((entry) => entry.kind)).toEqual([
      "period",
      "event",
      "period",
      "event",
      "event",
    ]);
  });
});

describe("timeline direction", () => {
  it("reads and writes the direction token", () => {
    expect(getTimelineDirection("timeline TD\n    title X")).toBe("TD");
    expect(setTimelineDirection("timeline\n    title X", "TD")).toBe("timeline TD\n    title X");
    expect(setTimelineDirection("timeline LR\n    title X", "TD")).toBe("timeline TD\n    title X");
    expect(getTimelineDirection("timeline\n    title X")).toBe("LR");
  });
});

describe("timeline mutations", () => {
  it("adds a new period above the target period", () => {
    const code = "timeline\n    2026 Q2 : Build";
    const result = addTimelineEvent(code, byLabel(code, "2026 Q2"), "above");
    expect(result.code).toBe("timeline\n    New Period 1 : New Event 1\n    2026 Q2 : Build");
    expect(result.nodeId).toBe(byLabel(result.code, "New Period 1"));
  });

  it("adds a new period below the target period including continuation lines", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B";
    const result = addTimelineEvent(code, byLabel(code, "2026 Q1"), "below");
    const lines = result.code.split("\n");
    expect(lines[1]).toBe("    2026 Q1 : A");
    expect(lines[2]).toBe("    : B");
    expect(lines[3]).toBe("    New Period 1 : New Event 1");
  });

  it("inserts an event before a target event on a continuation line", () => {
    const code = "timeline\n    2026 Q1 : A\n    : C";
    const c = byLabel(code, "C");
    const result = addTimelineEventToPeriod(code, c, "before");
    expect(result.code).toBe("timeline\n    2026 Q1 : A\n    : New Event 1\n    : C");
  });

  it("appends an event after the last event of the period", () => {
    const code = "timeline\n    2026 Q1 : A";
    const result = addTimelineEventToPeriod(code, byLabel(code, "A"), "after");
    expect(result.code).toBe("timeline\n    2026 Q1 : A\n    : New Event 1");
  });

  it("auto-numbers default event labels", () => {
    const code = "timeline\n    2026 Q1 : New Event 1";
    const result = addTimelineEventToPeriod(code, byLabel(code, "New Event 1"), "after");
    expect(result.code).toBe("timeline\n    2026 Q1 : New Event 1\n    : New Event 2");
  });

  it("adds a section with a starter period at the end of the document", () => {
    const code = "timeline\n    2026 Q1 : A";
    const result = addTimelineSection(code);
    expect(result.code.split("\n")).toEqual([
      "timeline",
      "    2026 Q1 : A",
      "    section New Section 1",
      "        New Period 1 : New Event 1",
    ]);
    expect(result.nodeId).toBe(byLabel(result.code, "New Section 1"));
  });

  it("adds a timeline header to a blank document", () => {
    const result = addTimelineSection("");
    expect(parseTimeline(result.code).headerLineIndex).toBe(0);
    expect(result.code.startsWith("timeline")).toBe(true);
  });

  it("renames a section, period, and event without touching siblings", () => {
    let code = renameTimelineNode(SAMPLE, byLabel(SAMPLE, "Planning"), "Discovery");
    code = renameTimelineNode(code, byLabel(code, "2026 Q1"), "2026 Q1b");
    code = renameTimelineNode(code, byLabel(code, "Prototype"), "MVP");
    expect(code.split("\n")[2]).toBe("    section Discovery");
    expect(code.split("\n")[3]).toBe("        2026 Q1b : Research");
    expect(code.split("\n")[4]).toBe("        : MVP : Pitch");
    expect(code.split("\n")[6]).toBe("    section Build");
  });

  it("renames an event that shares the period line", () => {
    const code = "timeline\n    2026 Q1 : A : B : C";
    const b = byLabel(code, "B");
    const result = renameTimelineNode(code, b, "Beta");
    expect(result).toBe("timeline\n    2026 Q1 : A : Beta : C");
  });

  it("sanitizes colons and newlines out of labels", () => {
    const code = "timeline\n    2026 Q1 : A";
    const result = renameTimelineNode(code, byLabel(code, "2026 Q1"), "Q1 : 2026\nNext");
    expect(result).toBe("timeline\n    Q1 2026 Next : A");
  });

  it("deletes a single event on a continuation line", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B";
    const result = deleteTimelineNode(code, byLabel(code, "B"));
    expect(result).toBe("timeline\n    2026 Q1 : A");
  });

  it("deletes one segment of a multi-event line", () => {
    const code = "timeline\n    2026 Q1 : A : B : C";
    const result = deleteTimelineNode(code, byLabel(code, "B"));
    expect(result).toBe("timeline\n    2026 Q1 : A : C");
  });

  it("reduces a single-event period to a bare period on delete", () => {
    const code = "timeline\n    2026 Q1 : A";
    const result = deleteTimelineNode(code, byLabel(code, "A"));
    expect(result).toBe("timeline\n    2026 Q1");
  });

  it("deletes a period with all its continuation lines", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B\n    2026 Q2 : C";
    const result = deleteTimelineNode(code, byLabel(code, "2026 Q1"));
    expect(result).toBe("timeline\n    2026 Q2 : C");
  });

  it("deletes a section with all its periods", () => {
    const code = `timeline
    title T
    section Planning
        2026 Q1 : A
    section Build
        2026 Q2 : B`;
    const result = deleteTimelineNode(code, byLabel(code, "Planning"));
    expect(result).toBe(`timeline
    title T
    section Build
        2026 Q2 : B`);
  });

  it("reorders periods within a section by dragging", () => {
    const code = `timeline
    section S
        2026 Q1 : A
        2026 Q2 : B
        2026 Q3 : C`;
    const q2 = byLabel(code, "2026 Q2");
    const q1 = byLabel(code, "2026 Q1");
    expect(moveTimelineNode(code, q2, q1, "before")).toBe(`timeline
    section S
        2026 Q2 : B
        2026 Q1 : A
        2026 Q3 : C`);
  });

  it("moves a period before a period in another section", () => {
    const code = `timeline
    section A
        2026 Q1 : X
        2026 Q2 : Y
    section B
        2026 Q3 : Z`;
    const q3 = byLabel(code, "2026 Q3");
    const q1 = byLabel(code, "2026 Q1");
    expect(moveTimelineNode(code, q3, q1, "before")).toBe(`timeline
    section A
        2026 Q3 : Z
        2026 Q1 : X
        2026 Q2 : Y
    section B`);
  });

  it("moves a period into another section", () => {
    const code = `timeline
    section A
        2026 Q1 : X
    section B
        2026 Q2 : Y`;
    const q1 = byLabel(code, "2026 Q1");
    const b = byLabel(code, "B");
    expect(moveTimelineNode(code, q1, b, "after")).toBe(`timeline
    section A
    section B
        2026 Q2 : Y
        2026 Q1 : X`);
  });

  it("reorders sections", () => {
    const code = `timeline
    section A
        2026 Q1 : X
    section B
        2026 Q2 : Y`;
    const b = byLabel(code, "B");
    const a = byLabel(code, "A");
    expect(moveTimelineNode(code, b, a, "before")).toBe(`timeline
    section B
        2026 Q2 : Y
    section A
        2026 Q1 : X`);
  });

  it("moves an event between periods as a continuation line", () => {
    const code = "timeline\n    2026 Q1 : A\n    2026 Q2 : B";
    const a = byLabel(code, "A");
    const q2 = byLabel(code, "2026 Q2");
    expect(moveTimelineNode(code, a, q2, "after")).toBe(
      "timeline\n    2026 Q1\n    2026 Q2 : B\n    : A",
    );
  });

  it("splits a shared event onto its own line before moving between periods", () => {
    const code = "timeline\n    2026 Q1 : A : B\n    2026 Q2 : C";
    const b = byLabel(code, "B");
    const result = moveTimelineNode(code, b, byLabel(code, "2026 Q2"), "after");
    expect(result).toBe("timeline\n    2026 Q1 : A\n    2026 Q2 : C\n    : B");
  });

  it("is a no-op when moving onto itself or a same-line event", () => {
    const code = "timeline\n    2026 Q1 : A : B";
    expect(moveTimelineNode(code, byLabel(code, "A"), byLabel(code, "A"), "after")).toBe(code);
    expect(moveTimelineNode(code, byLabel(code, "A"), byLabel(code, "B"), "before")).toBe(code);
  });

  it("reorders events within the same period", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B\n    : C";
    expect(moveTimelineNode(code, byLabel(code, "C"), byLabel(code, "A"), "before")).toBe(
      "timeline\n    2026 Q1 : C\n    : A\n    : B",
    );
  });

  it("moves an event to sit before another event in the same period block", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B\n    : C";
    expect(moveTimelineNode(code, byLabel(code, "B"), byLabel(code, "C"), "after")).toBe(
      "timeline\n    2026 Q1 : A\n    : C\n    : B",
    );
  });
});

describe("timeline section insertion (addTimelineSectionAt)", () => {
  const THREE_SECTIONS = `timeline
    section Planning
        2026 Q1 : Research
        : Prototype
    section Build
        2026 Q2 : Build : Test
        2026 Q3 : Launch
    section Release
        2026 Q4 : Ship`;

  it("inserts a section immediately before the target section", () => {
    const result = addTimelineSectionAt(THREE_SECTIONS, byLabel(THREE_SECTIONS, "Build"), "before");
    expect(result.code.split("\n")).toEqual([
      "timeline",
      "    section Planning",
      "        2026 Q1 : Research",
      "        : Prototype",
      "    section New Section 1",
      "    section Build",
      "        2026 Q2 : Build : Test",
      "        2026 Q3 : Launch",
      "    section Release",
      "        2026 Q4 : Ship",
    ]);
    const parsed = parseTimeline(result.code);
    expect(parsed.sections.map((section) => section.label)).toEqual([
      "Planning",
      "New Section 1",
      "Build",
      "Release",
    ]);
    expect(parsed.sections[2].periods.map((period) => period.label)).toEqual([
      "2026 Q2",
      "2026 Q3",
    ]);
    expect(result.nodeId).toBe(parsed.sections[1].id);
  });

  it("inserts a section after the complete target subtree", () => {
    const result = addTimelineSectionAt(THREE_SECTIONS, byLabel(THREE_SECTIONS, "Build"), "after");
    expect(result.code.split("\n")).toEqual([
      "timeline",
      "    section Planning",
      "        2026 Q1 : Research",
      "        : Prototype",
      "    section Build",
      "        2026 Q2 : Build : Test",
      "        2026 Q3 : Launch",
      "    section New Section 1",
      "    section Release",
      "        2026 Q4 : Ship",
    ]);
    const parsed = parseTimeline(result.code);
    expect(parsed.sections.map((section) => section.label)).toEqual([
      "Planning",
      "Build",
      "New Section 1",
      "Release",
    ]);
    // The target keeps all of its child periods/events.
    expect(parsed.sections[1].periods.map((period) => period.label)).toEqual([
      "2026 Q2",
      "2026 Q3",
    ]);
    expect(result.nodeId).toBe(parsed.sections[2].id);
  });

  it("inserts before the first section", () => {
    const result = addTimelineSectionAt(
      THREE_SECTIONS,
      byLabel(THREE_SECTIONS, "Planning"),
      "before",
    );
    expect(parseTimeline(result.code).sections[0].label).toBe("New Section 1");
    expect(parseTimeline(result.code).sections[1].label).toBe("Planning");
  });

  it("inserts after the last section", () => {
    const result = addTimelineSectionAt(
      THREE_SECTIONS,
      byLabel(THREE_SECTIONS, "Release"),
      "after",
    );
    const sections = parseTimeline(result.code).sections;
    expect(sections[sections.length - 2].label).toBe("Release");
    expect(sections[sections.length - 1].label).toBe("New Section 1");
  });

  it("inserts before/after a section with no child periods", () => {
    const code = `timeline
    section Empty
    section Full
        2026 Q1 : A`;
    const before = addTimelineSectionAt(code, byLabel(code, "Empty"), "before");
    expect(before.code.split("\n")[1]).toBe("    section New Section 1");
    expect(before.code.split("\n")[2]).toBe("    section Empty");
    const after = addTimelineSectionAt(code, byLabel(code, "Empty"), "after");
    expect(after.code.split("\n")[1]).toBe("    section Empty");
    expect(after.code.split("\n")[2]).toBe("    section New Section 1");
    expect(after.code.split("\n")[3]).toBe("    section Full");
  });

  it("does not move child periods into the wrong section", () => {
    const result = addTimelineSectionAt(THREE_SECTIONS, byLabel(THREE_SECTIONS, "Build"), "before");
    const parsed = parseTimeline(result.code);
    const build = parsed.sections.find((section) => section.label === "Build");
    expect(build?.periods.map((period) => period.label)).toEqual(["2026 Q2", "2026 Q3"]);
    expect(parsed.sections.find((section) => section.label === "New Section 1")?.periods).toEqual(
      [],
    );
  });

  it("auto-numbers section labels when inserting repeatedly", () => {
    let code = THREE_SECTIONS;
    code = addTimelineSectionAt(code, byLabel(code, "Build"), "before").code;
    const result = addTimelineSectionAt(code, byLabel(code, "New Section 1"), "before");
    expect(result.code).toContain("    section New Section 2\n    section New Section 1");
  });

  it("is a no-op when the target is not a section or does not exist", () => {
    expect(addTimelineSectionAt(THREE_SECTIONS, "TIMELINE_SECTION_999", "before")).toEqual({
      code: THREE_SECTIONS,
      nodeId: "TIMELINE_SECTION_999",
    });
    const periodId = byLabel(THREE_SECTIONS, "2026 Q2");
    expect(addTimelineSectionAt(THREE_SECTIONS, periodId, "after")).toEqual({
      code: THREE_SECTIONS,
      nodeId: periodId,
    });
  });

  it("round-trips through parse for both placements", () => {
    for (const placement of ["before", "after"] as const) {
      const result = addTimelineSectionAt(
        THREE_SECTIONS,
        byLabel(THREE_SECTIONS, "Build"),
        placement,
      );
      const parsed = parseTimeline(result.code);
      expect(parsed.sections).toHaveLength(4);
      expect(parsed.sections.map((section) => section.id)).toContain(result.nodeId);
      expect(parsed.sections.find((section) => section.id === result.nodeId)?.label).toBe(
        "New Section 1",
      );
    }
  });
});

describe("timeline period insertion (addTimelinePeriodNear)", () => {
  it("adds a period above a default period", () => {
    const code = "timeline\n    2026 Q2 : Build";
    const result = addTimelinePeriodNear(code, byLabel(code, "2026 Q2"), "before");
    expect(result.code).toBe("timeline\n    New Period 1 : New Event 1\n    2026 Q2 : Build");
    expect(result.nodeId).toBe(byLabel(result.code, "New Period 1"));
  });

  it("adds a period below a default period including its continuation lines", () => {
    const code = "timeline\n    2026 Q1 : A\n    : B";
    const result = addTimelinePeriodNear(code, byLabel(code, "2026 Q1"), "after");
    expect(result.code).toBe("timeline\n    2026 Q1 : A\n    : B\n    New Period 1 : New Event 1");
  });

  it("adds a period above an event, anchored to the event's own period", () => {
    const code = `timeline
    section S
        2026 Q2 : B : C`;
    const result = addTimelinePeriodNear(code, byLabel(code, "C"), "before");
    expect(result.code).toBe(`timeline
    section S
        New Period 1 : New Event 1
        2026 Q2 : B : C`);
  });

  it("adds a period below the period of a mid-section event (not the section edge)", () => {
    const code = `timeline
    section S
        2026 Q1 : A
        2026 Q2 : B
        2026 Q3 : C`;
    const result = addTimelinePeriodNear(code, byLabel(code, "B"), "after");
    expect(result.code).toBe(`timeline
    section S
        2026 Q1 : A
        2026 Q2 : B
        New Period 1 : New Event 1
        2026 Q3 : C`);
  });

  it("adds a period into an empty section", () => {
    const code = "timeline\n    section S";
    const result = addTimelinePeriodNear(code, byLabel(code, "S"), "after");
    expect(result.code).toBe(`timeline
    section S
        New Period 1 : New Event 1`);
  });
});

describe("timeline title", () => {
  const WITH_TITLE = `timeline
    title Product Milestones
    section Planning
        2026 Q1 : Research`;

  const WITHOUT_TITLE = `timeline
    section Planning
        2026 Q1 : Research`;

  it("reads the current title", () => {
    expect(getTimelineTitle(WITH_TITLE)).toBe("Product Milestones");
    expect(getTimelineTitle(WITHOUT_TITLE)).toBe("");
  });

  it("replaces an existing title in place", () => {
    const result = upsertTimelineTitle(WITH_TITLE, "Renamed");
    expect(result).toContain("    title Renamed\n");
    expect(result).not.toContain("Monestones");
    // The rest of the diagram is preserved.
    expect(result).toContain("section Planning");
    expect(result).toContain("2026 Q1 : Research");
  });

  it("inserts a title after the header when none exists", () => {
    const result = upsertTimelineTitle(WITHOUT_TITLE, "Diagram Title");
    expect(result).toBe(`timeline
    title Diagram Title
    section Planning
        2026 Q1 : Research`);
  });

  it("removes an existing title and keeps the diagram intact", () => {
    const result = removeTimelineTitle(WITH_TITLE);
    expect(result).toBe(`timeline
    section Planning
        2026 Q1 : Research`);
    expect(getTimelineTitle(result)).toBe("");
  });

  it("is a no-op when removing a non-existent title", () => {
    const result = removeTimelineTitle(WITHOUT_TITLE);
    expect(result).toBe(WITHOUT_TITLE);
  });

  it("round-trips a title change through parse + upsert", () => {
    const next = upsertTimelineTitle(WITH_TITLE, "Round Trip");
    const parsed = parseTimeline(next);
    expect(parsed.title).toBe("Round Trip");
    expect(parsed.titleLineIndex).toBeGreaterThanOrEqual(0);
  });
});

describe("timelineAddAxes (directional add buttons)", () => {
  it("maps an event in LR to top/bottom (before/after)", () => {
    expect(timelineAddAxes("event", "LR")).toEqual([
      { side: "top", action: { kind: "event", placement: "before" } },
      { side: "bottom", action: { kind: "event", placement: "after" } },
    ]);
  });

  it("maps an event in TD to top/bottom (before/after)", () => {
    expect(timelineAddAxes("event", "TD")).toEqual([
      { side: "top", action: { kind: "event", placement: "before" } },
      { side: "bottom", action: { kind: "event", placement: "after" } },
    ]);
  });

  it("maps a period in LR to left/right + bottom child button", () => {
    expect(timelineAddAxes("period", "LR")).toEqual([
      { side: "left", action: { kind: "period", placement: "before" } },
      { side: "right", action: { kind: "period", placement: "after" } },
      { side: "bottom", action: { kind: "event-to-period" } },
    ]);
  });

  it("maps a period in TD to top/bottom + right child button", () => {
    expect(timelineAddAxes("period", "TD")).toEqual([
      { side: "top", action: { kind: "period", placement: "before" } },
      { side: "bottom", action: { kind: "period", placement: "after" } },
      { side: "right", action: { kind: "event-to-period" } },
    ]);
  });

  it("maps a section in LR to left/right + bottom child button", () => {
    expect(timelineAddAxes("section", "LR")).toEqual([
      { side: "left", action: { kind: "section", placement: "before" } },
      { side: "right", action: { kind: "section", placement: "after" } },
      { side: "bottom", action: { kind: "period-to-section" } },
    ]);
  });

  it("maps a section in TD to top/bottom + right child button", () => {
    expect(timelineAddAxes("section", "TD")).toEqual([
      { side: "top", action: { kind: "section", placement: "before" } },
      { side: "bottom", action: { kind: "section", placement: "after" } },
      { side: "right", action: { kind: "period-to-section" } },
    ]);
  });
});
