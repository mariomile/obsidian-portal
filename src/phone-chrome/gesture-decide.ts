/**
 * Gesture arbitration for the phone drawer tab bar's swipe — pure, no DOM.
 * `drawer-tabs.ts` wires these into its own `touchstart`/`touchmove`/
 * `touchend` listeners on the drawer host; this module carries no listener
 * or edge logic of its own, only the two decisions below.
 *
 * Three decisions at three moments:
 *
 * - `isInCloseGutter` runs on `touchstart`, before anything is tracked: a
 *   touch that starts in the gutter is not ours at all.
 * - `decideClaim` runs on early `touchmove`. Once it answers `claim` or
 *   `ignore` the caller stops asking for the rest of that touch: a direction
 *   lock taken once is what keeps vertical scrolling smooth. `pending` means
 *   the finger has not travelled far enough to tell yet.
 * - `decideSnap` runs on `touchend` and says which tab the drawer lands on.
 */

export type ClaimDecision = 'pending' | 'claim' | 'ignore';
export type SnapDecision = 'next' | 'prev' | 'back';

/**
 * Width of the strip along the drawer's inner edge that stays Obsidian's.
 *
 * A tap target's worth, not a hairline: the gutter is invisible, so the thumb
 * aims at it from memory and a strip narrower than a finger is one the user
 * has to be lucky to hit. On a 402pt phone this is ~12% of the width, all of
 * it list padding rather than content.
 */
export const CLOSE_GUTTER_PX = 48;

/**
 * Is this touch starting in the strip that must keep Obsidian's own
 * swipe-to-close?
 *
 * A phone drawer is full-width, so it has no backdrop to tap — the escape
 * hatch the tab-swipe was designed around does not exist there. This strip is
 * that backdrop, rendered as a column instead of an area: it sits on the
 * drawer's *inner* edge (right edge for the left drawer, mirrored for the
 * right) so the finger starts where the backdrop would be and drags across the
 * full width to close. The outer edge would give a stunted run and collide
 * with the system's own edge gesture.
 *
 * @param localX Touch x relative to the host's left edge, px.
 * @param hostWidth Host width, px.
 */
export function isInCloseGutter(
  localX: number,
  hostWidth: number,
  side: 'left' | 'right',
  gutter: number = CLOSE_GUTTER_PX,
): boolean {
  // A host with no box cannot have a meaningful gutter, and treating one as
  // all-gutter would hand every touch away while the drawer is unlaid-out.
  if (hostWidth <= 0) return false;
  return side === 'left' ? localX >= hostWidth - gutter : localX <= gutter;
}

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
