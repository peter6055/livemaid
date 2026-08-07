/**
 * Shared DOM formatting helpers used by InlineTextEditor and LiveMaidEditor.
 * Extracted to avoid duplication and ensure consistent behavior.
 */

export function isFormatTag(node: Node, format: "bold" | "italic"): boolean {
  if (!(node instanceof HTMLElement)) return false;
  const tag = node.tagName.toLowerCase();
  return format === "bold" ? tag === "b" || tag === "strong" : tag === "i" || tag === "em";
}

export function getTextNodesInRange(range: Range, el: HTMLElement): Text[] {
  if (range.collapsed) {
    const textNodes: Text[] = [];
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node as Text);
    } else if (node instanceof HTMLElement && node === el) {
      const child = node.childNodes[range.startOffset];
      if (child && child.nodeType === Node.TEXT_NODE) {
        textNodes.push(child as Text);
      } else {
        const prev = node.childNodes[range.startOffset - 1];
        if (prev && prev.nodeType === Node.TEXT_NODE) textNodes.push(prev as Text);
      }
    }
    return textNodes.filter((n) => n.textContent?.trim());
  }

  const textNodes: Text[] = [];
  const iterator = document.createNodeIterator(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = iterator.nextNode())) {
    if (range.intersectsNode(node) && node.textContent?.trim()) {
      textNodes.push(node as Text);
    }
  }
  return textNodes;
}

export function isAllContentFormatted(el: HTMLElement, format: "bold" | "italic"): boolean {
  const textNodes: Text[] = [];
  const collect = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
        textNodes.push(child as Text);
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        collect(child);
      }
    });
  };
  collect(el);
  if (textNodes.length === 0) return false;
  return textNodes.every((textNode) => {
    let node: Node | null = textNode.parentNode;
    while (node && node !== el) {
      if (isFormatTag(node, format)) return true;
      node = node.parentNode;
    }
    return false;
  });
}

export function coversAllContent(el: HTMLElement, range: Range): boolean {
  return (
    range.startContainer === el &&
    range.startOffset === 0 &&
    range.endContainer === el &&
    range.endOffset === el.childNodes.length
  );
}

export function getTextNodes(node: Node): Text[] {
  const nodes: Text[] = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      nodes.push(child as Text);
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      nodes.push(...getTextNodes(child));
    }
  });
  return nodes;
}

export function isRangeFormatted(
  el: HTMLElement,
  range: Range,
  fmt: "bold" | "italic",
): boolean {
  const textNodes = getTextNodesInRange(range, el);
  if (textNodes.length === 0) return isAllContentFormatted(el, fmt);
  return textNodes.every((textNode) => {
    let node: Node | null = textNode.parentNode;
    while (node && node !== el) {
      if (isFormatTag(node, fmt)) return true;
      node = node.parentNode;
    }
    return false;
  });
}
