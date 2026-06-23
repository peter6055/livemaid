import { describe, expect, it } from "vitest";
import {
  buildSequenceMessageTriggerAreas,
  type SequenceMessageVisual,
} from "@/hooks/useCanvasInteraction";

function visual(
  index: number,
  y: number,
  height: number,
  textBox?: SequenceMessageVisual["textBox"],
): SequenceMessageVisual {
  return {
    index,
    sourceLineIndex: index + 1,
    lineEl: null,
    labelEls: [],
    lineRect: null,
    labelRect: null,
    selectionBox: { x: 0, y, width: 100, height },
    textBox: textBox ?? null,
    hitBox: { x: 0, y, width: 100, height },
  };
}

describe("buildSequenceMessageTriggerAreas", () => {
  it("clips dense sequence message overlays so the row below cannot steal the cursor", () => {
    const areas = buildSequenceMessageTriggerAreas(
      [visual(0, 100, 12), visual(1, 116, 12), visual(2, 132, 12)],
      { x: 8, y: 5 },
    );

    const first = areas[0];
    const second = areas[1];
    const third = areas[2];

    expect(first.y + first.height).toBeLessThanOrEqual(second.y);
    expect(second.y + second.height).toBeLessThanOrEqual(third.y);
    expect(first.y).toBe(95);
    expect(first.y + first.height).toBe(114);
    expect(second.y).toBe(114);
  });

  it("keeps long message overlays across the full rendered connection span", () => {
    const areas = buildSequenceMessageTriggerAreas(
      [visual(0, 100, 12, { x: 190, y: 98, width: 20, height: 10 })],
      { x: 8, y: 5 },
    );

    expect(areas[0]).toMatchObject({
      x: -8,
      width: 116,
    });
  });
});
