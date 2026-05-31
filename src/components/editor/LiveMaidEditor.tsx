"use client";

import { useEditorState } from "@/hooks/useEditorState";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { determineDiagramType, isEdgeId, parseEdgeId, updateLinkStyleAndLabel, getLinkIndex, updateLinkColor, updateMermaidCurve, updateLinkAnimation, deleteLink, rebuildLinkStyles, CONNECTOR_PATTERN } from "@/lib/diagrams/utils";
import { useState, useRef, useEffect, useCallback } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { EditorHeader } from "./EditorHeader";
import { EditorCodePanel } from "./EditorCodePanel";
import { EditorCanvas } from "./EditorCanvas";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Loader2, Undo2, Redo2, Type, Copy, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import * as htmlToImage from "html-to-image";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { DiagramRegistry } from "@/lib/diagrams/registry";
import { FONT_OPTIONS } from "@/lib/diagrams/constants";
import { updateMermaidConfigProperty, updateMermaidFontFamily } from "@/lib/diagrams/utils";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Star } from "lucide-react";
import mermaid from "mermaid";
import type { VersionHistoryEntry } from "@/lib/api/storage";

export function LiveMaidEditor({ documentId }: { documentId: string }) {
  const router = useRouter();

  const {
    doc, setDoc,
    code,
    loading,
    saving,
    svgContent,
    currentTheme,
    currentFont,
    parseError,
    renderIdRef,
    handleCodeChange
  } = useEditorState(documentId);

  const [isLocked, setIsLocked] = useState(false);
  const [isCodePanelOpen, setIsCodePanelOpen] = useState(true);
  const [navigatingState, setNavigatingState] = useState<{ isNavigating: boolean; message: string }>({ isNavigating: false, message: '' });

  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [isNewDiagramOpen, setIsNewDiagramOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [isExitConfirmOpen, setIsExitConfirmOpen] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ url: string; message: string } | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyDrafts, setHistoryDrafts] = useState<Record<string, string>>({});
  const [previewVersionId, setPreviewVersionId] = useState<string | null>(null);
  const [previewSvgContent, setPreviewSvgContent] = useState("");
  const [previewParseError, setPreviewParseError] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState('PNG');
  const [exportBg, setExportBg] = useState('transparent');
  const allowBrowserBackRef = useRef(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    selectedNodeId, setSelectedNodeId,
    selectedSvgId, setSelectedSvgId,
    selectionBox, setSelectionBox,
    textBox, setTextBox,
    editingText, setEditingText,
    isInlineEditing, setIsInlineEditing,
    connectionState, setConnectionState,
    inlineInputRef,
    handleSvgClick,
    handleMouseMove,
    handleMouseUp,
    handleEditClick,
    handleAddNodeFromSelected,
    shapePicker,
    setShapePicker
  } = useCanvasInteraction({
    code,
    svgContent,
    renderIdRef,
    containerRef,
    isLocked,
    handleCodeChange,
    determineDiagramType
  });

  const handleDeselect = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedSvgId(null);
    setSelectionBox(null);
    setTextBox(null);
    setIsInlineEditing(false);
  }, [setSelectedNodeId, setSelectedSvgId, setSelectionBox, setTextBox, setIsInlineEditing]);

  const handleResetStyle = useCallback(() => {
    if (!selectedNodeId) return;
    let newCode = code;
    
    // 1. Remove style lines
    const lines = newCode.split('\n');
    const filteredLines = lines.filter(line => {
        const isStyleLine = line.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\b`));
        return !isStyleLine;
    });
    newCode = filteredLines.join('\n');

    // 2. Remove inline HTML formatting tags from label
    const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
    const match = newCode.match(nodeRegex);
    if (match) {
        const originalLabel = match[3];
        const cleanLabel = originalLabel
            .replace(/<b[^>]*>/gi, '')
            .replace(/<\/b>/gi, '')
            .replace(/<i[^>]*>/gi, '')
            .replace(/<\/i>/gi, '')
            .replace(/<span[^>]*>/gi, '')
            .replace(/<\/span>/gi, '');
        
        const nodeRegexGlobal = new RegExp(nodeRegex.source, 'gm');
        newCode = newCode.replace(nodeRegexGlobal, `$1$2${cleanLabel}$4`);
    }

    handleCodeChange(newCode);

    const nodeId = selectedNodeId;
    setSelectedNodeId(null);
    setTimeout(() => {
        setSelectedNodeId(nodeId);
    }, 50);
  }, [code, handleCodeChange, selectedNodeId, setSelectedNodeId]);

  const handleUpdateEdgeStyle = useCallback((updates: { stroke?: string; arrowType?: string; label?: string }) => {
    if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
    const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
    if (!src || !dst) return;
    const updatedCode = updateLinkStyleAndLabel(code, src, dst, updates, occurrenceIndex);
    const healedCode = rebuildLinkStyles(code, updatedCode);
    handleCodeChange(healedCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleUpdateEdgeColor = useCallback((hexColor: string) => {
    if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
    const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
    if (!src || !dst) return;
    const linkIndex = getLinkIndex(code, src, dst, occurrenceIndex);
    const updatedCode = updateLinkColor(code, linkIndex, hexColor);
    handleCodeChange(updatedCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleUpdateEdgeCurve = useCallback((curve: string) => {
    const updatedCode = updateMermaidCurve(code, curve);
    handleCodeChange(updatedCode);
  }, [code, handleCodeChange]);

  const handleUpdateEdgeAnimation = useCallback((animate: boolean) => {
    if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
    const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
    if (!src || !dst) return;
    const updatedCode = updateLinkAnimation(code, src, dst, occurrenceIndex, animate);
    handleCodeChange(updatedCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleDeleteEdge = useCallback(() => {
    if (!selectedNodeId || !isEdgeId(selectedNodeId)) return;
    const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
    if (!src || !dst) return;
    const updatedCode = deleteLink(code, src, dst, occurrenceIndex);
    const healedCode = rebuildLinkStyles(code, updatedCode);
    handleCodeChange(healedCode);
    handleDeselect();
  }, [code, handleCodeChange, selectedNodeId, handleDeselect]);

  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any) => {
      editorRef.current = editor;
  };

  const handleThemeChange = (theme: string) => {
    const updatedCode = updateMermaidConfigProperty(code, 'theme', theme);
    handleCodeChange(updatedCode);
  };

  const defaultHistoryLabel = useCallback((version: VersionHistoryEntry, index: number) => {
    if (version.label?.trim()) return version.label.trim();
    const d = new Date(version.timestamp);
    const h = d.getHours() % 12 || 12;
    const m = String(d.getMinutes()).padStart(2, '0');
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    return `Snapshot ${index + 1} - ${h}:${m} ${ampm}`;
  }, []);

  const persistHistoryEntries = useCallback(async (updatedHistory: VersionHistoryEntry[]) => {
    if (!doc) return;

    try {
      const response = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionHistory: updatedHistory }),
      });

      if (!response.ok) {
        throw new Error("Failed to update version history");
      }

      const updatedDoc = await response.json();
      setDoc(updatedDoc);
      setHistoryDrafts(
        Object.fromEntries(
          (updatedDoc.versionHistory ?? []).map((version: VersionHistoryEntry, index: number) => [
            version.id,
            defaultHistoryLabel(version, index),
          ])
        )
      );
    } catch (error) {
      toast.error("Failed to update version history");
    }
  }, [defaultHistoryLabel, doc, documentId, setDoc]);

  const handleRollbackToVersion = useCallback((versionCode: string) => {
    setIsHistoryOpen(false);
    setPreviewVersionId(null);
    handleCodeChange(versionCode);
    toast.success('Rolled back successfully', {
      description: 'The diagram has been restored to the selected version.',
    });
  }, [handleCodeChange]);

  useEffect(() => {
    const previewVersion = (doc?.versionHistory ?? []).find((version) => version.id === previewVersionId);
    if (!isHistoryOpen || !previewVersion) {
      setPreviewSvgContent("");
      setPreviewParseError(null);
      return;
    }

    let cancelled = false;

    const renderPreview = async () => {
      try {
        setPreviewParseError(null);
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          flowchart: { htmlLabels: true },
        });
        await mermaid.parse(previewVersion.code, { suppressErrors: true });
        const { svg } = await mermaid.render(`history-preview-${Date.now()}`, previewVersion.code);
        if (!cancelled) {
          setPreviewSvgContent(svg);
        }
      } catch (error: any) {
        if (!cancelled) {
          setPreviewSvgContent("");
          setPreviewParseError(error?.message || "Failed to render preview diagram");
        }
      }
    };

    void renderPreview();

    return () => {
      cancelled = true;
    };
  }, [doc?.versionHistory, isHistoryOpen, previewVersionId]);

  const handleRenameHistoryEntry = useCallback((versionId: string, label: string) => {
    if (!doc) return;

    const trimmedLabel = label.trim();
    const updatedHistory = (doc.versionHistory ?? []).map((version) => (
      version.id === versionId
        ? { ...version, label: trimmedLabel || undefined }
        : version
    ));

    setHistoryDrafts((current) => ({
      ...current,
      [versionId]: trimmedLabel || current[versionId] || '',
    }));
    void persistHistoryEntries(updatedHistory);
  }, [doc, persistHistoryEntries]);

  const handleToggleHistoryStar = useCallback((versionId: string) => {
    if (!doc) return;

    const updatedHistory = (doc.versionHistory ?? []).map((version) => (
      version.id === versionId
        ? { ...version, starred: !version.starred }
        : version
    ));

    void persistHistoryEntries(updatedHistory);
  }, [doc, persistHistoryEntries]);

  const handleFontChange = (font: typeof FONT_OPTIONS[0]) => {
    const updatedCode = updateMermaidFontFamily(code, font.value);
    handleCodeChange(updatedCode);
  };

  const handleUpdateStyle = useCallback((property: string, value: string) => {
      if (!selectedNodeId) return;
      let newCode = code;
      const styleRegex = new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+(.*?)$`, 'm');
      const match = newCode.match(styleRegex);
      if (match) {
          let styleProps = match[1];
          const propRegex = new RegExp(`${property}:[^,]+`);
          if (propRegex.test(styleProps)) {
              styleProps = styleProps.replace(propRegex, `${property}:${value}`);
          } else {
              styleProps += `,${property}:${value}`;
          }
          newCode = newCode.replace(styleRegex, `style ${selectedNodeId} ${styleProps}`);
      } else {
          newCode += `\n    style ${selectedNodeId} ${property}:${value}`;
      }
      handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleGlobalBoldItalic = useCallback((format: 'bold' | 'italic') => {
    if (!selectedNodeId) return;

    const toggleGlobalStyle = (text: string, style: 'bold' | 'italic') => {
      let isBold = false;
      let isItalic = false;

      let temp = text.trim();
      let peeled = true;
      while (peeled) {
        peeled = false;
        if (temp.startsWith('<b>') && temp.endsWith('</b>')) {
          isBold = true;
          temp = temp.substring(3, temp.length - 4).trim();
          peeled = true;
        } else if (temp.startsWith('<i>') && temp.endsWith('</i>')) {
          isItalic = true;
          temp = temp.substring(3, temp.length - 4).trim();
          peeled = true;
        }
      }

      const cleanInner = temp
        .replace(/<\/?b>/gi, '')
        .replace(/<\/?i>/gi, '')
        .replace(/<span[^>]*>/gi, '')
        .replace(/<\/span>/gi, '');

      if (style === 'bold') {
        isBold = !isBold;
      } else if (style === 'italic') {
        isItalic = !isItalic;
      }

      let result = cleanInner;
      if (isItalic) {
        result = `<i>${result}</i>`;
      }
      if (isBold) {
        result = `<b>${result}</b>`;
      }
      return result;
    };

    if (isEdgeId(selectedNodeId)) {
      const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
      if (!src || !dst) return;
      const lines = code.split('\n');
      let currentOccurrence = 0;
      let currentLabel = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
          continue;
        }
        const linkLineRegex = new RegExp(`(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`, 'i');
        const match = line.match(linkLineRegex);
        if (match) {
          if (currentOccurrence === occurrenceIndex) {
            const middlePart = match[2];
            const quoteMatch = middlePart.match(/"([^"]*)"/);
            if (quoteMatch) {
              currentLabel = quoteMatch[1];
            } else {
              const barMatch = middlePart.match(/\|([^|]*)\|/);
              if (barMatch) {
                currentLabel = barMatch[1];
              }
            }
            break;
          }
          currentOccurrence++;
        }
      }
      const newLabel = toggleGlobalStyle(currentLabel, format);
      handleUpdateEdgeStyle({ label: newLabel });
    } else {
      const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\/|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
      const match = code.match(nodeRegex);
      let currentLabel = "";
      if (match) {
        currentLabel = match[3];
      } else {
        currentLabel = selectedNodeId;
      }
      const newLabel = toggleGlobalStyle(currentLabel, format);
      let newCode = code;
      if (match) {
        const nodeRegexGlobal = new RegExp(nodeRegex.source, 'gm');
        newCode = newCode.replace(nodeRegexGlobal, `$1$2${newLabel}$4`);
      } else {
        newCode += `\n    ${selectedNodeId}["${newLabel}"]`;
      }
      handleCodeChange(newCode);
    }
  }, [code, selectedNodeId, handleCodeChange, handleUpdateEdgeStyle]);

  const handleFormatNodeLabel = useCallback((format: string, colorValue?: string) => {
      if (!selectedNodeId) return;
      const getStyleVal = (property: string): string | null => {
        const match = code.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+(.*?)$`, 'm'));
        if (match) {
          const propMatch = match[1].match(new RegExp(`${property}:\\s*([^,;\\s]+)`));
          return propMatch ? propMatch[1] : null;
        }
        return null;
      };

      if (format === 'bold') {
          handleGlobalBoldItalic('bold');
          if (getStyleVal('font-weight')) {
              handleUpdateStyle('font-weight', 'normal');
          }
      } else if (format === 'italic') {
          handleGlobalBoldItalic('italic');
          if (getStyleVal('font-style')) {
              handleUpdateStyle('font-style', 'normal');
          }
      } else if (format === 'color' && colorValue) {
          handleUpdateStyle('color', colorValue);
      }
  }, [code, selectedNodeId, selectedSvgId, handleUpdateStyle, handleGlobalBoldItalic]);

  const handleFormatText = (format: string, colorValue?: string) => {
    console.log('[handleFormatText] format:', format, 'colorValue:', colorValue);
    if (!inlineInputRef.current) {
        console.log('[handleFormatText] inlineInputRef.current is null/undefined');
        return;
    }
    
    let start = inlineInputRef.current.selectionStart;
    let end = inlineInputRef.current.selectionEnd;
    
    if (start === end && typeof (inlineInputRef.current as any)._lastSelectionStart === 'number') {
        const lastStart = (inlineInputRef.current as any)._lastSelectionStart;
        const lastEnd = (inlineInputRef.current as any)._lastSelectionEnd;
        if (lastStart !== lastEnd) {
            start = lastStart;
            end = lastEnd;
        }
    }
    
    let selectedText = editingText.substring(start, end);
    console.log('[handleFormatText] start:', start, 'end:', end, 'selectedText:', selectedText, 'editingText:', editingText);
    
    const isSelectionEmpty = !selectedText;
    if (isSelectionEmpty) {
        start = 0;
        end = editingText.length;
        selectedText = editingText;
    }
    
    let before = '';
    let after = '';
    
    if (format === 'bold') {
        before = '<b>';
        after = '</b>';
    } else if (format === 'italic') {
        before = '<i>';
        after = '</i>';
    } else if (format === 'color' && colorValue) {
        before = `<span style='color:${colorValue}'>`;
        after = '</span>';
    }
    
    const newText = editingText.substring(0, start) + before + selectedText + after + editingText.substring(end);
    console.log('[handleFormatText] setting editingText to:', newText);
    setEditingText(newText);
    
    setTimeout(() => {
        if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.setSelectionRange(start, start + before.length + selectedText.length + after.length);
        }
    }, 10);
  };

  const handleEditSubmit = () => {
    if (!selectedNodeId || !isInlineEditing) {
        setIsInlineEditing(false);
        return;
    }
    
    let newCode = code;
    
    const isMessageLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%%')) return false;
      const keywords = ['sequenceDiagram', 'Note', 'note', 'rect', 'alt', 'opt', 'loop', 'par', 'critical', 'option', 'else', 'end', 'participant', 'actor', 'autonumber', 'activate', 'deactivate', 'box', 'links', 'link', 'properties', 'details'];
      if (keywords.some(kw => trimmed.startsWith(kw) || trimmed.startsWith(kw + ' '))) return false;
      return trimmed.includes(':');
    };

    const isNoteLine = (line: string) => {
      const trimmed = line.trim();
      return trimmed.startsWith('Note ') || trimmed.startsWith('note ');
    };

    const getCodeLineMappings = (lines: string[]) => {
      let msgCount = 0;
      let noteCount = 0;
      return lines.map((line, lineIndex) => {
        if (isMessageLine(line)) {
          return { type: 'msg', index: msgCount++, lineIndex };
        } else if (isNoteLine(line)) {
          return { type: 'note', index: noteCount++, lineIndex };
        }
        return null;
      }).filter(m => m !== null) as { type: string; index: number; lineIndex: number }[];
    };

    if (selectedNodeId.startsWith('SEQ_ACTOR_')) {
        const oldText = selectedNodeId.replace('SEQ_ACTOR_', '');
        const newText = editingText.replace(/\n/g, '<br/>');
        
        let found = false;
        const lines = code.split('\n');
        newCode = lines.map(line => {
            const trimmed = line.trim();
            const declMatch = trimmed.match(/^(participant|actor)\s+(\S+)(?:\s+as\s+(.+))?$/);
            if (declMatch) {
                const type = declMatch[1];
                const id = declMatch[2];
                const alias = declMatch[3];
                
                if (alias && alias.trim() === oldText.trim()) {
                    found = true;
                    return line.replace(`as ${alias}`, `as ${newText}`);
                }
                if (!alias && id === oldText) {
                    found = true;
                    return line.replace(id, `${id} as ${newText}`);
                }
            }
            return line;
        }).join('\n');
        
        if (!found) {
            const lines = code.split('\n');
            const headerIdx = lines.findIndex(l => l.trim().startsWith('sequenceDiagram'));
            const declLine = `    participant ${oldText} as ${newText}`;
            if (headerIdx !== -1) {
                lines.splice(headerIdx + 1, 0, declLine);
            } else {
                lines.unshift('sequenceDiagram', declLine);
            }
            newCode = lines.join('\n');
        }
    } else if (selectedNodeId.startsWith('SEQ_MSG_')) {
        const parts = selectedNodeId.split('_');
        const targetIndex = parseInt(parts[2], 10);
        const newText = editingText.replace(/\n/g, '<br/>');
        const lines = code.split('\n');
        
        const mappings = getCodeLineMappings(lines);
        const targetMapping = mappings.find(m => m.type === 'msg' && m.index === targetIndex);
        if (targetMapping) {
            const lineIdx = targetMapping.lineIndex;
            const line = lines[lineIdx];
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                lines[lineIdx] = line.substring(0, colonIdx + 1) + ' ' + newText;
                newCode = lines.join('\n');
            }
        }
    } else if (selectedNodeId.startsWith('SEQ_NOTE_')) {
        const parts = selectedNodeId.split('_');
        const targetIndex = parseInt(parts[2], 10);
        const newText = editingText.replace(/\n/g, '<br/>');
        const lines = code.split('\n');
        
        const mappings = getCodeLineMappings(lines);
        const targetMapping = mappings.find(m => m.type === 'note' && m.index === targetIndex);
        if (targetMapping) {
            const lineIdx = targetMapping.lineIndex;
            const line = lines[lineIdx];
            const colonIdx = line.indexOf(':');
            if (colonIdx !== -1) {
                lines[lineIdx] = line.substring(0, colonIdx + 1) + ' ' + newText;
                newCode = lines.join('\n');
            }
        }
    } else if (selectedNodeId.startsWith('SEQ_')) {
        const oldText = selectedNodeId.replace('SEQ_', '');
        const newText = editingText.replace(/\n/g, '<br/>');
        newCode = newCode.split('\n').map(line => {
             if (line.includes(oldText)) {
                 return line.replace(oldText, newText);
             }
             return line;
        }).join('\n');
    } else if (isEdgeId(selectedNodeId)) {
        const { src, dst, occurrenceIndex } = parseEdgeId(selectedNodeId);
        if (src && dst) {
            newCode = updateLinkStyleAndLabel(newCode, src, dst, { label: editingText }, occurrenceIndex);
        }
    } else {
        const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
        if (nodeRegex.test(newCode)) {
            const nodeRegexGlobal = new RegExp(nodeRegex.source, 'gm');
            newCode = newCode.replace(nodeRegexGlobal, `$1$2${editingText}$4`);
        } else {
            const standaloneRegex = new RegExp(`(^|\\n)(\\s*)${selectedNodeId}(\\s*)($|\\r?\\n)`);
            if (standaloneRegex.test(newCode)) {
                newCode = newCode.replace(standaloneRegex, `$1$2${selectedNodeId}["${editingText}"]$4`);
            } else {
                const lines = newCode.split('\n');
                let insertIndex = -1;
                for (let i = 0; i < lines.length; i++) {
                    const trimmed = lines[i].trim();
                    if (
                        trimmed.startsWith('style ') || 
                        trimmed.startsWith('linkStyle ') || 
                        trimmed.startsWith('classDef ') || 
                        trimmed.startsWith('class ')
                    ) {
                        insertIndex = i;
                        break;
                    }
                }
                
                const newDeclaration = `    ${selectedNodeId}["${editingText}"]`;
                if (insertIndex !== -1) {
                    lines.splice(insertIndex, 0, newDeclaration);
                    newCode = lines.join('\n');
                } else {
                    newCode += `\n${newDeclaration}`;
                }
            }
        }
    }
    
    handleCodeChange(newCode);
    setIsInlineEditing(false);
  };

  const handleChangeShape = useCallback((shape: {b?: [string, string] | null, expanded?: string, isText?: boolean}) => {
      if (!selectedNodeId) return;
      let newCode = code;
      
      const standaloneShapeRegex = new RegExp(`\\n\\s*${selectedNodeId}\\@\\{\\s*shape:[^}]+\\}`, 'g');
      newCode = newCode.replace(standaloneShapeRegex, '');
      const shapeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*)(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?([\\s\\S]*?)["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\})`, 'gm');
      
      let replaced = false;
      newCode = newCode.replace(shapeRegex, (match, p1, p2, p3) => {
          replaced = true;
          if (shape.isText) {
              return `${p1}${p2}["${p3}"]\n    ${selectedNodeId}@{ shape: text }`;
          } else if (shape.expanded) {
              return `${p1}${p2}@{ shape: ${shape.expanded}, label: "${p3}" }`;
          } else if (shape.b) {
              return `${p1}${p2}${shape.b[0]}"${p3}"${shape.b[1]}`;
          }
          return match;
      });
      
      if (!replaced) {
          if (shape.isText) {
              newCode += `\n    ${selectedNodeId}["${selectedNodeId}"]\n    ${selectedNodeId}@{ shape: text }`;
          } else if (shape.expanded) {
              newCode += `\n    ${selectedNodeId}@{ shape: ${shape.expanded}, label: "${selectedNodeId}" }`;
          } else if (shape.b) {
              newCode += `\n    ${selectedNodeId}${shape.b[0]}"${selectedNodeId}"${shape.b[1]}`;
          }
      }
      
      handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleDuplicateNode = useCallback(() => {
      if (!selectedNodeId) return;
      let newCode = code;
      
      let prefix = 'n';
      const prefixMatch = selectedNodeId.match(/^([a-zA-Z]+)/);
      if (prefixMatch) {
          prefix = prefixMatch[1];
      }
      
      let i = 1;
      while (new RegExp(`(^|[^a-zA-Z0-9_])${prefix}${i}([^a-zA-Z0-9_]|$)`, 'm').test(newCode)) {
          i++;
      }
      const newNodeId = `${prefix}${i}`;
      
      const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${selectedNodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
      const match = newCode.match(nodeRegex);
      if (match) {
          newCode += `\n    ${match[2].replace(selectedNodeId, newNodeId)}${match[3]}${match[4]}`;
      } else {
          newCode += `\n    ${newNodeId}["Copy of Node"]`;
      }
      
      const lines = newCode.split('\n');
      const propertiesToDuplicate: string[] = [];
      lines.forEach(line => {
          if (line.match(new RegExp(`^\\s*style\\s+${selectedNodeId}\\s+`))) {
              propertiesToDuplicate.push(line.replace(new RegExp(`style\\s+${selectedNodeId}`), `style ${newNodeId}`));
          }
          if (line.match(new RegExp(`^\\s*click\\s+${selectedNodeId}\\s+`))) {
              propertiesToDuplicate.push(line.replace(new RegExp(`click\\s+${selectedNodeId}`), `click ${newNodeId}`));
          }
          if (line.match(new RegExp(`^\\s*${selectedNodeId}\\@\\{\\s*shape:`))) {
              propertiesToDuplicate.push(line.replace(new RegExp(`^(\\s*)${selectedNodeId}(\\@\\{.*\\})`), `$1${newNodeId}$2`));
          }
      });
      if (propertiesToDuplicate.length > 0) {
          newCode += '\n' + propertiesToDuplicate.join('\n');
      }
      
      const toRegex = new RegExp(`([a-zA-Z0-9_]+)\\s*(-->|==>|-\\.->)\\s*${selectedNodeId}([^a-zA-Z0-9_]|$)`, 'g');
      let edgesToAppend = [];
      let matchTo;
      while ((matchTo = toRegex.exec(code)) !== null) {
          edgesToAppend.push(`\n    ${matchTo[1]} ${matchTo[2]} ${newNodeId}`);
      }
      
      const fromRegex = new RegExp(`(^|[^a-zA-Z0-9_])${selectedNodeId}\\s*(-->|==>|-\\.->)\\s*([a-zA-Z0-9_]+)`, 'g');
      let matchFrom;
      while ((matchFrom = fromRegex.exec(code)) !== null) {
          edgesToAppend.push(`\n    ${newNodeId} ${matchFrom[2]} ${matchFrom[3]}`);
      }
      
      newCode += edgesToAppend.join('');
      handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleDeleteNode = useCallback(() => {
      if (!selectedNodeId) return;
      let newCode = code;
      
      const toRegex = new RegExp(`([a-zA-Z0-9_]+)\\s*(-->|==>|-\\.->)\\s*${selectedNodeId}([^a-zA-Z0-9_]|$)`, 'g');
      const fromRegex = new RegExp(`(^|[^a-zA-Z0-9_])${selectedNodeId}\\s*(-->|==>|-\\.->)\\s*([a-zA-Z0-9_]+)`, 'g');
      
      let parents = [];
      let matchTo;
      while ((matchTo = toRegex.exec(code)) !== null) {
          parents.push({ id: matchTo[1], arrow: matchTo[2] });
      }
      
      let children = [];
      let matchFrom;
      while ((matchFrom = fromRegex.exec(code)) !== null) {
          children.push({ id: matchFrom[3], arrow: matchFrom[2] });
      }
      
      let nodesToPreserve = new Set([...parents.map(p => p.id), ...children.map(c => c.id)]);
      let preservedDefinitions = [];
      for (const nodeId of nodesToPreserve) {
          const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${nodeId}\\s*(?:\\@\\{\\s*shape:[^,]+,\\s*label:\\s*|\\(\\(\\(|\\[\\/|\\[\\\\|\\[\\(|\\[\\[|\\(\\[|\\(\\(|\\{\\{|\\[|\\(|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\)\\)\\)|\\)\\]|\\)\\)|\\}\\}|\\/\\]|\\\\\\]|\\]\\]|\\s*\\}|\\]|\\)|\\}))`, 'm');
          const match = newCode.match(nodeRegex);
          if (match) {
              preservedDefinitions.push(`\n    ${match[2]}${match[3]}${match[4]}`);
          } else {
              preservedDefinitions.push(`\n    ${nodeId}`);
          }
      }
      
      const lines = newCode.split('\n');
      const filteredLines = lines.filter(line => {
          const mentionRegex = new RegExp(`(^|[^a-zA-Z0-9_])${selectedNodeId}([^a-zA-Z0-9_]|$)`);
          return !mentionRegex.test(line);
      });
      
      newCode = filteredLines.join('\n') + preservedDefinitions.join('');
      
      handleCodeChange(newCode);
      setSelectionBox(null);
      setSelectedNodeId(null);
  }, [code, handleCodeChange, selectedNodeId, setSelectionBox, setSelectedNodeId]);

  const performNavigation = useCallback((url: string, message: string) => {
    setNavigatingState({ isNavigating: true, message });
    setTimeout(() => {
      router.push(url);
    }, 400);
  }, [router]);

  const handleNavigate = useCallback((url: string, message: string) => {
    setPendingNavigation({ url, message });
    setIsExitConfirmOpen(true);
  }, []);

  const handleConfirmExitNavigation = useCallback(() => {
    if (!pendingNavigation) return;
    const next = pendingNavigation;
    setPendingNavigation(null);
    setIsExitConfirmOpen(false);
    if (next.url === '__browser_back__') {
      allowBrowserBackRef.current = true;
      window.history.back();
      return;
    }
    performNavigation(next.url, next.message);
  }, [pendingNavigation, performNavigation]);

  const handleCancelExitNavigation = useCallback(() => {
    setPendingNavigation(null);
    setIsExitConfirmOpen(false);
  }, []);

  const handleDuplicate = async () => {
    if (!doc) return;
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${doc.name} (Copy)`,
          code: code,
        }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        toast.success("Diagram duplicated");
        handleNavigate(`/editor/${newDiagram.id}`, 'Loading Workspace...');
      } else {
        toast.error("Failed to duplicate");
      }
    } catch (e) {
      toast.error("Failed to duplicate");
    }
  };

  const handleCreateSubmit = async () => {
    if (!createName.trim()) return;
    try {
      const res = await fetch("/api/diagrams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          code: `graph TD\n    A[Start] --> B[End]`,
        }),
      });
      if (res.ok) {
        const newDiagram = await res.json();
        setIsNewDiagramOpen(false);
        handleNavigate(`/editor/${newDiagram.id}`, 'Loading Workspace...');
      } else {
        toast.error("Failed to create diagram");
      }
    } catch (e) {
      toast.error("Failed to create diagram");
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameName.trim()) return;
    try {
      const res = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: renameName.trim() }),
      });
      if (res.ok) {
        setDoc(prev => prev ? { ...prev, name: renameName.trim() } : prev);
        setIsRenameOpen(false);
        toast.success("Diagram renamed");
      } else {
        toast.error("Failed to rename");
      }
    } catch (e) {
      toast.error("Failed to rename");
    }
  };
  
  const handleExport = async () => {
    let finalSvgContent = svgContent;
    
    // Inject background if needed for SVG/PNG
    if (exportBg !== 'transparent') {
      const bgRect = `<rect width="100%" height="100%" fill="${exportBg}" />`;
      finalSvgContent = finalSvgContent.replace(/(<svg[^>]*>)/, `$1${bgRect}`);
    }

    if (exportFormat === 'SVG') {
      const blob = new Blob([finalSvgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.name || 'diagram'}.svg`;
      a.click();
      URL.revokeObjectURL(url);
    } else if (exportFormat === 'PNG') {
      try {
        const svgContainer = containerRef.current?.querySelector('svg');
        if (!svgContainer) throw new Error("No SVG found");
        
        let w = 800; let h = 600;
        const viewBoxMatch = svgContainer.outerHTML.match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/);
        if (viewBoxMatch) { w = parseFloat(viewBoxMatch[1]); h = parseFloat(viewBoxMatch[2]); }

        // Use html-to-image to properly render foreignObjects and bypass canvas taint
        const dataUrl = await htmlToImage.toPng(svgContainer as unknown as HTMLElement, {
          backgroundColor: exportBg === 'transparent' ? undefined : exportBg,
          pixelRatio: 5,
          skipFonts: true,
          fontEmbedCSS: '',
          width: w,
          height: h,
          style: {
             transform: 'none',
             transformOrigin: 'top left',
             width: `${w}px`,
             height: `${h}px`
          }
        });
        
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `${doc?.name || 'diagram'}.png`;
        a.click();
      } catch (err) {
        console.error("PNG export error", err);
        toast.error("Failed to export PNG");
      }
    } else if (exportFormat === 'MMD') {
      const blob = new Blob([code], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${doc?.name || 'diagram'}.mmd`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      toast.info(`${exportFormat} export coming soon!`);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLocked) return;
      if (isInlineEditing) return;
      if (!selectedNodeId) return;

      // Ignore keydown if the user is typing in any text input, textarea, or Monaco editor
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (
        activeEl.tagName === 'INPUT' ||
        activeEl.tagName === 'TEXTAREA' ||
        activeEl.getAttribute('contenteditable') === 'true' ||
        activeEl.closest('.monaco-editor')
      );
      if (isInputActive) return;

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        if (isEdgeId(selectedNodeId)) {
          handleDeleteEdge();
        } else {
          handleDeleteNode();
        }
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleGlobalBoldItalic('bold');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        handleGlobalBoldItalic('italic');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLocked, isInlineEditing, selectedNodeId, handleDeleteEdge, handleDeleteNode, handleGlobalBoldItalic]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const guardState = { __editorGuard: true };
    window.history.pushState(guardState, '', window.location.href);

    const handlePopState = () => {
      if (allowBrowserBackRef.current) {
        allowBrowserBackRef.current = false;
        return;
      }

      setPendingNavigation({
        url: '__browser_back__',
        message: 'Leaving editor...'
      });
      setIsExitConfirmOpen(true);
      window.history.pushState(guardState, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-zinc-500 flex-col gap-4 transition-all duration-300">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
        <p className="text-lg font-medium text-foreground animate-pulse">Loading Workspace...</p>
      </div>
    );
  }

  const currentType = determineDiagramType(code);
  const sortedHistory = [...(doc?.versionHistory ?? [])]
    .sort((a, b) => Number(Boolean(b.starred)) - Number(Boolean(a.starred)) || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const selectedPreviewVersion = previewVersionId
    ? sortedHistory.find((version) => version.id === previewVersionId) ?? null
    : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {navigatingState.isNavigating && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm transition-all duration-300">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
            <p className="text-lg font-medium text-foreground animate-pulse">{navigatingState.message}</p>
          </div>
        </div>
      )}

      <EditorHeader 
        doc={doc}
        saving={saving}
        onNavigate={handleNavigate}
        onDuplicate={handleDuplicate}
        onNewDiagram={() => { setCreateName("New Diagram"); setIsNewDiagramOpen(true); }}
        onRename={() => { setRenameName(doc?.name || ""); setIsRenameOpen(true); }}
        onExport={() => setIsExportOpen(true)}
        onVersionHistory={() => setIsHistoryOpen(true)}
      />

      {/* Version History Sidebar */}
      {isHistoryOpen && (
        <div className="fixed inset-0 z-40" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/35 dark:bg-black/70 backdrop-blur-[2px]"
            onClick={() => {
              setIsHistoryOpen(false);
              setPreviewVersionId(null);
            }}
          />

          <div className="relative z-10 flex h-full w-full">
            <div className="min-w-0 flex-1 p-6 pr-6">
              <div className="relative h-full rounded-xl border border-border bg-background/95 dark:bg-zinc-800/90 shadow-2xl">
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3 dark:bg-zinc-800/95">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Snapshot Diagram Preview</p>
                      <p className="text-xs text-muted-foreground">Pan, zoom, and inspect safely before applying rollback.</p>
                    </div>
                    <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground">
                      {selectedPreviewVersion ? defaultHistoryLabel(selectedPreviewVersion, 0) : 'No snapshot selected'}
                    </span>
                  </div>

                  <div className="relative min-h-0 flex-1 overflow-hidden bg-background/30 dark:bg-zinc-700/35">
                    {selectedPreviewVersion ? (
                      previewParseError ? (
                        <div className="flex h-full items-center justify-center p-6">
                          <div className="max-w-lg rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
                            Preview render failed: {previewParseError}
                          </div>
                        </div>
                      ) : previewSvgContent ? (
                        <TransformWrapper
                          initialScale={1.35}
                          minScale={0.5}
                          maxScale={50}
                          wheel={{ wheelDisabled: true, step: 0.05 }}
                          panning={{ velocityDisabled: false }}
                          trackPadPanning={{ disabled: false }}
                          doubleClick={{ disabled: true }}
                          limitToBounds={false}
                        >
                          {({ zoomIn, zoomOut, resetTransform }) => (
                            <>
                              <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 rounded-lg border border-border bg-background p-1 shadow-sm">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomIn()}>
                                  <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg>
                                </Button>
                                <div className="h-px bg-border" />
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => resetTransform()}>
                                  <span className="text-[10px] font-bold">1:1</span>
                                </Button>
                                <div className="h-px bg-border" />
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => zoomOut()}>
                                  <svg viewBox="0 0 24 24" className="h-4 w-4"><path fill="currentColor" d="M19 13H5V11H19V13Z"/></svg>
                                </Button>
                              </div>

                              <TransformComponent
                                wrapperStyle={{ width: '100%', height: '100%' }}
                                contentStyle={{ width: '100%', height: '100%' }}
                              >
                                <div className="flex h-full w-full cursor-grab items-center justify-center bg-white active:cursor-grabbing">
                                  <div className="select-none" dangerouslySetInnerHTML={{ __html: previewSvgContent }} />
                                </div>
                              </TransformComponent>
                            </>
                          )}
                        </TransformWrapper>
                      ) : (
                        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                          Rendering selected snapshot...
                        </div>
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center p-8">
                        <div className="max-w-md text-center">
                          <p className="text-sm font-medium text-foreground">Select a snapshot to preview</p>
                          <p className="mt-1 text-sm text-muted-foreground">Use the Preview button in the right panel to render that version on this read-only canvas.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative h-full w-[26rem] border-l border-border bg-background shadow-2xl">
              <div className="flex h-full flex-col">
                <div className="shrink-0 border-b border-border px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base font-semibold text-foreground">Version History</h2>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Preview first, then apply rollback.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsHistoryOpen(false);
                        setPreviewVersionId(null);
                      }}
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Close version history"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                  <div className="rounded-lg border border-border bg-muted/40 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Current saved version</p>
                        <p className="text-xs text-muted-foreground">
                          {doc?.updatedAt ? format(new Date(doc.updatedAt), 'MMM d, yyyy h:mm a') : 'Unknown save time'}
                        </p>
                      </div>
                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {doc?.versionHistory?.length ?? 0} snapshot{(doc?.versionHistory?.length ?? 0) === 1 ? '' : 's'}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {sortedHistory.length > 0 ? (
                      sortedHistory.map((version, index) => (
                        <div key={version.id} className={`rounded-lg border bg-background shadow-sm transition-colors ${previewVersionId === version.id ? 'border-indigo-500 ring-1 ring-indigo-500/30' : 'border-border'}`}>
                          <div className="space-y-3 p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleHistoryStar(version.id)}
                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    aria-label={version.starred ? 'Unstar history entry' : 'Star history entry'}
                                    title={version.starred ? 'Unstar' : 'Star'}
                                  >
                                    <Star className={`h-3.5 w-3.5 ${version.starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                                  </button>
                                  <Input
                                    value={historyDrafts[version.id] ?? defaultHistoryLabel(version, index)}
                                    onChange={(event) => setHistoryDrafts((current) => ({ ...current, [version.id]: event.target.value }))}
                                    onBlur={(event) => handleRenameHistoryEntry(version.id, event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                                    className="h-7 flex-1 bg-background text-xs"
                                    aria-label="Rename history entry"
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(version.timestamp), 'MMM d, yyyy h:mm a')}
                                </p>
                              </div>
                            </div>

                            <pre className="max-h-12 overflow-hidden whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                              {version.code.split('\n').find((line) => line.trim())?.trim() || 'Empty version'}
                            </pre>

                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setPreviewVersionId(previewVersionId === version.id ? null : version.id)}
                                className="h-7 px-2 text-xs text-muted-foreground"
                              >
                                {previewVersionId === version.id ? 'Hide Preview' : 'Preview'}
                              </Button>
                              <Button
                                variant={previewVersionId === version.id ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => handleRollbackToVersion(version.code)}
                                className="h-7 px-2 text-xs"
                              >
                                {previewVersionId === version.id ? 'Apply Rollback' : 'Rollback'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
                        <p className="text-sm font-medium text-foreground">No saved versions yet</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          The first snapshot is created after you make and save a code change.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={isExitConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCancelExitNavigation();
          } else {
            setIsExitConfirmOpen(true);
          }
        }}
      >
        <DialogContent className="max-w-md bg-background border-border text-foreground">
          <DialogHeader>
            <DialogTitle>Leave this editor?</DialogTitle>
            <p className="text-sm text-muted-foreground">
              You are about to exit the current diagram editor. Continue?
            </p>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelExitNavigation}>Stay</Button>
            <Button onClick={handleConfirmExitNavigation}>Leave Editor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ResizablePanelGroup orientation="horizontal" className="flex-grow">
        {isCodePanelOpen && (
          <>
            <ResizablePanel defaultSize={30} minSize={20} className="bg-background flex flex-col border-r border-border">
              <EditorCodePanel 
                code={code}
                handleCodeChange={handleCodeChange}
                handleEditorDidMount={handleEditorDidMount}
                parseError={parseError}
              />
            </ResizablePanel>
            <ResizableHandle className="w-[1px] bg-slate-200 hover:bg-black transition-colors cursor-col-resize" />
          </>
        )}

        <ResizablePanel defaultSize={isCodePanelOpen ? 70 : 100} className="bg-white relative overflow-hidden text-zinc-900">
          <div className="absolute top-4 left-4 z-10 flex gap-3 pointer-events-auto">
            <div className="flex items-center gap-2 rounded-xl bg-background p-2 border border-border shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center"
                onClick={() => setIsCodePanelOpen(!isCodePanelOpen)}
                title={isCodePanelOpen ? "Collapse code section" : "Expand code section"}
              >
                {isCodePanelOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <PanelLeftOpen className="w-4 h-4" />
                )}
              </Button>
              <div className="h-5 w-px bg-border" />

              <Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => editorRef.current?.trigger('keyboard', 'undo', null)} title="Undo">
                <Undo2 className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground" onClick={() => editorRef.current?.trigger('keyboard', 'redo', null)} title="Redo">
                <Redo2 className="w-4 h-4" />
              </Button>
              <div className="h-5 w-px bg-border" />
              
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center">
                    <div className={`w-5 h-5 rounded-full border ${currentTheme === 'dark' ? 'bg-zinc-800 border-zinc-900' : currentTheme === 'forest' ? 'bg-green-400 border-green-500' : currentTheme === 'neutral' ? 'bg-slate-200 border-slate-300' : currentTheme === 'base' ? 'bg-orange-100 border-orange-200' : 'bg-[#4f197b] border-[#4f197b]'}`} />
                  </Button>
                } />
                <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-2" sideOffset={10} align="start">
                    <p className="text-xs font-medium text-slate-500 px-2 pt-2">Diagram theme</p>
                    <div className="flex flex-col">
                      {['default', 'forest', 'dark', 'neutral', 'base', 'mc', 'redux'].map((t) => (
                         <DropdownMenuItem 
                           key={t}
                           onClick={() => handleThemeChange(t)}
                           className="flex items-center gap-3 cursor-pointer"
                         >
                           <div className={`w-4 h-4 rounded border ${t === 'dark' ? 'bg-zinc-800 border-zinc-900' : t === 'forest' ? 'bg-green-200 border-green-300' : t === 'neutral' ? 'bg-slate-200 border-slate-300' : t === 'base' ? 'bg-orange-100 border-orange-200' : t === 'mc' ? 'bg-cyan-200 border-cyan-300' : t === 'redux' ? 'bg-[#4f197b] border-[#4f197b]' : 'bg-pink-100 border-pink-200'} ${currentTheme === t ? 'ring-2 ring-indigo-500' : ''}`} />
                           <span className="capitalize">{t}</span>
                         </DropdownMenuItem>
                      ))}
                    </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-foreground hover:bg-accent hover:text-accent-foreground flex items-center justify-center">
                    <Type className="w-4 h-4"/>
                  </Button>
                } />
                <DropdownMenuContent className="w-48 p-2 bg-background border-border rounded-xl flex flex-col gap-2" sideOffset={10} align="start">
                    <p className="text-xs font-medium text-slate-500 px-2 pt-2">Font Family</p>
                    <div className="flex flex-col">
                      {FONT_OPTIONS.map((f) => (
                         <DropdownMenuItem 
                           key={f.label}
                           onClick={() => handleFontChange(f)}
                           className="flex items-center gap-3 cursor-pointer"
                         >
                           <span className={currentFont === f.label ? 'font-bold text-indigo-500' : ''}>{f.label}</span>
                         </DropdownMenuItem>
                      ))}
                    </div>
                </DropdownMenuContent>
              </DropdownMenu>
              
              {currentType === 'sequence' && (
                <>
                  <div className="h-5 w-px bg-border mx-1" />
                  <div className="flex items-center gap-2 px-2 h-8 select-none">
                    <span className="text-xs font-medium text-foreground">Autonumber</span>
                    <button
                      onClick={() => {
                        if (code.match(/autonumber/i)) {
                          handleCodeChange(code.replace(/\r?\n\s*autonumber/gi, ''));
                        } else {
                          handleCodeChange(code.replace(/(sequenceDiagram)/i, '$1\n    autonumber'));
                        }
                      }}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                        code.match(/autonumber/i) ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                      }`}
                      aria-label="Toggle Autonumber"
                    >
                      <span
                        className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
                          code.match(/autonumber/i) ? "translate-x-[18px]" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </>
              )}

              <div className="h-5 w-px bg-border" />
              
              {DiagramRegistry[currentType] && DiagramRegistry[currentType].ToolbarComponent && (() => {
                  const ToolbarComp = DiagramRegistry[currentType].ToolbarComponent;
                  return ToolbarComp ? (
                    <ToolbarComp 
                      code={code} 
                      setCode={handleCodeChange} 
                      editorRef={editorRef} 
                      selectedNodeId={selectedNodeId} 
                    />
                  ) : null;
              })()}
            </div>
          </div>

          <EditorCanvas
          code={code}
          parseError={parseError}
          svgContent={svgContent}
          isLocked={isLocked}
          setIsLocked={setIsLocked}
          containerRef={containerRef}
          handleSvgClick={handleSvgClick}
          handleMouseMove={handleMouseMove}
          handleMouseUp={handleMouseUp}
          handleEditClick={handleEditClick}
          selectionBox={selectionBox}
          connectionState={connectionState}
          setConnectionState={setConnectionState}
          isInlineEditing={isInlineEditing}
          selectedSvgId={selectedSvgId}
          selectedNodeId={selectedNodeId}
          currentType={currentType}
          handleUpdateStyle={handleUpdateStyle}
          handleFormatNodeLabel={handleFormatNodeLabel}
          handleChangeShape={handleChangeShape}
          handleDuplicateNode={handleDuplicateNode}
          handleDeleteNode={handleDeleteNode}
          setIsInlineEditing={setIsInlineEditing}
          textBox={textBox}
          theme={currentTheme}
          editingText={editingText}
          setEditingText={setEditingText}
          handleEditSubmit={handleEditSubmit}
          inlineInputRef={inlineInputRef}
          handleAddNodeFromSelected={handleAddNodeFromSelected}
          onDeselect={handleDeselect}
          onResetStyle={handleResetStyle}
          onUpdateEdgeStyle={handleUpdateEdgeStyle}
          onUpdateEdgeColor={handleUpdateEdgeColor}
          onUpdateEdgeCurve={handleUpdateEdgeCurve}
          onUpdateEdgeAnimation={handleUpdateEdgeAnimation}
          onDeleteEdge={handleDeleteEdge}
          shapePicker={shapePicker}
          setShapePicker={setShapePicker}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Create Dialog */}
      <Dialog open={isNewDiagramOpen} onOpenChange={setIsNewDiagramOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={createName} 
              onChange={(e) => setCreateName(e.target.value)} 
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreateSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewDiagramOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateSubmit} className="bg-black text-white hover:bg-zinc-800">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Diagram</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={renameName} 
              onChange={(e) => setRenameName(e.target.value)} 
              placeholder="Diagram name"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRenameSubmit} className="bg-black text-white hover:bg-zinc-800">Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
        <DialogContent className="sm:max-w-[1200px] w-[90vw] max-w-[1200px]">
          <DialogHeader>
            <DialogTitle>Export diagram</DialogTitle>
          </DialogHeader>
          <div className="flex gap-6 py-4">
             {/* Left Column (Options) */}
             <div className="w-1/3 flex flex-col gap-4">
                <div>
                   <p className="text-sm font-semibold mb-2">Export format</p>
                   <div className="flex flex-col gap-2">
                     {[
                       { id: 'PNG', label: 'PNG', desc: 'High quality raster image' },
                       { id: 'SVG', label: 'SVG', desc: 'Scalable vector graphics' },
                       { id: 'MMD', label: 'MMD', desc: 'Mermaid syntax code' },
                     ].map(fmt => (
                        <div 
                          key={fmt.id}
                          onClick={() => {
                            setExportFormat(fmt.id);
                            if (fmt.id !== 'PNG' && exportBg === 'transparent') setExportBg('white');
                          }}
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${exportFormat === fmt.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-border hover:border-foreground/20'}`}
                        >
                           <div className="flex items-center gap-2 mb-1">
                             <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportFormat === fmt.id ? 'border-indigo-500' : 'border-border'}`}>
                               {exportFormat === fmt.id && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                             </div>
                             <span className="font-semibold text-foreground">{fmt.label}</span>
                           </div>
                           <p className="text-xs text-muted-foreground ml-6">{fmt.desc}</p>
                        </div>
                     ))}
                   </div>
                </div>
                <div>
                   <p className="text-sm font-semibold mb-2">Background color</p>
                   <div className="flex gap-2">
                     {(exportFormat === 'PNG' ? ['transparent', 'white', 'black'] : ['white', 'black']).map(c => (
                        <div 
                          key={c}
                          onClick={() => setExportBg(c)}
                          className={`w-8 h-8 rounded-md border-2 cursor-pointer ${exportBg === c ? 'border-indigo-500' : 'border-border'} ${c === 'white' ? 'bg-white' : c === 'black' ? 'bg-black' : ''}`}
                          style={c === 'transparent' ? { backgroundImage: 'conic-gradient(#e5e7eb 90deg, #fff 90deg 180deg, #e5e7eb 180deg 270deg, #fff 270deg)', backgroundSize: '10px 10px' } : undefined}
                        />
                     ))}
                   </div>
                </div>
             </div>
             {/* Right Column (Preview) */}
             <div className="w-2/3 flex flex-col">
                <p className="text-sm font-semibold mb-2">Preview</p>
                <div 
                  className="flex-grow border border-border rounded-lg overflow-hidden relative flex items-center justify-center min-h-[300px]" 
                  style={{ 
                    backgroundColor: exportBg === 'transparent' ? 'transparent' : exportBg,
                    backgroundImage: exportBg === 'transparent' ? 'conic-gradient(#e5e7eb 90deg, #fff 90deg 180deg, #e5e7eb 180deg 270deg, #fff 270deg)' : 'none',
                    backgroundSize: '10px 10px'
                  }}
                >
                    <div dangerouslySetInnerHTML={{ __html: svgContent }} className="max-w-full max-h-full object-contain p-4 relative z-10" />
                    <Button variant="outline" size="icon" className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm z-20" onClick={() => {
                        navigator.clipboard.writeText(svgContent);
                        toast.success("SVG code copied to clipboard!");
                    }}>
                       <Copy className="w-4 h-4" />
                    </Button>
                </div>
             </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportOpen(false)}>Cancel</Button>
            <Button onClick={handleExport} className="bg-black text-white hover:bg-zinc-800">Export</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
