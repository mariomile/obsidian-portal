/**
 * Gesture arbitration for the phone drawer tab bar's swipe — pure, no DOM.
 * `drawer-tabs.ts` wires these into its own `touchstart`/`touchmove`/
 * `touchend` listeners on the drawer host; this module carries no listener
 * or edge logic of its own, only the two decisions below.
 *
 * Two decisions at two moments:
 *
 * - `decideClaim` runs on early `touchmove`. Once it answers `claim` or
 *   `ignore` the caller stops asking for the rest of that touch: a direction
 *   lock taken once is what keeps vertical scrolling smooth. `pending` means
 *   the finger has not travelled far enough to tell yet.
 * - `decideSnap` runs on `touchend` and says which tab the drawer lands on.
 */

export type ClaimDecision = 'pending' | 'claim' | 'ignore';
export type SnapDecision = 'next' | 'prev' | 'back';

/** px of travel before the direction lock is decided. */
const CLAIM_THRESHOLD_PX = 8;
/** Fraction of a page past which the drag commits on its own. */
const COMMIT_PROGRESS = 0.5;
/** Progress-per-ms above which a short drag still commits (a flick). */
const COMMIT_VELOCITY = 0.003;

/**
 * @param dx Signed horizontal travel since touchstart, px.
 * @param dy Signed vertical travel since touchstart, px.
 */
export function decideClaim(
  dx: number,
  dy: number,
  threshold: number = CLAIM_THRESHOLD_PX,
): ClaimDecision {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax < threshold && ay < threshold) return 'pending';
  // Ties go to scrolling: a diagonal drag is far more often a scroll that
  // wobbled than a page turn.
  return ax > ay ? 'claim' : 'ignore';
}

/**
 * @param progress -1..1 of a full page, signed like `PillLayoutInput.progress`.
 * @param velocity Signed progress-per-ms at release (same axis as `progress`).
 */
export function decideSnap(
  progress: number,
  velocity: number,
  activeIndex: number,
  slotCount: number,
): SnapDecision {
  const forward = progress > 0;
  const targetIndex = forward ? activeIndex + 1 : activeIndex - 1;
  if (targetIndex < 0 || targetIndex >= slotCount) return 'back';

  const travelled = Math.abs(progress) >= COMMIT_PROGRESS;
  // A flick only counts when it is thrown the same way the drag went.
  const flicked =
    Math.abs(velocity) >= COMMIT_VELOCITY && Math.sign(velocity) === Math.sign(progress);
  if (!travelled && !flicked) return 'back';

  return forward ? 'next' : 'prev';
}
