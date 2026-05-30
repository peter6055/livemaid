"use client";

import { useEditorState } from "@/hooks/useEditorState";
import { useCanvasInteraction } from "@/hooks/useCanvasInteraction";
import { determineDiagramType } from "@/lib/diagrams/utils";
import { useCallback } from "react";
import { EditorHeader } from "./EditorHeader";
import { EditorCodePanel } from "./EditorCodePanel";
import { EditorCanvas } from "./EditorCanvas";
import { ResizablePanelGroup } from "@/components/ui/resizable";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
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
    renderIdRef,
    containerRef,
    isLocked,
    handleCodeChange,
    determineDiagramType
  });

  const handleEditorDidMount = (editor: any) => {
      // editorRef logic can be placed here
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
      if (format === 'bold') {
          handleUpdateStyle('font-weight', 'bold');
      } else if (format === 'italic') {
          handleUpdateStyle('font-style', 'italic');
      } else if (format === 'color' && colorValue) {
          handleUpdateStyle('color', colorValue);
      }
  }, [handleUpdateStyle]);

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
    } else if (selectedNodeId.startsWith('L_')) {
        const parts = selectedNodeId.split('_');
        if (parts.length >= 3) {
            const src = parts[1];
            const dst = parts[2];
            const linkRegex = new RegExp(`(^|\\n)(\\s*${src}\\s*)(?:-->|==>|-\\.->|--.*?-->|==.*?==>|-\\..*?\\.->|--.*?-|==.*?=|-\\..*?\\.)(?:.*?\\|)?(\\s*${dst}\\b)`, 'm');
            const match = newCode.match(linkRegex);
            
            if (match) {
                const fullMatch = match[0];
                let newArrow = editingText.trim() ? `-- "${editingText}" -->` : `-->`;
                if (fullMatch.includes('==')) newArrow = editingText.trim() ? `== "${editingText}" ==>` : `==>`;
                if (fullMatch.includes('-.')) newArrow = editingText.trim() ? `-. "${editingText}" .->` : `-.->`;
                
                newCode = newCode.replace(linkRegex, `$1$2${newArrow}$3`);
            }
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
        <EditorCodePanel 
          isCodePanelOpen={isCodePanelOpen}
          code={code}
          handleCodeChange={handleCodeChange}
          handleEditorDidMount={handleEditorDidMount}
          parseError={parseError}
        />

        <EditorCanvas
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
          toolbarStyle={{
            top: selectionBox ? selectionBox.y - 45 : 0,
            left: selectionBox ? selectionBox.x + selectionBox.width / 2 : 0,
            transform: 'translateX(-50%)'
          }}
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
        />
      </ResizablePanelGroup>
    </div>
  );
}
