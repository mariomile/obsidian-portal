import type { NavbarSlot } from './navbar';

/**
 * The pure half of the drawer tab bar: turning a drawer's tabs into pills,
 * deciding when the bar has to be rebuilt, and keeping an index in range.
 *
 * Split out from `drawer-tabs.ts` because that module works against a live
 * workspace and a live DOM, neither of which a unit test can supply. These
 * three decisions are the ones worth pinning.
 */

/** One drawer tab, reduced to what the bar cares about. */
export interface TabInfo {
  /** Icon id from `view.getIcon()`. */
  icon: string;
  /** Display text from `view.getDisplayText()`. */
  label: string;
  /** View type — identity for the signature, since labels change. */
  viewType: string;
}

/** Tabs → pills, in drawer order. Ids are positional: a tab has no id of its
 *  own, and the same view type can appear in both drawers. */
export function tabsToSlots(tabs: readonly TabInfo[]): NavbarSlot[] {
  return tabs.map((tab, index) => ({
    id: `drawer-${index}`,
    icon: tab.icon,
    label: tab.label,
  }));
}

/**
 * Changes exactly when the bar has to be rebuilt: a tab added, removed, or
 * reordered. Deliberately built from view types only — a view that renames
 * itself (Outline showing the current note's title) must not tear down and
 * rebuild the bar while it is being used.
 */
export function tabsSignature(tabs: readonly TabInfo[]): string {
  return tabs.map((tab) => tab.viewType).join('|');
}

/** Keeps an index inside `[0, count)`. Returns 0 for an empty list rather
 *  than -1: callers index into arrays with this, and -1 reads undefined. */
export function clampTabIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, index));
}
