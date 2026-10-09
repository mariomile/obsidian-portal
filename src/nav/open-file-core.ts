/**
 * Where a note opened from Portal lands. Pure, so the rule is testable
 * without a workspace.
 *
 * Desktop: a new tab, so a click in the sidebar never replaces the note being
 * read. An empty "New tab" is reused instead of leaving it behind.
 * Phone: the current tab, as before. Tabs there are hidden behind a switcher
 * and would pile up one per tap.
 */
export type OpenTarget = 'current' | 'new-tab';

export function chooseOpenTarget(m: { isPhone: boolean; activeIsEmpty: boolean }): OpenTarget {
  if (m.isPhone || m.activeIsEmpty) return 'current';
  return 'new-tab';
}
