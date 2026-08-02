import type { PhoneChromeSlot } from './slots';

/**
 * Slot resolution: which configured slots are actually usable in this vault.
 *
 * Disabled slots stay in the bar rather than being dropped. Keeping the row
 * stable means the user's muscle memory for slot positions survives
 * installing or removing a plugin, and a greyed slot explains itself where a
 * silently missing one would not.
 *
 * Takes predicates rather than an `App` so the rule is unit-testable; the
 * real predicates come from `obsidian-internals.ts` (and, for
 * `hasReachableLeaf`, a small workspace+DOM helper in hub-level.ts).
 */
export interface ResolvedSlot {
  slot: PhoneChromeSlot;
  /** Tapping this slot does something. For a view slot: the view type is
   *  REGISTERED (its plugin is installed and enabled) — no open leaf is
   *  required, because a tap can now create one on demand (see
   *  `hub-level.ts`'s `onSelect`). For a command slot: the command is
   *  registered; running it is enough on its own. */
  enabled: boolean;
  /**
   * The pager can slide into this slot RIGHT NOW. True only when the slot is
   * enabled, view-backed, AND an open leaf for it is already reachable
   * inside the hub container — a slot that has never been opened is tappable
   * (see `enabled`) but not swipeable until its leaf exists. A command slot
   * has no leaf to reveal (running `daily-notes` opens a markdown leaf,
   * which is by definition not hub level), so it is always tap-only and the
   * pager rubber-bands instead.
   */
  pageable: boolean;
}

export function resolveSlots(
  slots: readonly PhoneChromeSlot[],
  hasViewType: (type: string) => boolean,
  hasCommand: (id: string) => boolean,
  /** Does an open leaf for this view type actually live where the pager can
   *  reach and clean it up (a child of the hub container)? Gates `pageable`
   *  only — an unopened view is still `enabled` (tappable), just not yet
   *  swipeable, since tapping it can create the leaf lazily. Defaults to
   *  always-true so callers/tests that only care about view-type/command
   *  registration are unaffected; the real, workspace-aware predicate is
   *  supplied by hub-level.ts. */
  hasReachableLeaf: (type: string) => boolean = () => true,
): ResolvedSlot[] {
  return slots.map((slot) => {
    const enabled = slot.viewType
      ? hasViewType(slot.viewType)
      : slot.commandId
        ? hasCommand(slot.commandId)
        : false;
    const pageable = slot.viewType ? enabled && hasReachableLeaf(slot.viewType) : false;
    return { slot, enabled, pageable };
  });
}

/** Index of the first usable slot, or -1 when the whole bar is dead. */
export function firstEnabledIndex(resolved: readonly ResolvedSlot[]): number {
  return resolved.findIndex((r) => r.enabled);
}

/** Index of the nearest pageable slot from `from` in `direction`, skipping
 *  disabled and tap-only slots on the way (the spec's "skipped by the
 *  pager"), or -1 when nothing pageable exists that way. */
export function nextPageableIndex(
  resolved: readonly ResolvedSlot[],
  from: number,
  direction: 1 | -1,
): number {
  for (let i = from + direction; i >= 0 && i < resolved.length; i += direction) {
    if (resolved[i]?.pageable) return i;
  }
  return -1;
}
