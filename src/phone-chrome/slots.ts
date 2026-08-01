/**
 * Phone-chrome slot model: the hub views the pager moves between.
 *
 * Pure module — no DOM, no Obsidian imports — so the whole config surface is
 * unit-tested off-device. A slot names exactly one target: a registered view
 * type, or a command to run. Resolution against what is actually installed
 * happens in `hub-registry.ts`; here we only validate shape.
 */

/** Below this the bar stops reading as a segmented control. */
export const MIN_SLOTS = 3;
/** Above this the collapsed icons stop being a comfortable touch target. */
export const MAX_SLOTS = 5;

export interface PhoneChromeSlot {
  /** Stable id — settings key and `data-slot` attribute. Unique per set. */
  id: string;
  /** Icon id (Lucide or a registered `hi-*` glyph) shown in the capsule. */
  icon: string;
  /** Label rendered only while this slot is the active one. */
  label: string;
  /** View type to page to. Mutually exclusive with `commandId`. */
  viewType?: string;
  /** Command to run instead, for targets with no dedicated view type. */
  commandId?: string;
}

/**
 * Shipped defaults. Everything except Portal degrades to a disabled slot on a
 * vault without the rest of the suite — that degradation lives in
 * `hub-registry.ts`, not here.
 */
export const DEFAULT_PHONE_CHROME_SLOTS: readonly PhoneChromeSlot[] = [
  { id: 'portal', icon: 'hi-panel-left', label: 'Files', viewType: 'portal' },
  { id: 'recents', icon: 'clock', label: 'Recents', viewType: 'masonry' },
  { id: 'tasks', icon: 'check-circle', label: 'Tasks', viewType: 'tasks' },
  { id: 'daily', icon: 'calendar', label: 'Daily', commandId: 'daily-notes' },
] as const;

function isSlot(value: unknown): value is PhoneChromeSlot {
  if (typeof value !== 'object' || value === null) return false;
  const slot = value as Record<string, unknown>;
  if (typeof slot.id !== 'string' || slot.id.length === 0) return false;
  if (typeof slot.icon !== 'string' || slot.icon.length === 0) return false;
  if (typeof slot.label !== 'string' || slot.label.length === 0) return false;
  const hasView = typeof slot.viewType === 'string' && slot.viewType.length > 0;
  const hasCommand = typeof slot.commandId === 'string' && slot.commandId.length > 0;
  // Exactly one target kind — both or neither is a malformed slot.
  return hasView !== hasCommand;
}

/**
 * Validate stored slots, falling back wholesale to the defaults on anything
 * malformed. Wholesale rather than per-slot on purpose: a half-repaired bar is
 * harder to reason about than a known-good one, and the user can always
 * re-edit. Over-long sets truncate instead, since the extra slots are
 * unambiguous surplus rather than corruption.
 */
export function parsePhoneChromeSlots(value: unknown): PhoneChromeSlot[] {
  if (!Array.isArray(value)) return [...DEFAULT_PHONE_CHROME_SLOTS];
  if (!value.every(isSlot)) return [...DEFAULT_PHONE_CHROME_SLOTS];
  const slots = value as PhoneChromeSlot[];
  if (slots.length < MIN_SLOTS) return [...DEFAULT_PHONE_CHROME_SLOTS];
  const ids = new Set(slots.map((s) => s.id));
  if (ids.size !== slots.length) return [...DEFAULT_PHONE_CHROME_SLOTS];
  return slots.slice(0, MAX_SLOTS);
}
