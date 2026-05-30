import { useState, useCallback, useRef, MutableRefObject } from "react";

export function useCanvasInteraction({ 
    code, 
    renderIdRef, 
    containerRef, 
    isLocked,
    handleCodeChange,
    determineDiagramType
}: { 
    code: string;
    renderIdRef: MutableRefObject<string | null>;
    containerRef: MutableRefObject<HTMLDivElement | null>;
    isLocked: boolean;
    handleCodeChange: (code: string) => void;
    determineDiagramType: (code: string) => string;
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedSvgId, setSelectedSvgId] = useState<string | null>(null);
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [textBox, setTextBox] = useState<{x: number, y: number, width: number, height: number} | null>(null);
  const [editingText, setEditingText] = useState("");
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  
  const [connectionState, setConnectionState] = useState<{
      active: boolean;
      startNodeId: string | null;
      mousePos: { x: number, y: number } | null;
      isDragging: boolean;
  }>({ active: false, startNodeId: null, mousePos: null, isDragging: false });

  const getClickedNode = useCallback((target: Element) => {
    let currentNode: SVGElement | null = target as SVGElement;
    let foundNodeClass = false;
    let nodeId = null;

    while (currentNode && currentNode.tagName !== 'svg') {
      if (currentNode.classList?.contains('node') || currentNode.classList?.contains('cluster')) {
        foundNodeClass = true;
        nodeId = currentNode.id;
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
      // Sequence diagram elements
      if (currentNode.classList?.contains('actor') || currentNode.classList?.contains('messageText') || currentNode.classList?.contains('noteText')) {
        foundNodeClass = true;
        nodeId = `SEQ_${currentNode.textContent?.trim()}`;
        break;
      }
      currentNode = currentNode.parentElement as SVGElement | null;
    }

    if (foundNodeClass && currentNode && containerRef.current) {
        const rawSvgId = currentNode.id;
        const rect = currentNode.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        
        let elementToMeasure = currentNode;
        const innerText = currentNode.querySelector('.label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label');
        if (innerText) {
            elementToMeasure = innerText as SVGElement;
        } else if (currentNode.tagName === 'text' || currentNode.tagName === 'foreignObject' || currentNode.classList?.contains('label')) {
            elementToMeasure = currentNode;
        }
        const textRect = elementToMeasure.getBoundingClientRect();
        
        const newSelectionBox = {
            x: (rect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
            y: (rect.top - containerRect.top + containerRef.current.scrollTop) / scale,
            width: rect.width / scale,
            height: rect.height / scale
        };

        const newTextBox = {
            x: (textRect.left - containerRect.left + containerRef.current.scrollLeft) / scale,
            y: (textRect.top - containerRect.top + containerRef.current.scrollTop) / scale,
            width: textRect.width / scale,
            height: textRect.height / scale
        };
        
        let cleanId = nodeId;
        if (cleanId?.startsWith('SEQ_')) {
             // Keep it as is for sequence diagrams
        } else if (cleanId && renderIdRef.current && cleanId.includes(renderIdRef.current)) {
            const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
            cleanId = cleanId.replace(prefixRegex, '');
            if (cleanId.startsWith('flowchart-')) {
                cleanId = cleanId.replace('flowchart-', '');
            }
            cleanId = cleanId.replace(/-\\d+$/, '');
        } else if (cleanId) {
            cleanId = cleanId.replace(/^.*?-/, '').replace(/-\\d+$/, '');
            if (cleanId.startsWith('flowchart-')) {
                cleanId = cleanId.replace('flowchart-', '');
            }
        }
        return { cleanId, rawSvgId, newSelectionBox, newTextBox };
    }
    return null;
  }, [containerRef, renderIdRef]);

  const inlineInputRef = useRef<HTMLTextAreaElement>(null);

  const handleEditClick = useCallback((e: React.MouseEvent | Event) => {
    if ('stopPropagation' in e) e.stopPropagation();
    
    const currentType = determineDiagramType(code);
    if (!(currentType === 'graph' || currentType === 'flowchart' || currentType === 'sequence')) {
        return;
    }

    const result = getClickedNode(e.target as Element);
    let targetNodeId = selectedNodeId;

    if (result) {
        setSelectionBox(result.newSelectionBox);
        setTextBox(result.newTextBox);
        setSelectedNodeId(result.cleanId);
        setSelectedSvgId(result.rawSvgId);
        targetNodeId = result.cleanId;
    }
    
    if (!targetNodeId) return;
    
    let currentText = targetNodeId;
    
    if (targetNodeId.startsWith('SEQ_')) {
        currentText = targetNodeId.replace('SEQ_', '');
        currentText = currentText.replace(/<br\/>/g, '\n');
    } else if (targetNodeId.startsWith('L_')) {
        const parts = targetNodeId.split('_');
        if (parts.length >= 3) {
            const src = parts[1];
            const dst = parts[2];
            const linkRegex = new RegExp(`(^|\\n)(\\s*${src}\\s*)(?:-->|==>|-\\.->|--.*?-->|==.*?==>|-\\..*?\\.->|--.*?-|==.*?=|-\\..*?\\.)(?:.*?\\|)?(\\s*${dst}\\b)`, 'm');
            const match = code.match(linkRegex);
            if (match) {
                const textMatch = match[0].match(/(?:--|==|-\\.-)\\s*["']?([\\s\\S]*?)["']?\\s*(?:---|===|-\\.-|>|->|=>)/);
                if (textMatch && textMatch[1] && textMatch[1].trim() !== '') {
                    currentText = textMatch[1].trim();
                } else {
                    currentText = '';
                }
            }
        }
    } else {
        const nodeRegex = new RegExp(`(^|[^a-zA-Z0-9_])(${targetNodeId}\\s*(?:\\[\\/|\\[\\\\\\[\\(|\\[|\\[\\[|\\(\\[|\\(\\(\\(|\\(\\(|\\(|\\{\\{|\\{|\\>)\\s*["']?)([\\s\\S]*?)(["']?\\s*(?:\\]|\\)|\\)\\]|\\)\\)\\)|\\)\\)|\\}|\\}\\}|\\/\\]|\\\\\\]|\\]\\]))`, 'm');
        const match = code.match(nodeRegex);
        if (match && match[3]) {
            currentText = match[3];
        } else {
            const innerText = result?.rawSvgId ? document.querySelector(`#${result.rawSvgId} .label, #${result.rawSvgId} text, #${result.rawSvgId} foreignObject, #${result.rawSvgId} .nodeLabel`) : null;
            if (innerText && innerText.textContent) {
                currentText = innerText.textContent.trim();
            }
        }
    }
    setEditingText(currentText);
    setIsInlineEditing(true);
    setTimeout(() => {
        if (inlineInputRef.current) {
            inlineInputRef.current.focus();
            inlineInputRef.current.select();
        }
    }, 10);
  }, [code, getClickedNode, selectedNodeId, determineDiagramType]);

  const lastClickTimeRef = useRef<number>(0);

  const handleSvgClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLocked) return;

    const currentTime = new Date().getTime();
    const timeSinceLastClick = currentTime - lastClickTimeRef.current;
    
    if (timeSinceLastClick < 300) {
        lastClickTimeRef.current = 0;
        handleEditClick(e);
        return;
    }
    lastClickTimeRef.current = currentTime;

    const result = getClickedNode(e.target as Element);
    
    if (result) {
        setSelectionBox(result.newSelectionBox);
        setTextBox(result.newTextBox);
        setSelectedNodeId(result.cleanId);
        setSelectedSvgId(result.rawSvgId);
    } else {
        if ((e.target as any).tagName === 'svg' || (e.target as any).classList?.contains('react-transform-component')) {
            setSelectionBox(null);
            setTextBox(null);
            setSelectedNodeId(null);
            setSelectedSvgId(null);
            setIsInlineEditing(false);
        }
    }
  }, [isLocked, getClickedNode, handleEditClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (connectionState.active && connectionState.startNodeId && containerRef.current) {
          const containerRect = containerRef.current.getBoundingClientRect();
          const scale = containerRect.width / containerRef.current.offsetWidth;
          
          setConnectionState(prev => ({
              ...prev,
              isDragging: true,
              mousePos: {
                  x: (e.clientX - containerRect.left + containerRef.current!.scrollLeft) / scale,
                  y: (e.clientY - containerRect.top + containerRef.current!.scrollTop) / scale
              }
          }));
      }
  }, [connectionState.active, connectionState.startNodeId, containerRef]);

  const handleAddNodeFromSelected = useCallback((startId: string | null, targetNodeId?: string) => {
      if (!startId) return;
      
      const diagramType = determineDiagramType(code);
      let newCode = code;

      const getNextNodeId = (codeStr: string, prefix: string = 'n'): string => {
          let i = 1;
          while (new RegExp(`(^|[^a-zA-Z0-9_])${prefix}${i}([^a-zA-Z0-9_]|$)`, 'm').test(codeStr)) i++;
          return `${prefix}${i}`;
      };

      if (diagramType === 'flowchart' || diagramType === 'graph') {
          if (targetNodeId && targetNodeId !== startId) {
              newCode += `\n    ${startId} --> ${targetNodeId}`;
          } else {
              const prefix = startId.match(/^([a-zA-Z]+)/)?.[1] || 'n';
              const newNodeId = getNextNodeId(code, prefix);
              newCode += `\n    ${startId} --> ${newNodeId}[New Node]`;
          }
      } else if (diagramType === 'sequence') {
          const actor = startId.replace('SEQ_', '');
          if (targetNodeId && targetNodeId !== startId && targetNodeId.startsWith('SEQ_')) {
              const targetActor = targetNodeId.replace('SEQ_', '');
              newCode += `\n    ${actor}->>${targetActor}: New Message`;
          } else {
              newCode += `\n    ${actor}->>NewActor: New Message`;
          }
      }
      
      handleCodeChange(newCode);
  }, [code, handleCodeChange, determineDiagramType]);

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if (connectionState.active && connectionState.startNodeId) {
          if (connectionState.isDragging) {
              const result = getClickedNode(e.target as Element);
              if (result && result.cleanId && result.cleanId !== connectionState.startNodeId) {
                  handleAddNodeFromSelected(connectionState.startNodeId, result.cleanId);
              } else if (!result) {
                  // Dropped on empty space
              }
          }
          setConnectionState({ active: false, startNodeId: null, mousePos: null, isDragging: false });
      }
  }, [connectionState, getClickedNode, handleAddNodeFromSelected]);

  return {
    selectedNodeId, setSelectedNodeId,
    selectedSvgId, setSelectedSvgId,
    selectionBox, setSelectionBox,
    textBox, setTextBox,
    editingText, setEditingText,
    isInlineEditing, setIsInlineEditing,
    connectionState, setConnectionState,
    inlineInputRef,
    getClickedNode,
    handleSvgClick,
    handleMouseMove,
    handleMouseUp,
    handleEditClick,
    handleAddNodeFromSelected
  };
}
