import { describe, expect, it } from "vitest";
import {
  DIAGRAM_CATALOG,
  DIAGRAM_TEMPLATES,
  getDiagramCapability,
  getDiagramTemplate,
  isCreatableDiagramType,
} from "@/lib/diagrams/catalog";
import { determineDiagramType } from "@/lib/diagrams/utils";
import { normalizeDiagramDocument, normalizeFolder } from "@/lib/api/storageTypes";

describe("diagram catalogue", () => {
  it("defines labels and capabilities for every creatable type", () => {
    for (const item of DIAGRAM_CATALOG) {
      expect(item.label).toBeTruthy();
      expect(["two-way", "code-only"]).toContain(item.capability);
      expect(isCreatableDiagramType(item.id)).toBe(true);
    }
  });

  it("keeps templates pointed at valid diagram types", () => {
    for (const template of DIAGRAM_TEMPLATES) {
      expect(getDiagramTemplate(template.id)).toEqual(template);
      expect(isCreatableDiagramType(template.type)).toBe(true);
      expect(template.code.trim()).not.toEqual("");
    }
  });

  it("labels known editor-backed types as two-way editable", () => {
    expect(getDiagramCapability("flowchart")).toBe("two-way");
    expect(getDiagramCapability("sequence")).toBe("two-way");
    expect(getDiagramCapability("classDiagram")).toBe("two-way");
    expect(getDiagramCapability("erDiagram")).toBe("two-way");
    expect(getDiagramCapability("stateDiagram")).toBe("two-way");
  });
});

describe("diagram type detection", () => {
  it("treats empty code as blank", () => {
    expect(determineDiagramType("")).toBe("blank");
    expect(determineDiagramType("\n  \n%% comment only")).toBe("blank");
  });

  it("detects code-only diagram families", () => {
    expect(determineDiagramType("gitGraph\n  commit")).toBe("gitGraph");
    expect(determineDiagramType("requirementDiagram\nrequirement r {\n}")).toBe(
      "requirementDiagram",
    );
    expect(determineDiagramType('C4Context\nPerson(user, "User")')).toBe("C4Context");
  });
});

describe("starred metadata normalization", () => {
  it("defaults old documents and folders to unstarred", () => {
    expect(normalizeDiagramDocument({ id: "d1" }).starred).toBe(false);
    expect(normalizeDiagramDocument({ id: "d1" }).starredAt).toBeNull();
    expect(normalizeFolder({ id: "f1" }).starred).toBe(false);
    expect(normalizeFolder({ id: "f1" }).starredAt).toBeNull();
  });

  it("preserves starred document and folder metadata", () => {
    const starredAt = "2026-01-01T00:00:00.000Z";
    expect(normalizeDiagramDocument({ id: "d1", starred: true, starredAt }).starredAt).toBe(
      starredAt,
    );
    expect(normalizeFolder({ id: "f1", starred: true, starredAt }).starredAt).toBe(starredAt);
  });
});
