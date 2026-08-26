"use client";

import { ClassConnectMenu, type ClassConnectMenuState } from "./ClassConnectMenu";
import { StateConnectMenu, type StateConnectMenuState } from "./StateConnectMenu";
import { hasEndState, hasStartState } from "@/lib/diagrams/stateDiagram";
import type { StateShapeKind } from "@/lib/diagrams/stateDiagram";

interface CanvasPopoversProps {
  currentType: string;
  code: string;
  classConnectMenu: ClassConnectMenuState | null;
  setClassConnectMenu: React.Dispatch<React.SetStateAction<ClassConnectMenuState | null>>;
  onAddClassRelationship?: (source: string, target: string, operator: string) => void;
  onCreateClassLinked?: (source: string, operator: string) => void;
  onCreateNoteForClass?: (source: string) => void;
  stateConnectMenu: StateConnectMenuState | null;
  setStateConnectMenu: React.Dispatch<React.SetStateAction<StateConnectMenuState | null>>;
  onCreateStateShapeLinked?: (source: string, kind: StateShapeKind) => void;
}

/**
 * Connection drop-point popovers rendered at canvasShell level (outside TransformWrapper)
 * so pan/zoom never shifts them. Extracted verbatim from EditorCanvas: the class-diagram
 * relationship picker / create chip and the state-diagram shape picker shown when a
 * drag-to-connect lands on empty canvas.
 */
export function CanvasPopovers({
  currentType,
  code,
  classConnectMenu,
  setClassConnectMenu,
  onAddClassRelationship,
  onCreateClassLinked,
  onCreateNoteForClass,
  stateConnectMenu,
  setStateConnectMenu,
  onCreateStateShapeLinked,
}: CanvasPopoversProps) {
  return (
    <>
      {/* Class-diagram connection drop menu (relationship picker / create chip). */}
      {currentType === "classDiagram" && classConnectMenu && (
        <ClassConnectMenu
          state={classConnectMenu}
          onPickRelationship={(operator) => {
            if (classConnectMenu.target) {
              onAddClassRelationship?.(classConnectMenu.source, classConnectMenu.target, operator);
            } else {
              onCreateClassLinked?.(classConnectMenu.source, operator);
            }
            setClassConnectMenu(null);
          }}
          onChooseNewClass={() => {
            // Create the new class linked with a default association (`-->`). The user no longer
            // picks a connection type up front — they can change it later via the edge toolbar.
            onCreateClassLinked?.(classConnectMenu.source, "-->");
            setClassConnectMenu(null);
          }}
          onChooseNewNote={() => {
            onCreateNoteForClass?.(classConnectMenu.source);
            setClassConnectMenu(null);
          }}
          onClose={() => setClassConnectMenu(null)}
        />
      )}

      {/* State-diagram connection drop menu (pick which shape to create on empty canvas). */}
      {currentType === "stateDiagram" && stateConnectMenu && (
        <StateConnectMenu
          state={stateConnectMenu}
          hasStart={hasStartState(code)}
          hasEnd={hasEndState(code)}
          onPick={(kind) => {
            onCreateStateShapeLinked?.(stateConnectMenu.source, kind);
            setStateConnectMenu(null);
          }}
          onClose={() => setStateConnectMenu(null)}
        />
      )}
    </>
  );
}
