/**
 * Pill geometry for the phone drawer tab bar — pure, no DOM.
 *
 * The bar is a constant-width row: collapsed slots are icon-only, and the
 * single expanded slot absorbs whatever is left over. During a swipe the
 * expansion budget is *shared* between the outgoing and incoming slot in
 * proportion to gesture progress, which is what produces the interpolated
 * pill (outgoing still wide, incoming already half-open) instead of a snap.
 *
 * Consumers must realise `width` through transforms — the navbar renders the
 * capsule as a 3-slice whose caps translate and whose flat middle scales —
 * never by animating the real `width` property (layout thrash on iOS WebKit)
 * and never by `scaleX` on a rounded box (squashed corners, stretched icons).
 */

export interface SlotGeometry {
  /** px offset of this slot's left edge from the bar's content-box left. */
  x: number;
  /** px width of this slot's capsule. */
  width: number;
  /** 0..1 opacity for the label layer — tracks expansion share. */
  labelOpacity: number;
}

export interface PillLayoutInput {
  slotCount: number;
  activeIndex: number;
  /** -1..1. Positive drags toward the next slot, negative toward the previous. */
  progress: number;
  /**
   * Index the gesture is heading toward. Defaults to the adjacent slot in the
   * progress direction; a caller passes it explicitly to land the pill on a
   * non-adjacent slot instead.
   */
  targetIndex?: number;
  /** px available inside the bar's content box. */
  barWidth: number;
  /** px width of a collapsed, icon-only slot. */
  iconWidth: number;
  /** px gap between adjacent slots. */
  gap: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function layoutPills(input: PillLayoutInput): SlotGeometry[] {
  const { slotCount, activeIndex, barWidth, iconWidth, gap } = input;
  if (slotCount <= 0) return [];

  const progress = clamp(input.progress, -1, 1);
  const impliedTarget = progress > 0 ? activeIndex + 1 : activeIndex - 1;
  const targetIndex = input.targetIndex ?? impliedTarget;
  // No destination → the pill stays at rest while the content rubber-bands.
  const hasTarget =
    targetIndex >= 0 && targetIndex < slotCount && targetIndex !== activeIndex;
  const share = hasTarget ? Math.abs(progress) : 0;

  const collapsedTotal = slotCount * iconWidth + (slotCount - 1) * gap;
  const budget = Math.max(0, barWidth - collapsedTotal);

  const pills: SlotGeometry[] = [];
  let x = 0;
  for (let i = 0; i < slotCount; i++) {
    let expansion = 0;
    if (i === activeIndex) expansion = 1 - share;
    else if (hasTarget && i === targetIndex) expansion = share;

    const width = iconWidth + budget * expansion;
    pills.push({ x, width, labelOpacity: expansion });
    x += width + gap;
  }
  return pills;
}
