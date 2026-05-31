export const CONNECTOR_PATTERN = '<==>|<-->|<-\\\\.->|<-.->|x--x|o--o|x-\\\\.x|x-.x|o-\\\\.o|o-.o|-\\\\.->|-.->|-->|==>|--x|--o|-\\\\.x|-.x|-\\\\.o|-.o|---|===|-\\\\.-|-.-|~~~';
export const CONNECTOR_REGEX = new RegExp(CONNECTOR_PATTERN);

export function updateMermaidTheme(code: string, newTheme: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        if (/theme:\s*(?:'|")[^'"]+(?:'|")/.test(configBlock)) {
            configBlock = configBlock.replace(/theme:\s*(?:'|")[^'"]+(?:'|")/, `theme: '${newTheme}'`);
        } else if (/theme:\s*[^\s\n]+/.test(configBlock)) {
            configBlock = configBlock.replace(/theme:\s*[^\s\n]+/, `theme: ${newTheme}`);
        } else {
            configBlock += `\n  theme: ${newTheme}`;
        }
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  theme: ${newTheme}\n---\n` + code;
    }
}

export function determineDiagramType(sourceCode: string): string {
    const lines = sourceCode.split('\n');
    let inConfig = false;
    for (const line of lines) {
       const trimmed = line.trim();
       if (trimmed === '---') {
          inConfig = !inConfig;
          continue;
       }
       if (inConfig || trimmed.startsWith('%%') || trimmed === '') continue;
       
       if (trimmed.startsWith('flowchart') || trimmed.startsWith('graph')) return 'flowchart';
       if (trimmed.startsWith('sequenceDiagram')) return 'sequence';
       
       const match = trimmed.match(/^([a-zA-Z]+)/);
       if (match) return match[1];
    }
    return 'flowchart';
}

export function updateMermaidConfigProperty(code: string, property: string, value: string): string {
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

export function updateMermaidFontFamily(code: string, fontString: string): string {
    const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
    const match = code.match(regex);
    if (match) {
        let configBlock = match[1];
        
        // Update top-level fontFamily
        const fontRegex = /(^|\n)  fontFamily:\s*[^\n]+/;
        if (fontRegex.test(configBlock)) {
            configBlock = configBlock.replace(fontRegex, `$1  fontFamily: '${fontString}'`);
        } else {
            configBlock += `\n  fontFamily: '${fontString}'`;
        }

        // Update themeVariables: fontFamily
        const themeVarsRegex = /(^|\n)  themeVariables:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
        const themeVarsMatch = configBlock.match(themeVarsRegex);
        
        if (themeVarsMatch) {
            let varsBlock = themeVarsMatch[2];
            if (/\n    fontFamily:\s*[^\n]+/.test(varsBlock)) {
                varsBlock = varsBlock.replace(/\n    fontFamily:\s*[^\n]+/, `\n    fontFamily: '${fontString}'`);
            } else {
                varsBlock = varsBlock.replace(/\n*$/, `\n    fontFamily: '${fontString}'\n`);
            }
            configBlock = configBlock.replace(themeVarsRegex, `$1  themeVariables:${varsBlock}`);
        } else {
            configBlock += `\n  themeVariables:\n    fontFamily: '${fontString}'`;
        }
        
        return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
    } else {
        return `---\nconfig:\n  fontFamily: '${fontString}'\n  themeVariables:\n    fontFamily: '${fontString}'\n---\n` + code;
    }
}

export function isEdgeId(id: string | null): boolean {
  return !!id && (id.startsWith('L_') || id.startsWith('L-'));
}

export function parseEdgeId(id: string) {
  const parts = id.split(/[_-]/);
  const rawIndex = parts[3] ? parseInt(parts[3], 10) : 0;
  const occurrenceIndex = !isNaN(rawIndex) ? Math.floor(rawIndex / 2) : 0;
  return {
    src: parts[1] || '',
    dst: parts[2] || '',
    occurrenceIndex
  };
}

export function parseConnectorStyle(middlePart: string): { stroke: string; arrowType: string } {
  // Strip label quotes or bars
  const cleanMiddle = middlePart.replace(/"[^"]*"/g, '').replace(/\|[^|]*\|/g, '').replace(/\s+/g, '');
  
  let stroke = 'solid';
  let arrowType = 'arrow';
  
  if (cleanMiddle.includes('~~~')) {
    return { stroke: 'none', arrowType: 'plain' };
  }
  
  if (cleanMiddle.includes('==')) {
    stroke = 'thick';
  } else if (cleanMiddle.includes('.-') || cleanMiddle.includes('-.')) {
    stroke = 'dashed';
  }
  
  // Determine arrowType
  if (cleanMiddle.includes('<-->') || cleanMiddle.includes('<-.->') || cleanMiddle.includes('<==>')) {
    arrowType = 'double_arrow';
  } else if (cleanMiddle.includes('x--x') || cleanMiddle.includes('x-.x')) {
    arrowType = 'double_cross';
  } else if (cleanMiddle.includes('o--o') || cleanMiddle.includes('o-.o')) {
    arrowType = 'double_circle';
  } else if (cleanMiddle.endsWith('-->') || cleanMiddle.endsWith('.->') || cleanMiddle.endsWith('==>')) {
    arrowType = 'arrow';
  } else if (cleanMiddle.endsWith('--x') || cleanMiddle.endsWith('-.x')) {
    arrowType = 'cross';
  } else if (cleanMiddle.endsWith('--o') || cleanMiddle.endsWith('-.o')) {
    arrowType = 'circle';
  } else if (cleanMiddle.includes('---') || cleanMiddle.includes('-.-') || cleanMiddle.includes('===')) {
    arrowType = 'plain';
  } else {
    if (cleanMiddle.includes('>') || cleanMiddle.includes('->') || cleanMiddle.includes('=>')) {
      arrowType = 'arrow';
    } else {
      arrowType = 'plain';
    }
  }
  
  return { stroke, arrowType };
}

export function getConnector(stroke: string, arrowType: string): string {
  if (stroke === 'none') return '~~~';
  
  if (stroke === 'dashed') {
    switch (arrowType) {
      case 'plain': return '-.-';
      case 'arrow': return '-.->';
      case 'double_arrow': return '<-.->';
      case 'cross': return '-.x';
      case 'double_cross': return 'x-.x';
      case 'circle': return '-.o';
      case 'double_circle': return 'o-.o';
      default: return '-.->';
    }
  }
  
  if (stroke === 'thick') {
    switch (arrowType) {
      case 'plain': return '===';
      case 'arrow': return '==>';
      case 'double_arrow': return '<==>';
      case 'cross': return '==>';
      case 'double_cross': return '==>';
      case 'circle': return '==>';
      case 'double_circle': return '==>';
      default: return '==>';
    }
  }
  
  // solid / default
  switch (arrowType) {
    case 'plain': return '---';
    case 'arrow': return '-->';
    case 'double_arrow': return '<-->';
    case 'cross': return '--x';
    case 'double_cross': return 'x--x';
    case 'circle': return '--o';
    case 'double_circle': return 'o--o';
    default: return '-->';
  }
}

export function getReconstructedConnector(stroke: string, arrowType: string, label: string): string {
  const conn = getConnector(stroke, arrowType);
  if (!label.trim()) return conn;
  return `${conn}|${label.trim()}|`;
}

export function getLinkIndex(code: string, src: string, dst: string, occurrenceIndex: number = 0): number {
  const lines = code.split('\n');
  let linkCount = 0;
  let matchingOccurrenceCount = 0;
  let targetIndex = -1;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
      continue;
    }
    
    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          // Strip labels and quotes from each part before extracting IDs
          const cleanSrcStr = parts[i].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          const cleanDstStr = parts[i+1].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          
          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || '';
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || '';
          
          const srcMatch = srcLastWord.match(/^([a-zA-Z0-9_-]+)/);
          const dstMatch = dstFirstWord.match(/^([a-zA-Z0-9_-]+)/);
          
          if (srcMatch && dstMatch) {
            const cleanSrc = srcMatch[1];
            const cleanDst = dstMatch[1];
            
            if (cleanSrc === src && cleanDst === dst) {
              if (matchingOccurrenceCount === occurrenceIndex) {
                targetIndex = linkCount;
              }
              matchingOccurrenceCount++;
            }
            linkCount++;
          }
        }
      }
    }
  }
  
  return targetIndex;
}

export function updateLinkStyleAndLabel(
  code: string,
  src: string,
  dst: string,
  updates: { stroke?: string; arrowType?: string; label?: string },
  occurrenceIndex: number = 0
): string {
  const lines = code.split('\n');
  let currentOccurrence = 0;
  
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
      return line;
    }
    
    const linkLineRegex = new RegExp(`(^|\\s*)${src}\\b[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)\\b${dst}\\b`, 'i');
    const match = line.match(linkLineRegex);
    if (match) {
      if (currentOccurrence === occurrenceIndex) {
        currentOccurrence++;
        const middlePart = match[2];
        const current = parseConnectorStyle(middlePart);
        
        let currentLabel = "";
        const quoteMatch = middlePart.match(/"([^"]*)"/);
        if (quoteMatch) {
          currentLabel = quoteMatch[1];
        } else {
          const barMatch = middlePart.match(/\|([^|]*)\|/);
          if (barMatch) {
            currentLabel = barMatch[1];
          }
        }
        
        const finalStroke = updates.stroke !== undefined ? updates.stroke : current.stroke;
        const finalArrowType = updates.arrowType !== undefined ? updates.arrowType : current.arrowType;
        const finalLabel = updates.label !== undefined ? updates.label : currentLabel;
        
        const newMiddle = getReconstructedConnector(finalStroke, finalArrowType, finalLabel);
        
        const startOfMatch = line.indexOf(match[0]);
        const beforeMatch = line.substring(0, startOfMatch);
        const matchStr = match[0];
        const afterMatch = line.substring(startOfMatch + matchStr.length);
        
        const middleIndex = matchStr.indexOf(middlePart, matchStr.indexOf(src) + src.length);
        const newMatchStr = matchStr.substring(0, middleIndex) + newMiddle + matchStr.substring(middleIndex + middlePart.length);
        
        return beforeMatch + newMatchStr + afterMatch;
      }
      currentOccurrence++;
    }
    return line;
  });
  
  return newLines.join('\n');
}

export function updateLinkColor(code: string, linkIndex: number, hexColor: string): string {
  if (linkIndex === -1) return code;
  
  const lines = code.split('\n');
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  let updated = false;
  
  const newLines = lines.map(line => {
    if (styleRegex.test(line)) {
      updated = true;
      if (line.includes('stroke:')) {
        return line.replace(/stroke:\s*[^,;\s]+/, `stroke:${hexColor}`);
      } else {
        return line.trim().replace(/;?\s*$/, '') + `,stroke:${hexColor};`;
      }
    }
    return line;
  });
  
  if (!updated) {
    newLines.push(`    linkStyle ${linkIndex} stroke:${hexColor},stroke-width:2px;`);
  }
  
  return newLines.join('\n');
}

export function parseLinkColor(code: string, linkIndex: number): string | null {
  if (linkIndex === -1) return null;
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  const lines = code.split('\n');
  for (const line of lines) {
    if (styleRegex.test(line)) {
      const match = line.match(/stroke:\s*([^,;\s]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

export function updateMermaidCurve(code: string, curve: string): string {
  const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
  const match = code.match(regex);
  if (match) {
    let configBlock = match[1];
    const flowchartRegex = /(^|\n)  flowchart:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
    const flowchartMatch = configBlock.match(flowchartRegex);
    
    if (flowchartMatch) {
      let flowchartBlock = flowchartMatch[2];
      const curveRegex = /\n    curve:\s*[^\s\n]+/;
      if (curveRegex.test(flowchartBlock)) {
        flowchartBlock = flowchartBlock.replace(curveRegex, `\n    curve: ${curve}`);
      } else {
        flowchartBlock = flowchartBlock.replace(/\n*$/, `\n    curve: ${curve}\n`);
      }
      configBlock = configBlock.replace(flowchartRegex, `$1  flowchart:${flowchartBlock}`);
    } else {
      configBlock += `\n  flowchart:\n    curve: ${curve}`;
    }
    
    return code.replace(regex, `---\nconfig:\n${configBlock}\n---\n`);
  } else {
    return `---\nconfig:\n  flowchart:\n    curve: ${curve}\n---\n` + code;
  }
}

export function parseMermaidCurve(code: string): string {
  const regex = /^---\nconfig:\n([\s\S]*?)\n---\n/m;
  const match = code.match(regex);
  if (match) {
    const configBlock = match[1];
    const flowchartRegex = /(^|\n)  flowchart:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
    const flowchartMatch = configBlock.match(flowchartRegex);
    if (flowchartMatch) {
      const flowchartBlock = flowchartMatch[2];
      const curveMatch = flowchartBlock.match(/\n    curve:\s*([^\s\n]+)/);
      if (curveMatch) {
        return curveMatch[1].trim();
      }
    }
  }
  return 'step';
}

export function updateLinkAnimation(code: string, linkIndex: number, animate: boolean): string {
  if (linkIndex === -1) return code;
  
  const lines = code.split('\n');
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  let updated = false;
  
  const newLines = lines.map(line => {
    if (styleRegex.test(line)) {
      updated = true;
      let lineContent = line.trim();
      
      // Remove stroke-dasharray and animation
      lineContent = lineContent
        .replace(/stroke-dasharray:[^,;\s]+,?/, '')
        .replace(/stroke-dashoffset:[^,;\s]+,?/, '')
        .replace(/animation:[^,;\s]+,?/, '')
        .replace(/,+,/g, ',')
        .replace(/,\s*;/, ';')
        .replace(/:\s*,/, ':')
        .replace(/,\s*$/, '')
        .replace(/;?\s*$/, '');
      
      if (animate) {
        lineContent = lineContent + `,stroke-dasharray:5,stroke-dashoffset:0,animation:mermaid-flow 0.5s linear infinite;`;
      } else {
        lineContent = lineContent + `;`;
      }
      return `    ` + lineContent;
    }
    return line;
  });
  
  if (!updated && animate) {
    newLines.push(`    linkStyle ${linkIndex} stroke-dasharray:5,stroke-dashoffset:0,animation:mermaid-flow 0.5s linear infinite;`);
  }
  
  return newLines.join('\n');
}

export function parseLinkAnimation(code: string, linkIndex: number): boolean {
  if (linkIndex === -1) return false;
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  const lines = code.split('\n');
  for (const line of lines) {
    if (styleRegex.test(line)) {
      return line.includes('animation:');
    }
  }
  return false;
}

export function deleteLink(code: string, src: string, dst: string, occurrenceIndex: number = 0): string {
  const lines = code.split('\n');
  let currentOccurrence = 0;
  
  const filteredLines = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
      return true;
    }
    const linkLineRegex = new RegExp(`^\\s*${src}\\b[^\\n]*?(?:${CONNECTOR_PATTERN})[^\\n]*?\\b${dst}\\b`, 'i');
    if (linkLineRegex.test(line)) {
      if (currentOccurrence === occurrenceIndex) {
        currentOccurrence++;
        return false;
      }
      currentOccurrence++;
    }
    return true;
  });
  
  return filteredLines.join('\n');
}

export function rebuildLinkStyles(oldCode: string, newCode: string): string {
  const oldLines = oldCode.split('\n');
  const oldLinks: { src: string; dst: string }[] = [];
  
  for (const line of oldLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
      continue;
    }
    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          const cleanSrcStr = parts[i].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          const cleanDstStr = parts[i+1].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || '';
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || '';
          const srcMatch = srcLastWord.match(/^([a-zA-Z0-9_-]+)/);
          const dstMatch = dstFirstWord.match(/^([a-zA-Z0-9_-]+)/);
          if (srcMatch && dstMatch) {
            oldLinks.push({ src: srcMatch[1], dst: dstMatch[1] });
          }
        }
      }
    }
  }

  const linkStylesMap = new Map<string, string>();
  const linkStyleRegex = /^\s*linkStyle\s+(\d+)\s+([\s\S]+)$/;
  
  const oldPairCounts = new Map<string, number>();
  const oldLinkKeys = oldLinks.map(link => {
    const pairKey = `${link.src}->${link.dst}`;
    const count = oldPairCounts.get(pairKey) || 0;
    oldPairCounts.set(pairKey, count + 1);
    return `${pairKey}_${count}`;
  });

  for (const line of oldLines) {
    const match = line.match(linkStyleRegex);
    if (match) {
      const index = parseInt(match[1], 10);
      const style = match[2].trim();
      if (index >= 0 && index < oldLinkKeys.length) {
        const key = oldLinkKeys[index];
        linkStylesMap.set(key, style);
      }
    }
  }

  const newLines = newCode.split('\n');
  const filteredLines = newLines.filter(line => !linkStyleRegex.test(line));

  const newLinks: { src: string; dst: string }[] = [];
  for (const line of filteredLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('subgraph') || trimmed.startsWith('end')) {
      continue;
    }
    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          const cleanSrcStr = parts[i].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          const cleanDstStr = parts[i+1].replace(/\|[^|]*\|/g, '').replace(/"[^"]*"/g, '').trim();
          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || '';
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || '';
          const srcMatch = srcLastWord.match(/^([a-zA-Z0-9_-]+)/);
          const dstMatch = dstFirstWord.match(/^([a-zA-Z0-9_-]+)/);
          if (srcMatch && dstMatch) {
            newLinks.push({ src: srcMatch[1], dst: dstMatch[1] });
          }
        }
      }
    }
  }

  const newPairCounts = new Map<string, number>();
  const rebuiltStyleLines: string[] = [];
  newLinks.forEach((link, index) => {
    const pairKey = `${link.src}->${link.dst}`;
    const count = newPairCounts.get(pairKey) || 0;
    newPairCounts.set(pairKey, count + 1);
    
    const key = `${pairKey}_${count}`;
    if (linkStylesMap.has(key)) {
      const style = linkStylesMap.get(key);
      rebuiltStyleLines.push(`    linkStyle ${index} ${style}`);
    }
  });

  return [...filteredLines, ...rebuiltStyleLines].join('\n');
}

