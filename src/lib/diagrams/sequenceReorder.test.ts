import { describe, it, expect } from "vitest";
import {
  computeInsertionIndex,
  applyReorder,
  findSeqReorderTargetSlot,
  type UnifiedRow,
} from "./sequenceReorder";

describe("sequenceReorder", () => {
  describe("computeInsertionIndex", () => {
    const makeUnified = (srcIndices: number[]): UnifiedRow[] =>
      srcIndices.map((srcIndex, i) => ({
        kind: "msg" as const,
        srcIndex,
        domIndex: i,
      }));

    it("E before C (upward move): fromPos=4, slot=2", () => {
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const insertAt = computeInsertionIndex(unified, 4, 2);
      expect(insertAt).toBe(4);
    });

    it("E before D (upward move one): fromPos=4, slot=3", () => {
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const insertAt = computeInsertionIndex(unified, 4, 3);
      expect(insertAt).toBe(5);
    });

    it("B after D (downward move): fromPos=1, slot=4", () => {
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const insertAt = computeInsertionIndex(unified, 1, 4);
      expect(insertAt).toBe(5);
    });

    it("C before A (upward move to start): fromPos=2, slot=0", () => {
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const insertAt = computeInsertionIndex(unified, 2, 0);
      expect(insertAt).toBe(2);
    });

    it("A after E (downward move to end): fromPos=0, slot=5", () => {
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const insertAt = computeInsertionIndex(unified, 0, 5);
      expect(insertAt).toBe(6);
    });

    it("non-contiguous srcIndices (with blocks): E before C", () => {
      const unified = makeUnified([2, 4, 6, 8, 10]);
      const insertAt = computeInsertionIndex(unified, 4, 2);
      expect(insertAt).toBe(6);
    });

    it("alt/else boundary: C before B (cross-boundary upward)", () => {
      const unified = makeUnified([0, 2, 4]);
      const insertAt = computeInsertionIndex(unified, 2, 1);
      expect(insertAt).toBe(2);
    });
  });

  describe("applyReorder", () => {
    const makeUnified = (srcIndices: number[]): UnifiedRow[] =>
      srcIndices.map((srcIndex, i) => ({
        kind: "msg" as const,
        srcIndex,
        domIndex: i,
      }));

    it("E before C => A B E C D", () => {
      const lines = ["seq", "part", "A", "B", "C", "D", "E"];
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const result = applyReorder(lines, unified, 4, 2);
      expect(result).toEqual(["seq", "part", "A", "B", "E", "C", "D"]);
    });

    it("E upward one (before D) => A B C E D", () => {
      const lines = ["seq", "part", "A", "B", "C", "D", "E"];
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const result = applyReorder(lines, unified, 4, 3);
      expect(result).toEqual(["seq", "part", "A", "B", "C", "E", "D"]);
    });

    it("B after D => A C D B E", () => {
      const lines = ["seq", "part", "A", "B", "C", "D", "E"];
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const result = applyReorder(lines, unified, 1, 4);
      expect(result).toEqual(["seq", "part", "A", "C", "D", "B", "E"]);
    });

    it("no-op: slot === fromPos", () => {
      const lines = ["seq", "part", "A", "B", "C"];
      const unified = makeUnified([2, 3, 4]);
      const result = applyReorder(lines, unified, 1, 1);
      expect(result).toEqual(lines);
    });

    it("no-op: slot === fromPos + 1", () => {
      const lines = ["seq", "part", "A", "B", "C"];
      const unified = makeUnified([2, 3, 4]);
      const result = applyReorder(lines, unified, 1, 2);
      expect(result).toEqual(lines);
    });

    it("message/note unified ordering: note interleaved", () => {
      const lines = ["seq", "A", "note1", "B", "C"];
      const unified: UnifiedRow[] = [
        { kind: "msg", srcIndex: 1, domIndex: 0 },
        { kind: "note", srcIndex: 2, domIndex: 0 },
        { kind: "msg", srcIndex: 3, domIndex: 1 },
        { kind: "msg", srcIndex: 4, domIndex: 2 },
      ];
      const result = applyReorder(lines, unified, 3, 1);
      expect(result).toEqual(["seq", "A", "C", "note1", "B"]);
    });

    it("C before A => C A B D E", () => {
      const lines = ["seq", "part", "A", "B", "C", "D", "E"];
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const result = applyReorder(lines, unified, 2, 0);
      expect(result).toEqual(["seq", "part", "C", "A", "B", "D", "E"]);
    });

    it("A after E => B C D E A", () => {
      const lines = ["seq", "part", "A", "B", "C", "D", "E"];
      const unified = makeUnified([2, 3, 4, 5, 6]);
      const result = applyReorder(lines, unified, 0, 5);
      expect(result).toEqual(["seq", "part", "B", "C", "D", "E", "A"]);
    });

    it("boundary: fromPos out of range", () => {
      const lines = ["seq", "A", "B"];
      const unified = makeUnified([1, 2]);
      const result = applyReorder(lines, unified, 5, 0);
      expect(result).toEqual(lines);
    });

    it("alt/else boundary: move C (else) before B (alt) — no extra upward shift", () => {
      const lines = [
        "Alice->>Bob: A",
        "alt condition",
        "Alice->>Bob: B",
        "else",
        "Alice->>Bob: C",
        "end",
      ];
      const unified: UnifiedRow[] = [
        { kind: "msg", srcIndex: 0, domIndex: 0 },
        { kind: "msg", srcIndex: 2, domIndex: 1 },
        { kind: "msg", srcIndex: 4, domIndex: 2 },
      ];
      const result = applyReorder(lines, unified, 2, 1);
      expect(result).toEqual([
        "Alice->>Bob: A",
        "alt condition",
        "Alice->>Bob: C",
        "Alice->>Bob: B",
        "else",
        "end",
      ]);
    });

    it("adjacent upward move: fromPos=9 to slot=8 (Schedule before Return)", () => {
      const lines = [
        "sequenceDiagram",
        "participant A",
        "participant B",
        "A->>B: msg0",
        "A->>B: msg1",
        "A->>B: msg2",
        "A->>B: msg3",
        "A->>B: msg4",
        "A->>B: msg5",
        "A->>B: msg6",
        "A->>B: msg7",
        "A->>B: Return barcode",
        "A->>B: Schedule usage check",
      ];
      const unified: UnifiedRow[] = [];
      for (let i = 0; i < 8; i++) {
        unified.push({ kind: "msg", srcIndex: 3 + i, domIndex: i });
      }
      unified.push({ kind: "msg", srcIndex: 11, domIndex: 8 });
      unified.push({ kind: "msg", srcIndex: 12, domIndex: 9 });
      const result = applyReorder(lines, unified, 9, 8);
      expect(result.length).toBe(lines.length);
      expect(result[11]).toBe("A->>B: Schedule usage check");
      expect(result[12]).toBe("A->>B: Return barcode");
    });
  });

  describe("findSeqReorderTargetSlot", () => {
    it("returns eligible slot when cursor is in its zone", () => {
      // 5 slots (0..4) at evenly spaced Y positions
      const allSlotYs = [0, 40, 80, 120, 160];
      // Slots 0, 3, 4 are eligible (1 and 2 excluded as fromIndex/fromIndex+1)
      const eligible = new Set([0, 3, 4]);
      // Cursor at Y=10 -> well within slot 0's zone (top: -7, bottom: 20)
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 10)).toBe(0);
      // Cursor at Y=50 -> midpoint between slot 1 (y=40) and slot 2 (y=80) is 60,
      // so Y=50 is in slot 1's zone (20..60). Slot 1 is excluded -> returns null.
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 50)).toBeNull();
    });

    it("allowed slot before dragged row remains targetable through midpoint to excluded neighbor", () => {
      // 5 slots. Simulates dragging slot 2, so eligible = {0, 4}
      // Slots: 0 at y=0, 1 at y=40 (excluded), 2 at y=80 (excluded/from), 3 at y=120 (excluded/from+1), 4 at y=160
      const allSlotYs = [0, 40, 80, 120, 160];
      const eligible = new Set([0, 4]);
      // Cursor at Y=20 -> midpoint between slot 0 (y=0) and slot 1 (y=40) is 20, slot 0 is eligible
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 20)).toBe(0);
    });

    it("excluded own slot returns null when cursor in its zone", () => {
      const allSlotYs = [0, 40, 80, 120, 160];
      const eligible = new Set([0, 4]);
      // Cursor at Y=60 -> midpoint between slot 1 (40) and slot 2 (80) is 60, slot 1 excluded
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 60)).toBeNull();
      // Cursor at Y=100 -> midpoint between slot 2 (80) and slot 3 (120) is 100, slot 2 excluded
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 100)).toBeNull();
      // Cursor at Y=140 -> midpoint between slot 3 (120) and slot 4 (160) is 140, slot 3 excluded
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 140)).toBeNull();
    });

    it("first-slot edge zone works", () => {
      const allSlotYs = [50, 100, 150];
      const eligible = new Set([0, 2]);
      // Cursor at Y=44 -> within slot 0's zone (top edge: 50 - 7 = 43)
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 44)).toBe(0);
      // Cursor at Y=60 -> still slot 0 (midpoint to slot 1 is 75)
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 60)).toBe(0);
    });

    it("last-slot edge zone works", () => {
      const allSlotYs = [50, 100, 150];
      const eligible = new Set([0]);
      // Cursor at Y=155 -> after last slot center, still in slot 2's zone, but slot 2 excluded
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 155)).toBeNull();
    });

    it("cursor exactly on slot center resolves to that slot", () => {
      const allSlotYs = [0, 50, 100];
      const eligible = new Set([1]);
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 50)).toBe(1);
    });

    it("empty eligible set returns null everywhere", () => {
      const allSlotYs = [0, 50, 100];
      const eligible = new Set<number>();
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 25)).toBeNull();
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 75)).toBeNull();
    });

    it("all slots eligible behaves like unfiltered midpoint zones", () => {
      const allSlotYs = [0, 40, 80, 120, 160];
      const eligible = new Set([0, 1, 2, 3, 4]);
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 10)).toBe(0);
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 30)).toBe(1);
      // Y=60 is the midpoint between slot1 (40) and slot2 (80); lower slot wins
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 60)).toBe(1);
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 100)).toBe(2);
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 140)).toBe(3);
    });

    it("adjacent upward move: fromIndex=9, target slot=8 with overlapping rows", () => {
      // Reproduces the exact failing case: dragging row 9 (Schedule) to slot 8 (before Return).
      // Rows 8 and 9 overlap vertically (row8.bottom=417.33 > row9.top=403.89), which causes
      // slotY(9) to be computed as (417.33 + 403.89) / 2 = 410.61.
      // Slot 8 Y = (369.51 + 378.52) / 2 = 374.015.
      // Eligible slots exclude fromIndex (9) and fromIndex+1 (10).
      const allSlotYs = [50, 100, 150, 200, 250, 300, 335, 350, 374.015, 410.61, 460];
      const eligible = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      // Cursor at Y=385 should be in slot 8's zone
      // zoneTop = (350 + 374.015) / 2 = 362.0075
      // zoneBottom = (374.015 + 410.61) / 2 = 392.3125
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 385)).toBe(8);
      // Cursor at Y=373 should also be in slot 8's zone
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 373)).toBe(8);
      // Cursor at Y=365 should also be in slot 8's zone
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 365)).toBe(8);
    });

    it("cursor in excluded fromIndex zone returns null", () => {
      const allSlotYs = [50, 100, 150, 200, 250, 300, 335, 350, 374.015, 410.61, 460];
      const eligible = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      // Cursor at Y=400 should be in slot 9's zone (excluded)
      // zoneTop = (374.015 + 410.61) / 2 = 392.3125
      // zoneBottom = (410.61 + 460) / 2 = 435.305
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 400)).toBeNull();
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 420)).toBeNull();
    });

    it("cursor at zone boundary resolves to lower slot", () => {
      const allSlotYs = [0, 50, 100];
      const eligible = new Set([0, 1, 2]);
      // Y=25 is the midpoint between slot 0 (0) and slot 1 (50)
      // Should resolve to slot 0 (lower slot wins at boundary)
      expect(findSeqReorderTargetSlot(allSlotYs, eligible, 25)).toBe(0);
    });
  });
});
