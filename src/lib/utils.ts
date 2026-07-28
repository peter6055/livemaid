import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts plain text from HTML content for inline editing.
 * - Converts block elements (<div>, <p>, <h1>-<h6>, <li>, <blockquote>) to newlines
 * - Converts <br> to newlines
 * - Strips all other HTML tags
 * - Decodes HTML entities
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n") // <br> → newline
    .replace(/<\/?(div|p|h[1-6]|li|blockquote)[^>]*>/gi, "\n") // Block elements → newline
    .replace(/<[^>]+>/g, "") // Strip all other tags
    .replace(/&amp;/g, "&") // Decode entities
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n") // Collapse multiple newlines
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
 */
export function normalizeHtmlForMermaid(html: string): string {
  return (
    html
      // Replace opening block elements with their style attribute (if any)
      .replace(
        /<(div|p|h[1-6]|li|blockquote)([^>]*)>/gi,
        (_match, _tag, attrs) => {
          // Extract text-align style if present
          const styleMatch = attrs.match(/style\s*=\s*["']([^"']*text-align[^"']*)["']/i);
          if (styleMatch) {
            return `<div style="${styleMatch[1]}">`;
          }
          return "";
        },
      )
      // Convert closing block elements to <br/>
      .replace(/<\/(div|p|h[1-6]|li|blockquote)[^>]*>/gi, "<br/>")
      // Remove empty <br/> at the start
      .replace(/^(<br\s*\/?>)+/i, "")
      // Remove empty <br/> at the end
      .replace(/(<br\s*\/?>)+$/i, "")
      // Collapse multiple <br/> tags
      .replace(/(<br\s*\/?>){3,}/gi, "<br/><br/>")
      // Remove empty tags (like <b></b>, <i></i>, <span></span>)
      .replace(/<(b|i|span|em|strong)[^>]*>\s*<\/\1>/gi, "")
      // Trim whitespace
      .trim()
  );
}
