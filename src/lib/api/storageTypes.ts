// Storage domain types + the StorageAdapter contract.
//
// This module defines the persistence-layer SHAPE (documents) and the INTERFACE every storage
// backend must implement. The current backend is the local file system (`storageFsAdapter.ts`); a
// future MongoDB backend simply implements this same `StorageAdapter` interface and gets swapped in
// at the single instantiation point in `storage.ts`. No API route or frontend code references a
// concrete backend — they only use the façade in `storage.ts` — so migrating backends is a
// localized change.

import { buildSequenceMessageAnchor } from "@/lib/diagrams/sequenceCommentAnchor";

export interface DiagramDocument {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  code: string;
  type: "flowchart" | "sequence" | "class";
  folderId: string | null;
  subPages: { id: string; name: string; code: string }[];
  comments: DiagramComment[];
  versionHistory: VersionHistoryEntry[];
}

export interface DiagramComment {
  id: string;
  anchor: DiagramCommentAnchor;
  messages: DiagramCommentMessage[];
  resolved: boolean;
  starred?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiagramCommentAnchor {
  type: "shape" | "canvas";
  shapeId?: string;
  fallbackPos?: {
    x: number;
    y: number;
  };
  position?: {
    x: number;
    y: number;
  };
  sequenceMessage?: {
    sender: string;
    receiver: string;
    operator: string;
    label: string;
    occurrence: number;
  };
}

export interface DiagramCommentMessage {
  id: string;
  content: string;
  authorId: string;
  timestamp: string;
}

export interface VersionHistoryEntry {
  id: string;
  code: string;
  timestamp: string;
  label?: string;
  starred?: boolean;
}

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

// Whether the app runs in read-only demo mode. Read here once so every backend (and the API routes
// that return 403s for writes) shares a single source of truth.
export const IS_DEMO_MODE = process.env.DEMO_MODE === "true";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Coerce an arbitrary parsed record into a fully-formed DiagramDocument with safe defaults. Backend-
// agnostic so both the FS adapter and a future Mongo adapter hydrate documents identically.
export function normalizeDiagramDocument(raw: Partial<DiagramDocument>): DiagramDocument {
  const sequenceMessageEntries = String(raw.code || "")
    .split("\n")
    .map((line, index) => ({ index, line }))
    .filter(({ line }) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("%%")) return false;
      const keywords = [
        "sequenceDiagram",
        "Note",
        "note",
        "rect",
        "alt",
        "opt",
        "loop",
        "par",
        "critical",
        "option",
        "else",
        "end",
        "participant",
        "actor",
        "autonumber",
        "activate",
        "deactivate",
        "box",
        "links",
        "link",
        "properties",
        "details",
      ];
      if (keywords.some((kw) => trimmed === kw || trimmed.startsWith(kw + " "))) return false;
      return trimmed.includes(":");
    });

  const normalizedComments: DiagramComment[] = Array.isArray(raw.comments)
    ? raw.comments.map((comment, index): DiagramComment => {
        const rawComment = isRecord(comment) ? comment : null;
        if (rawComment && Array.isArray(rawComment.messages)) {
          const rawAnchor = isRecord(rawComment.anchor) ? rawComment.anchor : null;
          const legacySequenceMatch =
            rawAnchor &&
            rawAnchor.type === "shape" &&
            typeof rawAnchor.shapeId === "string"
              ? rawAnchor.shapeId.match(/^SEQ_MSG_(\d+)$/)
              : null;
          const derivedSequenceMessage =
            rawAnchor &&
            rawAnchor.type === "shape" &&
            !rawAnchor.sequenceMessage &&
            legacySequenceMatch
              ? buildSequenceMessageAnchor(sequenceMessageEntries, Number(legacySequenceMatch[1]))
              : null;
          const anchor: DiagramCommentAnchor =
            rawAnchor
              ? rawAnchor.type === "shape"
                ? {
                    type: "shape",
                    shapeId:
                      typeof rawAnchor.shapeId === "string" ? rawAnchor.shapeId : undefined,
                    fallbackPos:
                      isRecord(rawAnchor.fallbackPos) &&
                      typeof rawAnchor.fallbackPos.x === "number" &&
                      typeof rawAnchor.fallbackPos.y === "number"
                        ? {
                            x: rawAnchor.fallbackPos.x,
                            y: rawAnchor.fallbackPos.y,
                          }
                        : undefined,
                    sequenceMessage:
                      isRecord(rawAnchor.sequenceMessage) &&
                      typeof rawAnchor.sequenceMessage.sender === "string" &&
                      typeof rawAnchor.sequenceMessage.receiver === "string" &&
                      typeof rawAnchor.sequenceMessage.operator === "string" &&
                      typeof rawAnchor.sequenceMessage.label === "string" &&
                      typeof rawAnchor.sequenceMessage.occurrence === "number"
                        ? {
                            sender: rawAnchor.sequenceMessage.sender,
                            receiver: rawAnchor.sequenceMessage.receiver,
                            operator: rawAnchor.sequenceMessage.operator,
                            label: rawAnchor.sequenceMessage.label,
                            occurrence: rawAnchor.sequenceMessage.occurrence,
                          }
                        : derivedSequenceMessage ?? undefined,
                  }
                : {
                    type: "canvas",
                    position:
                      isRecord(rawAnchor.position) &&
                      typeof rawAnchor.position.x === "number" &&
                      typeof rawAnchor.position.y === "number"
                        ? {
                            x: rawAnchor.position.x,
                            y: rawAnchor.position.y,
                          }
                        : { x: 0.5, y: 0.5 },
                  }
              : { type: "canvas", position: { x: 0.5, y: 0.5 } };
          return {
            id: typeof rawComment.id === "string" ? rawComment.id : `comment-${index}`,
            anchor,
            messages: rawComment.messages
              .filter((message) => message && typeof message.content === "string")
              .map((message, messageIndex: number) => ({
                id: typeof message.id === "string" ? message.id : `comment-${index}-message-${messageIndex}`,
                content: message.content,
                authorId: typeof message.authorId === "string" ? message.authorId : "anonymous",
                timestamp:
                  typeof message.timestamp === "string" ? message.timestamp : new Date().toISOString(),
            })),
            resolved: Boolean(rawComment.resolved),
            starred: Boolean(rawComment.starred),
            createdAt:
              typeof rawComment.createdAt === "string" ? rawComment.createdAt : new Date().toISOString(),
            updatedAt:
              typeof rawComment.updatedAt === "string" ? rawComment.updatedAt : new Date().toISOString(),
          };
        }

        const rawLegacyComment = isRecord(comment) ? comment : null;
        const timestamp =
          rawLegacyComment && typeof rawLegacyComment.timestamp === "string"
            ? rawLegacyComment.timestamp
            : new Date().toISOString();
        const content =
          rawLegacyComment && typeof rawLegacyComment.content === "string" ? rawLegacyComment.content : "";
        const id =
          rawLegacyComment && typeof rawLegacyComment.id === "string"
            ? rawLegacyComment.id
            : `legacy-comment-${index}`;
        return {
          id,
          anchor: { type: "canvas", position: { x: 0.5, y: 0.5 } },
          messages: [
            {
              id: `${id}-message-0`,
              content,
              authorId: "anonymous",
              timestamp,
            },
          ],
          resolved: false,
          starred: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      })
    : [];

  return {
    id: raw.id || "",
    name: raw.name || "Untitled Diagram",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : null,
    code: raw.code || "",
    type: raw.type || "flowchart",
    folderId: typeof raw.folderId === "string" ? raw.folderId : null,
    subPages: Array.isArray(raw.subPages) ? raw.subPages : [],
    comments: normalizedComments,
    versionHistory: Array.isArray(raw.versionHistory) ? raw.versionHistory : [],
  };
}

export function normalizeFolder(raw: Partial<Folder>): Folder {
  return {
    id: raw.id || "",
    name: raw.name || "Untitled Folder",
    parentId: typeof raw.parentId === "string" ? raw.parentId : null,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
    deletedAt: typeof raw.deletedAt === "string" ? raw.deletedAt : null,
  };
}

// The persistence contract. Every storage backend (file system today, MongoDB later) implements
// exactly these methods. Reads exclude soft-deleted records; writes are no-ops in demo mode; folder
// deletion reparents contents so nothing is orphaned. Keeping this surface minimal is deliberate —
// it is the entire API the rest of the app depends on.
export interface StorageAdapter {
  // Diagrams
  getDiagrams(): Promise<DiagramDocument[]>;
  getDiagram(id: string): Promise<DiagramDocument | null>;
  saveDiagram(doc: DiagramDocument): Promise<void>;
  deleteDiagram(id: string): Promise<boolean>;

  // Folders
  getFolders(): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | null>;
  saveFolder(folder: Folder): Promise<void>;
  deleteFolderCascade(id: string): Promise<boolean>;
}
