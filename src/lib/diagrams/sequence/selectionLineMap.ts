/**
 * Find the declaration line of a sequence participant/actor by id, e.g.
 * `participant Alice`, `actor Bob as Robert`. Returns -1 if the participant is
 * implicit (never explicitly declared).
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findSequenceParticipantLine(code: string, actorId: string): number {
  if (!actorId) return -1;
  const esc = escapeRegExp(actorId);
  const declRe = new RegExp(
    `^(?:participant|actor|boundary|control|entity|database|collections|queue)\\s+${esc}(?:\\s|@|$)`,
    "i",
  );
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    if (declRe.test(lines[i].trim())) return i;
  }
  return -1;
}
