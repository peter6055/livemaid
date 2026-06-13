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
    ? raw.comments.map((comment: any, index): DiagramComment => {
        if (comment && Array.isArray(comment.messages)) {
          const legacySequenceMatch =
            comment.anchor &&
            comment.anchor.type === "shape" &&
            typeof comment.anchor.shapeId === "string"
              ? comment.anchor.shapeId.match(/^SEQ_MSG_(\d+)$/)
              : null;
          const derivedSequenceMessage =
            comment.anchor &&
            comment.anchor.type === "shape" &&
            !comment.anchor.sequenceMessage &&
            legacySequenceMatch
              ? buildSequenceMessageAnchor(sequenceMessageEntries, Number(legacySequenceMatch[1]))
              : null;
          const anchor: DiagramCommentAnchor =
            comment.anchor && typeof comment.anchor === "object"
              ? comment.anchor.type === "shape"
                ? {
                    type: "shape",
                    shapeId:
                      typeof comment.anchor.shapeId === "string" ? comment.anchor.shapeId : undefined,
                    fallbackPos:
                      comment.anchor.fallbackPos &&
                      typeof comment.anchor.fallbackPos.x === "number" &&
                      typeof comment.anchor.fallbackPos.y === "number"
                        ? {
                            x: comment.anchor.fallbackPos.x,
                            y: comment.anchor.fallbackPos.y,
                          }
                        : undefined,
                    sequenceMessage:
                      comment.anchor.sequenceMessage &&
                      typeof comment.anchor.sequenceMessage.sender === "string" &&
                      typeof comment.anchor.sequenceMessage.receiver === "string" &&
                      typeof comment.anchor.sequenceMessage.operator === "string" &&
                      typeof comment.anchor.sequenceMessage.label === "string" &&
                      typeof comment.anchor.sequenceMessage.occurrence === "number"
                        ? {
                            sender: comment.anchor.sequenceMessage.sender,
                            receiver: comment.anchor.sequenceMessage.receiver,
                            operator: comment.anchor.sequenceMessage.operator,
                            label: comment.anchor.sequenceMessage.label,
                            occurrence: comment.anchor.sequenceMessage.occurrence,
                          }
                        : derivedSequenceMessage ?? undefined,
                  }
                : {
                    type: "canvas",
                    position:
                      comment.anchor.position &&
                      typeof comment.anchor.position.x === "number" &&
                      typeof comment.anchor.position.y === "number"
                        ? {
                            x: comment.anchor.position.x,
                            y: comment.anchor.position.y,
                          }
                        : { x: 0.5, y: 0.5 },
                  }
              : { type: "canvas", position: { x: 0.5, y: 0.5 } };
          return {
            id: typeof comment.id === "string" ? comment.id : `comment-${index}`,
            anchor,
            messages: comment.messages
              .filter((message: any) => message && typeof message.content === "string")
              .map((message: any, messageIndex: number) => ({
                id: typeof message.id === "string" ? message.id : `comment-${index}-message-${messageIndex}`,
                content: message.content,
                authorId: typeof message.authorId === "string" ? message.authorId : "anonymous",
                timestamp:
                  typeof message.timestamp === "string" ? message.timestamp : new Date().toISOString(),
              })),
            resolved: Boolean(comment.resolved),
            createdAt:
              typeof comment.createdAt === "string" ? comment.createdAt : new Date().toISOString(),
            updatedAt:
              typeof comment.updatedAt === "string" ? comment.updatedAt : new Date().toISOString(),
          };
        }

        const timestamp =
          typeof comment?.timestamp === "string" ? comment.timestamp : new Date().toISOString();
        const content = typeof comment?.content === "string" ? comment.content : "";
        const id = typeof comment?.id === "string" ? comment.id : `legacy-comment-${index}`;
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
