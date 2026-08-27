"use client";

/**
 * Viewport-space preview and drop-indicator layers rendered OUTSIDE TransformWrapper at
 * canvasShell level, so canvas pan/zoom never distorts their coordinates. Extracted verbatim
 * from EditorCanvas. Each layer renders nothing while its drag state is inactive, preserving
 * the original DOM positions and output.
 */

/** Dashed line + snap ring shown while dragging a selected sequence message/note to another slot. */
export interface SeqDragIndicatorState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  snapX: number | null;
}

/** Live connect-preview line + snap highlight for the class/ER/state drag-to-connect drags. */
export interface ConnectPreviewState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  snap: { cx: number; cy: number; w: number; h: number } | null;
  anchor: { x: number; y: number } | null;
}

/** Drop zones + cursor guide shown while dragging a sequence message into a chronological slot. */
export interface SeqReorderDropState {
  fromIndex: number;
  left: number;
  width: number;
  slots: Array<{ slot: number; y: number; h: number }>;
  cursorY: number;
  targetSlot: number | null;
}

/**
 * Sequence drag indicator — rendered at canvasShell level (outside TransformWrapper)
 * so canvas pan/zoom never affects its coordinate system.
 * All positions are viewport-relative to canvasShellRef.
 */
export function SeqDragIndicatorLayer({ indicator }: { indicator: SeqDragIndicatorState | null }) {
  return (
    <>
      {indicator && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="seq-drag-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb" />
            </marker>
          </defs>
          <line
            x1={indicator.x1}
            y1={indicator.y1}
            x2={indicator.x2}
            y2={indicator.y2}
            stroke="#2563eb"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            shapeRendering="geometricPrecision"
            markerEnd="url(#seq-drag-arrow)"
          />
          {indicator.snapX !== null && (
            <g transform={`translate(${indicator.snapX}, ${indicator.y1})`}>
              <circle r={14} fill="#10b981" />
              <line
                x1={-7}
                y1={0}
                x2={7}
                y2={0}
                stroke="#ffffff"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
              <line
                x1={0}
                y1={-7}
                x2={0}
                y2={7}
                stroke="#ffffff"
                strokeWidth={3.5}
                strokeLinecap="round"
              />
            </g>
          )}
        </svg>
      )}
    </>
  );
}

/**
 * Class-diagram connection drag preview — dashed line from the + to the cursor, plus a ring
 * highlighting the snapped class/note. Outside TransformWrapper (viewport/shell coords).
 */
export function ClassConnectPreviewLayer({ connect }: { connect: ConnectPreviewState | null }) {
  return (
    <>
      {connect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="class-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={connect.x1}
            y1={connect.y1}
            x2={connect.x2}
            y2={connect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#class-connect-arrow)"
          />
          {connect.snap && (
            <rect
              x={connect.snap.cx - 3}
              y={connect.snap.cy - 3}
              width={connect.snap.w + 6}
              height={connect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {connect.anchor && (
            <g transform={`translate(${connect.anchor.x}, ${connect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}
    </>
  );
}

/**
 * ER-diagram drag-to-connect preview line + snap highlight (US1), rendered outside the
 * TransformWrapper at shell level so pan/zoom never distorts its coordinates.
 */
export function ErConnectPreviewLayer({ connect }: { connect: ConnectPreviewState | null }) {
  return (
    <>
      {connect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="er-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={connect.x1}
            y1={connect.y1}
            x2={connect.x2}
            y2={connect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#er-connect-arrow)"
          />
          {connect.snap && (
            <rect
              x={connect.snap.cx - 3}
              y={connect.snap.cy - 3}
              width={connect.snap.w + 6}
              height={connect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {connect.anchor && (
            <g transform={`translate(${connect.anchor.x}, ${connect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}
    </>
  );
}

/**
 * State-diagram drag-to-connect preview line + snap highlight, rendered outside the
 * TransformWrapper at shell level so pan/zoom never distorts its coordinates.
 */
export function StateConnectPreviewLayer({ connect }: { connect: ConnectPreviewState | null }) {
  return (
    <>
      {connect && (
        <svg className="absolute inset-0 pointer-events-none z-30 w-full h-full overflow-visible">
          <defs>
            <marker
              id="state-connect-arrow"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#6366f1" />
            </marker>
          </defs>
          <line
            x1={connect.x1}
            y1={connect.y1}
            x2={connect.x2}
            y2={connect.y2}
            stroke="#6366f1"
            strokeDasharray="10,8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#state-connect-arrow)"
          />
          {connect.snap && (
            <rect
              x={connect.snap.cx - 3}
              y={connect.snap.cy - 3}
              width={connect.snap.w + 6}
              height={connect.snap.h + 6}
              rx={6}
              fill="rgba(99,102,241,0.10)"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
          {connect.anchor && (
            <g transform={`translate(${connect.anchor.x}, ${connect.anchor.y})`}>
              <circle r={5} fill="#10b981" stroke="#ffffff" strokeWidth={1.5} />
            </g>
          )}
        </svg>
      )}
    </>
  );
}

/**
 * Sequence message reorder drop zones + drag ghost — rendered at canvasShell level
 * (viewport-relative, outside TransformWrapper) so pan/zoom never shifts them.
 */
export function SeqReorderDropLayer({ reorder }: { reorder: SeqReorderDropState | null }) {
  return (
    <>
      {reorder && (
        <div
          className="absolute inset-0 pointer-events-none z-30"
          data-seq-reorder-overlay
          data-seq-reorder-from={reorder.fromIndex}
          data-seq-reorder-target={reorder.targetSlot ?? "none"}
        >
          {reorder.slots.map((s) => {
            const active = reorder.targetSlot === s.slot;
            const alpha = active ? 0.38 : 0.16;
            const h = active ? Math.min(s.h + 4, s.h * 1.5 + 2) : s.h;
            return (
              <div
                key={`seq-drop-${s.slot}`}
                className="absolute rounded-md"
                data-seq-drop-slot={s.slot}
                data-seq-drop-active={active ? "true" : "false"}
                style={{
                  left: reorder.left,
                  width: reorder.width,
                  top: s.y - h / 2,
                  height: h,
                  border: active ? "2px solid #4f46e5" : "1.5px dashed #818cf8",
                  backgroundImage: `repeating-linear-gradient(45deg, rgba(99,102,241,${alpha}) 0, rgba(99,102,241,${alpha}) 6px, transparent 6px, transparent 12px)`,
                  transition: "top 60ms linear, height 60ms linear",
                }}
              />
            );
          })}
          <div
            className="absolute"
            style={{
              left: reorder.left,
              width: reorder.width,
              top: reorder.cursorY - 1.5,
              height: 3,
              background: "#4f46e5",
              opacity: 0.85,
              borderRadius: 9999,
            }}
          />
        </div>
      )}
    </>
  );
}
