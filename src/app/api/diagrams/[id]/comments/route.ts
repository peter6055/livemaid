import { NextResponse } from "next/server";
import { getDiagram, saveDiagram, IS_DEMO_MODE, type DiagramComment } from "@/lib/api/storage";
import { nanoid } from "nanoid";
import { buildSequenceMessageAnchor } from "@/lib/diagrams/sequenceCommentAnchor";

function normalizeAnchor(anchor: any, code: string): DiagramComment["anchor"] {
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

  if (anchor && anchor.type === "shape") {
    const legacySequenceMatch =
      typeof anchor.shapeId === "string" ? anchor.shapeId.match(/^SEQ_MSG_(\d+)$/) : null;
    const derivedSequenceMessage =
      !anchor.sequenceMessage && legacySequenceMatch
        ? buildSequenceMessageAnchor(sequenceMessageEntries, Number(legacySequenceMatch[1]))
        : null;

    return {
      type: "shape",
      shapeId: typeof anchor.shapeId === "string" ? anchor.shapeId : undefined,
      fallbackPos:
        anchor.fallbackPos &&
        typeof anchor.fallbackPos.x === "number" &&
        typeof anchor.fallbackPos.y === "number"
          ? {
              x: anchor.fallbackPos.x,
              y: anchor.fallbackPos.y,
            }
          : undefined,
      sequenceMessage:
        anchor.sequenceMessage &&
        typeof anchor.sequenceMessage.sender === "string" &&
        typeof anchor.sequenceMessage.receiver === "string" &&
        typeof anchor.sequenceMessage.operator === "string" &&
        typeof anchor.sequenceMessage.label === "string" &&
        typeof anchor.sequenceMessage.occurrence === "number"
          ? {
              sender: anchor.sequenceMessage.sender,
              receiver: anchor.sequenceMessage.receiver,
              operator: anchor.sequenceMessage.operator,
              label: anchor.sequenceMessage.label,
              occurrence: anchor.sequenceMessage.occurrence,
            }
          : derivedSequenceMessage ?? undefined,
    };
  }
  if (
    anchor &&
    anchor.type === "canvas" &&
    anchor.position &&
    typeof anchor.position.x === "number" &&
    typeof anchor.position.y === "number"
  ) {
    return {
      type: "canvas",
      position: { x: anchor.position.x, y: anchor.position.y },
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
