const SENSITIVE_RULES = [
  { pattern: /https?:\/\/[^\s"')\]]{8,}/g, replacement: "[url]" },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, replacement: "[email]" },
  {
    pattern:
      /(?:sk[_-]|pk[_-]|api[_-]?key|token|secret|password|credential|auth)[\s:=]+['"]?[a-zA-Z0-9_\-=/+]{8,}['"]?/gi,
    replacement: "[credential]",
  },
  {
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s"')\]]+/g,
    replacement: "[connection-string]",
  },
  { pattern: /(?:bearer|basic|digest)\s+[a-zA-Z0-9_\-=.]{16,}/gi, replacement: "[auth-token]" },
];

const SENSITIVE_KEY_PATTERNS =
  /^(?:code|source|content|diagram|mermaid|text|body|data|svg|html|raw)$/i;

const MAX_STRING_LENGTH = 500;

export function sanitizeString(value: string): string {
  let result = value;
  if (result.length > MAX_STRING_LENGTH) {
    result = result.slice(0, MAX_STRING_LENGTH) + "... [truncated]";
  }
  for (const { pattern, replacement } of SENSITIVE_RULES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === "string") {
      if (SENSITIVE_KEY_PATTERNS.test(key)) {
        sanitized[key] = `[sanitized]`;
      } else {
        sanitized[key] = sanitizeString(value);
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (value === null || value === undefined) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value
        .slice(0, 10)
        .map((v) => (typeof v === "string" ? sanitizeString(v) : v));
    } else {
      sanitized[key] = "[complex]";
    }
  }
  return sanitized;
}
