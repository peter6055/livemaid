import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import DOMPurify from "dompurify";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---------------------------------------------------------------------------
// HTML sanitization
//
// The editor accepts HTML inside contentEditable nodes and feeds it back into
// Mermaid labels. Mermaid is configured with `securityLevel: "loose"` and
// `flowchart: { htmlLabels: true }`, so anything that survives into the label
// source is rendered as live HTML in the SVG. DOMPurify is the only robust way
// to strip active/disallowed content (scripts, iframes, event handlers,
// javascript: URLs, …) before the value is stored or re-rendered.
//
// The `dompurify` ESM build auto-binds to `window` when one exists (browser and
// jsdom test environment). In a window-less Node context (unit tests) its
// `.sanitize` is unavailable, so we fall back to a conservative tag stripper
// that keeps the same formatting subset the editor produces.
// ---------------------------------------------------------------------------

let sanitizer: ((html: string) => string) | undefined;

/** Tags the editor may legitimately produce/consume in a label. */
const ALLOWED_TAGS = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "br",
  "span",
  "div",
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "ul",
  "ol",
  "blockquote",
  "code",
  "pre",
  "mark",
  "small",
  "sub",
  "sup",
];

const ALLOWED_TAG_NAMES = new Set(ALLOWED_TAGS);

/**
 * Escapes special regex characters in a string so it can be safely used in
 * `new RegExp(...)` as a literal match.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Sanitizes untrusted HTML so it is safe to store and render as a Mermaid label.
 */
export function sanitizeHtml(html: string): string {
  if (sanitizer === undefined) {
    sanitizer = createSanitizer();
  }
  return sanitizer(html);
}

function createSanitizer(): (html: string) => string {
  // Browser / jsdom: DOMPurify does the real work with an allowlist that keeps
  // the formatting the editor produces while dropping scripts, iframes, event
  // handler attributes, and javascript: URLs.
  if (typeof window !== "undefined" && typeof DOMPurify?.sanitize === "function") {
    const sanitize = DOMPurify.sanitize;
    return (value: string) =>
      constrainStyleAttributes(
        sanitize(value, {
          ALLOWED_TAGS,
          ALLOWED_ATTR: ["style", "class"],
          ALLOW_DATA_ATTR: false,
          // Only the CSS the editor emits is meaningful here; let DOMPurify's
          // default CSS filter (which blocks `url(...)`, `expression(...)`,
          // etc.) apply on top, then we constrain style attributes further to
          // a benign text-align declaration only.
        }),
      );
  }
  return stripDisallowedHtml;
}

/** Matches an HTML opening tag and captures its name + attribute string. */
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g;
/** Matches a `style="..."` or `style='...'` attribute. */
const STYLE_ATTR_RE = /\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Rewrites `style` attributes so they can only contain a benign `text-align`
 * declaration. Drops url()/expression()/javascript: payloads and any other CSS
 * property, so a style attribute can never carry active content.
 */
function constrainStyleAttributes(html: string): string {
  return html.replace(TAG_RE, (full, tagName, attrs, slash) => {
    const name = tagName.toLowerCase();
    const styleMatch = attrs.match(STYLE_ATTR_RE);
    if (!styleMatch) return full;
    const styleValue = (styleMatch[1] ?? styleMatch[2] ?? "").trim();
    if (
      /^[\s;]*text-align\s*:\s*(left|center|right|start|end|justify)\s*;?[\s;]*$/i.test(styleValue)
    ) {
      return `<${name} style="${styleValue}"${slash ? " /" : ""}>`;
    }
    // Strip the dangerous style attribute entirely.
    const withoutStyle = full.replace(/\sstyle\s*=\s*(?:"[^"]*"|'[^']*')/i, "");
    return withoutStyle;
  });
}

/**
 * Conservative fallback for non-DOM environments (unit tests). Keeps the same
 * formatting subset as DOMPurify and drops everything else, including any
 * attribute that could carry active content.
 */
function stripDisallowedHtml(html: string): string {
  // 1. Remove comments (closed and unclosed).
  let value = html.replace(/<!--[\s\S]*?(-->|$)/g, "");

  // 2. Drop dangerous elements entirely, including their content: remove the
  //    whole `<script>…</script>` span first so the payload never survives.
  const dangerousNames = [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "link",
    "meta",
    "base",
    "form",
    "svg",
    "math",
    "template",
  ];
  for (const name of dangerousNames) {
    // Repeated passes handle nesting of the same tag name.
    while (true) {
      const before = value;
      value = value.replace(new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name}\\s*>`, "gi"), "");
      value = value.replace(new RegExp(`<${name}\\b[^>]*\\/?>`, "gi"), "");
      if (value === before) break;
    }
  }

  // 3. Walk every remaining tag. Keep allowlisted tags with only a benign
  //    `text-align` style attribute; drop every other tag and every attribute.
  value = value.replace(TAG_RE, (full, tagName, attrs) => {
    const name = tagName.toLowerCase();
    if (name === "br") return "<br/>";
    if (!ALLOWED_TAG_NAMES.has(name)) return "";
    const styleMatch = attrs.match(STYLE_ATTR_RE);
    if (!styleMatch) return `<${name}>`;
    const styleValue = (styleMatch[1] ?? styleMatch[2] ?? "").trim();
    // Keep only benign text-align declarations; strip url()/expression()/
    // javascript: payloads and any other property.
    if (
      /^[\s;]*text-align\s*:\s*(left|center|right|start|end|justify)\s*;?[\s;]*$/i.test(styleValue)
    ) {
      return `<${name} style="${styleValue}">`;
    }
    return `<${name}>`;
  });

  // 4. Normalize closing tags for allowlisted elements; drop closers for
  //    anything that slipped past step 2.
  value = value.replace(/<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/g, (_full, tagName) =>
    ALLOWED_TAG_NAMES.has(tagName.toLowerCase()) ? `</${tagName.toLowerCase()}>` : "",
  );

  // 5. Collapse whitespace that the stripping steps may have introduced.
  return value.replace(/>\s+</g, "><").trim();
}

/**
 * Extracts plain text from HTML content for inline editing.
 * - Converts block elements (<div>, <p>, <h1>-<h6>, <li>, <blockquote>) to newlines
 * - Converts <br> to newlines
 * - Strips all other HTML tags
 * - Decodes HTML entities
 */
export function htmlToPlainText(html: string): string {
  // Prefer DOM textContent when available — avoids regex sanitization pitfalls
  // (CodeQL incomplete multi-character sanitization on tag-stripping regexes).
  if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = sanitizeHtml(html);
    return (container.textContent ?? "")
      .replace(/\u00a0/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Node/unit-test fallback: sanitize first, then extract text with repeated
  // tag stripping until stable so nested/overlapping patterns cannot reappear.
  let value = sanitizeHtml(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(div|p|h[1-6]|li|blockquote)[^>]*>/gi, "\n");
  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(/<[^>]*>/g, "");
  }
  return value
    .replace(
      /&(amp|lt|gt|quot|#39|nbsp);/g,
      (entity) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'",
          "&nbsp;": " ",
        })[entity] ?? entity,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Checks if a string contains HTML tags.
 */
export function containsHtml(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

/**
 * Normalizes HTML content from contentEditable div for Mermaid compatibility.
 * - Converts <div>, <p>, <h1>-<h6>, <li>, <blockquote> to <br/>
 * - Preserves text-align style attributes
 * - Removes empty tags
 * - Normalizes whitespace
 * - Removes browser-added line wraps at word-boundary characters (/, -, .)
 *
 * The input is sanitized first (see `sanitizeHtml`): Mermaid runs with
 * `securityLevel: "loose"` and `htmlLabels: true`, so any active/disallowed
 * content (scripts, iframes, event handlers, …) must be stripped before the
 * value is stored in the diagram source.
 */
export function normalizeHtmlForMermaid(html: string): string {
  // sanitizeHtml (DOMPurify) is the security boundary. The regexes below are
  // Mermaid formatting only, applied after sanitization, and empty-tag cleanup
  // is repeated until stable so incomplete multi-character sanitization cannot
  // reintroduce previously stripped markup.
  let value = sanitizeHtml(html)
    // Replace opening block elements with their style attribute (if any)
    .replace(/<(div|p|h[1-6]|li|blockquote)([^>]*)>/gi, (_match, _tag, attrs) => {
      // Extract text-align style if present
      const styleMatch = attrs.match(/style\s*=\s*["']([^"']*text-align[^"']*)["']/i);
      if (styleMatch) {
        return `<div style="${styleMatch[1]}">`;
      }
      return "";
    })
    // Convert closing block elements to <br/>
    .replace(/<\/(div|p|h[1-6]|li|blockquote)[^>]*>/gi, "<br/>")
    // Remove <br> that the browser added at word-boundary characters (/, -, .)
    // These are visual line wraps, not intentional line breaks
    .replace(/([/\-.])<br\s*\/?>/gi, "$1")
    .replace(/<br\s*\/?>([/\-.])/gi, "$1")
    // Remove empty <br/> at the start
    .replace(/^(<br\s*\/?>)+/i, "")
    // Remove empty <br/> at the end
    .replace(/(<br\s*\/?>)+$/i, "")
    // Collapse multiple <br/> tags
    .replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>");

  let previous = "";
  while (value !== previous) {
    previous = value;
    value = value.replace(/<(b|i|span|em|strong)[^>]*>\s*<\/\1>/gi, "");
  }
  return value.trim();
}
