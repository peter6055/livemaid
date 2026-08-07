import { describe, it, expect } from "vitest";
import {
  getSequenceParticipantIds,
  generateSequenceParticipantId,
  generateSequenceParticipantLabel,
  buildSequenceParticipantInsertLine,
  getLastSequenceParticipantDeclarationIndex,
  insertSequenceParticipant,
} from "@/components/editor/SequenceToolbar";

describe("sequence participant auto-ID (PR: SequenceToolbar extraction, AC 1.3)", () => {
  it("returns A for an empty diagram", () => {
    expect(generateSequenceParticipantId("sequenceDiagram")).toBe("A");
  });

  it("collects IDs from explicit participant declarations", () => {
    const code = `sequenceDiagram
    participant A
    participant B
    participant C as Charlie
    participant D as Dave`;
    expect(getSequenceParticipantIds(code).has("A")).toBe(true);
    expect(getSequenceParticipantIds(code).has("D")).toBe(true);
    expect(generateSequenceParticipantId(code)).toBe("E");
  });

  it("collects IDs from message references even when never declared", () => {
    const code = `sequenceDiagram
    A->>B: Hello
    B-->>A: Hi`;
    const ids = getSequenceParticipantIds(code);
    expect(ids.has("A")).toBe(true);
    expect(ids.has("B")).toBe(true);
    expect(generateSequenceParticipantId(code)).toBe("C");
  });

  it("skips to the first unused letter across mixed declarations and messages", () => {
    const code = `sequenceDiagram
    participant Alice as A
    A->>B: msg
    participant C as Cee`;
    expect(generateSequenceParticipantId(code)).toBe("D");
  });

  it("falls back to a timestamped id when all 26 letters are taken", () => {
    const used = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    const decls = used.map((c) => `    participant ${c}`).join("\n");
    const code = `sequenceDiagram\n${decls}`;
    const id = generateSequenceParticipantId(code);
    expect(id.startsWith("P")).toBe(true);
  });

  it("ignores non-participant keywords like note/loop/end", () => {
    const code = `sequenceDiagram
    participant A
    Note right of A: a note
    loop each time
    end`;
    const ids = getSequenceParticipantIds(code);
    expect(ids.has("Note")).toBe(false);
    expect(ids.has("loop")).toBe(false);
    expect(ids.has("end")).toBe(false);
    expect(generateSequenceParticipantId(code)).toBe("B");
  });
});

describe("sequence participant label uniqueness", () => {
  it("generates New Database when free", () => {
    expect(generateSequenceParticipantLabel("database", "sequenceDiagram")).toBe("New Database");
  });

  it("deduplicates labels that are already in use", () => {
    const code = `sequenceDiagram
    participant A@{ "type": "database" } as New Database`;
    expect(generateSequenceParticipantLabel("database", code)).toBe("New Database 2");
  });

  it("counts up past existing suffixed labels", () => {
    const code = `sequenceDiagram
    participant A@{ "type": "database" } as New Database
    participant B@{ "type": "database" } as New Database 2`;
    expect(generateSequenceParticipantLabel("database", code)).toBe("New Database 3");
  });
});

describe("sequence participant insert line builder", () => {
  it("builds a plain participant declaration", () => {
    expect(buildSequenceParticipantInsertLine("participant", "E", "New Participant")).toBe(
      "    participant E as New Participant",
    );
  });

  it("builds an actor declaration", () => {
    expect(buildSequenceParticipantInsertLine("actor", "F", "New Actor")).toBe(
      "    actor F as New Actor",
    );
  });

  it("builds a typed participant declaration with @{} metadata", () => {
    expect(buildSequenceParticipantInsertLine("database", "G", "New Database")).toBe(
      '    participant G@{ "type": "database" } as New Database',
    );
  });
});

describe("sequence participant right-side insertion (AC 1.1 / 1.2)", () => {
  it("finds the last declaration line", () => {
    const code = `sequenceDiagram
    participant A
    A->>B: hi
    participant B`;
    expect(getLastSequenceParticipantDeclarationIndex(code)).toBe(3);
  });

  it("injects below the last declaration block so the new column renders rightmost", () => {
    const code = `sequenceDiagram
    participant A
    participant B
    A->>B: Hello`;
    const result = insertSequenceParticipant(code, "database");
    expect(result).toBe(`sequenceDiagram
    participant A
    participant B
    participant C@{ "type": "database" } as New Database
    A->>B: Hello`);
  });

  it("appends at the end when participants are only implied by messages", () => {
    const code = `sequenceDiagram
    A->>B: Hello`;
    const result = insertSequenceParticipant(code, "actor");
    expect(result).toBe(`sequenceDiagram
    A->>B: Hello
    actor C as New Actor`);
  });

  it("auto-IDs sequentially across repeated insertions", () => {
    let code = `sequenceDiagram
    participant A`;
    code = insertSequenceParticipant(code, "participant");
    code = insertSequenceParticipant(code, "participant");
    expect(code).toBe(`sequenceDiagram
    participant A
    participant B as New Participant
    participant C as New Participant 2`);
  });

  it("uses type metadata for non-participant/actor archetypes", () => {
    const code = `sequenceDiagram
    participant A
    A->>B: hi`;
    const result = insertSequenceParticipant(code, "collections");
    expect(result).toContain('participant C@{ "type": "collections" } as New Collections');
  });
});
