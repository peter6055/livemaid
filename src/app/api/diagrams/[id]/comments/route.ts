import { NextResponse } from "next/server";
import { getDiagram, saveDiagram, IS_DEMO_MODE, type DiagramComment } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import { buildSequenceMessageAnchor } from "@/lib/diagrams/sequenceCommentAnchor";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeAnchor(anchor: unknown, code: string): DiagramComment["anchor"] {
  const sequenceMessageEntries = String(code || "")
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

  const rawAnchor = isRecord(anchor) ? anchor : null;

  if (rawAnchor?.type === "shape") {
    const legacySequenceMatch =
      typeof rawAnchor.shapeId === "string" ? rawAnchor.shapeId.match(/^SEQ_MSG_(\d+)$/) : null;
    const derivedSequenceMessage =
      !rawAnchor.sequenceMessage && legacySequenceMatch
        ? buildSequenceMessageAnchor(sequenceMessageEntries, Number(legacySequenceMatch[1]))
        : null;

    const rawFallbackPos = isRecord(rawAnchor.fallbackPos) ? rawAnchor.fallbackPos : null;
    const rawSequenceMessage = isRecord(rawAnchor.sequenceMessage) ? rawAnchor.sequenceMessage : null;

    return {
      type: "shape",
      shapeId: typeof rawAnchor.shapeId === "string" ? rawAnchor.shapeId : undefined,
      fallbackPos:
        rawFallbackPos &&
        typeof rawFallbackPos.x === "number" &&
        typeof rawFallbackPos.y === "number"
          ? {
              x: rawFallbackPos.x,
              y: rawFallbackPos.y,
            }
          : undefined,
      sequenceMessage:
        rawSequenceMessage &&
        typeof rawSequenceMessage.sender === "string" &&
        typeof rawSequenceMessage.receiver === "string" &&
        typeof rawSequenceMessage.operator === "string" &&
        typeof rawSequenceMessage.label === "string" &&
        typeof rawSequenceMessage.occurrence === "number"
          ? {
              sender: rawSequenceMessage.sender,
              receiver: rawSequenceMessage.receiver,
              operator: rawSequenceMessage.operator,
              label: rawSequenceMessage.label,
              occurrence: rawSequenceMessage.occurrence,
            }
          : derivedSequenceMessage ?? undefined,
    };
  }
  if (
    rawAnchor?.type === "canvas" &&
    isRecord(rawAnchor.position) &&
    typeof rawAnchor.position.x === "number" &&
    typeof rawAnchor.position.y === "number"
  ) {
    return {
      type: "canvas",
      position: { x: rawAnchor.position.x, y: rawAnchor.position.y },
    };
  }
  return { type: "canvas", position: { x: 0.5, y: 0.5 } };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }
    return NextResponse.json(diagram.comments ?? []);
  } catch {
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (IS_DEMO_MODE) {
    return NextResponse.json({ error: "Demo mode: comments are disabled" }, { status: 403 });
  }

  try {
    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }

    const body = await request.json();
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Comment content is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const comment: DiagramComment = {
      id: nanoid(),
      anchor: normalizeAnchor(body.anchor, diagram.code),
      messages: [
        {
          id: nanoid(),
          content,
          authorId: typeof body.authorId === "string" && body.authorId.trim() ? body.authorId : "anonymous",
          timestamp: now,
        },
      ],
      resolved: false,
      starred: false,
      createdAt: now,
      updatedAt: now,
    };

    const updated = { ...diagram, comments: [...(diagram.comments ?? []), comment], updatedAt: now };
    await saveDiagram(updated);
    return NextResponse.json(comment, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (IS_DEMO_MODE) {
    return NextResponse.json({ error: "Demo mode: comments are disabled" }, { status: 403 });
  }

  try {
    const diagram = await getDiagram(id);
    if (!diagram) {
      return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
    }

    const body = await request.json();
    const commentId = typeof body.commentId === "string" ? body.commentId : "";
    if (!commentId) {
      return NextResponse.json({ error: "commentId is required" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const comments = (diagram.comments ?? []).map((comment) => {
      if (comment.id !== commentId) return comment;

      const nextMessages = Array.isArray(body.message)
        ? comment.messages
        : typeof body.content === "string" && body.content.trim()
          ? [
              ...comment.messages,
              {
                id: nanoid(),
                content: body.content.trim(),
                authorId:
                  typeof body.authorId === "string" && body.authorId.trim()
                    ? body.authorId
                    : "anonymous",
                timestamp: now,
              },
            ]
          : comment.messages;

      return {
        ...comment,
        messages: nextMessages,
        resolved: typeof body.resolved === "boolean" ? body.resolved : comment.resolved,
        starred: typeof body.starred === "boolean" ? body.starred : comment.starred,
        updatedAt: now,
      };
    });

    const updated = { ...diagram, comments, updatedAt: now };
    await saveDiagram(updated);
    const comment = comments.find((entry) => entry.id === commentId);
    return NextResponse.json(comment ?? null);
  } catch {
    return NextResponse.json({ error: "Failed to update comment" }, { status: 500 });
  }
}
