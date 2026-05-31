import { useState, useCallback, useRef, MutableRefObject, useEffect } from "react";
import { isEdgeId, parseEdgeId, CONNECTOR_PATTERN } from "@/lib/diagrams/utils";


export function useCanvasInteraction({ 
    code, 
    svgContent,
    renderIdRef, 
    containerRef, 
    isLocked,
    handleCodeChange,
    determineDiagramType
}: { 
    code: string;
    svgContent?: string;
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

  const normalizeId = useCallback((id: string) => {
    let cleanId = id.replace('-hit-target', '');
    
    // 1. Remove render ID prefix if present
    if (renderIdRef.current && cleanId.includes(renderIdRef.current)) {
        const prefixRegex = new RegExp(`^.*?-?${renderIdRef.current}-`);
        cleanId = cleanId.replace(prefixRegex, '');
    }
    
    // Also remove generic svg- or flowchart- prefixes that might be added
    cleanId = cleanId.replace(/^svg-/, '').replace(/^flowchart-/, '');

    // 2. Check if it is an edge ID pattern: e.g., L_n2_n4_2 or L-n2-n4-3
    // We want to match L, followed by src, followed by dst, followed by a raw index.
    const edgeMatch = cleanId.match(/^L[_-]([a-zA-Z0-9]+)[_-]([a-zA-Z0-9]+)[_-](\d+)$/);
    if (edgeMatch) {
        const src = edgeMatch[1];
        const dst = edgeMatch[2];
        const rawIndex = parseInt(edgeMatch[3], 10);
        // Canonicalize edge ID to use underscores and even rawIndex
        const canonicalIndex = 2 * Math.floor(rawIndex / 2);
        return `L_${src}_${dst}_${canonicalIndex}`;
    }

    // 3. For non-edge IDs, strip trailing render suffixes like -1, _2
    cleanId = cleanId.replace(/[-_]\d+$/, '');
    
    return cleanId;
  }, [renderIdRef]);

  const recalculateSelection = useCallback(() => {
    if (!selectedNodeId || !containerRef.current) return;

    // Search for the element corresponding to selectedNodeId
    let foundElement: SVGElement | null = null;
    let foundRawSvgId: string | null = null;

    if (selectedNodeId.startsWith('SEQ_')) {
      const actorName = selectedNodeId.replace('SEQ_', '');
      const candidates = containerRef.current.querySelectorAll('.actor, .messageText, .noteText');
      for (const candidate of Array.from(candidates)) {
        if (candidate.textContent?.trim() === actorName) {
          foundElement = candidate as SVGElement;
          if (!candidate.id) {
            candidate.id = `seq-element-${actorName.replace(/[^a-zA-Z0-9_]/g, '')}`;
          }
          foundRawSvgId = candidate.id || null;
          break;
        }
      }
    } else {
      // It's a flowchart node, cluster, or link
      let candidatesList: SVGElement[] = [];
      if (isEdgeId(selectedNodeId)) {
        const edgeLabels = Array.from(containerRef.current.querySelectorAll('.edgeLabel'));
        const flowchartLinks = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
        const otherNodes = Array.from(containerRef.current.querySelectorAll('.node, .cluster'));
        candidatesList = [...edgeLabels, ...flowchartLinks, ...otherNodes] as SVGElement[];
      } else {
        candidatesList = Array.from(containerRef.current.querySelectorAll('.node, .cluster, path.flowchart-link:not(.flowchart-link-hit-target), .edgeLabel')) as SVGElement[];
      }

      for (const candidate of candidatesList) {
        let nodeId = candidate.id;
        if (!nodeId && candidate.classList?.contains('edgeLabel')) {
          const dataIdEl = candidate.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId) {
              const canonical = normalizeId(rawId);
              // Only snap selection to labeled edge labels (non-empty text).
              // For empty/unlabeled edge labels, do not set nodeId so that the loop
              // bypasses this candidate and selects the path element instead.
              const hasText = candidate.textContent?.trim() !== '';
              if (hasText) {
                const paths = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
                const matchingPath = paths.find(p => p.id && normalizeId(p.id) === canonical);
                if (matchingPath) {
                  nodeId = matchingPath.id;
                }
              }
            }
          }
        }

        if (nodeId) {
          const cleanId = normalizeId(nodeId);

          if (cleanId === selectedNodeId) {
            foundElement = candidate;
            if (candidate.classList?.contains('edgeLabel') && !candidate.id) {
              candidate.id = `edge-label-${cleanId}`;
            }
            foundRawSvgId = candidate.id || null;
            break;
          }
        }
      }
    }

    if (foundElement && containerRef.current) {
      const rect = foundElement.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();
      const scale = containerRect.width / containerRef.current.offsetWidth;
      
      let elementToMeasure = foundElement;
      const innerText = foundElement.querySelector('.label > div, foreignObject > div, .label, foreignObject, text, .messageText, .noteText, .nodeLabel, .cluster-label');
      if (innerText) {
          elementToMeasure = innerText as SVGElement;
      } else if (foundElement.tagName === 'text' || foundElement.tagName === 'foreignObject' || foundElement.classList?.contains('label')) {
          elementToMeasure = foundElement;
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

      setSelectionBox(newSelectionBox);
      setTextBox(newTextBox);
      setSelectedSvgId(foundRawSvgId);
    } else {
      // If we couldn't find the selected element in the new SVG, clear the selection
      setSelectionBox(null);
      setTextBox(null);
      setSelectedNodeId(null);
      setSelectedSvgId(null);
    }
  }, [selectedNodeId, containerRef, renderIdRef, normalizeId]);

  // Effect to recalculate selection on code or svgContent (re-render) change
  useEffect(() => {
    if (!selectedNodeId) return;

    const timeoutId = setTimeout(() => {
      recalculateSelection();
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [code, svgContent, selectedNodeId, recalculateSelection]);

  // Effect to recalculate selection on container or mermaid-container resize (e.g. dragging panel splitter or window resize)
  useEffect(() => {
    if (!selectedNodeId || !containerRef.current) return;

    const observer = new ResizeObserver(() => {
      recalculateSelection();
    });

    const mermaidContainer = containerRef.current.querySelector('.mermaid-container');
    
    observer.observe(containerRef.current);
    if (mermaidContainer) {
      observer.observe(mermaidContainer);
    }

    return () => {
      observer.disconnect();
    };
  }, [selectedNodeId, containerRef, recalculateSelection, svgContent]);


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
      if (currentNode.classList?.contains('flowchart-link') || currentNode.classList?.contains('flowchart-link-hit-target') || currentNode.classList?.contains('edgeLabel')) {
        foundNodeClass = true;
        nodeId = currentNode.id;
        if (!nodeId) {
            if (currentNode.classList?.contains('edgeLabel')) {
                const dataIdEl = currentNode.querySelector('[data-id]');
                if (dataIdEl) {
                    const rawId = dataIdEl.getAttribute('data-id');
                    if (rawId) {
                        const canonical = normalizeId(rawId);
                        const paths = Array.from(containerRef.current?.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)') || []);
                        const path = paths.find(p => p.id && normalizeId(p.id) === canonical);
                        if (path && path.id) nodeId = path.id;
                    }
                }
            } else {
                const path = currentNode.parentElement?.querySelector('path.flowchart-link:not(.flowchart-link-hit-target)') || currentNode.closest('.edgeLabel')?.previousElementSibling;
                if (path && path.id) nodeId = path.id;
            }
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
        const cleanId = nodeId ? (nodeId.startsWith('SEQ_') ? nodeId : normalizeId(nodeId)) : null;

        // If it's an edge and we clicked the path itself, check if there is an .edgeLabel in the container for this edge.
        // If so, snap the currentNode to that label so that our selection/text boxes align perfectly on the label text.
        if (cleanId && isEdgeId(cleanId) && (currentNode.classList?.contains('flowchart-link') || currentNode.classList?.contains('flowchart-link-hit-target'))) {
            const edgeLabels = Array.from(containerRef.current.querySelectorAll('.edgeLabel'));
            const matchingLabel = edgeLabels.find(labelEl => {
                const dIdEl = labelEl.querySelector('[data-id]');
                const hasText = labelEl.textContent?.trim() !== '';
                return hasText && dIdEl && dIdEl.getAttribute('data-id') && normalizeId(dIdEl.getAttribute('data-id')!) === cleanId;
            });
            if (matchingLabel) {
                currentNode = matchingLabel as SVGElement;
            }
        }

        if (cleanId && isEdgeId(cleanId) && currentNode.classList?.contains('edgeLabel') && !currentNode.id) {
            currentNode.id = `edge-label-${cleanId}`;
        }

        if (cleanId && cleanId.startsWith('SEQ_') && !currentNode.id) {
            currentNode.id = `seq-element-${cleanId.replace('SEQ_', '').replace(/[^a-zA-Z0-9_]/g, '')}`;
        }

        let pathElementToMeasure = currentNode;
        if (currentNode.classList?.contains('flowchart-link-hit-target')) {
            const next = currentNode.nextElementSibling;
            const prev = currentNode.previousElementSibling;
            if (next && (next.classList?.contains('flowchart-link') || next.classList?.contains('path'))) {
                pathElementToMeasure = next as SVGElement;
            } else if (prev && (prev.classList?.contains('flowchart-link') || prev.classList?.contains('path'))) {
                pathElementToMeasure = prev as SVGElement;
            } else if (containerRef.current && cleanId) {
                const paths = Array.from(containerRef.current.querySelectorAll('path.flowchart-link:not(.flowchart-link-hit-target)'));
                for (const p of paths) {
                    if (p.id && normalizeId(p.id) === cleanId) {
                        pathElementToMeasure = p as SVGElement;
                        break;
                    }
                }
            }
        }

        const rawSvgId = currentNode.id;
        const rect = pathElementToMeasure.getBoundingClientRect();
        const containerRect = containerRef.current.getBoundingClientRect();
        const scale = containerRect.width / containerRef.current.offsetWidth;
        
        let elementToMeasure = pathElementToMeasure;
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
        
        return { cleanId, rawSvgId, newSelectionBox, newTextBox };
    }
    return null;
  }, [containerRef, normalizeId]);

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
    } else if (isEdgeId(targetNodeId)) {
        const { src, dst, occurrenceIndex } = parseEdgeId(targetNodeId);
        if (src && dst) {
            const lines = code.split('\n');
            let currentOccurrence = 0;
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
                    continue;
                }
                const linkLineRegex = new RegExp(`(^|\\s*)${src}\\b[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)\\b${dst}\\b`, 'i');
                const match = line.match(linkLineRegex);
                if (match) {
                    if (currentOccurrence === occurrenceIndex) {
                        const middlePart = match[2];
                        const barMatch = middlePart.match(/\|([^|]*)\|/);
                        const quoteMatch = middlePart.match(/"([^"]*)"/);
                        if (quoteMatch) {
                            currentText = quoteMatch[1];
                        } else if (barMatch) {
                            currentText = barMatch[1];
                        } else {
                            currentText = '';
                        }
                        break;
                    }
                    currentOccurrence++;
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
    if (isInlineEditing) return;

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
  }, [isLocked, getClickedNode, handleEditClick, isInlineEditing]);

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

  // Synchronized hover highlighting for edge paths and their labels
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getCanonicalEdgeId = (el: HTMLElement | SVGElement | null): string | null => {
      if (!el) return null;
      
      // 1. If it has class edgeLabel or is inside one, find the data-id
      const labelEl = el.closest('.edgeLabel');
      if (labelEl) {
        const dataIdEl = labelEl.querySelector('[data-id]');
        if (dataIdEl) {
          const rawId = dataIdEl.getAttribute('data-id');
          if (rawId) return normalizeId(rawId);
        }
      }

      // 2. If it's a path or flowchart-link or hit target
      let current: SVGElement | null = el as SVGElement;
      while (current && current.tagName !== 'svg') {
        if (current.id) {
          const cleanId = normalizeId(current.id);
          if (isEdgeId(cleanId)) {
            return cleanId;
          }
        }
        current = current.parentElement as SVGElement | null;
      }
      return null;
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const canonicalEdgeId = getCanonicalEdgeId(target);

      if (canonicalEdgeId) {
        // Clear any existing hover highlights first to prevent stale highlights
        container.querySelectorAll('.edge-hover-highlight').forEach(el => {
          el.classList.remove('edge-hover-highlight');
        });

        // Highlight matched visible paths
        const allPaths = container.querySelectorAll('path.flowchart-link, path.path');
        allPaths.forEach((path: any) => {
          if (path.id && normalizeId(path.id) === canonicalEdgeId && !path.classList.contains('flowchart-link-hit-target')) {
            path.classList.add('edge-hover-highlight');
          }
        });

        // Highlight matched labels
        const allLabels = container.querySelectorAll('.edgeLabel');
        allLabels.forEach((label: any) => {
          const dataIdEl = label.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId && normalizeId(rawId) === canonicalEdgeId) {
              label.classList.add('edge-hover-highlight');
            }
          }
        });
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;

      const relatedTarget = e.relatedTarget as HTMLElement;
      
      const currentCanonicalId = getCanonicalEdgeId(target);
      const relatedCanonicalId = getCanonicalEdgeId(relatedTarget);

      // If we are moving within the same edge, don't clear highlights
      if (currentCanonicalId && currentCanonicalId === relatedCanonicalId) {
        return;
      }

      // Otherwise, clear highlights
      container.querySelectorAll('.edge-hover-highlight').forEach(el => {
        el.classList.remove('edge-hover-highlight');
      });

      // If we moved to another edge, highlight it
      if (relatedCanonicalId) {
        const allPaths = container.querySelectorAll('path.flowchart-link, path.path');
        allPaths.forEach((path: any) => {
          if (path.id && normalizeId(path.id) === relatedCanonicalId && !path.classList.contains('flowchart-link-hit-target')) {
            path.classList.add('edge-hover-highlight');
          }
        });

        const allLabels = container.querySelectorAll('.edgeLabel');
        allLabels.forEach((label: any) => {
          const dataIdEl = label.querySelector('[data-id]');
          if (dataIdEl) {
            const rawId = dataIdEl.getAttribute('data-id');
            if (rawId && normalizeId(rawId) === relatedCanonicalId) {
              label.classList.add('edge-hover-highlight');
            }
          }
        });
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    container.addEventListener('mouseout', handleMouseOut);

    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
      container.removeEventListener('mouseout', handleMouseOut);
    };
  }, [containerRef, svgContent, normalizeId]);

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
