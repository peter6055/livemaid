export interface SequenceMessageAnchorSignature {
  sender: string;
  receiver: string;
  operator: string;
  label: string;
  occurrence: number;
}

const SEQUENCE_MESSAGE_RE =
  /^(\S+?)\s*(<<-->>|<<->>|-->>|--x|--\)|-->|->>|-x|-\)|->)\s*(\S+)\s*:(.*)$/;

export function parseSequenceMessageLine(line: string) {
  const match = line.trim().match(SEQUENCE_MESSAGE_RE);
  if (!match) return null;
  return {
    sender: match[1],
    operator: match[2],
    receiver: match[3],
    label: match[4].trim(),
  };
}

export function normalizeSequenceMessageLabel(label: string) {
  return label.replace(/<br\s*\/?>/gi, "\n").trim();
}

export function buildSequenceMessageAnchor(
  entries: Array<{ index: number; line: string }>,
  messageIndex: number,
): SequenceMessageAnchorSignature | null {
  const entry = entries[messageIndex];
  if (!entry) return null;
  const parsed = parseSequenceMessageLine(entry.line);
  if (!parsed) return null;

  const normalizedLabel = normalizeSequenceMessageLabel(parsed.label);
  let occurrence = 0;
  for (let i = 0; i < messageIndex; i += 1) {
    const previous = parseSequenceMessageLine(entries[i]?.line ?? "");
    if (
      previous &&
      previous.sender === parsed.sender &&
      previous.receiver === parsed.receiver &&
      previous.operator === parsed.operator &&
      normalizeSequenceMessageLabel(previous.label) === normalizedLabel
    ) {
      occurrence += 1;
    }
  }

  return {
    sender: parsed.sender,
    receiver: parsed.receiver,
    operator: parsed.operator,
    label: normalizedLabel,
    occurrence,
  };
}

export function findSequenceMessageIndexByAnchor(
  entries: Array<{ index: number; line: string }>,
  anchor: SequenceMessageAnchorSignature,
): number {
  let occurrence = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const parsed = parseSequenceMessageLine(entries[i].line);
    if (
      parsed &&
      parsed.sender === anchor.sender &&
      parsed.receiver === anchor.receiver &&
      parsed.operator === anchor.operator &&
      normalizeSequenceMessageLabel(parsed.label) === anchor.label
    ) {
      if (occurrence === anchor.occurrence) return i;
      occurrence += 1;
    }
  }
  return -1;
}
