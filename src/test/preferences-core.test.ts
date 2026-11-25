import { describe, it, expect } from "vitest";
import {
  mergePreferences,
  normalizePreferences,
  sanitizePreferences,
  PREFERENCE_DEFAULTS,
} from "@/lib/preferences/core";

describe("preference document validation", () => {
  it("fills a missing or non-object document with defaults", () => {
    expect(normalizePreferences(null)).toEqual(PREFERENCE_DEFAULTS);
    expect(normalizePreferences("garbage")).toEqual(PREFERENCE_DEFAULTS);
    expect(normalizePreferences([1, 2])).toEqual(PREFERENCE_DEFAULTS);
  });

  it("ignores unknown keys and storage metadata", () => {
    const stored = {
      _id: "user-1",
      updatedAt: new Date(),
      viewMode: "list",
      isAdmin: true,
      plan: "enterprise",
    };
    expect(normalizePreferences(stored)).toEqual({ ...PREFERENCE_DEFAULTS, viewMode: "list" });
  });

  it("drops invalid enum and boolean values instead of coercing them", () => {
    const stored = {
      viewMode: "table",
      sortBy: 3,
      theme: "sepia",
      usageAnalytics: "true",
      debugReporting: 1,
    };
    expect(normalizePreferences(stored)).toEqual(PREFERENCE_DEFAULTS);
    // No truthy coercion: a bad value must never opt a user into telemetry.
    expect(normalizePreferences(stored).usageAnalytics).toBe(false);
    expect(normalizePreferences(stored).debugReporting).toBe(false);
  });

  it("accepts every valid enum value and a null folder", () => {
    expect(
      normalizePreferences({
        viewMode: "grid",
        sortBy: "created",
        theme: "dark",
        currentFolderId: null,
        usageAnalytics: true,
        debugReporting: true,
      }),
    ).toEqual({
      viewMode: "grid",
      sortBy: "created",
      theme: "dark",
      currentFolderId: null,
      usageAnalytics: true,
      debugReporting: true,
    });
  });

  it("treats an empty folder id as absent", () => {
    expect(normalizePreferences({ currentFolderId: "" }).currentFolderId).toBeNull();
  });

  it("never surfaces keys that were not sent in a patch", () => {
    expect(sanitizePreferences({ theme: "light" })).toEqual({ theme: "light" });
    expect(sanitizePreferences({})).toEqual({});
    expect(sanitizePreferences({ nope: 1 })).toEqual({});
  });

  it("merges a patch over an existing document", () => {
    const base = { ...PREFERENCE_DEFAULTS, viewMode: "list" as const };
    expect(mergePreferences(base, { theme: "dark" })).toEqual({
      ...base,
      theme: "dark",
    });
  });
});
