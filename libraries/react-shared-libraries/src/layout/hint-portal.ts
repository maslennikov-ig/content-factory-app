/**
 * «Inside» for outside-press handlers, portalled hints included.
 *
 * `Hint` renders its bubble into `document.body` (`97dq.76`, `DESIGN.md`
 * «layers render through a portal»), so the bubble is no longer a DOM
 * descendant of the popover or menu that holds the hint. A handler asking
 * `holder.contains(event.target)` saw a press on the bubble as a press outside
 * and closed — the «План впереди» popover shut when its own legend was tapped
 * (fourteenth walk review, P3-4).
 *
 * The bubble carries `data-hint-portal` with the hint's id and the hint's
 * anchor carries `data-hint-anchor` with the same id, so a press on a bubble
 * counts as inside exactly the holders that contain its anchor, and still as
 * outside for everything else.
 */
export const HINT_PORTAL_ATTRIBUTE = 'data-hint-portal';
export const HINT_ANCHOR_ATTRIBUTE = 'data-hint-anchor';

export function containsIncludingHints(
  holder: Element | null | undefined,
  target: EventTarget | null | undefined
): boolean {
  if (!holder || !target) return false;
  const node = target as Node;
  if (typeof node.nodeType !== 'number') return false;
  if (holder.contains(node)) return true;
  const element =
    node.nodeType === 1 ? (node as Element) : node.parentElement ?? null;
  const bubble = element?.closest(`[${HINT_PORTAL_ATTRIBUTE}]`);
  const id = bubble?.getAttribute(HINT_PORTAL_ATTRIBUTE);
  if (!id) return false;
  return Array.from(
    holder.querySelectorAll(`[${HINT_ANCHOR_ATTRIBUTE}]`)
  ).some((anchor) => anchor.getAttribute(HINT_ANCHOR_ATTRIBUTE) === id);
}
