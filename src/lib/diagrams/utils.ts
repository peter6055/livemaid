export const CONNECTOR_PATTERN =
  "<==>|<-->|x==x|o==o|x-\\\\.-x|x-.-x|o-\\\\.-o|o-.-o|x--x|o--o|x-\\\\.x|x-.x|o-\\\\.o|o-.o|<-\\\\.->|<-.->|-\\\\.->|-.->|-->|==>|==x|==o|-.-x|-.-o|--x|--o|-\\\\.x|-.x|-\\\\.o|-.o|---|===|-\\\\.-|-.-|~~~";
export const CONNECTOR_REGEX = new RegExp(CONNECTOR_PATTERN);

export function updateMermaidTheme(code: string, newTheme: string): string {
  const regex = /^---\r?\n\s*config:\s*\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n/m;
  const match = code.match(regex);
  if (match) {
    let configBlock = match[1];
    if (/theme:\s*(?:'|")[^'"]+(?:'|")/.test(configBlock)) {
      configBlock = configBlock.replace(/theme:\s*(?:'|")[^'"]+(?:'|")/, `theme: '${newTheme}'`);
    } else if (/theme:\s*[^\s\n\r]+/.test(configBlock)) {
      configBlock = configBlock.replace(/theme:\s*[^\s\n\r]+/, `theme: ${newTheme}`);
    } else {
      configBlock = configBlock.trimEnd();
      configBlock += (configBlock ? "\n" : "") + `  theme: ${newTheme}`;
    }
    return code.replace(match[0], `---\nconfig:\n${configBlock}\n---\n`);
  } else {
    return `---\nconfig:\n  theme: ${newTheme}\n---\n` + code;
  }
}

export function determineDiagramType(sourceCode: string): string {
  const lines = sourceCode.split("\n");
  let inConfig = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "---") {
      inConfig = !inConfig;
      continue;
    }
    if (inConfig || trimmed.startsWith("%%") || trimmed === "") continue;

    if (trimmed.startsWith("flowchart") || trimmed.startsWith("graph")) return "flowchart";
    if (trimmed.startsWith("sequenceDiagram")) return "sequence";

    const match = trimmed.match(/^([a-zA-Z]+)/);
    if (match) return match[1];
  }
  return "flowchart";
}

export function updateMermaidConfigProperty(code: string, property: string, value: string): string {
  const regex = /^---\r?\n\s*config:\s*\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n/m;
  const match = code.match(regex);
  if (match) {
    let configBlock = match[1];
    const propRegex = new RegExp(`${property}:\\s*(?:'|")?[^'"\\n\\r]+(?:'|")?`);
    if (propRegex.test(configBlock)) {
      configBlock = configBlock.replace(propRegex, `${property}: ${value}`);
    } else {
      configBlock = configBlock.trimEnd();
      configBlock += (configBlock ? "\n" : "") + `  ${property}: ${value}`;
    }
    return code.replace(match[0], `---\nconfig:\n${configBlock}\n---\n`);
  } else {
    return `---\nconfig:\n  ${property}: ${value}\n---\n` + code;
  }
}

export function updateMermaidFontFamily(code: string, fontString: string): string {
  const regex = /^---\r?\n\s*config:\s*\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n/m;
  const match = code.match(regex);
  if (match) {
    let configBlock = match[1];

    // Update top-level fontFamily
    const fontRegex = /(^|\n)  fontFamily:\s*[^\n\r]+/;
    if (fontRegex.test(configBlock)) {
      configBlock = configBlock.replace(fontRegex, `$1  fontFamily: '${fontString}'`);
    } else {
      configBlock = configBlock.trimEnd();
      configBlock += (configBlock ? "\n" : "") + `  fontFamily: '${fontString}'`;
    }

    // Update themeVariables: fontFamily
    const themeVarsRegex = /(^|\n)  themeVariables:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
    const themeVarsMatch = configBlock.match(themeVarsRegex);

    if (themeVarsMatch) {
      let varsBlock = themeVarsMatch[2];
      if (/\n    fontFamily:\s*[^\n\r]+/.test(varsBlock)) {
        varsBlock = varsBlock.replace(
          /\n    fontFamily:\s*[^\n\r]+/,
          `\n    fontFamily: '${fontString}'`,
        );
      } else {
        varsBlock = varsBlock.replace(/\n*$/, `\n    fontFamily: '${fontString}'\n`);
      }
      configBlock = configBlock.replace(themeVarsRegex, `$1  themeVariables:${varsBlock}`);
    } else {
      configBlock = configBlock.trimEnd();
      configBlock +=
        (configBlock ? "\n" : "") + `  themeVariables:\n    fontFamily: '${fontString}'`;
    }

    return code.replace(match[0], `---\nconfig:\n${configBlock}\n---\n`);
  } else {
    return (
      `---\nconfig:\n  fontFamily: '${fontString}'\n  themeVariables:\n    fontFamily: '${fontString}'\n---\n` +
      code
    );
  }
}

export function isEdgeId(id: string | null): boolean {
  return (
    !!id &&
    (id.startsWith("L_") || id.startsWith("L-") || id.startsWith("e_") || id.startsWith("e-"))
  );
}

export function parseEdgeId(id: string) {
  const parts = id.split(/[_-]/);
  const rawIndex = parts[3] ? parseInt(parts[3], 10) : 0;
  const occurrenceIndex = !isNaN(rawIndex) ? Math.floor(rawIndex / 2) : 0;
  return {
    src: parts[1] || "",
    dst: parts[2] || "",
    occurrenceIndex,
  };
}

export function parseConnectorStyle(middlePart: string): { stroke: string; arrowType: string } {
  const cleanMiddle = middlePart
    .replace(/"[^"]*"/g, "")
    .replace(/\|[^|]*\|/g, "")
    .replace(/\s+/g, "");

  if (cleanMiddle.includes("~~~")) {
    return { stroke: "none", arrowType: "plain" };
  }

  let stroke = "solid";
  if (cleanMiddle.includes("==")) {
    stroke = "thick";
  } else if (
    cleanMiddle.includes(".-") ||
    cleanMiddle.includes("-.") ||
    cleanMiddle.includes("\\.-") ||
    cleanMiddle.includes("-\\.")
  ) {
    stroke = "dashed";
  }

  let arrowType = "plain";
  const indicators = cleanMiddle.replace(/[-=\.\\~]/g, "");
  if (indicators.includes("<") && indicators.includes(">")) {
    arrowType = "double_arrow";
  } else if (indicators === "xx" || (indicators.startsWith("x") && indicators.endsWith("x"))) {
    arrowType = "double_cross";
  } else if (indicators === "oo" || (indicators.startsWith("o") && indicators.endsWith("o"))) {
    arrowType = "double_circle";
  } else if (indicators.endsWith(">")) {
    arrowType = "arrow";
  } else if (indicators.endsWith("x")) {
    arrowType = "cross";
  } else if (indicators.endsWith("o")) {
    arrowType = "circle";
  } else {
    arrowType = "plain";
  }

  return { stroke, arrowType };
}

export function getConnector(stroke: string, arrowType: string): string {
  if (stroke === "none") return "~~~";

  if (stroke === "dashed") {
    switch (arrowType) {
      case "plain":
        return "-.-";
      case "arrow":
        return "-.->";
      case "double_arrow":
        return "<-.->";
      case "cross":
        return "-.-x";
      case "double_cross":
        return "x-.-x";
      case "circle":
        return "-.-o";
      case "double_circle":
        return "o-.-o";
      default:
        return "-.->";
    }
  }

  if (stroke === "thick") {
    switch (arrowType) {
      case "plain":
        return "===";
      case "arrow":
        return "==>";
      case "double_arrow":
        return "<==>";
      case "cross":
        return "==x";
      case "double_cross":
        return "x==x";
      case "circle":
        return "==o";
      case "double_circle":
        return "o==o";
      default:
        return "==>";
    }
  }

  // solid / default
  switch (arrowType) {
    case "plain":
      return "---";
    case "arrow":
      return "-->";
    case "double_arrow":
      return "<-->";
    case "cross":
      return "--x";
    case "double_cross":
      return "x--x";
    case "circle":
      return "--o";
    case "double_circle":
      return "o--o";
    default:
      return "-->";
  }
}

export function getReconstructedConnector(
  stroke: string,
  arrowType: string,
  label: string,
): string {
  const conn = getConnector(stroke, arrowType);
  if (!label.trim()) return conn;
  return `${conn}|${label.trim()}|`;
}

export function generateEdgeId(src: string, dst: string, occurrenceIndex: number): string {
  const cleanSrc = src.replace(/[^a-zA-Z0-9_-]/g, "");
  const cleanDst = dst.replace(/[^a-zA-Z0-9_-]/g, "");
  return `e_${cleanSrc}_${cleanDst}_${occurrenceIndex}`;
}

export function getLinkIndex(
  code: string,
  src: string,
  dst: string,
  occurrenceIndex: number = 0,
): number {
  const lines = code.split("\n");
  let linkCount = 0;
  let matchingOccurrenceCount = 0;
  let targetIndex = -1;

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }

    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          // Strip labels, quotes, and prepended edge IDs from each part before extracting IDs
          const cleanSrcStr = parts[i]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .replace(/\b[a-zA-Z0-9_-]+@\s*$/, "")
            .trim();
          const cleanDstStr = parts[i + 1]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .trim();

          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || "";
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || "";

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
  occurrenceIndex: number = 0,
): string {
  const lines = code.split("\n");
  let currentOccurrence = 0;

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      return line;
    }

    const linkLineRegex = new RegExp(
      `(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );
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
        const finalArrowType =
          updates.arrowType !== undefined ? updates.arrowType : current.arrowType;
        const finalLabel = updates.label !== undefined ? updates.label : currentLabel;

        const newMiddle = getReconstructedConnector(finalStroke, finalArrowType, finalLabel);

        const startOfMatch = line.indexOf(match[0]);
        const beforeMatch = line.substring(0, startOfMatch);
        const matchStr = match[0];
        const afterMatch = line.substring(startOfMatch + matchStr.length);

        const middleIndex = matchStr.indexOf(middlePart, matchStr.indexOf(src) + src.length);
        const newMatchStr =
          matchStr.substring(0, middleIndex) +
          newMiddle +
          matchStr.substring(middleIndex + middlePart.length);

        return beforeMatch + newMatchStr + afterMatch;
      }
      currentOccurrence++;
    }
    return line;
  });

  return newLines.join("\n");
}

export function updateLinkColor(code: string, linkIndex: number, hexColor: string): string {
  if (linkIndex === -1) return code;

  const lines = code.split("\n");
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  let updated = false;

  const newLines = lines.map((line) => {
    if (styleRegex.test(line)) {
      updated = true;
      const cleanLine = line.trim().replace(/;?\s*$/, "");
      if (cleanLine.includes("stroke:")) {
        return cleanLine.replace(/stroke:\s*[^,;\s]+/, `stroke:${hexColor}`);
      } else {
        return cleanLine + `,stroke:${hexColor}`;
      }
    }
    return line;
  });

  if (!updated) {
    newLines.push(`    linkStyle ${linkIndex} stroke:${hexColor}`);
  }

  return newLines.join("\n");
}

export function parseLinkColor(code: string, linkIndex: number): string | null {
  if (linkIndex === -1) return null;
  const styleRegex = new RegExp(`^\\s*linkStyle\\s+${linkIndex}\\s+.*$`);
  const lines = code.split("\n");
  for (const line of lines) {
    if (styleRegex.test(line)) {
      const match = line.match(/stroke:\s*([^,;\s]+)/);
      if (match) return match[1];
    }
  }
  return null;
}

export function updateMermaidCurve(code: string, curve: string): string {
  const regex = /^---\r?\n\s*config:\s*\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n/m;
  const match = code.match(regex);
  if (match) {
    let configBlock = match[1];
    const flowchartRegex = /(^|\n)  flowchart:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
    const flowchartMatch = configBlock.match(flowchartRegex);

    if (flowchartMatch) {
      let flowchartBlock = flowchartMatch[2];
      const curveRegex = /\n    curve:\s*[^\s\n\r]+/;
      if (curveRegex.test(flowchartBlock)) {
        flowchartBlock = flowchartBlock.replace(curveRegex, `\n    curve: ${curve}`);
      } else {
        flowchartBlock = flowchartBlock.replace(/\n*$/, `\n    curve: ${curve}\n`);
      }
      configBlock = configBlock.replace(flowchartRegex, `$1  flowchart:${flowchartBlock}`);
    } else {
      configBlock = configBlock.trimEnd();
      configBlock += (configBlock ? "\n" : "") + `  flowchart:\n    curve: ${curve}`;
    }

    return code.replace(match[0], `---\nconfig:\n${configBlock}\n---\n`);
  } else {
    return `---\nconfig:\n  flowchart:\n    curve: ${curve}\n---\n` + code;
  }
}

export function parseMermaidCurve(code: string): string {
  const regex = /^---\r?\n\s*config:\s*\r?\n([\s\S]*?)(?:\r?\n)?---\r?\n/m;
  const match = code.match(regex);
  if (match) {
    const configBlock = match[1];
    const flowchartRegex = /(^|\n)  flowchart:([\s\S]*?)(?=\n  [a-zA-Z0-9]+:|$)/;
    const flowchartMatch = configBlock.match(flowchartRegex);
    if (flowchartMatch) {
      const flowchartBlock = flowchartMatch[2];
      const curveMatch = flowchartBlock.match(/\n    curve:\s*([^\s\n\r]+)/);
      if (curveMatch) {
        return curveMatch[1].trim();
      }
    }
  }
  return "step";
}

export function updateLinkAnimation(
  code: string,
  src: string,
  dst: string,
  occurrenceIndex: number,
  animate: boolean,
): string {
  const lines = code.split("\n");
  let currentOccurrence = 0;
  let edgeIdToUse = "";
  let edgeIdFound = false;

  // 1. Process the matched edge line to find/add/remove the edge ID
  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      return line;
    }
    const linkLineRegex = new RegExp(
      `(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );
    const match = line.match(linkLineRegex);
    if (match) {
      if (currentOccurrence === occurrenceIndex) {
        currentOccurrence++;

        // Look for an existing ID in the line
        const idRegex = new RegExp(`\\b([a-zA-Z0-9_-]+)@(?:${CONNECTOR_PATTERN})`);
        const idMatch = line.match(idRegex);

        if (idMatch) {
          edgeIdToUse = idMatch[1];
          edgeIdFound = true;

          if (!animate) {
            // If turning off animation and it is our deterministic ID, remove the ID from the line to keep it clean
            const defaultId = generateEdgeId(src, dst, occurrenceIndex);
            if (edgeIdToUse === defaultId) {
              const startOfMatch = line.indexOf(match[0]);
              const beforeMatch = line.substring(0, startOfMatch);
              const matchStr = match[0];
              const afterMatch = line.substring(startOfMatch + matchStr.length);

              const cleanMatchStr = matchStr.replace(new RegExp(`\\b${defaultId}@`), "");
              return beforeMatch + cleanMatchStr + afterMatch;
            }
          }
          return line;
        } else {
          // No existing edge ID found. If turning on animation, generate one and prepend it to the connector.
          if (animate) {
            const defaultId = generateEdgeId(src, dst, occurrenceIndex);
            edgeIdToUse = defaultId;

            // Special case: the source node carries inline shape metadata on the edge line,
            // e.g. `A2@{ shape: flip-tri, label: "x" } ==>B`. Mermaid cannot parse an edge ID
            // placed after the `}` (it expects `&` or end-of-statement, not a LINK_ID), so the
            // naive `A2@{...} e_A2_B_0@==>B` form throws a parse error and no animation renders.
            // Fix: split the inline shape onto its own node-definition line and put the edge ID
            // after the bare source id — `A2@{...}` + newline + `A2 e_A2_B_0@==>B` — which Mermaid
            // parses and animates correctly. Duplicate node defs are harmless (Mermaid merges them).
            const inlineShapeRegex = new RegExp(`^(\\s*)(${src}@\\{[^}]*\\})\\s*`);
            const shapeMatch = line.match(inlineShapeRegex);
            if (shapeMatch) {
              const indent = shapeMatch[1];
              const shapeDef = shapeMatch[2];
              const rest = line.slice(shapeMatch[0].length);
              return `${indent}${shapeDef}\n${indent}${src} ${defaultId}@${rest}`;
            }

            const middlePart = match[2];
            const newMiddle = `${defaultId}@${middlePart}`;

            const startOfMatch = line.indexOf(match[0]);
            const beforeMatch = line.substring(0, startOfMatch);
            const matchStr = match[0];
            const afterMatch = line.substring(startOfMatch + matchStr.length);

            const middleIndex = matchStr.indexOf(middlePart, matchStr.indexOf(src) + src.length);
            const newMatchStr =
              matchStr.substring(0, middleIndex) +
              newMiddle +
              matchStr.substring(middleIndex + middlePart.length);

            return beforeMatch + newMatchStr + afterMatch;
          }
          return line;
        }
      }
      currentOccurrence++;
    }
    return line;
  });

  // 2. Remove any existing property definition block for this edgeId if found or generated
  const finalCode = newLines.join("\n");
  if (!edgeIdToUse && !edgeIdFound) {
    return finalCode;
  }

  const idToCheck = edgeIdToUse || generateEdgeId(src, dst, occurrenceIndex);
  let cleanedCode = finalCode;
  const propRegex = new RegExp(`^\\s*${idToCheck}\\s*@\\{\\s*[\\s\\S]*?\\s*\\}\\n?`, "gm");
  cleanedCode = cleanedCode.replace(propRegex, "");

  // 3. If animate is true, append the new property block
  if (animate) {
    cleanedCode = cleanedCode.trimEnd() + `\n    ${idToCheck}@{ animate: true }\n`;
  }

  return cleanedCode;
}

export function parseLinkAnimation(
  code: string,
  src: string,
  dst: string,
  occurrenceIndex: number,
): boolean {
  const lines = code.split("\n");
  let currentOccurrence = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    const linkLineRegex = new RegExp(
      `(^|\\s*)${src}(?:\\b|(?=[xoXO]))[^\\n]*?((?:${CONNECTOR_PATTERN})[^\\n]*?)(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );
    if (linkLineRegex.test(line)) {
      if (currentOccurrence === occurrenceIndex) {
        const idRegex = new RegExp(`\\b([a-zA-Z0-9_-]+)@(?:${CONNECTOR_PATTERN})`);
        const idMatch = line.match(idRegex);
        if (idMatch) {
          const edgeId = idMatch[1];
          const propRegex = new RegExp(`^\\s*${edgeId}\\s*@\\{\\s*([\\s\\S]*?)\\s*\\}`, "m");
          const propMatch = code.match(propRegex);
          if (propMatch) {
            const props = propMatch[1];
            return /animate\s*:\s*true/.test(props) || /animation\s*:\s*(?:fast|slow)/.test(props);
          }
        }
        return false;
      }
      currentOccurrence++;
    }
  }
  return false;
}

function extractNodeDefinition(line: string, nodeId: string): string | null {
  const openingBrackets = `\\[\\/|\\[\\\\\\[\\(|\\(|\\{\\{|\\{|\\[\\[|\\[\\(|\\>|\\(\\(\\(|\\(\\(|\\[`;
  const closingBrackets = `\\]|\\)|\\)\\]|\\)\\)\\)|\\)\\)|\\}|\\}\\}|\\/\\]|\\\\\\]|\\]\\]`;
  const defRegex = new RegExp(
    `\\b${nodeId}(?:${openingBrackets})[\\s\\S]*?(?:${closingBrackets})`,
    "i",
  );
  const match = line.match(defRegex);
  return match ? match[0] : null;
}

function hasNodeLabelDefinition(lines: string[], nodeId: string): boolean {
  const openingBrackets = `\\[\\/|\\[\\\\\\[\\(|\\(|\\{\\{|\\{|\\[\\[|\\[\\(|\\>|\\(\\(\\(|\\(\\(|\\[`;
  const defRegex = new RegExp(`\\b${nodeId}(?:${openingBrackets})`, "i");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    if (
      trimmed.startsWith("style ") ||
      trimmed.startsWith("linkStyle ") ||
      trimmed.startsWith("classDef ") ||
      trimmed.startsWith("class ")
    ) {
      continue;
    }
    if (defRegex.test(line)) {
      return true;
    }
  }
  return false;
}

function isNodeIdReferenced(lines: string[], nodeId: string): boolean {
  const nodeRefRegex = new RegExp(`\\b${nodeId}\\b`, "i");
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    if (
      trimmed.startsWith("style ") ||
      trimmed.startsWith("linkStyle ") ||
      trimmed.startsWith("classDef ") ||
      trimmed.startsWith("class ")
    ) {
      continue;
    }
    if (nodeRefRegex.test(line)) {
      return true;
    }
  }
  return false;
}

export function deleteLink(
  code: string,
  src: string,
  dst: string,
  occurrenceIndex: number = 0,
): string {
  const lines = code.split("\n");
  let currentOccurrence = 0;

  // Find the target line and extract definitions
  let targetLine: string | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    const linkLineRegex = new RegExp(
      `^\\s*${src}(?:\\b|(?=[xoXO]))[^\\n]*?(?:${CONNECTOR_PATTERN})[^\\n]*?(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );
    if (linkLineRegex.test(line)) {
      if (currentOccurrence === occurrenceIndex) {
        targetLine = line;
        break;
      }
      currentOccurrence++;
    }
  }

  if (!targetLine) {
    return code;
  }

  // Filter out the deleted link line
  currentOccurrence = 0;
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      return true;
    }
    const linkLineRegex = new RegExp(
      `^\\s*${src}(?:\\b|(?=[xoXO]))[^\\n]*?(?:${CONNECTOR_PATTERN})[^\\n]*?(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );
    if (linkLineRegex.test(line)) {
      if (currentOccurrence === occurrenceIndex) {
        currentOccurrence++;
        return false;
      }
      currentOccurrence++;
    }
    return true;
  });

  // Extract src and dst definitions from targetLine
  const srcDef = extractNodeDefinition(targetLine, src) || src;
  const dstDef = extractNodeDefinition(targetLine, dst) || dst;

  // Determine if we need to preserve them as standalone nodes
  const srcHasLabel = srcDef !== src;
  const dstHasLabel = dstDef !== dst;

  let shouldPreserveSrc = false;
  let shouldPreserveDst = false;

  if (srcHasLabel) {
    shouldPreserveSrc = !hasNodeLabelDefinition(filteredLines, src);
  } else {
    shouldPreserveSrc = !isNodeIdReferenced(filteredLines, src);
  }

  if (dstHasLabel) {
    shouldPreserveDst = !hasNodeLabelDefinition(filteredLines, dst);
  } else {
    shouldPreserveDst = !isNodeIdReferenced(filteredLines, dst);
  }

  // Re-insert definitions with matching indentation at the original position of the deleted line
  const matchIndent = targetLine.match(/^(\s*)/);
  const indent = matchIndent ? matchIndent[1] : "    ";

  const replacements: string[] = [];
  if (shouldPreserveSrc) {
    replacements.push(`${indent}${srcDef}`);
  }
  if (shouldPreserveDst) {
    replacements.push(`${indent}${dstDef}`);
  }

  currentOccurrence = 0;
  const resultLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const isSpecial =
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end");
    const linkLineRegex = new RegExp(
      `^\\s*${src}(?:\\b|(?=[xoXO]))[^\\n]*?(?:${CONNECTOR_PATTERN})[^\\n]*?(?:\\b|(?<=[xoXO]))${dst}\\b`,
      "i",
    );

    if (!isSpecial && linkLineRegex.test(line)) {
      if (currentOccurrence === occurrenceIndex) {
        resultLines.push(...replacements);
        currentOccurrence++;
        continue;
      }
      currentOccurrence++;
    }
    resultLines.push(line);
  }

  return resultLines.join("\n");
}

export function rebuildLinkStyles(oldCode: string, newCode: string): string {
  const oldLines = oldCode.split("\n");
  const oldLinks: { src: string; dst: string }[] = [];

  for (const line of oldLines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          const cleanSrcStr = parts[i]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .replace(/\b[a-zA-Z0-9_-]+@\s*$/, "")
            .trim();
          const cleanDstStr = parts[i + 1]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .trim();
          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || "";
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || "";
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
  const oldLinkKeys = oldLinks.map((link) => {
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

  const newLines = newCode.split("\n");
  const filteredLines = newLines.filter((line) => !linkStyleRegex.test(line));

  const newLinks: { src: string; dst: string }[] = [];
  for (const line of filteredLines) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("%%") ||
      trimmed.startsWith("subgraph") ||
      trimmed.startsWith("end")
    ) {
      continue;
    }
    const hasConnector = CONNECTOR_REGEX.test(trimmed);
    if (hasConnector) {
      const parts = trimmed.split(CONNECTOR_REGEX);
      if (parts.length >= 2) {
        for (let i = 0; i < parts.length - 1; i++) {
          const cleanSrcStr = parts[i]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .replace(/\b[a-zA-Z0-9_-]+@\s*$/, "")
            .trim();
          const cleanDstStr = parts[i + 1]
            .replace(/\|[^|]*\|/g, "")
            .replace(/"[^"]*"/g, "")
            .trim();
          const srcLastWord = cleanSrcStr.split(/\s+/).pop() || "";
          const dstFirstWord = cleanDstStr.split(/\s+/)[0] || "";
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

  return [...filteredLines, ...rebuiltStyleLines].join("\n");
}
