"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import Editor from "@monaco-editor/react";
import { DiagramDocument } from "@/lib/api/storage";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Loader2, Type, LayoutTemplate, Menu, Plus, Network, Download, ChevronsDown, ArrowDown, ArrowUp, ArrowRight, ArrowLeft, Check, Copy, Lock, Unlock } from "lucide-react";
import * as htmlToImage from 'html-to-image';
import Link from "next/link";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";

import mermaid from "mermaid";

const DEBOUNCE_MS = 1000;

function updateMermaidConfigProperty(code: string, property: string, value: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        const propRegex = new RegExp(`${property}:\\s*(?:'|")?[^'"\\n]+(?:'|")?`);
        if (propRegex.test(configBlock)) {
            configBlock = configBlock.replace(propRegex, `${property}: ${value}`);
        } else {
            configBlock += `\n  ${property}: ${value}`;
        }
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  ${property}: ${value}\n---\n` + code;
    }
}

export default function LiveMaidEditor({ documentId }: { documentId: string }) {
  const [doc, setDoc] = useState<DiagramDocument | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Dialog states
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [renameName, setRenameName] = useState("");
  const [isNewDiagramOpen, setIsNewDiagramOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('PNG');
  const [exportBg, setExportBg] = useState('transparent');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // SVG State
  const [svgContent, setSvgContent] = useState<string>("");
  const [currentTheme, setCurrentTheme] = useState('default');
  const [parseError, setParseError] = useState<string | null>(null);

  // Interaction State
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderIdRef = useRef<string | null>(null);
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          editorRef.current?.trigger('keyboard', 'redo', null);
        } else {
          editorRef.current?.trigger('keyboard', 'undo', null);
        }
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose', // allow clicks
      flowchart: { htmlLabels: false },
      sequence: { htmlLabels: false },
    });
  }, []);

  const renderMermaid = useCallback(async (mermaidCode: string) => {
    try {
      setParseError(null);
      await mermaid.parse(mermaidCode, { suppressErrors: true });
      const id = `mermaid-svg-${Date.now()}`;
      renderIdRef.current = id;
      const { svg } = await mermaid.render(id, mermaidCode);
      setSvgContent(svg);
      
      // Try to extract theme
      const match = mermaidCode.match(/theme:\s*(?:'|")?([^'"\s\n]+)/);
      if (match) {
          setCurrentTheme(match[1]);
      } else {
          setCurrentTheme('default');
      }
      
      // Clear selection on new render, coordinates might be stale
      setSelectionBox(null);
      setSelectedNodeId(null);
      setIsEditing(false);
    } catch (e: any) {
      setParseError(e?.message || "Syntax Error");
    }
  }, []);

  // 1. Fetch Initial Data
  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/diagrams/${documentId}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        setDoc(data);
        setCode(data.code);
        renderMermaid(data.code);
      } catch (error) {
        toast.error("Failed to load diagram");
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [documentId, renderMermaid]);

  // 2. Auto-Save Logic
  const saveCode = useCallback(async (newCode: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/diagrams/${documentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: newCode }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (error) {
      toast.error("Failed to auto-save");
    } finally {
      setSaving(false);
    }
  }, [documentId]);

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || "";
    setCode(newCode);

    renderMermaid(newCode);

    // Trigger auto-save
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveCode(newCode);
    }, DEBOUNCE_MS);
  };

  const handleThemeChange = (theme: string) => {
    setCurrentTheme(theme);
    const updatedCode = updateMermaidConfigProperty(code, 'theme', theme);
    handleCodeChange(updatedCode);
  };

  const currentDirection = (() => {
      const m = code.match(/(flowchart|graph)\s+(TD|TB|BT|RL|LR)/);
      return m ? m[2] : 'TD';
  })();

  const currentLayout = (() => {
      const match = code.match(/layout:\s*([^\n]+)/);
      return match ? match[1].trim() : 'dagre';
  })();

  const handleDirectionChange = (newDir: string) => {
      let newCode = code;
      const regex = /(flowchart|graph)\s+(TD|TB|BT|RL|LR)/;
      if (regex.test(newCode)) {
          newCode = newCode.replace(regex, `$1 ${newDir}`);
      } else {
          newCode = newCode.replace(/(flowchart|graph)/, `$1 ${newDir}`);
      }
      handleCodeChange(newCode);
  };

  const handleLayoutChange = (newLayout: string) => {
      let newCode = code;
      newCode = updateMermaidConfigProperty(newCode, 'layout', newLayout);
      handleCodeChange(newCode);
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
        const dataUrl = await htmlToImage.toPng(svgContainer, {
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

  const handleAddShape = useCallback((shape: {b: [string, string] | null, isText?: boolean}) => {
      const newNodeId = `node_${Date.now()}`;
      
      if (shape.isText) {
          const newCode = code + `\n    ${newNodeId}["Text Block"]`;
          handleCodeChange(newCode);
          return;
      }

      const brackets = shape.b as [string, string];
      const label = "New Node";
      let newCode = code;
      
      if (selectedNodeId) {
          // If a node is selected, branch off from it
          newCode += `\n    ${selectedNodeId} --> ${newNodeId}${brackets[0]}${label}${brackets[1]}`;
      } else {
          // Otherwise add floating
          newCode += `\n    ${newNodeId}${brackets[0]}${label}${brackets[1]}`;
      }
      handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleAddTextBlock = useCallback(() => {
      handleAddShape({b: null, isText: true});
  }, [handleAddShape]);

  const handleAddNodeFromSelected = useCallback(() => {
      if (!selectedNodeId) return;
      const newNodeId = `node_${Date.now()}`;
      const newEdgeCode = `\n    ${selectedNodeId} --> ${newNodeId}[New Node]`;
      const newCode = code + newEdgeCode;
      handleCodeChange(newCode);
  }, [code, handleCodeChange, selectedNodeId]);

  const handleAddSubgraph = useCallback(() => {
      const subId = `sub_${Date.now()}`;
      const nodeId = `node_${Date.now()}`;
      const newCode = code + `\n    subgraph ${subId}["Untitled subgraph"]\n        ${nodeId}["Untitled Node"]\n    end`;
      handleCodeChange(newCode);
  }, [code, handleCodeChange]);

  // Node Selection Logic
  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const target = e.target as Element;
    
    // Attempt to find if we clicked a node
    let currentNode: SVGElement | null = target as SVGElement;
    let foundNodeClass = false;
    let nodeId = null;

    while (currentNode && currentNode.tagName !== 'svg') {
      if (currentNode.classList?.contains('node')) {
        foundNodeClass = true;
        nodeId = currentNode.id; // Mermaid usually sets id like `flowchart-node_123-1`
        break;
      }
      if (currentNode.classList?.contains('flowchart-link') || currentNode.classList?.contains('edgeLabel')) {
        foundNodeClass = true;
        nodeId = currentNode.id;
        if (!nodeId) {
            const path = currentNode.parentElement?.querySelector('path.flowchart-link') || currentNode.closest('.edgeLabel')?.previousElementSibling;
            if (path && path.id) nodeId = path.id;
        }
        break;
      }
      currentNode = currentNode.parentElement as SVGElement | null;
    }

    if (foundNodeClass && currentNode && containerRef.current) {
        const rect = currentNode.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        
        setSelectionBox({
            x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
            y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale,
            width: rect.width / scale,
            height: rect.height / scale
        });
        
        let cleanId = nodeId;
        if (cleanId && renderIdRef.current && cleanId.includes(renderIdRef.current)) {
            const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
            cleanId = cleanId.replace(prefixRegex, '');
            if (cleanId.startsWith('flowchart-')) {
                cleanId = cleanId.replace('flowchart-', '');
            }
            cleanId = cleanId.replace(/-\d+$/, '');
        } else if (cleanId) {
            cleanId = cleanId.replace(/^.*?-/, '').replace(/-\d+$/, '');
            if (cleanId.startsWith('flowchart-')) {
                cleanId = cleanId.replace('flowchart-', '');
            }
        }
        setSelectedNodeId(cleanId);
    } else {
        if ((target as any).tagName === 'svg' || (target as any).classList?.contains('react-transform-component')) {
            setSelectionBox(null);
            setSelectedNodeId(null);
        }
    }
  }, [isLocked]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditModalOpen(true);
    
    if (!selectedNodeId) return;
    
    let currentText = selectedNodeId;
    
    if (selectedNodeId.startsWith('L_')) {
        const parts = selectedNodeId.split('_');
        if (parts.length >= 3) {
            const src = parts[1];
            const dst = parts[2];
            const linkRegex = new RegExp(`(^|\\n)(\\s*${src}\\s*)(?:-->|==>|-\\.->|--.*?-->|==.*?==>|-\\..*?\\.->|--.*?-|==.*?=|-\\..*?\\.)(?:.*?\\|)?(\\s*${dst}\\b)`, 'm');
            const match = code.match(linkRegex);
            if (match) {
                const textMatch = match[0].match(/(?:--|==|-\.-)\s*["']?([\s\S]*?)["']?\s*(?:---|===|-\.-|>|->|=>)/);
                if (textMatch && textMatch[1] && textMatch[1].trim() !== '') {
                    currentText = textMatch[1].trim();
                } else {
                    currentText = '';
                }
            }
        }
    } else {
        const nodeRegex = new RegExp(`(^|\\s)(${selectedNodeId}\\s*(?:\\[|\\(\\(?|\\{|\\{\\{|\\[\\/?|\\[\\\\|\\>|\\(\\(\\(|\\[\\[)\\s*["']?)([\\s\S]*?)(["']?\\s*(?:\\]|\\)\\)?|\\}|\\}\\}|\\[?\\/\\]|\\]|\\]\\]))`, 'm');
        const match = code.match(nodeRegex);
        if (match && match[3]) {
            currentText = match[3];
        }
    }
    setEditingText(currentText);
  };

  const handleEditSubmit = () => {
    if (!selectedNodeId) {
        setIsEditModalOpen(false);
        return;
    }
    
    let newCode = code;
    
    if (selectedNodeId.startsWith('L_')) {
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
        const nodeRegex = new RegExp(`(^|\\s)(${selectedNodeId}\\s*(?:\\[|\\(\\(?|\\{|\\{\\{|\\[\\/?|\\[\\\\|\\>|\\(\\(\\(|\\[\\[)\\s*["']?)([\\s\S]*?)(["']?\\s*(?:\\]|\\)\\)?|\\}|\\}\\}|\\[?\\/\\]|\\]|\\]\\]))`, 'm');
        if (nodeRegex.test(newCode)) {
            newCode = newCode.replace(nodeRegex, `$1$2${editingText}$4`);
        } else {
            newCode += `\n    ${selectedNodeId}["${editingText}"]`;
        }
    }
    
    handleCodeChange(newCode);
    setIsEditModalOpen(false);
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
        router.push(`/editor/${newDiagram.id}`);
      } else {
        toast.error("Failed to create diagram");
      }
    } catch (e) {
      toast.error("Failed to create diagram");
    }
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
        router.push(`/editor/${newDiagram.id}`);
      } else {
        toast.error("Failed to duplicate");
      }
    } catch (e) {
      toast.error("Failed to duplicate");
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-white text-zinc-500">Loading editor...</div>;
  }

  if (!doc) {
    return <div className="min-h-screen flex items-center justify-center bg-white text-red-500">Diagram not found</div>;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-white text-zinc-900 overflow-hidden">
      <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-4 shrink-0 z-20">
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="mr-2 text-zinc-700 hover:text-zinc-900 hover:bg-slate-100" />}>
              <Menu className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => { setCreateName("New Diagram"); setIsNewDiagramOpen(true); }}>New Diagram</DropdownMenuItem>
              <DropdownMenuItem onClick={handleDuplicate}>Duplicate</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setRenameName(doc?.name || ""); setIsRenameOpen(true); }}>Rename</DropdownMenuItem>
              <Link href="/"><DropdownMenuItem>Dashboard</DropdownMenuItem></Link>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/">
            <div className="bg-[#7a3dff] p-1.5 rounded-lg mr-6 flex items-center justify-center cursor-pointer hover:opacity-90 transition-opacity w-9 h-9">
              <LayoutTemplate className="w-5 h-5 text-white" />
            </div>
          </Link>
          
          <div className="flex items-center text-[15px] font-semibold text-slate-500 tracking-tight">
            <Link href="/" className="hover:text-zinc-900 transition-colors text-slate-600">Projects</Link>
            <span className="mx-3 text-slate-300 font-light">/</span>
            <span className="text-[#4e3dd4]">{doc.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm font-medium mr-4">
          <Button variant="ghost" size="sm" onClick={() => setIsExportOpen(true)} className="flex items-center gap-2 mr-2 text-slate-700 hover:bg-slate-100 h-9 border border-slate-200">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </Button>
          {saving ? (
            <span className="flex items-center text-slate-400">
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </span>
          ) : (
            <span className="flex items-center text-emerald-600">
              <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 mr-1.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              Saved
            </span>
          )}
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="flex-grow">
        <ResizablePanel defaultSize={30} minSize={20} className="bg-white flex flex-col border-r border-slate-200">
          <div className="h-10 border-b border-slate-200 bg-slate-50 flex items-center px-4 shrink-0 justify-between">
            <span className="text-xs font-mono text-zinc-800 font-bold tracking-wide uppercase">Mermaid Code</span>
          </div>
          <div className="flex-grow relative flex flex-col min-h-0">
            <div className="flex-grow min-h-0 relative">
              <Editor
                height="100%"
                defaultLanguage="markdown"
                theme="light"
                value={code}
                onChange={handleCodeChange}
                onMount={handleEditorDidMount}
                options={{
                  readOnly: false,
                  minimap: { enabled: false },
                  fontSize: 13,
                  wordWrap: "on",
                  lineNumbers: "on",
                  scrollBeyondLastLine: false,
                  padding: { top: 16, bottom: 40 }
                }}
              />
            </div>
            {parseError && (
              <div className="flex-shrink-0 relative z-10 bg-red-50 text-red-600 p-4 text-[13px] leading-relaxed font-mono border-t border-red-200 max-h-[50%] overflow-y-auto whitespace-pre-wrap shadow-[0_-8px_20px_-5px_rgba(0,0,0,0.1)]">
                <span className="font-bold text-base mb-2 block sticky top-0 bg-red-50 py-1">Syntax Error</span>
                {parseError}
              </div>
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle className="w-[1px] bg-slate-200 hover:bg-black transition-colors cursor-col-resize" />

        <ResizablePanel defaultSize={70} className="bg-slate-50 relative overflow-hidden">
          <div className="absolute top-4 left-4 z-10 flex gap-3 pointer-events-auto">
            <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200">
              <Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-slate-700 hover:bg-slate-100">
                <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M12.8 23q-2.05 0-3.85-.937T6 19.45L1.2 12.4l.475-.475q.5-.525 1.238-.6t1.337.35l2.75 1.9V4q0-.425.288-.712T8 3t.713.288T9 4v13.425L5.3 14.85l2.375 3.45q.875 1.275 2.225 1.988t2.9.712q2.575 0 4.388-1.812T19 14.8V5q0-.425.288-.712T20 4t.713.288T21 5v9.8q0 3.425-2.387 5.813T12.8 23M11 12V2q0-.425.288-.712T12 1t.713.288T13 2v10zm4 0V3q0-.425.288-.712T16 2t.713.288T17 3v9zm-2.85 4.5"></path></svg>
              </Button>
              <div className="h-5 w-px bg-slate-200" />
              
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-slate-700 hover:bg-slate-100 flex items-center justify-center" />}>
                  <div className={`w-5 h-5 rounded-full border ${currentTheme === 'dark' ? 'bg-zinc-800 border-zinc-900' : currentTheme === 'forest' ? 'bg-green-400 border-green-500' : currentTheme === 'neutral' ? 'bg-slate-200 border-slate-300' : currentTheme === 'base' ? 'bg-orange-100 border-orange-200' : 'bg-[#4f197b] border-[#4f197b]'}`} />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 p-2 bg-slate-50 border-slate-200 rounded-xl flex flex-col gap-2" sideOffset={10} align="start">
                    <p className="text-xs font-medium text-slate-500 px-2 pt-2">Diagram theme</p>
                    <div className="flex flex-col">
                      {['default', 'forest', 'dark', 'neutral', 'base'].map((t) => (
                         <DropdownMenuItem 
                           key={t}
                           onClick={() => handleThemeChange(t)}
                           className="flex items-center gap-3 cursor-pointer"
                         >
                           <div className={`w-4 h-4 rounded border ${t === 'dark' ? 'bg-zinc-800 border-zinc-900' : t === 'forest' ? 'bg-green-200 border-green-300' : t === 'neutral' ? 'bg-slate-200 border-slate-300' : t === 'base' ? 'bg-orange-100 border-orange-200' : 'bg-slate-50 border-slate-200'} ${currentTheme === t ? 'ring-2 ring-indigo-500' : ''}`} />
                           <span className="capitalize">{t}</span>
                         </DropdownMenuItem>
                      ))}
                    </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="h-5 w-px bg-slate-200" />
              
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="shrink-0 rounded-md p-1 h-8 w-8 text-slate-700 hover:bg-slate-100 flex items-center justify-center" />}>
                  <ChevronsDown className="w-4 h-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48 p-2 bg-slate-50 border-slate-200 rounded-xl flex flex-col gap-1" sideOffset={10} align="start">
                    <div className="flex flex-col">
                      {[
                        { id: 'TD', label: 'Top to bottom', icon: <ArrowDown className="w-4 h-4" /> },
                        { id: 'BT', label: 'Bottom to top', icon: <ArrowUp className="w-4 h-4" /> },
                        { id: 'LR', label: 'Left to right', icon: <ArrowRight className="w-4 h-4" /> },
                        { id: 'RL', label: 'Right to left', icon: <ArrowLeft className="w-4 h-4" /> },
                      ].map((d) => (
                         <DropdownMenuItem 
                           key={d.id}
                           onClick={() => handleDirectionChange(d.id)}
                           className="flex items-center gap-3 cursor-pointer rounded-md hover:bg-slate-100"
                         >
                           {d.icon}
                           <span className="flex-1 text-sm font-medium">{d.label}</span>
                           {currentDirection === d.id && <Check className="w-4 h-4 text-indigo-500" />}
                         </DropdownMenuItem>
                      ))}
                    </div>
                </DropdownMenuContent>
              </DropdownMenu>



              <div className="h-5 w-px bg-slate-200" />
              <div className="flex items-center gap-2 px-2 opacity-70" title="Auto Layout is locked">
                 <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Auto Layout</span>
                 <div className="w-7 h-4 bg-indigo-500 rounded-full flex items-center px-0.5 cursor-not-allowed">
                   <div className="w-3 h-3 bg-white rounded-full translate-x-3 shadow-sm" />
                 </div>
               </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl bg-white p-2 border border-slate-200">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-8 text-slate-700 hover:bg-slate-100 flex items-center gap-2" />}>
                  <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="currentColor" d="M6.5 11L12 2l5.5 9zm11 11q-1.875 0-3.187-1.312T13 17.5t1.313-3.187T17.5 13t3.188 1.313T22 17.5t-1.312 3.188T17.5 22M3 21.5v-8h8v8zM17.5 20q1.05 0 1.775-.725T20 17.5t-.725-1.775T17.5 15t-1.775.725T15 17.5t.725 1.775T17.5 20M5 19.5h4v-4H5zM10.05 9h3.9L12 5.85zm7.45 8.5"></path></svg>
                  <span>Shape</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[340px] max-h-[60vh] overflow-y-auto p-4 bg-slate-50 border-slate-200 rounded-xl flex flex-col gap-6" sideOffset={10} align="start">
                   {/* Basic Shapes */}
                   <div className="flex flex-col gap-3">
                     <p className="text-xs font-semibold text-slate-500 px-1 uppercase tracking-wider">Basic</p>
                     <div className="grid grid-cols-6 gap-2">
                        {[
                          { b: null, isText: true, l: 'Text', i: <text x="12" y="16" fontSize="14" fontFamily="sans-serif" textAnchor="middle" fill="currentColor" fontWeight="bold">T</text> },
                          { b: ['[', ']'], l: 'Square', i: <rect x="4" y="4" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['(', ')'], l: 'Rounded', i: <rect x="4" y="4" width="16" height="16" rx="5" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['([', '])'], l: 'Stadium', i: <rect x="3" y="7" width="18" height="10" rx="5" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['((', '))'], l: 'Circle', i: <circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['{', '}'], l: 'Rhombus', i: <polygon points="12 4, 20 12, 12 20, 4 12" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['{{', '}}'], l: 'Hexagon', i: <polygon points="12 4, 20 8, 20 16, 12 20, 4 16, 4 8" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[(', ')]'], l: 'Cylinder', i: <path d="M5 7 C5 5, 19 5, 19 7 V17 C19 19, 5 19, 5 17 Z M5 7 C5 9, 19 9, 19 7" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[/', '/]'], l: 'Parallelogram', i: <polygon points="7 20, 21 20, 17 4, 3 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[\\', '\\]'], l: 'Parallelogram Alt', i: <polygon points="3 20, 17 20, 21 4, 7 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[/', '\\]'], l: 'Trapezoid', i: <polygon points="7 20, 17 20, 21 4, 3 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[\\', '/]'], l: 'Trapezoid Alt', i: <polygon points="3 20, 21 20, 17 4, 7 4" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['(((', ')))'], l: 'Double Circle', i: <g><circle cx="12" cy="12" r="8" stroke="currentColor" fill="none" strokeWidth="1.5" /><circle cx="12" cy="12" r="5" stroke="currentColor" fill="none" strokeWidth="1.5" /></g> },
                          { b: ['>', ']'], l: 'Asymmetric', i: <path d="M4 4 h11 l5 8 l-5 8 h-11 z" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                          { b: ['[[', ']]'], l: 'Subroutine', i: <path d="M4 4 h16 v16 h-16 z M8 4 v16 M16 4 v16" stroke="currentColor" fill="none" strokeWidth="1.5" /> },
                        ].map((shape, i) => (
                           <DropdownMenuItem 
                             key={i}
                             onClick={() => handleAddShape(shape as any)}
                             className="flex items-center justify-center w-10 h-10 bg-white border border-slate-200 rounded hover:border-indigo-400 hover:bg-indigo-50 cursor-pointer text-slate-700 p-0"
                             title={shape.l}
                           >
                              <svg viewBox="0 0 24 24" className="w-5 h-5">
                                 {shape.i}
                              </svg>
                           </DropdownMenuItem>
                        ))}
                     </div>
                   </div>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" className="h-8 text-slate-700 hover:bg-slate-100 flex items-center gap-2" onClick={handleAddTextBlock}>
                 <Type className="w-4 h-4" />
                 <span>Text</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 text-slate-700 hover:bg-slate-100 flex items-center gap-2" onClick={handleAddSubgraph}>
                 <LayoutTemplate className="w-4 h-4" />
                 <span>Subgraph</span>
              </Button>
            </div>
          </div>

          <div className="w-full h-full relative bg-slate-50 overflow-hidden">
            {/* The dot background pattern (fixed, absolute, or tied to transform) */}
            <div 
              className="absolute inset-0 z-0 pointer-events-none opacity-40" 
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, #cbd5e1 1.5px, transparent 0)',
                backgroundSize: '24px 24px'
              }}
            />

            <TransformWrapper
              initialScale={1}
              minScale={0.05}
              maxScale={50}
              centerOnInit={true}
              wheel={{ step: 0.1, activationKeys: ["Control", "Meta", "Alt", "Shift"] }}
              panning={{ velocityDisabled: false, disabled: isEditing, wheelPanning: true } as any}
            >
              {({ zoomIn, zoomOut, resetTransform, state }) => (
                <>
                  <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-2 bg-white border border-slate-200 p-1 rounded-lg">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => zoomIn()}>
                       <Plus className="w-4 h-4" />
                    </Button>
                    <div className="h-px bg-slate-100" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => resetTransform()}>
                       <span className="text-[10px] font-bold">1:1</span>
                    </Button>
                    <div className="h-px bg-slate-100" />
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-600" onClick={() => zoomOut()}>
                       <svg viewBox="0 0 24 24" className="w-4 h-4"><path fill="currentColor" d="M19 13H5v-2h14v2z"/></svg>
                    </Button>
                    <div className="h-px bg-slate-100" />
                    <Button 
                       variant="ghost" 
                       size="icon" 
                       className={`h-8 w-8 ${isLocked ? 'text-red-500' : 'text-slate-600'}`} 
                       onClick={() => setIsLocked(!isLocked)}
                       title={isLocked ? "Unlock diagram" : "Lock diagram"}
                    >
                       {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    </Button>
                  </div>

                  <TransformComponent
                    wrapperStyle={{ width: "100%", height: "100%" }}
                    contentStyle={{ width: "100%", height: "100%" }}
                  >
                    <div 
                      ref={containerRef}
                      className="w-full h-full relative flex items-center justify-center cursor-grab active:cursor-grabbing"
                      onClick={handleSvgClick}
                      onDoubleClick={(e) => { if (selectedNodeId) handleEditClick(e); }}
                    >
                      {parseError && (
                        <div 
                          className="absolute inset-0 z-40 bg-white/60 backdrop-blur-[4px] cursor-not-allowed flex items-center justify-center pointer-events-auto" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Empty container to capture clicks and blur out the broken diagram underneath */}
                        </div>
                      )}

                      <div 
                        className={`mermaid-container transition-all ${parseError ? 'opacity-30' : ''}`}
                        dangerouslySetInnerHTML={{ __html: svgContent }} 
                      />

                      {/* Selection Bounding Box */}
                      {selectionBox && (
                        <div 
                          className="absolute border-indigo-500 rounded-md pointer-events-none z-20"
                          style={{
                            left: selectionBox.x - 4,
                            top: selectionBox.y - 4,
                            width: selectionBox.width + 8,
                            height: selectionBox.height + 8,
                            borderWidth: `${2 / state.scale}px`,
                            boxShadow: `0 0 0 ${4 / state.scale}px rgba(99, 102, 241, 0.2)`
                          }}
                        >
                          {/* Node ID indicator */}
                          <div 
                            className="absolute left-0 pointer-events-auto origin-bottom-left flex gap-1 items-end"
                            style={{ 
                              top: `-${24 / state.scale}px`,
                              transform: `scale(${1 / state.scale})`
                            }}
                          >
                            <div className="bg-indigo-500 text-white font-mono text-[10px] px-2 py-0.5 rounded-t-md whitespace-nowrap">
                              {selectedNodeId}
                            </div>
                          </div>
                          
                          {/* Inline Text Edit Overlay Removed */}

                          {/* Quick Add Node (+) Button */}
                          <div 
                            className="absolute left-1/2 pointer-events-auto origin-top"
                            style={{ 
                              bottom: `-${12 / state.scale}px`,
                              transform: `translateX(-50%) translateY(100%) scale(${1 / state.scale})`
                            }}
                          >
                            <button
                               onClick={(e) => { e.stopPropagation(); handleAddNodeFromSelected(); }}
                               className="w-5 h-5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md transform hover:scale-110 transition-transform"
                            >
                               <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </TransformComponent>
                  
                  {/* Read-Only Lock Indicator - Moved outside TransformComponent so it doesn't zoom! */}
                  {isLocked && (
                    <div className="absolute top-4 right-4 bg-white/80 backdrop-blur border border-red-200 text-red-600 px-3 py-1.5 rounded-md text-xs font-medium flex items-center shadow-sm pointer-events-none z-50">
                      <Lock className="w-3.5 h-3.5 mr-1.5" /> Locked
                    </div>
                  )}
                </>
              )}
            </TransformWrapper>
          </div>
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
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${exportFormat === fmt.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                           <div className="flex items-center gap-2 mb-1">
                             <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${exportFormat === fmt.id ? 'border-teal-500' : 'border-slate-300'}`}>
                               {exportFormat === fmt.id && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                             </div>
                             <span className="font-semibold text-slate-700">{fmt.label}</span>
                           </div>
                           <p className="text-xs text-slate-500 ml-6">{fmt.desc}</p>
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
                          className={`w-8 h-8 rounded-md border-2 cursor-pointer ${exportBg === c ? 'border-teal-500' : 'border-slate-200'} ${c === 'white' ? 'bg-white' : c === 'black' ? 'bg-black' : ''}`}
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
                  className="flex-grow border border-slate-200 rounded-lg overflow-hidden relative flex items-center justify-center min-h-[300px]" 
                  style={{ 
                    backgroundColor: exportBg === 'transparent' ? 'transparent' : exportBg,
                    backgroundImage: exportBg === 'transparent' ? 'conic-gradient(#e5e7eb 90deg, #fff 90deg 180deg, #e5e7eb 180deg 270deg, #fff 270deg)' : 'none',
                    backgroundSize: '10px 10px'
                  }}
                >
                    <div dangerouslySetInnerHTML={{ __html: svgContent }} className="max-w-full max-h-full object-contain p-4 relative z-10" />
                    <Button variant="outline" size="icon" className="absolute top-2 right-2 bg-white/80 backdrop-blur-sm z-20">
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
      {/* Edit Label Dialog */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Label</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input 
              value={editingText} 
              onChange={(e) => setEditingText(e.target.value)} 
              placeholder="Label text"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleEditSubmit()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
            <Button onClick={() => handleEditSubmit()} className="bg-black text-white hover:bg-zinc-800">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
