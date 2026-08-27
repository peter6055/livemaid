import { parseSequenceMessageLine } from "@/lib/diagrams/sequence/commentAnchor";
import { getSequenceParticipantEntries } from "@/lib/diagrams/sequence/mutations";

/**
 * Resolve the rendered Mermaid top-shape element (participant box, actor stick
 * figure, database cylinder, ...) for a sequence participant node id
 * (`SEQ_ACTOR_<id>`).
 *
 * Mermaid renders sequence participants WITHOUT usable element ids, so mapping
 * relies on layout: lifelines are placed left-to-right in order of first
 * appearance across participant declarations and message endpoints (implicit
 * participants are created at first mention), and every participant
 * contributes exactly one `.actor-top` shape centered above its lifeline.
 *
 * Returns null when the id never appears in the code or the DOM does not
 * contain the expected geometry.
 */
export function getSequenceLifelineOrder(code: string): string[] {
  const entries = getSequenceParticipantEntries(code);
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (id: string) => {
    if (!seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  };
  let nextEntry = 0;
  for (const rawLine of code.split("\n")) {
    const line = rawLine.trim();
    const parsed = parseSequenceMessageLine(line);
    if (parsed) {
      add(parsed.sender);
      add(parsed.receiver);
      continue;
    }
    if (
      nextEntry < entries.length &&
      /^(?:participant|actor|boundary|control|entity|database|collections|queue)\s/i.test(line)
    ) {
      add(entries[nextEntry].id);
      nextEntry += 1;
    }
  }
  return order;
}

export function findSequenceActorElement(
  container: HTMLElement,
  code: string,
  shapeId: string,
): Element | null {
  if (!shapeId.startsWith("SEQ_ACTOR_")) return null;
  const actorId = shapeId.slice("SEQ_ACTOR_".length);
  if (!actorId) return null;

  const lifelineIndex = getSequenceLifelineOrder(code).indexOf(actorId);
  if (lifelineIndex < 0) return null;

  const lifelineEls = Array.from(container.querySelectorAll("line.actor-line"));
  const topShapeEls = Array.from(container.querySelectorAll(".actor-top")) as SVGElement[];
  if (lifelineEls.length === 0 || topShapeEls.length === 0) return null;

  const lifelineCenters = lifelineEls
    .map((el) => {
      const rect = el.getBoundingClientRect();
      return rect.left + rect.width / 2;
    })
    .sort((a, b) => a - b);
  if (lifelineIndex >= lifelineCenters.length) return null;

  const targetX = lifelineCenters[lifelineIndex];

  let best: SVGElement | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const el of topShapeEls) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const distance = Math.abs(rect.left + rect.width / 2 - targetX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = el;
    }
  }
  return best;
}
