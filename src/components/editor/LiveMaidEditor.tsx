"use client";

import { useEditorState } from "@/hooks/useEditorState";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { determineDiagramType, isEdgeId, parseEdgeId, updateLinkStyleAndLabel, getLinkIndex, updateLinkColor, updateMermaidCurve, updateLinkAnimation, deleteLink, rebuildLinkStyles } from "@/lib/diagrams/utils";
import { useCallback } from "react";
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
import { useState, useRef } from "react";

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
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('PNG');
  const [exportBg, setExportBg] = useState('transparent');
  
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
    handleAddNodeFromSelected
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
        
        newCode = newCode.replace(nodeRegex, `$1$2${cleanLabel}$4`);
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
    const linkIndex = getLinkIndex(code, src, dst, occurrenceIndex);
    const updatedCode = updateLinkAnimation(code, linkIndex, animate);
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
          const codeVal = getStyleVal('font-weight');
          let isBold = codeVal === 'bold';
          if (!isBold && selectedSvgId) {
             try {
               const parent = document.getElementById(selectedSvgId);
               const el = parent?.querySelector('.label, text, .nodeLabel');
               if (el) {
                 const fw = window.getComputedStyle(el).fontWeight;
                 isBold = ['bold', '700', '800', '900'].includes(fw);
               }
             } catch (e) {
               console.error(e);
             }
          }

          if (isBold) {
              handleUpdateStyle('font-weight', 'normal');
          } else {
              handleUpdateStyle('font-weight', 'bold');
          }
      } else if (format === 'italic') {
          const codeVal = getStyleVal('font-style');
          let isItalic = codeVal === 'italic';
          if (!isItalic && selectedSvgId) {
             try {
               const parent = document.getElementById(selectedSvgId);
               const el = parent?.querySelector('.label, text, .nodeLabel');
               if (el) {
                 const fs = window.getComputedStyle(el).fontStyle;
                 isItalic = fs === 'italic';
               }
             } catch (e) {
               console.error(e);
             }
          }

          if (isItalic) {
              handleUpdateStyle('font-style', 'normal');
          } else {
              handleUpdateStyle('font-style', 'italic');
          }
      } else if (format === 'color' && colorValue) {
          handleUpdateStyle('color', colorValue);
      }
  }, [code, selectedNodeId, selectedSvgId, handleUpdateStyle]);

  const handleFormatText = (format: string, colorValue?: string) => {
    if (!inlineInputRef.current) return;
    
    const start = inlineInputRef.current.selectionStart;
    const end = inlineInputRef.current.selectionEnd;
    const selectedText = editingText.substring(start, end);
    
    if (!selectedText && format !== 'color') return;
    
    let before = '';
    let after = '';
    
    if (format === 'bold') {
        before = '<b>';
        after = '</b>';
    } else if (format === 'italic') {
        before = '<i>';
        after = '</i>';
    } else if (format === 'color' && colorValue) {
        if (!selectedText) {
            setEditingText(`<span style='color:${colorValue}'>${editingText}</span>`);
            return;
        }
        before = `<span style='color:${colorValue}'>`;
        after = '</span>';
    }
    
    const newText = editingText.substring(0, start) + before + selectedText + after + editingText.substring(end);
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
    
    if (selectedNodeId.startsWith('SEQ_')) {
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
            newCode = newCode.replace(nodeRegex, `$1$2${editingText}$4`);
        } else {
            newCode += `\n    ${selectedNodeId}["${editingText}"]`;
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

  const handleNavigate = (url: string, message: string) => {
    setNavigatingState({ isNavigating: true, message });
    setTimeout(() => {
      router.push(url);
    }, 400);
  };

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-zinc-500 flex-col gap-4 transition-all duration-300">
        <Loader2 className="w-12 h-12 animate-spin text-indigo-500" />
        <p className="text-lg font-medium text-foreground animate-pulse">Loading Workspace...</p>
      </div>
    );
  }

  const currentType = determineDiagramType(code);

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
      />

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
          handleFormatText={handleFormatText}
          inlineInputRef={inlineInputRef}
          handleAddNodeFromSelected={handleAddNodeFromSelected}
          onDeselect={handleDeselect}
          onResetStyle={handleResetStyle}
          onUpdateEdgeStyle={handleUpdateEdgeStyle}
          onUpdateEdgeColor={handleUpdateEdgeColor}
          onUpdateEdgeCurve={handleUpdateEdgeCurve}
          onUpdateEdgeAnimation={handleUpdateEdgeAnimation}
          onDeleteEdge={handleDeleteEdge}
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
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${exportFormat === fmt.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/30' : 'border-border hover:border-foreground/20'}`}
                        >
                           <div className="flex items-center gap-2 mb-1">
                             <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportFormat === fmt.id ? 'border-teal-500' : 'border-border'}`}>
                               {exportFormat === fmt.id && <div className="w-2 h-2 rounded-full bg-teal-500" />}
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
                          className={`w-8 h-8 rounded-md border-2 cursor-pointer ${exportBg === c ? 'border-teal-500' : 'border-border'} ${c === 'white' ? 'bg-white' : c === 'black' ? 'bg-black' : ''}`}
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
