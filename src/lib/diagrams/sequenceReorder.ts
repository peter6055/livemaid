export type UnifiedRow = {
  kind: "msg" | "note";
  srcIndex: number;
  domIndex: number;
};

export function computeInsertionIndex(
  unified: UnifiedRow[],
  fromPos: number,
  slot: number,
): number {
  const N = unified.length;
  const srcIdx = unified[fromPos].srcIndex;

  let refOrigIndex: number | null = null;
  if (slot < N) {
    refOrigIndex = unified[slot].srcIndex;
  }

  let insertAt: number;
  if (refOrigIndex !== null) {
    insertAt = refOrigIndex > srcIdx ? refOrigIndex - 1 : refOrigIndex;
  } else {
    const remaining = unified.filter((_, i) => i !== fromPos);
    const last = remaining[remaining.length - 1];
    const lastIdx = last.srcIndex > srcIdx ? last.srcIndex - 1 : last.srcIndex;
    insertAt = lastIdx + 1;
  }

  return insertAt;
}

/**
 * Pure Y-target helper for sequence drag reorder.
 * Computes zone boundaries from ALL-slot midpoints (including excluded no-op slots),
 * then returns the slot number only if it is in the eligible set.
 * Cursor in an excluded slot's zone returns null.
 */
export function findSeqReorderTargetSlot(
  allSlotYs: readonly number[],
  eligibleSlots: ReadonlySet<number>,
  cursorY: number,
  edgeHalfHeight: number = 7,
): number | null {
  const N = allSlotYs.length - 1;
  for (let k = 0; k < allSlotYs.length; k += 1) {
    const y = allSlotYs[k];
    const zoneTop = k === 0 ? y - edgeHalfHeight : (allSlotYs[k - 1] + y) / 2;
    const zoneBottom = k === N ? y + edgeHalfHeight : (y + allSlotYs[k + 1]) / 2;
    if (cursorY >= zoneTop && cursorY <= zoneBottom) {
      return eligibleSlots.has(k) ? k : null;
    }
  }
  return null;
}

export function applyReorder(
  lines: string[],
  unified: UnifiedRow[],
  fromPos: number,
  slot: number,
): string[] {
  const N = unified.length;
  if (fromPos < 0 || fromPos >= N) return lines;
  if (slot === fromPos || slot === fromPos + 1) return lines;

  const clampedSlot = Math.max(0, Math.min(N, slot));
  if (clampedSlot === fromPos || clampedSlot === fromPos + 1) return lines;

  const srcIdx = unified[fromPos].srcIndex;
  const movedLine = lines[srcIdx];
  const insertAt = computeInsertionIndex(unified, fromPos, clampedSlot);

  const result = [...lines];
  result.splice(srcIdx, 1);
  result.splice(insertAt, 0, movedLine);
  return result;
}
