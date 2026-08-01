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
 * real predicates come from `obsidian-internals.ts`.
 */
export interface ResolvedSlot {
  slot: PhoneChromeSlot;
  /** The slot's target exists, so tapping it does something. */
  enabled: boolean;
  /**
   * The pager can slide into this slot. True only for view-backed slots:
   * a command slot has no leaf to reveal (running `daily-notes` opens a
   * markdown leaf, which is by definition not hub level), so it is a
   * tap-only action and the pager rubber-bands instead.
   */
  pageable: boolean;
}

export function resolveSlots(
  slots: readonly PhoneChromeSlot[],
  hasViewType: (type: string) => boolean,
  hasCommand: (id: string) => boolean,
): ResolvedSlot[] {
  return slots.map((slot) => {
    const enabled = slot.viewType
      ? hasViewType(slot.viewType)
      : slot.commandId
        ? hasCommand(slot.commandId)
        : false;
    return { slot, enabled, pageable: enabled && Boolean(slot.viewType) };
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
