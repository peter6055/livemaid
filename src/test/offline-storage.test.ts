// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  saveOfflineEdit,
  getOfflineEdit,
  clearOfflineEdit,
  type OfflineEdit,
} from "@/lib/offlineStorage";

const makeEdit = (overrides: Partial<OfflineEdit> = {}): OfflineEdit => ({
  diagramId: "doc-1",
  baseCode: "graph TD\n  A --> B",
  pendingCode: "graph TD\n  A --> B\n  B --> C",
  updatedAt: 1700000000000,
  ...overrides,
});

describe("offlineStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips an offline edit", () => {
    const edit = makeEdit();
    saveOfflineEdit(edit);
    expect(getOfflineEdit("doc-1")).toEqual(edit);
  });

  it("overwrites a previous edit for the same diagram", () => {
    saveOfflineEdit(makeEdit({ pendingCode: "v1" }));
    const v2 = makeEdit({ pendingCode: "v2", updatedAt: 2 });
    saveOfflineEdit(v2);
    expect(getOfflineEdit("doc-1")?.pendingCode).toBe("v2");
  });

  it("keys edits per diagram id", () => {
    saveOfflineEdit(makeEdit());
    saveOfflineEdit(makeEdit({ diagramId: "doc-2", pendingCode: "other" }));
    expect(getOfflineEdit("doc-1")?.pendingCode).not.toBe("other");
    expect(getOfflineEdit("doc-2")?.pendingCode).toBe("other");
  });

  it("returns null for a missing edit", () => {
    expect(getOfflineEdit("missing")).toBeNull();
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    localStorage.setItem("livemaid:offline-edit:doc-1", "{not json");
    expect(getOfflineEdit("doc-1")).toBeNull();
  });

  it("returns null for JSON with an unexpected shape", () => {
    localStorage.setItem("livemaid:offline-edit:doc-1", JSON.stringify({ nope: 1 }));
    expect(getOfflineEdit("doc-1")).toBeNull();
  });

  it("clears an edit", () => {
    saveOfflineEdit(makeEdit());
    clearOfflineEdit("doc-1");
    expect(getOfflineEdit("doc-1")).toBeNull();
  });

  it("clear is a no-op when nothing is cached", () => {
    expect(() => clearOfflineEdit("doc-1")).not.toThrow();
  });
});
