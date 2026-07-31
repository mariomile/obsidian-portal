# Phone Chrome Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Portal a phone-only hub navbar — a segmented control whose active slot alone carries a label — paged by an interruptible horizontal swipe across configurable slots.

**Architecture:** On mobile Obsidian keeps every root leaf as a sibling inside one `.workspace-tab-container`, with a single `.mod-active` visible. The pager borrows that container rather than building or reparenting anything: it makes the neighbour sibling visible, translates both nodes with `transform`, and calls `setActiveLeaf` on release. All decision logic (pill geometry, gesture arbitration, slot resolution) lives in pure functions with no DOM, so the hard parts are unit-tested off-device; only mounting and translation need a phone.

**Tech Stack:** TypeScript (ESM, `type: module`), esbuild, `node:test` with `node --experimental-strip-types`, Obsidian API 1.13.1, plain CSS in `styles.css`.

**Spec:** `docs/brainstorms/2026-08-01-phone-chrome-design.md`

## Global Constraints

- **Node >= 22**, pnpm 10.17.1. Tests: `pnpm test` → `node --experimental-strip-types --test "src/**/*.test.ts"`.
- **Test imports use the `.ts` extension** (`import { x } from './y.ts'`) — required by `--experimental-strip-types`. Source-to-source imports stay extensionless.
- **Tests use `node:test` + `node:assert/strict`.** No other test framework.
- **Never `any`.** Undocumented Obsidian surfaces are reached only through `src/obsidian-internals.ts`, narrowed with `as unknown as` and defensively guarded, returning a safe fallback on any structural miss.
- **Phone only:** every entry point guards on `Platform.isPhone` and returns early otherwise.
- **Settings are checked inside handlers**, never captured at install time, so toggles apply live with no reload (the `mobileHeaderBack` pattern).
- **styles.css contract** (enforced by `src/style-contract.test.ts`, must stay green):
  - No raw `ms`, hex colours, or `cubic-bezier()` outside a `var(--token, fallback)` expression.
  - `!important` count must stay at **0**.
  - Every `:hover` selector sits inside `@media (hover: hover)`.
  - `transition` on `background-color` / `color` / `opacity` uses `var(--portal-wash-motion)`; physical transforms use `var(--portal-motion)`.
  - No CSS comment may contain `--token*/` (terminates the comment early).
- **Animation:** only `transform` and `opacity` during a gesture. Never `width`, `left`, `top`, or `margin` — that is layout thrash on iOS WebKit.
- **`pnpm release:check`** (`lint && test && build`) must pass before any task is considered done.
- Do **not** touch `manifest.json`, `package.json`, or `versions.json` versions — `release-contract.test.ts` pins them and a bump is a separate release step.

---

### Task 1: Device spike — who owns the touch

**Files:**
- Create: `docs/plans/2026-08-01-002-spike-findings.md`
- Scratch (never committed): a temporary block in `src/main.ts`, reverted at the end of the task.

**Interfaces:**
- Consumes: nothing.
- Produces: a committed findings document answering two yes/no questions. Tasks 6–8 read it to know whether they implement the primary approach or the documented fallback.

This task writes **no production code**. It exists because both remaining risks are the same question — who actually owns that touch — and answering them costs one iPhone session instead of two sign-offs.

Note before starting: `src/nav/mobile-header-back.ts` already proves the suppression technique (a `document`-level capture-phase listener with `stopImmediatePropagation()` that beats Obsidian's own handler on its own button). Question B below is therefore only "does the same technique hold for `touchstart` as it does for `click`", not "is it possible at all".

- [ ] **Step 1: Add the throwaway probe to `onload()`**

Append this at the end of `onload()` in `src/main.ts`. It is scratch code — it gets reverted in Step 5.

```ts
// SPIKE — reverted at the end of Task 1. Do not commit.
if (Platform.isPhone) {
  this.addCommand({
    id: 'portal-spike-probe',
    name: 'SPIKE probe',
    callback: () => {
      const active = document.querySelector<HTMLElement>(
        '.workspace-tabs.mod-visible > .workspace-tab-container > .workspace-leaf.mod-active',
      );
      const container = active?.parentElement;
      const leaves = [...(container?.children ?? [])] as HTMLElement[];
      const idx = active ? leaves.indexOf(active) : -1;
      const neighbour = leaves[idx + 1] ?? leaves[idx - 1];
      if (!active || !neighbour) {
        console.log('SPIKE: no sibling leaf found', { leaves: leaves.length, idx });
        return;
      }
      // Question A: can a non-active sibling be shown and translated?
      neighbour.style.display = 'block';
      neighbour.style.transform = 'translateX(60%)';
      active.style.transform = 'translateX(-40%)';
      console.log('SPIKE: forced visible', {
        neighbourDisplay: getComputedStyle(neighbour).display,
        neighbourClasses: neighbour.className,
      });
      // Re-read after a tick: does Obsidian put it back?
      window.setTimeout(() => {
        console.log('SPIKE: after 400ms', {
          display: getComputedStyle(neighbour).display,
          transform: getComputedStyle(neighbour).transform,
        });
      }, 400);
      window.setTimeout(() => {
        neighbour.style.display = '';
        neighbour.style.transform = '';
        active.style.transform = '';
      }, 2000);
    },
  });

  // Question B: does capture-phase touchstart suppression beat the drawer?
  this.registerDomEvent(
    document,
    'touchstart',
    (evt: TouchEvent) => {
      const t = evt.touches[0];
      if (!t) return;
      if (t.clientX > 24 && t.clientX < window.innerWidth - 24) return;
      console.log('SPIKE: swallowing edge touch at', t.clientX);
      evt.stopImmediatePropagation();
    },
    { capture: true },
  );
}
```

`Platform` must be added to the `obsidian` import for the spike; the revert in Step 5 removes it again.

- [ ] **Step 2: Build and deploy to the phone**

Run: `pnpm build`

The build writes `main.js` straight into the vault via `.obsidian-plugin-dir` — do not copy a stale `main.js` from the repo root. Then sync and reload the plugin on the iPhone.

- [ ] **Step 3: Run Question A on device**

Open a note, then a second hub-ish view so at least two root leaves exist. Run the "SPIKE probe" command from the command palette.

Record from the console:
- Does the neighbour become visibly rendered, offset to the right?
- After 400ms, is `display` still non-`none` and the transform still applied?

**PASS** = the neighbour stays visible and translated for the full 2s. **FAIL** = Obsidian resets `display` or the transform on its own.

- [ ] **Step 4: Run Question B on device**

Drag inward from the left screen edge, then from the right edge.

**PASS** = the log line appears and no drawer opens. **FAIL** = the drawer opens anyway, meaning Obsidian's handler runs before a `document` capture listener.

- [ ] **Step 5: Revert the scratch code**

Remove the entire spike block from `src/main.ts` and restore the original `obsidian` import line. Verify with `git diff -- src/main.ts` that it reports no changes.

- [ ] **Step 6: Write the findings document**

Create `docs/plans/2026-08-01-002-spike-findings.md` with the real observed values:

```markdown
# Phone Chrome spike — findings

**Date:** <date run>
**Device:** iPhone <model>, iOS <version>, Obsidian <version>

## Question A — can a non-active sibling leaf be shown and translated?

**Result:** PASS | FAIL
**Observed:** <the console output, verbatim>

If FAIL, Tasks 7 and 8 switch to the snapshot fallback: during the gesture
translate a static clone of the neighbour and mount the real leaf on release.
Fidelity degrades, the model does not.

## Question B — does capture-phase touchstart suppression beat the drawer?

**Result:** PASS | FAIL
**Observed:** <the console output, verbatim>

If FAIL, Task 8 cannot suppress the drawers. Escalate to Mario before
continuing: it reopens the gesture-arbitration decision, which he settled by
choosing to disable the drawers at hub level.
```

- [ ] **Step 7: Commit**

```bash
git add docs/plans/2026-08-01-002-spike-findings.md
git commit -m "docs: phone chrome spike findings (leaf visibility, drawer suppression)"
```

- [ ] **Step 8: Stop and report**

Report both results to Mario before starting Task 2. A FAIL on Question B is a hard gate.

---

### Task 2: Slot model and settings

**Files:**
- Create: `src/phone-chrome/slots.ts`
- Create: `src/phone-chrome/slots.test.ts`
- Modify: `src/settings.ts` (interface, `DEFAULT_SETTINGS`, `parseSettings`, settings tab)

**Interfaces:**
- Consumes: nothing.
- Produces: `PhoneChromeSlot`, `DEFAULT_PHONE_CHROME_SLOTS`, `parsePhoneChromeSlots(value: unknown): PhoneChromeSlot[]`, and the settings fields `phoneChrome: boolean` / `phoneChromeSlots: PhoneChromeSlot[]`.

- [ ] **Step 1: Write the failing test**

Create `src/phone-chrome/slots.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PHONE_CHROME_SLOTS,
  parsePhoneChromeSlots,
  MIN_SLOTS,
  MAX_SLOTS,
} from './slots.ts';

test('the shipped defaults are a legal slot set', () => {
  assert.ok(DEFAULT_PHONE_CHROME_SLOTS.length >= MIN_SLOTS);
  assert.ok(DEFAULT_PHONE_CHROME_SLOTS.length <= MAX_SLOTS);
  for (const slot of DEFAULT_PHONE_CHROME_SLOTS) {
    assert.ok(slot.id.length > 0);
    assert.ok(slot.label.length > 0);
    assert.ok(slot.icon.length > 0);
    // Exactly one target kind per slot.
    assert.equal(Boolean(slot.viewType) !== Boolean(slot.commandId), true);
  }
  const ids = DEFAULT_PHONE_CHROME_SLOTS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, 'slot ids must be unique');
});

test('garbage falls back to the defaults', () => {
  assert.deepEqual(parsePhoneChromeSlots(undefined), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots(null), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots('portal'), DEFAULT_PHONE_CHROME_SLOTS);
  assert.deepEqual(parsePhoneChromeSlots([{ id: 'x' }]), DEFAULT_PHONE_CHROME_SLOTS);
});

test('too few slots falls back, too many truncates', () => {
  const one = [{ id: 'a', icon: 'i', label: 'A', viewType: 'v' }];
  assert.deepEqual(parsePhoneChromeSlots(one), DEFAULT_PHONE_CHROME_SLOTS);

  const seven = Array.from({ length: 7 }, (_, i) => ({
    id: `s${i}`,
    icon: 'i',
    label: `S${i}`,
    viewType: `v${i}`,
  }));
  const parsed = parsePhoneChromeSlots(seven);
  assert.equal(parsed.length, MAX_SLOTS);
  assert.equal(parsed[0]?.id, 's0');
});

test('a valid custom set survives round-trip', () => {
  const custom = [
    { id: 'portal', icon: 'hi-panel-left', label: 'Files', viewType: 'portal' },
    { id: 'search', icon: 'search', label: 'Search', commandId: 'global-search:open' },
    { id: 'daily', icon: 'calendar', label: 'Daily', commandId: 'daily-notes' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(custom), custom);
});

test('duplicate ids fall back to the defaults', () => {
  const dupes = [
    { id: 'a', icon: 'i', label: 'A', viewType: 'v1' },
    { id: 'a', icon: 'i', label: 'B', viewType: 'v2' },
    { id: 'c', icon: 'i', label: 'C', viewType: 'v3' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(dupes), DEFAULT_PHONE_CHROME_SLOTS);
});

test('a slot with both a view type and a command is rejected', () => {
  const both = [
    { id: 'a', icon: 'i', label: 'A', viewType: 'v', commandId: 'c' },
    { id: 'b', icon: 'i', label: 'B', viewType: 'v2' },
    { id: 'c', icon: 'i', label: 'C', viewType: 'v3' },
  ];
  assert.deepEqual(parsePhoneChromeSlots(both), DEFAULT_PHONE_CHROME_SLOTS);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './slots.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/phone-chrome/slots.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, all six `slots.test.ts` tests green, every pre-existing test still green.

- [ ] **Step 5: Wire the settings fields**

In `src/settings.ts`, add the import:

```ts
import {
  DEFAULT_PHONE_CHROME_SLOTS,
  parsePhoneChromeSlots,
  type PhoneChromeSlot,
} from './phone-chrome/slots';
```

Add to the `PortalSettings` interface, after `mobileHeaderBack`:

```ts
  /** Phone-only: replace the hub with a segmented navbar paged by horizontal
   *  swipe. Default OFF — this takes over touch handling, so it must not
   *  switch itself on across a synced vault. Applies live. */
  phoneChrome: boolean;
  /** The hub views the phone-chrome pager moves between, in bar order. */
  phoneChromeSlots: PhoneChromeSlot[];
```

Add to `DEFAULT_SETTINGS`, after `mobileHeaderBack: true,`:

```ts
  phoneChrome: false,
  phoneChromeSlots: [...DEFAULT_PHONE_CHROME_SLOTS],
```

Add to the object returned by `parseSettings`, after the `mobileHeaderBack` entry:

```ts
    phoneChrome:
      typeof data.phoneChrome === 'boolean'
        ? data.phoneChrome
        : DEFAULT_SETTINGS.phoneChrome,
    phoneChromeSlots: parsePhoneChromeSlots(data.phoneChromeSlots),
```

- [ ] **Step 6: Add the settings-tab toggle**

In `PortalSettingTab.display()`, after the existing `mobileHeaderBack` setting, add:

```ts
    new Setting(containerEl)
      .setName('Phone hub navbar')
      .setDesc(
        'Phone only. Replaces the hub with a segmented navbar you page through by ' +
          'swiping horizontally. While it is on, the edge-drag sidebars are disabled ' +
          'at hub level — open them with the menu button instead.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.phoneChrome)
          .onChange(async (value) => {
            this.plugin.settings.phoneChrome = value;
            await this.plugin.saveSettings();
          }),
      );
```

Slot editing is out of scope for v1 — `phoneChromeSlots` is parsed and honoured but edited only via `data.json`. Do not build a slot editor.

- [ ] **Step 7: Verify the whole gate**

Run: `pnpm release:check`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/phone-chrome/slots.ts src/phone-chrome/slots.test.ts src/settings.ts
git commit -m "feat(phone-chrome): slot model and settings"
```

---

### Task 3: Pill geometry

**Files:**
- Create: `src/phone-chrome/pill-geometry.ts`
- Create: `src/phone-chrome/pill-geometry.test.ts`

**Interfaces:**
- Consumes: nothing (deliberately does not import `slots.ts` — it takes a count, not a slot list, so it stays trivially testable).
- Produces: `SlotGeometry`, `PillLayoutInput`, `layoutPills(input: PillLayoutInput): SlotGeometry[]`.

This is the heart of the feature: the interpolated pill that makes the gesture read as premium. It is a pure function over numbers.

- [ ] **Step 1: Write the failing test**

Create `src/phone-chrome/pill-geometry.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { layoutPills, type PillLayoutInput } from './pill-geometry.ts';

/** 4 slots, 40px icons, 8px gaps in a 400px bar.
 *  Collapsed total = 4*40 + 3*8 = 184 → 216px of expansion budget. */
const base: PillLayoutInput = {
  slotCount: 4,
  activeIndex: 1,
  progress: 0,
  barWidth: 400,
  iconWidth: 40,
  gap: 8,
};

test('at rest the active slot takes the whole expansion budget', () => {
  const pills = layoutPills(base);
  assert.equal(pills.length, 4);
  assert.equal(pills[0]?.width, 40);
  assert.equal(pills[1]?.width, 40 + 216);
  assert.equal(pills[2]?.width, 40);
  assert.equal(pills[3]?.width, 40);
  assert.equal(pills[1]?.labelOpacity, 1);
  assert.equal(pills[0]?.labelOpacity, 0);
});

test('slots tile left to right and fill the bar exactly', () => {
  const pills = layoutPills(base);
  assert.equal(pills[0]?.x, 0);
  assert.equal(pills[1]?.x, 48); // 40 + 8
  assert.equal(pills[2]?.x, 48 + 256 + 8);
  const last = pills[3];
  assert.equal((last?.x ?? 0) + (last?.width ?? 0), 400);
});

test('mid-swipe the budget is split between outgoing and incoming', () => {
  const pills = layoutPills({ ...base, progress: 0.5 });
  assert.equal(pills[1]?.width, 40 + 108);
  assert.equal(pills[2]?.width, 40 + 108);
  assert.equal(pills[1]?.labelOpacity, 0.5);
  assert.equal(pills[2]?.labelOpacity, 0.5);
  assert.equal(pills[0]?.width, 40);
});

test('a completed swipe hands the whole budget to the next slot', () => {
  const pills = layoutPills({ ...base, progress: 1 });
  assert.equal(pills[1]?.width, 40);
  assert.equal(pills[2]?.width, 40 + 216);
  assert.equal(pills[2]?.labelOpacity, 1);
  assert.equal(pills[1]?.labelOpacity, 0);
});

test('negative progress expands the previous slot', () => {
  const pills = layoutPills({ ...base, progress: -1 });
  assert.equal(pills[0]?.width, 40 + 216);
  assert.equal(pills[1]?.width, 40);
});

test('rubber-band at the ends leaves the pill exactly at rest', () => {
  const atStart = layoutPills({ ...base, activeIndex: 0, progress: -0.7 });
  assert.deepEqual(atStart, layoutPills({ ...base, activeIndex: 0, progress: 0 }));

  const atEnd = layoutPills({ ...base, activeIndex: 3, progress: 0.7 });
  assert.deepEqual(atEnd, layoutPills({ ...base, activeIndex: 3, progress: 0 }));
});

test('progress is clamped to [-1, 1]', () => {
  assert.deepEqual(
    layoutPills({ ...base, progress: 3 }),
    layoutPills({ ...base, progress: 1 }),
  );
});

test('a bar too narrow for any expansion degrades to equal icons', () => {
  const pills = layoutPills({ ...base, barWidth: 100 });
  for (const pill of pills) assert.equal(pill.width, 40);
  assert.equal(pills[1]?.labelOpacity, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './pill-geometry.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/phone-chrome/pill-geometry.ts`:

```ts
/**
 * Pill geometry for the phone hub navbar — pure, no DOM.
 *
 * The bar is a constant-width row: collapsed slots are icon-only, and the
 * single expanded slot absorbs whatever is left over. During a swipe the
 * expansion budget is *shared* between the outgoing and incoming slot in
 * proportion to gesture progress, which is what produces the interpolated
 * pill (outgoing still wide, incoming already half-open) instead of a snap.
 *
 * Consumers must apply `width` as a `transform: scaleX()` against a fixed
 * base box, never as a real `width` — animating width is layout thrash on
 * iOS WebKit.
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
  const targetIndex = progress > 0 ? activeIndex + 1 : activeIndex - 1;
  // No destination → the pill stays at rest while the content rubber-bands.
  const hasTarget = targetIndex >= 0 && targetIndex < slotCount;
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, all eight `pill-geometry.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/phone-chrome/pill-geometry.ts src/phone-chrome/pill-geometry.test.ts
git commit -m "feat(phone-chrome): pure pill geometry with shared expansion budget"
```

---

### Task 4: Gesture arbitration

**Files:**
- Create: `src/phone-chrome/gesture-decide.ts`
- Create: `src/phone-chrome/gesture-decide.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ClaimDecision`, `SnapDecision`, `decideClaim(dx, dy, threshold?): ClaimDecision`, `decideSnap(progress, velocity, activeIndex, slotCount): SnapDecision`.

**Spec refinement to note:** the spec writes `decideClaim → 'ignore' | 'claim'`. The implementation adds a third state, `'pending'`, because the decision cannot be taken on the first `touchmove` — until the finger has travelled past the threshold, neither answer is correct yet. Two states would force a premature commit on a 1px move.

- [ ] **Step 1: Write the failing test**

Create `src/phone-chrome/gesture-decide.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { decideClaim, decideSnap } from './gesture-decide.ts';

test('decideClaim waits while the finger is under the threshold', () => {
  assert.equal(decideClaim(0, 0), 'pending');
  assert.equal(decideClaim(5, 2), 'pending');
  assert.equal(decideClaim(-6, 3), 'pending');
});

test('decideClaim takes a dominantly horizontal move', () => {
  assert.equal(decideClaim(20, 4), 'claim');
  assert.equal(decideClaim(-20, 4), 'claim');
});

test('decideClaim releases a dominantly vertical move for good', () => {
  assert.equal(decideClaim(4, 20), 'ignore');
  assert.equal(decideClaim(20, 25), 'ignore');
  // Exactly diagonal is not dominantly horizontal → scrolling wins.
  assert.equal(decideClaim(20, 20), 'ignore');
});

test('decideSnap commits past the halfway point', () => {
  assert.equal(decideSnap(0.6, 0, 1, 4), 'next');
  assert.equal(decideSnap(-0.6, 0, 1, 4), 'prev');
});

test('decideSnap returns a short, slow drag', () => {
  assert.equal(decideSnap(0.2, 0, 1, 4), 'back');
  assert.equal(decideSnap(-0.2, 0, 1, 4), 'back');
});

test('decideSnap commits a short drag thrown fast', () => {
  assert.equal(decideSnap(0.2, 0.004, 1, 4), 'next');
  assert.equal(decideSnap(-0.2, -0.004, 1, 4), 'prev');
});

test('decideSnap ignores velocity thrown against the drag', () => {
  assert.equal(decideSnap(0.2, -0.004, 1, 4), 'back');
});

test('decideSnap rubber-bands at the extremes', () => {
  // First slot dragged toward a previous that does not exist.
  assert.equal(decideSnap(-0.9, -0.01, 0, 4), 'back');
  // Last slot dragged toward a next that does not exist.
  assert.equal(decideSnap(0.9, 0.01, 3, 4), 'back');
});

test('decideSnap treats a single-slot bar as always at rest', () => {
  assert.equal(decideSnap(0.9, 0.01, 0, 1), 'back');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './gesture-decide.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/phone-chrome/gesture-decide.ts`:

```ts
/**
 * Gesture arbitration for the phone hub pager — pure, no DOM.
 *
 * Two decisions at two moments:
 *
 * - `decideClaim` runs on early `touchmove`. Once it answers `claim` or
 *   `ignore` the caller stops asking for the rest of that touch: a direction
 *   lock taken once is what keeps vertical scrolling smooth. `pending` means
 *   the finger has not travelled far enough to tell yet.
 * - `decideSnap` runs on `touchend` and says where the pager lands.
 *
 * At hub level the pager claims every horizontal drag — Obsidian's edge-drag
 * drawers are suppressed there, so there are no edge zones to carve out.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, all nine `gesture-decide.test.ts` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/phone-chrome/gesture-decide.ts src/phone-chrome/gesture-decide.test.ts
git commit -m "feat(phone-chrome): pure gesture claim and snap decisions"
```

---

### Task 5: Slot resolution against what is installed

**Files:**
- Create: `src/phone-chrome/hub-registry.ts`
- Create: `src/phone-chrome/hub-registry.test.ts`
- Modify: `src/obsidian-internals.ts` (append `isViewTypeRegistered`, `isCommandRegistered`)

**Interfaces:**
- Consumes: `PhoneChromeSlot` from Task 2.
- Produces: `ResolvedSlot`, `resolveSlots(slots, hasViewType, hasCommand): ResolvedSlot[]`, `firstEnabledIndex(resolved): number`, and the internals helpers `isViewTypeRegistered(app, type): boolean` / `isCommandRegistered(app, id): boolean`.

The resolution rule is pure and takes predicates, so it is tested with fakes and never needs an `App`.

**Spec deviation to flag to Mario at the end of this task.** A command-backed slot (the shipped `daily` default) has no leaf to page to — running `daily-notes` opens a markdown leaf, which is by definition *not* hub level. So command slots resolve as **tap-only actions, not pages**: tapping runs the command, and the pager rubber-bands rather than sliding into them. That is the `pageable` flag below. The alternative is dropping command slots from v1 entirely and shipping three defaults; report the behaviour to Mario and let him choose.

- [ ] **Step 1: Write the failing test**

Create `src/phone-chrome/hub-registry.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { firstEnabledIndex, resolveSlots } from './hub-registry.ts';
import type { PhoneChromeSlot } from './slots.ts';

const slots: PhoneChromeSlot[] = [
  { id: 'portal', icon: 'hi-panel-left', label: 'Files', viewType: 'portal' },
  { id: 'recents', icon: 'clock', label: 'Recents', viewType: 'masonry' },
  { id: 'daily', icon: 'calendar', label: 'Daily', commandId: 'daily-notes' },
];

const has = (...names: string[]) => (name: string) => names.includes(name);
const none = () => false;

test('a slot whose view type is installed is enabled', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, true],
  );
});

test('a missing view type disables its slot without dropping it', () => {
  const resolved = resolveSlots(slots, has('portal'), has('daily-notes'));
  assert.equal(resolved.length, 3, 'disabled slots stay in the bar');
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, false, true],
  );
  assert.equal(resolved[1]?.slot.id, 'recents');
});

test('a missing command disables its slot', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), none);
  assert.deepEqual(
    resolved.map((r) => r.enabled),
    [true, true, false],
  );
});

test('only view-backed slots are pageable; command slots are tap-only', () => {
  const resolved = resolveSlots(slots, has('portal', 'masonry'), has('daily-notes'));
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, true, false],
    'the daily slot is enabled but has no leaf to slide into',
  );
});

test('a disabled view slot is not pageable either', () => {
  const resolved = resolveSlots(slots, has('portal'), none);
  assert.deepEqual(
    resolved.map((r) => r.pageable),
    [true, false, false],
  );
});

test('firstEnabledIndex finds the first usable slot', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('masonry'), none)), 1);
  assert.equal(firstEnabledIndex(resolveSlots(slots, has('portal'), none)), 0);
});

test('firstEnabledIndex returns -1 when nothing resolves', () => {
  assert.equal(firstEnabledIndex(resolveSlots(slots, none, none)), -1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './hub-registry.ts'`.

- [ ] **Step 3: Write the pure resolution**

Create `src/phone-chrome/hub-registry.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, all seven `hub-registry.test.ts` tests green.

- [ ] **Step 5: Add the internals predicates**

Append to `src/obsidian-internals.ts`, following the file's existing narrowing and guarding style:

```ts
interface ViewRegistry {
  viewByType?: Record<string, unknown>;
}
interface AppWithViewRegistry {
  viewRegistry?: ViewRegistry;
}
interface CommandsRegistry {
  commands?: Record<string, unknown>;
}
interface AppWithCommandRegistry {
  commands?: CommandsRegistry;
}

/** True when a view type is registered (its plugin is installed and enabled).
 *  `viewRegistry.viewByType` is untyped but long-stable; a structural miss
 *  returns false so a slot degrades to disabled rather than throwing. */
export function isViewTypeRegistered(app: App, type: string): boolean {
  const registry = (app as unknown as AppWithViewRegistry).viewRegistry?.viewByType;
  return typeof registry === 'object' && registry !== null && type in registry;
}

/** True when a command id exists. Same defensive posture as above. */
export function isCommandRegistered(app: App, id: string): boolean {
  const registry = (app as unknown as AppWithCommandRegistry).commands?.commands;
  return typeof registry === 'object' && registry !== null && id in registry;
}
```

- [ ] **Step 6: Verify the whole gate**

Run: `pnpm release:check`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/phone-chrome/hub-registry.ts src/phone-chrome/hub-registry.test.ts src/obsidian-internals.ts
git commit -m "feat(phone-chrome): resolve slots against installed views and commands"
```

- [ ] **Step 8: Report the spec deviation**

Tell Mario that command-backed slots resolved as tap-only actions rather than pages, and why (no leaf to slide into). Ask whether to keep the `daily` default as a tap-only fourth slot or drop command slots from v1 and ship three. Continue to Task 6 either way — the answer only changes `DEFAULT_PHONE_CHROME_SLOTS`.

---

### Task 6: The navbar element

**Files:**
- Create: `src/phone-chrome/navbar.ts`
- Modify: `styles.css` (append a phone-chrome section)

**Interfaces:**
- Consumes: `ResolvedSlot` (Task 5), `layoutPills` / `SlotGeometry` (Task 3).
- Produces: `class PhoneChromeNavbar` with `constructor(host: HTMLElement, resolved: ResolvedSlot[])`, `render(activeIndex: number): void`, `setProgress(activeIndex: number, progress: number): void`, `onSelect: (index: number) => void`, `destroy(): void`.

The navbar draws itself and applies geometry. It holds no gesture logic and no leaf knowledge.

- [ ] **Step 1: Write the implementation**

Create `src/phone-chrome/navbar.ts`:

```ts
import { setIcon } from 'obsidian';
import { layoutPills } from './pill-geometry';
import type { ResolvedSlot } from './hub-registry';

/**
 * The phone hub navbar: a constant-width segmented row where only the active
 * slot carries a label.
 *
 * Every slot is laid out once at a fixed base width and then scaled with
 * `transform: scaleX()`; the label rides in its own layer so its text never
 * scales with the capsule. Nothing here animates `width` — that would be
 * layout thrash on iOS WebKit, which is the whole reason the geometry module
 * hands back numbers instead of styles.
 */
export class PhoneChromeNavbar {
  /** Called when a slot is tapped. Wired by `hub-level.ts`. */
  onSelect: (index: number) => void = () => {};

  private readonly el: HTMLElement;
  private readonly slotEls: HTMLElement[] = [];
  private readonly labelEls: HTMLElement[] = [];
  private activeIndex = 0;

  constructor(
    host: HTMLElement,
    private readonly resolved: ResolvedSlot[],
  ) {
    this.el = host.createDiv({ cls: 'portal-phone-navbar' });

    this.resolved.forEach((entry, index) => {
      const slotEl = this.el.createDiv({ cls: 'portal-phone-slot' });
      slotEl.dataset.slot = entry.slot.id;
      slotEl.toggleClass('is-disabled', !entry.enabled);

      const iconEl = slotEl.createDiv({ cls: 'portal-phone-slot-icon' });
      setIcon(iconEl, entry.slot.icon);

      const labelEl = slotEl.createDiv({ cls: 'portal-phone-slot-label' });
      labelEl.setText(entry.slot.label);

      if (entry.enabled) {
        slotEl.addEventListener('click', () => this.onSelect(index));
      }

      this.slotEls.push(slotEl);
      this.labelEls.push(labelEl);
    });
  }

  /** Snap the bar to a settled state (used on mount and after a snap). */
  render(activeIndex: number): void {
    this.activeIndex = activeIndex;
    this.el.toggleClass('is-animating', true);
    this.apply(activeIndex, 0);
  }

  /** Drive the bar from live gesture progress. No transitions while dragging:
   *  the finger IS the animation, and a CSS transition would lag behind it. */
  setProgress(activeIndex: number, progress: number): void {
    this.activeIndex = activeIndex;
    this.el.toggleClass('is-animating', false);
    this.apply(activeIndex, progress);
  }

  destroy(): void {
    this.el.remove();
  }

  private apply(activeIndex: number, progress: number): void {
    const barWidth = this.el.clientWidth;
    if (barWidth === 0) return; // not laid out yet; a later call will catch it

    const styles = getComputedStyle(this.el);
    const iconWidth = parseFloat(styles.getPropertyValue('--portal-phone-icon-size')) || 40;
    const gap = parseFloat(styles.getPropertyValue('--portal-phone-gap')) || 8;

    const pills = layoutPills({
      slotCount: this.slotEls.length,
      activeIndex,
      progress,
      barWidth,
      iconWidth,
      gap,
    });

    pills.forEach((pill, i) => {
      const slotEl = this.slotEls[i];
      const labelEl = this.labelEls[i];
      if (!slotEl || !labelEl) return;
      // Base box is `iconWidth` wide; scaleX carries it to the target width.
      slotEl.style.transform =
        `translateX(${pill.x}px) scaleX(${pill.width / iconWidth})`;
      labelEl.style.opacity = String(pill.labelOpacity);
      // Undo the capsule's horizontal scale so the text is never stretched.
      labelEl.style.transform = `scaleX(${iconWidth / pill.width})`;
      slotEl.toggleClass('is-active', i === activeIndex);
    });
  }
}
```

- [ ] **Step 2: Append the styles**

Append to `styles.css`. Note the contract: no raw `ms`/hex/`cubic-bezier` outside a `var(--token, fallback)`, no `!important`, and any `:hover` must be inside `@media (hover: hover)` — this block deliberately has none, since it is phone-only.

```css
/* --- phone chrome: hub navbar ----------------------------------------------
   Constant-width segmented row. Slots are laid out at a fixed base box and
   moved/scaled with transform only — animating width here would thrash layout
   on iOS WebKit, which is exactly what the gesture cannot afford. */
.portal-phone-navbar {
  --portal-phone-icon-size: 40px;
  --portal-phone-gap: 8px;
  position: relative;
  display: block;
  height: var(--portal-phone-icon-size);
  margin: var(--size-4-2, 8px) var(--size-4-3, 12px);
}

.portal-phone-slot {
  position: absolute;
  inset-block: 0;
  left: 0;
  width: var(--portal-phone-icon-size);
  transform-origin: left center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--size-4-1, 4px);
  border-radius: var(--radius-l, 12px);
  background-color: transparent;
  color: var(--text-muted);
  will-change: transform;
}

.portal-phone-navbar.is-animating .portal-phone-slot {
  transition: transform var(--portal-motion);
}

.portal-phone-slot.is-active {
  background-color: var(--portal-wash);
  color: var(--text-normal);
}

.portal-phone-navbar.is-animating .portal-phone-slot.is-active {
  transition:
    transform var(--portal-motion),
    background-color var(--portal-wash-motion),
    color var(--portal-wash-motion);
}

.portal-phone-slot.is-disabled {
  color: var(--text-faint);
}

.portal-phone-slot-icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

/* Counter-scaled against the capsule so the text never stretches. */
.portal-phone-slot-label {
  transform-origin: left center;
  white-space: nowrap;
  overflow: hidden;
  font-size: var(--font-ui-small);
  will-change: opacity, transform;
}

.portal-phone-navbar.is-animating .portal-phone-slot-label {
  transition:
    opacity var(--portal-wash-motion),
    transform var(--portal-motion);
}
```

`--portal-motion` and `--portal-wash-motion` are declared on `.portal-rail` only, so the navbar would resolve them to nothing. Widen that existing selector near the top of `styles.css` — change:

```css
.portal-rail {
  --portal-motion: var(--cosmos-t-fast, 120ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1));
```

to:

```css
.portal-rail,
.portal-phone-navbar {
  --portal-motion: var(--cosmos-t-fast, 120ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1));
```

Leave the rest of that block untouched: `--portal-indent` and the wash colours are harmless on the navbar, and splitting the block would duplicate the token vocabulary the style contract exists to keep singular.

- [ ] **Step 3: Verify the style contract still holds**

Run: `pnpm test`
Expected: PASS — in particular all of `style-contract.test.ts`. If the raw-value scan fires, the offending declaration is missing its `var(--token, fallback)` wrapper.

- [ ] **Step 4: Verify lint and build**

Run: `pnpm release:check`
Expected: lint clean, tests pass, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/phone-chrome/navbar.ts styles.css
git commit -m "feat(phone-chrome): segmented navbar element and styles"
```

---

### Task 7: The pager

**Files:**
- Create: `src/phone-chrome/pager.ts`

**Interfaces:**
- Consumes: `decideClaim` / `decideSnap` (Task 4).
- Produces: `class PhoneChromePager` with `constructor(host: HTMLElement, callbacks: PagerCallbacks)`, `destroy(): void`; and `interface PagerCallbacks { slotCount(): number; activeIndex(): number; onClaim(direction: 1 | -1): HTMLElement | null; onProgress(progress: number): void; onSettle(decision: SnapDecision): void }`.

The pager owns touch only. It knows nothing about leaves or the navbar — it reports progress and a settle decision, and the caller decides what those mean.

**If Task 1 recorded Question A as FAIL:** `onClaim` returns a cloned snapshot element instead of the real neighbour leaf. The pager code below is unchanged either way, which is the point of returning an `HTMLElement` from `onClaim` rather than a leaf.

- [ ] **Step 1: Write the implementation**

Create `src/phone-chrome/pager.ts`:

```ts
import { decideClaim, decideSnap, type SnapDecision } from './gesture-decide';

export interface PagerCallbacks {
  /** How many slots the bar currently has. */
  slotCount(): number;
  /** Which slot is showing right now. */
  activeIndex(): number;
  /**
   * The gesture just claimed a direction (+1 next, -1 previous). Return the
   * element to translate alongside the current one, or null when there is no
   * destination — the pager then rubber-bands.
   */
  onClaim(direction: 1 | -1): HTMLElement | null;
  /** Live gesture progress, -1..1, signed like the pill geometry. */
  onProgress(progress: number): void;
  /** The finger lifted; the caller performs the snap. */
  onSettle(decision: SnapDecision): void;
}

/** Past the end of the bar the drag keeps moving, but heavily damped. */
const RUBBER_BAND_FACTOR = 0.35;

/**
 * Touch-driven horizontal pager over the hub.
 *
 * Owns exactly one thing: turning a finger into `progress`. Everything
 * downstream — which leaf, which pill, what the snap means — is the caller's.
 * The direction lock is taken once per touch: once the gesture is released to
 * vertical scrolling it never comes back, so a diagonal thumb cannot make the
 * page stutter mid-scroll.
 */
export class PhoneChromePager {
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private lastX = 0;
  private lastTime = 0;
  private state: 'idle' | 'pending' | 'dragging' | 'released' = 'idle';
  private neighbour: HTMLElement | null = null;
  private direction: 1 | -1 = 1;

  private readonly onTouchStart = (evt: TouchEvent): void => {
    const touch = evt.touches[0];
    if (!touch) return;
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.lastX = touch.clientX;
    this.startTime = evt.timeStamp;
    this.lastTime = evt.timeStamp;
    this.state = 'pending';
    this.neighbour = null;
  };

  private readonly onTouchMove = (evt: TouchEvent): void => {
    const touch = evt.touches[0];
    if (!touch) return;
    if (this.state === 'released' || this.state === 'idle') return;

    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    if (this.state === 'pending') {
      const claim = decideClaim(dx, dy);
      if (claim === 'pending') return;
      if (claim === 'ignore') {
        // Released to the browser for the rest of this touch.
        this.state = 'released';
        return;
      }
      // Finger moving left reveals the NEXT slot.
      this.direction = dx < 0 ? 1 : -1;
      this.neighbour = this.callbacks.onClaim(this.direction);
      this.state = 'dragging';
    }

    // Claimed: the browser must not also scroll or trigger a native gesture.
    evt.preventDefault();

    const width = this.host.clientWidth || 1;
    const raw = -dx / width; // left drag → positive progress → next slot
    const progress = this.neighbour
      ? Math.max(-1, Math.min(1, raw))
      : raw * RUBBER_BAND_FACTOR;

    this.lastX = touch.clientX;
    this.lastTime = evt.timeStamp;
    this.callbacks.onProgress(progress);
  };

  private readonly onTouchEnd = (evt: TouchEvent): void => {
    if (this.state !== 'dragging') {
      this.state = 'idle';
      return;
    }

    const width = this.host.clientWidth || 1;
    const dx = this.lastX - this.startX;
    const progress = Math.max(-1, Math.min(1, -dx / width));

    // Progress-per-ms over the last move, matching decideSnap's unit. Use the
    // whole gesture when the last move carries no measurable interval.
    const elapsed = Math.max(1, this.lastTime - this.startTime);
    const velocity = progress / elapsed;

    const decision = this.neighbour
      ? decideSnap(progress, velocity, this.callbacks.activeIndex(), this.callbacks.slotCount())
      : 'back';

    this.state = 'idle';
    this.neighbour = null;
    this.callbacks.onSettle(decision);
  };

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: PagerCallbacks,
  ) {
    // Not passive: a claimed drag must be able to preventDefault().
    this.host.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.host.addEventListener('touchmove', this.onTouchMove, { passive: false });
    this.host.addEventListener('touchend', this.onTouchEnd, { passive: true });
    this.host.addEventListener('touchcancel', this.onTouchEnd, { passive: true });
  }

  destroy(): void {
    this.host.removeEventListener('touchstart', this.onTouchStart);
    this.host.removeEventListener('touchmove', this.onTouchMove);
    this.host.removeEventListener('touchend', this.onTouchEnd);
    this.host.removeEventListener('touchcancel', this.onTouchEnd);
  }
}
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm release:check`
Expected: lint clean, all existing tests still pass, build succeeds.

There is no unit test for this file on purpose: every branch it contains that carries a decision already has one in `gesture-decide.test.ts`. What is left is touch plumbing, which is verified on device in Task 9.

- [ ] **Step 3: Commit**

```bash
git add src/phone-chrome/pager.ts
git commit -m "feat(phone-chrome): touch pager with direction lock and rubber-band"
```

---

### Task 8: Hub level, leaf plumbing, and drawer suppression

**Files:**
- Create: `src/phone-chrome/hub-level.ts`
- Modify: `src/main.ts` (import and install)
- Modify: `styles.css` (hub container rules)

**Interfaces:**
- Consumes: everything from Tasks 2–7.
- Produces: `installPhoneChrome(plugin: PortalPlugin): void`.

This is where the two spike answers land. Read `docs/plans/2026-08-01-002-spike-findings.md` before starting.

- [ ] **Step 1: Write the implementation**

Create `src/phone-chrome/hub-level.ts`:

```ts
import { Platform } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type PortalPlugin from '../main';
import { executeCommand, isCommandRegistered, isViewTypeRegistered } from '../obsidian-internals';
import { firstEnabledIndex, resolveSlots, type ResolvedSlot } from './hub-registry';
import { PhoneChromeNavbar } from './navbar';
import { PhoneChromePager } from './pager';

/** The mobile root container Obsidian keeps every root leaf inside. Verified
 *  on device; also the anchor Cosmos Phone Edition relies on. */
const TAB_CONTAINER =
  '.workspace-tabs.mod-visible > .workspace-tab-container';
const ACTIVE_LEAF = '.workspace-leaf.mod-active';
/** Marks a sibling leaf we forced visible for the duration of a gesture. */
const PEEK_CLASS = 'portal-phone-peek';
/** Marks the container while the chrome owns it (styling + gesture scope). */
const HUB_CLASS = 'portal-phone-hub';

/**
 * Phone-only hub chrome: a segmented navbar plus a swipe pager across the
 * configured slots.
 *
 * Mounted only when the active leaf is one of the slots ("hub level") and
 * torn down the moment a note takes over, which is what keeps the gesture
 * from ever competing with CodeMirror. While mounted, Obsidian's edge-drag
 * drawers are suppressed: at hub level the left drawer is Portal (already a
 * slot) and the right one is empty with no note open, so both are redundant
 * exactly where they are disabled.
 *
 * Gated on `Platform.isPhone` at install and on `settings.phoneChrome` inside
 * every handler, so the toggle applies live with no reload.
 */
export function installPhoneChrome(plugin: PortalPlugin): void {
  if (!Platform.isPhone) return;

  let navbar: PhoneChromeNavbar | null = null;
  let pager: PhoneChromePager | null = null;
  let container: HTMLElement | null = null;
  let resolved: ResolvedSlot[] = [];
  let activeIndex = 0;

  const slotLeaves = (): (WorkspaceLeaf | null)[] =>
    resolved.map(({ slot, enabled }) => {
      if (!enabled || !slot.viewType) return null;
      return plugin.app.workspace.getLeavesOfType(slot.viewType)[0] ?? null;
    });

  const leafEl = (leaf: WorkspaceLeaf | null): HTMLElement | null =>
    (leaf?.view.containerEl.closest('.workspace-leaf') as HTMLElement | null) ?? null;

  const indexOfActiveLeaf = (): number => {
    const active = plugin.app.workspace.getMostRecentLeaf();
    if (!active) return -1;
    const type = active.view.getViewType();
    return resolved.findIndex((r) => r.pageable && r.slot.viewType === type);
  };

  const clearTransforms = (): void => {
    if (!container) return;
    for (const el of Array.from(container.children) as HTMLElement[]) {
      el.style.transform = '';
      el.removeClass(PEEK_CLASS);
    }
  };

  const unmount = (): void => {
    clearTransforms();
    pager?.destroy();
    navbar?.destroy();
    pager = null;
    navbar = null;
    container?.removeClass(HUB_CLASS);
    container = null;
  };

  const mount = (): void => {
    const found = document.querySelector<HTMLElement>(TAB_CONTAINER);
    // Fail-safe: an Obsidian update that renames this structure means the
    // chrome simply never mounts, and the app behaves exactly as before.
    if (!found) return;

    container = found;
    container.addClass(HUB_CLASS);

    resolved = resolveSlots(
      plugin.settings.phoneChromeSlots,
      (type) => isViewTypeRegistered(plugin.app, type),
      (id) => isCommandRegistered(plugin.app, id),
    );
    if (firstEnabledIndex(resolved) === -1) {
      unmount();
      return;
    }
    activeIndex = Math.max(0, indexOfActiveLeaf());

    const host = container.parentElement ?? container;
    navbar = new PhoneChromeNavbar(host, resolved);
    navbar.onSelect = (index) => {
      const entry = resolved[index];
      if (!entry?.enabled) return;
      // Tap-only slots run their command and leave the bar where it is —
      // the command usually opens a note, which unmounts the chrome anyway.
      if (!entry.pageable) {
        if (entry.slot.commandId) executeCommand(plugin.app, entry.slot.commandId);
        return;
      }
      const leaf = slotLeaves()[index];
      if (!leaf) return;
      activeIndex = index;
      plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
      navbar?.render(activeIndex);
    };
    navbar.render(activeIndex);

    pager = new PhoneChromePager(container, {
      slotCount: () => resolved.length,
      activeIndex: () => activeIndex,
      onClaim: (direction) => {
        const index = activeIndex + direction;
        // Command slots have no leaf to slide into → rubber-band instead.
        if (!resolved[index]?.pageable) return null;
        const target = slotLeaves()[index];
        const el = leafEl(target);
        if (!target || !el) return null;
        // Neighbour views are deferred at rest (Obsidian 1.7+): mounting one
        // here, at first contact, is what lets the swipe show real content
        // without keeping every hub view alive all the time. Fire and forget —
        // the drag has ~120ms of travel before the neighbour is on screen, and
        // an unresolved leaf simply renders empty for a frame.
        void target.loadIfDeferred();
        // Question A from the spike: force the sibling visible for the drag.
        el.addClass(PEEK_CLASS);
        return el;
      },
      onProgress: (progress) => {
        const current = leafEl(slotLeaves()[activeIndex]);
        const neighbour = leafEl(slotLeaves()[activeIndex + (progress > 0 ? 1 : -1)]);
        const width = container?.clientWidth ?? 0;
        if (current) current.style.transform = `translateX(${-progress * width}px)`;
        if (neighbour) {
          const offset = progress > 0 ? width : -width;
          neighbour.style.transform = `translateX(${offset - progress * width}px)`;
        }
        navbar?.setProgress(activeIndex, progress);
      },
      onSettle: (decision) => {
        if (decision === 'next') activeIndex += 1;
        if (decision === 'prev') activeIndex -= 1;
        const leaf = slotLeaves()[activeIndex];
        clearTransforms();
        if (leaf) plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
        navbar?.render(activeIndex);
      },
    });
  };

  const sync = (): void => {
    if (!plugin.settings.phoneChrome) {
      if (navbar) unmount();
      return;
    }
    const atHub = indexOfActiveLeaf() !== -1;
    if (atHub && !navbar) mount();
    else if (!atHub && navbar) unmount();
    else if (atHub && navbar) {
      activeIndex = Math.max(0, indexOfActiveLeaf());
      navbar.render(activeIndex);
    }
  };

  // Suppress Obsidian's edge-drag drawers while the chrome owns the hub.
  // Same technique as `mobile-header-back.ts`: a document-level capture
  // listener runs before the target's own bubble-phase handler. Gated on the
  // setting and on the chrome actually being mounted, so it is inert
  // everywhere else in the app.
  plugin.registerDomEvent(
    document,
    'touchstart',
    (evt: TouchEvent) => {
      if (!plugin.settings.phoneChrome || !container) return;
      const target = evt.target as HTMLElement | null;
      if (!target?.closest(`.${HUB_CLASS}`)) return;
      evt.stopImmediatePropagation();
    },
    { capture: true },
  );

  plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', sync));
  plugin.app.workspace.onLayoutReady(sync);
}
```

- [ ] **Step 2: Add the hub container styles**

Append to `styles.css`:

```css
/* --- phone chrome: hub container -------------------------------------------
   The pager borrows Obsidian's own mobile tab container rather than building
   one. `pan-y` leaves vertical scrolling to the browser and horizontal drags
   to the pager; `.portal-phone-peek` is the sibling leaf we reveal for the
   duration of a gesture. */
.portal-phone-hub {
  touch-action: pan-y;
  overflow: hidden;
}

.portal-phone-hub > .workspace-leaf.portal-phone-peek {
  display: flex;
  will-change: transform;
}

@media (prefers-reduced-motion: reduce) {
  .portal-phone-navbar.is-animating .portal-phone-slot,
  .portal-phone-navbar.is-animating .portal-phone-slot-label {
    transition: none;
  }
}
```

- [ ] **Step 3: Install it from `main.ts`**

Add the import alongside the other `install*` imports:

```ts
import { installPhoneChrome } from './phone-chrome/hub-level';
```

And call it in `onload()`, immediately after `installMobileHeaderBack(this);`:

```ts
    // Phone-only: segmented hub navbar with a swipe pager (default off).
    installPhoneChrome(this);
```

- [ ] **Step 4: Verify the whole gate**

Run: `pnpm release:check`
Expected: lint clean, all tests pass, build succeeds.

- [ ] **Step 5: Verify the feature is genuinely inert when off**

Run: `pnpm build`, then open the vault **on desktop** and confirm nothing changed: the rail behaves as before, no `.portal-phone-*` element exists in the DOM, and no console errors appear. `Platform.isPhone` is false there, so `installPhoneChrome` must return before touching anything.

- [ ] **Step 6: Commit**

```bash
git add src/phone-chrome/hub-level.ts src/main.ts styles.css
git commit -m "feat(phone-chrome): hub-level mount, leaf paging, drawer suppression"
```

---

### Task 9: Device sign-off

**Files:**
- Create: `docs/plans/2026-08-01-002-signoff.md`

**Interfaces:**
- Consumes: the complete feature.
- Produces: a signed-off checklist, and the decision on whether `phoneChrome` stays default-off.

`phoneChrome` ships **off**. This task does not flip it — that is Mario's call after reading the results.

- [ ] **Step 1: Build and deploy**

Run: `pnpm build`

The build writes `main.js` into the vault through `.obsidian-plugin-dir`. Sync, then reload the plugin on the iPhone and turn on "Phone hub navbar" in Portal's settings.

- [ ] **Step 2: Walk the checklist on device**

Record a real PASS/FAIL for each, with what you actually saw:

1. At hub level the navbar renders; only the active slot shows a label.
2. Swiping left pages to the next slot; content and pill move together under the finger.
3. Reversing mid-swipe returns both content and pill, with no flicker and no state left behind.
4. A short slow drag returns; a short fast flick commits.
5. On the first slot, dragging right rubber-bands and settles back.
6. Vertical scrolling inside a hub view still works, including a diagonal thumb.
7. Dragging inward from either screen edge does **not** open a drawer.
8. The menu button still opens the left sidebar by tap.
9. Opening a note unmounts the chrome; the back affordance returns to it.
10. Inside the editor, horizontal drags do nothing unusual and text selection is unaffected.
11. A slot whose plugin is not installed renders greyed and is skipped by the pager.
11b. Tapping the command-backed `daily` slot runs the command; swiping toward it rubber-bands instead of paging.
12. Turning the setting off restores stock behaviour immediately, with no reload.
13. With iOS "Reduce Motion" on, paging is instant and nothing animates.

- [ ] **Step 3: Write the sign-off document**

Create `docs/plans/2026-08-01-002-signoff.md` with the thirteen results, the device and OS versions, and — for any FAIL — what was observed rather than what was expected.

- [ ] **Step 4: Commit**

```bash
git add docs/plans/2026-08-01-002-signoff.md
git commit -m "docs: phone chrome device sign-off"
```

- [ ] **Step 5: Report to Mario**

Report the checklist verbatim, then ask whether `phoneChrome` should stay default-off or flip to on. Do not flip it unprompted.

---

## Notes for the implementer

**Read the spike findings first.** Task 1 answers two questions that change Tasks 7 and 8. Question A FAIL means switching to the snapshot fallback (`onClaim` returns a clone rather than the real neighbour leaf — the pager itself does not change). Question B FAIL is a hard stop: escalate rather than working around it.

**The pure modules carry the design.** `pill-geometry.ts`, `gesture-decide.ts`, and the resolution half of `hub-registry.ts` hold every decision worth arguing about, and all three are testable without a phone. If you find yourself wanting to put a decision in `pager.ts` or `hub-level.ts`, it probably belongs in a pure module with a test.

**Deploy through the build.** `pnpm build` writes `main.js` into the vault via `.obsidian-plugin-dir`. Never copy the repo-root `main.js` by hand — it goes stale silently.

**Never `git add -A`.** Stage the exact paths listed in each commit step.
