# Drawer Tab Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hub navbar with a segmented pill bar at the top of both mobile drawers, switching their tabs by tap and by horizontal swipe.

**Architecture:** The bar reads each drawer's real tabs and drives Obsidian's own `selectTabIndex` — the same entry point its native press-and-slide selector calls. Nothing is reparented, revealed, or cleaned up, which is why the whole class of defects from the hub navbar cannot recur. Obsidian renders only the active drawer tab, so during a swipe the pill alone tracks the finger and the section changes on release.

**Tech Stack:** TypeScript (ESM, `type: module`), esbuild, `node:test` with `node --experimental-strip-types`, Obsidian API 1.13.1, plain CSS in `styles.css`.

**Spec:** `docs/brainstorms/2026-08-03-drawer-tab-bar-design.md`

## Global Constraints

- **Node >= 22**, pnpm. Tests: `pnpm test` → `node --experimental-strip-types --test "src/**/*.test.ts"`.
- **Test imports use the `.ts` extension** (`import { x } from './y.ts'`); source-to-source imports stay extensionless. Required by `--experimental-strip-types` — do not "fix" it.
- **Tests use `node:test` + `node:assert/strict`.** No other framework.
- **Never `any`.** Undocumented Obsidian surfaces go only through `src/obsidian-internals.ts`, narrowed with `as unknown as` and defensively guarded, returning a safe fallback on any structural miss.
- **Phone only:** every entry point guards on `Platform.isPhone` and returns early otherwise.
- **Settings are checked inside handlers**, never captured at install time, so toggles apply live.
- **styles.css contract** (enforced by `src/style-contract.test.ts`, must stay green):
  - No raw `ms`, hex colours, or `cubic-bezier()` outside a `var(--token, fallback)` expression on the same line.
  - `!important` count must stay at **0**.
  - Every `:hover` selector sits inside `@media (hover: hover)`.
  - `transition` on `background-color` / `color` / `opacity` uses `var(--portal-wash-motion)`; physical transforms use `var(--portal-motion)`.
  - No CSS comment may contain `--token*/` (terminates the comment early).
- **Animation:** only `transform` and `opacity` during a gesture. Never `width`, `left`, `top`, or `margin`.
- **`pnpm release:check`** (`lint && test && build`) must pass before any task is considered done.
- Do **not** touch `manifest.json`, `package.json`, or `versions.json` versions.
- **SHARED WORKING TREE.** Another session works in this repo concurrently (files under `src/kit/`, `src/icons/`). ALWAYS commit with explicit pathspecs: `git commit -- <paths>`. Never a bare `git commit`, never `git add -A`, never `git add .` — a bare commit sweeps whatever is already staged, including another session's index. Run `git status --short` before every commit and confirm only your own files are staged.

---

### Task 1: Move the slot type and delete the hub navbar

**Files:**
- Modify: `src/phone-chrome/navbar.ts`
- Modify: `src/phone-chrome/drawer-tabs.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export interface NavbarSlot { id: string; icon: string; label: string }` in `navbar.ts`, and `PhoneChromeNavbar`'s constructor taking `NavbarSlot[]` instead of `ResolvedSlot[]`.

`navbar.ts` and `drawer-tabs.ts` both import `ResolvedSlot` from `hub-registry.ts`, which this task deletes. The type is the navbar's input contract — what it needs to draw a pill — not a registry concept. `enabled`/`pageable` go with it: every drawer tab is real and reachable by definition, and `drawer-tabs.ts` currently sets both to a constant `true` purely to satisfy the type. A module that has to lie to satisfy a type is a sign the type belongs elsewhere.

- [ ] **Step 1: Add the type to `navbar.ts`**

Insert above the `PhoneChromeNavbar` class declaration:

```ts
/** What the bar needs to draw one pill. Owned here, not by a registry: this
 *  is the navbar's input contract, and the drawer tabs that feed it have no
 *  notion of being enabled or unreachable — every tab in a drawer is real. */
export interface NavbarSlot {
  /** Stable id, written to `data-slot` for styling and diagnostics. */
  id: string;
  /** Icon id passed to Obsidian's `setIcon`. */
  icon: string;
  /** Label shown when this pill is the expanded, active one. */
  label: string;
}
```

- [ ] **Step 2: Retype the constructor and drop the disabled handling**

In `navbar.ts`, replace the import line:

```ts
import type { ResolvedSlot } from './hub-registry';
```

with nothing (delete it), and change the constructor parameter from
`private readonly resolved: ResolvedSlot[]` to
`private readonly slots: NavbarSlot[]`.

Then rewrite the constructor's loop body so it reads the flat type. Replace:

```ts
    this.resolved.forEach((entry, index) => {
      const slotEl = this.el.createDiv({ cls: 'portal-phone-slot' });
      slotEl.dataset.slot = entry.slot.id;
      slotEl.toggleClass('is-disabled', !entry.enabled);
```

with:

```ts
    this.slots.forEach((slot, index) => {
      const slotEl = this.el.createDiv({ cls: 'portal-phone-slot' });
      slotEl.dataset.slot = slot.id;
```

Replace the two `entry.slot.*` reads further down:

```ts
      setIcon(iconEl, entry.slot.icon);
```
becomes
```ts
      setIcon(iconEl, slot.icon);
```

and

```ts
      labelEl.setText(entry.slot.label);
```
becomes
```ts
      labelEl.setText(slot.label);
```

Finally replace the conditional listener:

```ts
      if (entry.enabled) {
        slotEl.addEventListener('click', () => this.onSelect(index));
      }
```

with an unconditional one — there is no disabled state any more:

```ts
      slotEl.addEventListener('click', () => this.onSelect(index));
```

Search the rest of the file for `this.resolved` and rename each to `this.slots`.

- [ ] **Step 3: Update `drawer-tabs.ts` to build the flat type**

Replace the import:

```ts
import type { ResolvedSlot } from './hub-registry';
```

with:

```ts
import type { NavbarSlot } from './navbar';
```

(merge it into the existing `import { PhoneChromeNavbar } from './navbar';` line as
`import { PhoneChromeNavbar, type NavbarSlot } from './navbar';`)

and replace the `tabsAsSlots` function wholesale:

```ts
  /** Tabs as the bar renders them. Read live from the drawer, so the bar can
   *  only ever show sections that are actually in there. */
  const tabsAsSlots = (leaves: WorkspaceLeaf[]): NavbarSlot[] =>
    leaves.map((leaf, i) => ({
      id: `drawer-${i}`,
      icon: leaf.view.getIcon(),
      label: leaf.view.getDisplayText(),
    }));
```

- [ ] **Step 4: Do NOT run the gate yet**

`hub-level.ts:474` calls `new PhoneChromeNavbar(host, resolved, container)` with a `ResolvedSlot[]`, so retyping the constructor breaks it immediately. There is no intermediate state that compiles: `hub-level.ts` cannot survive the retype, and it cannot be deleted first because `navbar.ts` still imports from `hub-registry.ts`. The deletion below is therefore part of this task, not a later one.

Continue straight to Step 5.

- [ ] **Step 5: Delete the files**

```bash
git rm src/phone-chrome/hub-level.ts src/phone-chrome/pager.ts \
       src/phone-chrome/hub-registry.ts src/phone-chrome/hub-registry.test.ts \
       src/phone-chrome/slots.ts src/phone-chrome/slots.test.ts
```

- [ ] **Step 6: Unwire `main.ts`**

Delete this import line:

```ts
import { installPhoneChrome } from './phone-chrome/hub-level';
```

Delete the field and its doc comment:

```ts
  /** Re-syncs the phone hub chrome against current settings/workspace state
   *  — a no-op on desktop. Exposed so the settings tab's `phoneChrome`
   *  toggle can apply live instead of waiting for the next
   *  layout-change/active-leaf-change. Assigned in `onload()`. */
  syncPhoneChrome: () => void = () => {};
```

Delete the call and its comment from `onload()`:

```ts
    // Phone-only: segmented hub navbar with a swipe pager (default off).
    this.syncPhoneChrome = installPhoneChrome(this);
```

Leave `installDrawerTabs`/`syncDrawerTabs` exactly as they are.

- [ ] **Step 7: Remove the settings**

In `src/settings.ts`:

Delete the import of the slots module:

```ts
import {
  DEFAULT_PHONE_CHROME_SLOTS,
  parsePhoneChromeSlots,
  type PhoneChromeSlot,
} from './phone-chrome/slots';
```

(if the names are spread across an existing import block, remove only these three.)

Delete both interface fields and their doc comments:

```ts
  phoneChrome: boolean;
  /** The hub views the phone-chrome pager moves between, in bar order. */
  phoneChromeSlots: PhoneChromeSlot[];
```

Delete both `DEFAULT_SETTINGS` entries:

```ts
  phoneChrome: false,
  phoneChromeSlots: [...DEFAULT_PHONE_CHROME_SLOTS],
```

Delete both `parseSettings` entries:

```ts
    phoneChrome:
      typeof data.phoneChrome === 'boolean'
        ? data.phoneChrome
        : DEFAULT_SETTINGS.phoneChrome,
    phoneChromeSlots: parsePhoneChromeSlots(data.phoneChromeSlots),
```

Delete the whole "Phone hub navbar" `new Setting(containerEl)` block from `PortalSettingTab.display()` — the one whose `.setName('Phone hub navbar')` and whose `onChange` calls `this.plugin.syncPhoneChrome()`. Leave the "Drawer tab bar" block that follows it.

- [ ] **Step 8: Remove the hub CSS**

In `styles.css`, delete every rule whose selector mentions `.portal-phone-hub`, `.portal-phone-peek`, `.portal-phone-dragging` or `.portal-phone-settling`, together with the comment blocks that introduce them.

**Keep** every `.portal-phone-navbar`, `.portal-phone-slot`, `.portal-phone-slot-bg`, `.portal-phone-pill-cap`, `.portal-phone-pill-mid`, `.portal-phone-slot-icon` and `.portal-phone-slot-label` rule — those draw the pills the drawer bar uses — and keep `.portal-drawer-tabs`.

**One block needs editing, not deleting.** The `prefers-reduced-motion` rule (around line 709) lists navbar selectors to keep AND one hub selector to remove, in the same selector list. Deleting the whole block would silently strip reduced-motion support from the pills. Change it from:

```css
  .portal-phone-navbar.is-animating .portal-phone-slot,
  .portal-phone-navbar.is-animating .portal-phone-pill-cap,
  .portal-phone-navbar.is-animating .portal-phone-pill-mid,
  .portal-phone-navbar.is-animating .portal-phone-slot-bg,
  .portal-phone-navbar.is-animating .portal-phone-slot-label,
  .portal-phone-hub > .workspace-leaf.portal-phone-settling {
    transition: none;
  }
```

to just the five navbar lines (drop the trailing `.portal-phone-hub` selector and move the comma):

```css
  .portal-phone-navbar.is-animating .portal-phone-slot,
  .portal-phone-navbar.is-animating .portal-phone-pill-cap,
  .portal-phone-navbar.is-animating .portal-phone-pill-mid,
  .portal-phone-navbar.is-animating .portal-phone-slot-bg,
  .portal-phone-navbar.is-animating .portal-phone-slot-label {
    transition: none;
  }
```

Verify nothing was over-deleted:

```bash
grep -c "portal-phone-navbar\|portal-phone-slot" styles.css   # expect > 0
grep -c "portal-phone-hub\|portal-phone-peek" styles.css      # expect 0
```

- [ ] **Step 9: Verify nothing still references the deleted modules**

```bash
grep -rn "hub-level\|installPhoneChrome\|syncPhoneChrome\|phoneChromeSlots\|hub-registry\|PhoneChromePager\|ResolvedSlot" src/ || echo "clean"
```

Expected: `clean`. Any hit is a reference the deletion missed — fix it before continuing.

- [ ] **Step 10: Verify the gate**

Run: `pnpm release:check`
Expected: exit 0. The test count drops (the two deleted test files go with their modules); `pill-geometry.test.ts`, `gesture-decide.test.ts` and `drawer-model.test.ts` must all still be present and green.

- [ ] **Step 11: Confirm the feature is inert on desktop**

Run: `pnpm build`, then reload Obsidian on desktop and confirm nothing changed — the rail behaves as before, no `.portal-phone-*` or `.portal-drawer-tabs` element exists in the DOM, and no console errors appear. `Platform.isPhone` is false there, so `installDrawerTabs` returns before touching anything.

- [ ] **Step 12: Commit**

```bash
git status --short
git commit -m "feat(phone-chrome)!: remove the hub navbar

It never worked on device. All three defects — a neighbouring view that
stayed invisible during the drag, taps landing on live content underneath,
two leaves tearing apart mid-glide — came from one root cause: it dragged
real workspace leaves inside a container it did not own.

The drawer tab bar replaces it, where Obsidian owns the swap.

Removes hub-level, pager, hub-registry, slots and their tests, both settings,
and the related CSS. navbar/pill-geometry/gesture-decide stay — the drawer
bar uses them." -- src/phone-chrome/ src/main.ts src/settings.ts styles.css
```
---

### Task 2: Extract the drawer-reading logic as pure functions

**Files:**
- Create: `src/phone-chrome/drawer-model.ts`
- Create: `src/phone-chrome/drawer-model.test.ts`

**Interfaces:**
- Consumes: `NavbarSlot` from Task 1.
- Produces: `interface TabInfo { icon: string; label: string; viewType: string }`, `tabsToSlots(tabs: readonly TabInfo[]): NavbarSlot[]`, `tabsSignature(tabs: readonly TabInfo[]): string`, `clampTabIndex(index: number, count: number): number`.

`drawer-tabs.ts` does its work against a live workspace, which cannot be unit-tested. These three decisions can: turning tabs into pills, deciding when a remount is needed, and keeping an index in range. Pulling them out is what makes the module testable at all.

- [ ] **Step 1: Write the failing test**

Create `src/phone-chrome/drawer-model.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { clampTabIndex, tabsSignature, tabsToSlots, type TabInfo } from './drawer-model.ts';

const tabs: TabInfo[] = [
  { icon: 'links-coming-in', label: 'Backlinks', viewType: 'backlink' },
  { icon: 'links-going-out', label: 'Outgoing links', viewType: 'outgoing-link' },
  { icon: 'list', label: 'Outline', viewType: 'outline' },
];

test('every tab becomes a pill, in order', () => {
  const slots = tabsToSlots(tabs);
  assert.equal(slots.length, 3);
  assert.deepEqual(
    slots.map((s) => s.label),
    ['Backlinks', 'Outgoing links', 'Outline'],
  );
  assert.equal(slots[0]?.icon, 'links-coming-in');
});

test('pill ids are unique and positional', () => {
  const ids = tabsToSlots(tabs).map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  // Two drawers can hold the same view type, and a tab has no id of its own,
  // so position is the only thing that identifies a pill.
  assert.deepEqual(ids, ['drawer-0', 'drawer-1', 'drawer-2']);
});

test('the signature changes when the tab set changes', () => {
  const base = tabsSignature(tabs);
  assert.equal(tabsSignature(tabs), base, 'same tabs, same signature');

  const added = tabsSignature([...tabs, { icon: 'calendar', label: 'Calendar', viewType: 'calendar' }]);
  assert.notEqual(added, base);

  const removed = tabsSignature(tabs.slice(0, 2));
  assert.notEqual(removed, base);

  const reordered = tabsSignature([tabs[1]!, tabs[0]!, tabs[2]!]);
  assert.notEqual(reordered, base, 'order matters — the pills would move');
});

test('the signature ignores label changes', () => {
  // A view renaming itself (Outline showing the note title, say) must not
  // tear down and rebuild the bar mid-use.
  const renamed = tabs.map((t) => ({ ...t, label: t.label + ' (2)' }));
  assert.equal(tabsSignature(renamed), tabsSignature(tabs));
});

test('clampTabIndex keeps an index inside the tab list', () => {
  assert.equal(clampTabIndex(1, 3), 1);
  assert.equal(clampTabIndex(-1, 3), 0);
  assert.equal(clampTabIndex(7, 3), 2);
});

test('clampTabIndex returns 0 for an empty list rather than -1', () => {
  // Callers index into arrays with the result; -1 would read undefined.
  assert.equal(clampTabIndex(3, 0), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module './drawer-model.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/phone-chrome/drawer-model.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS — all six `drawer-model.test.ts` tests green, every pre-existing test still green.

- [ ] **Step 5: Commit**

```bash
git status --short
git commit -m "feat(phone-chrome): pure drawer tab model

tabsToSlots, tabsSignature and clampTabIndex are the three decisions in the
drawer bar that do not need a live workspace. The signature keys on view
types, not labels, so a view renaming itself cannot rebuild the bar mid-use." -- src/phone-chrome/drawer-model.ts src/phone-chrome/drawer-model.test.ts
```

---

### Task 3: Both drawers, and the swipe

**Files:**
- Modify: `src/phone-chrome/drawer-tabs.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `NavbarSlot` (Task 1); `TabInfo`, `tabsToSlots`, `tabsSignature`, `clampTabIndex` (Task 2); `decideClaim(dx, dy) → 'pending' | 'claim' | 'ignore'` and `decideSnap(progress, velocity, activeIndex, slotCount) → 'next' | 'prev' | 'back'` from `./gesture-decide`; `drawerTabParentOf(leaf)` and `selectDrawerTab(parent, index)` from `../obsidian-internals`.
- Produces: `installDrawerTabs(plugin: PortalPlugin): () => void` (unchanged signature).

Today `drawer-tabs.ts` handles the right drawer only and supports tap only. This task generalises it to both drawers and adds the swipe.

**The swipe's shape is dictated by a verified constraint:** Obsidian renders only the active drawer tab, so there is no neighbouring view to drag. Only the pill tracks the finger; the section changes on release. Do not try to move content.

- [ ] **Step 1: Rewrite `drawer-tabs.ts`**

Replace the whole file:

```ts
import { Platform } from 'obsidian';
import type { WorkspaceLeaf, WorkspaceMobileDrawer, WorkspaceSidedock } from 'obsidian';
import type PortalPlugin from '../main';
import { drawerTabParentOf, selectDrawerTab } from '../obsidian-internals';
import { clampTabIndex, tabsSignature, tabsToSlots, type TabInfo } from './drawer-model';
import { decideClaim, decideSnap } from './gesture-decide';
import { PhoneChromeNavbar } from './navbar';

/**
 * Phone-only: a segmented pill bar at the top of each mobile drawer, driving
 * Obsidian's own drawer tabs.
 *
 * Why the drawer and not the root split (which the removed hub navbar tried):
 * inside a drawer Obsidian owns the swap. `selectTabIndex` is the same entry
 * point its native press-and-slide selector calls, and the active view is
 * rendered into `.workspace-drawer-active-tab-content`. Nothing has to be
 * reparented, revealed, or cleaned up, so the defects that came from dragging
 * real leaves in a borrowed container cannot occur here.
 *
 * The tabs are read from the drawer, never configured: the bar shows exactly
 * what is in there, so it cannot advertise a section that does not exist.
 *
 * The bar is additive — Obsidian's native selector stays where it is, so a
 * failure degrades to the previous behaviour instead of trapping the user.
 */

/** Marks a drawer while our bar owns it: styling, and `touch-action` so the
 *  browser leaves horizontal drags to us and keeps vertical scrolling. */
const DRAWER_CLASS = 'portal-drawer-tabs';

/** Which side a mounted bar belongs to. */
type Side = 'left' | 'right';

const HOST_SELECTOR: Record<Side, string> = {
  left: '.workspace-drawer.mod-left .workspace-drawer-active-tab-container',
  right: '.workspace-drawer.mod-right .workspace-drawer-active-tab-container',
};

interface Mounted {
  navbar: PhoneChromeNavbar;
  host: HTMLElement;
  signature: string;
  /** Torn down with the bar; see `attachGesture`. */
  detachGesture: () => void;
}

export function installDrawerTabs(plugin: PortalPlugin): () => void {
  if (!Platform.isPhone) return () => {};

  const mounted = new Map<Side, Mounted>();
  let disposed = false;

  // `WorkspaceSidedock | WorkspaceMobileDrawer`, not just the former: on
  // phone these ARE drawers, and narrowing to the desktop type would not
  // compile. We only ever compare it by identity against `leaf.getRoot()`.
  const sideRoot = (side: Side): WorkspaceSidedock | WorkspaceMobileDrawer =>
    side === 'left' ? plugin.app.workspace.leftSplit : plugin.app.workspace.rightSplit;

  /** Every leaf in that drawer, in tab order. */
  const drawerLeaves = (side: Side): WorkspaceLeaf[] => {
    const root = sideRoot(side);
    const leaves: WorkspaceLeaf[] = [];
    plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getRoot() === root) leaves.push(leaf);
    });
    return leaves;
  };

  const tabsOf = (leaves: readonly WorkspaceLeaf[]): TabInfo[] =>
    leaves.map((leaf) => ({
      icon: leaf.view.getIcon(),
      label: leaf.view.getDisplayText(),
      viewType: leaf.view.getViewType(),
    }));

  /** Current tab index for a drawer, clamped. */
  const activeIndexOf = (side: Side, count: number): number => {
    const first = drawerLeaves(side)[0];
    const parent = first ? drawerTabParentOf(first) : null;
    const raw = parent && typeof parent.currentTab === 'number' ? parent.currentTab : 0;
    return clampTabIndex(raw, count);
  };

  /** Switch a drawer to `index`, via the same call the native selector uses. */
  const goToTab = (side: Side, index: number): void => {
    const first = drawerLeaves(side)[0];
    if (!first) return;
    const parent = drawerTabParentOf(first);
    if (!parent) return;
    selectDrawerTab(parent, index);
  };

  const unmount = (side: Side): void => {
    const entry = mounted.get(side);
    if (!entry) return;
    entry.detachGesture();
    entry.navbar.destroy();
    entry.host.removeClass(DRAWER_CLASS);
    mounted.delete(side);
  };

  const unmountAll = (): void => {
    for (const side of [...mounted.keys()]) unmount(side);
  };

  /**
   * Horizontal drag over the whole drawer changes section.
   *
   * Only the PILL moves while the finger is down. Obsidian renders just the
   * active tab, so there is no neighbouring view to drag — showing one would
   * mean mounting views it never built, which is exactly what went wrong in
   * the hub navbar. The pill still answers "where am I going", which is what
   * the gesture has to communicate.
   *
   * Deliberate consequence, chosen by Mario over a narrower gesture: content
   * that scrolls horizontally inside a drawer (Bases tables) can no longer be
   * scrolled sideways while this is on.
   */
  const attachGesture = (side: Side, host: HTMLElement, count: number): (() => void) => {
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastTime = 0;
    let prevX = 0;
    let prevTime = 0;
    let width = 1;
    let state: 'idle' | 'pending' | 'dragging' | 'released' = 'idle';
    let from = 0;

    const onStart = (evt: TouchEvent): void => {
      const touch = evt.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      prevX = touch.clientX;
      lastTime = evt.timeStamp;
      prevTime = evt.timeStamp;
      state = 'pending';
    };

    const onMove = (evt: TouchEvent): void => {
      const touch = evt.touches[0];
      if (!touch) return;
      if (state === 'released' || state === 'idle') return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      if (state === 'pending') {
        const claim = decideClaim(dx, dy);
        if (claim === 'pending') return;
        if (claim === 'ignore') {
          state = 'released';
          return;
        }
        state = 'dragging';
        from = activeIndexOf(side, count);
        // The one layout read of the gesture; every frame after reuses it.
        width = host.clientWidth || 1;
      }

      // Claimed: the browser must not also scroll or fire a native gesture.
      evt.preventDefault();

      const progress = Math.max(-1, Math.min(1, -dx / width));
      const target = progress > 0 ? from + 1 : from - 1;
      prevX = lastX;
      prevTime = lastTime;
      lastX = touch.clientX;
      lastTime = evt.timeStamp;

      const entry = mounted.get(side);
      // Out of range at either end → the pill stays put and the drag
      // rubber-bands, which is what `setProgress` does with no target.
      if (target < 0 || target >= count) {
        entry?.navbar.setProgress(from, 0);
        return;
      }
      entry?.navbar.setProgress(from, progress, target);
    };

    const onEnd = (evt: TouchEvent): void => {
      if (state !== 'dragging') {
        state = 'idle';
        return;
      }
      state = 'idle';

      const dx = lastX - startX;
      const progress = Math.max(-1, Math.min(1, -dx / width));
      // Instantaneous velocity from the last two samples, in progress-per-ms
      // (decideSnap's unit). An average over the gesture would dilute a flick
      // thrown at the end of a slow drag — the case flick detection exists
      // for. A touchend long after the last move describes motion that has
      // already stopped, so it reads as zero.
      const dt = lastTime - prevTime;
      const sinceLastMove = evt.timeStamp - lastTime;
      const velocity = dt <= 0 || sinceLastMove > 60 ? 0 : -(lastX - prevX) / width / dt;

      const decision =
        evt.type === 'touchcancel' ? 'back' : decideSnap(progress, velocity, from, count);
      const landing = decision === 'next' ? from + 1 : decision === 'prev' ? from - 1 : from;

      const entry = mounted.get(side);
      entry?.navbar.render(clampTabIndex(landing, count));
      if (landing !== from) goToTab(side, landing);
    };

    // touchmove is never passive: a claimed drag must preventDefault().
    host.addEventListener('touchstart', onStart, { passive: true });
    host.addEventListener('touchmove', onMove, { passive: false });
    host.addEventListener('touchend', onEnd, { passive: true });
    host.addEventListener('touchcancel', onEnd, { passive: true });

    return () => {
      host.removeEventListener('touchstart', onStart);
      host.removeEventListener('touchmove', onMove);
      host.removeEventListener('touchend', onEnd);
      host.removeEventListener('touchcancel', onEnd);
    };
  };

  const syncSide = (side: Side): void => {
    const leaves = drawerLeaves(side);
    const tabs = tabsOf(leaves);

    // One tab is not a bar; zero means the drawer is not built yet.
    if (tabs.length < 2) {
      unmount(side);
      return;
    }

    const first = leaves[0];
    // Fail-safe: an Obsidian change to the drawer internals means the bar
    // never mounts, and the native selector keeps working untouched.
    if (!first || !drawerTabParentOf(first)) {
      unmount(side);
      return;
    }

    const host = document.querySelector<HTMLElement>(HOST_SELECTOR[side]);
    if (!host) {
      unmount(side);
      return;
    }

    const signature = tabsSignature(tabs);
    const existing = mounted.get(side);
    if (existing && (existing.host !== host || existing.signature !== signature)) {
      // The drawer was rebuilt, or its tab set changed. `PhoneChromeNavbar`
      // fixes its slots at construction, so a fresh mount is the only way
      // either change reaches the bar.
      unmount(side);
    }

    if (!mounted.has(side)) {
      host.addClass(DRAWER_CLASS);
      const navbar = new PhoneChromeNavbar(host, tabsToSlots(tabs), host.firstChild);
      navbar.onSelect = (index) => {
        navbar.render(clampTabIndex(index, tabs.length));
        goToTab(side, index);
      };
      const detachGesture = attachGesture(side, host, tabs.length);
      mounted.set(side, { navbar, host, signature, detachGesture });
    }

    mounted.get(side)?.navbar.render(activeIndexOf(side, tabs.length));
  };

  const sync = (): void => {
    if (disposed) return;
    if (!plugin.settings.drawerTabs) {
      unmountAll();
      return;
    }
    syncSide('left');
    syncSide('right');
  };

  plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', sync));
  plugin.app.workspace.onLayoutReady(sync);
  // A drawer can gain its width a frame after we attach; render() no-ops at
  // zero width, so without a retry a mount into an unlaid-out host sticks.
  const bootTimer = window.setTimeout(sync, 0);
  plugin.registerDomEvent(window, 'resize', () => {
    if (mounted.size > 0) sync();
  });

  plugin.register(() => {
    disposed = true;
    window.clearTimeout(bootTimer);
    unmountAll();
  });

  return sync;
}
```

- [ ] **Step 2: Update the stylesheet**

In `styles.css`, replace the existing drawer tab bar block:

```css
.portal-drawer-tabs > .portal-phone-navbar {
  margin: var(--size-4-2, 8px) var(--size-4-3, 12px);
  flex: 0 0 auto;
}
```

with:

```css
.portal-drawer-tabs > .portal-phone-navbar {
  margin: var(--size-4-2, 8px) var(--size-4-3, 12px);
  flex: 0 0 auto;
}

/* Horizontal drags belong to the bar; the browser keeps vertical scrolling.
   Without this the drawer's own scroll and our gesture fight on every
   diagonal thumb. */
.portal-drawer-tabs {
  touch-action: pan-y;
}
```

- [ ] **Step 3: Verify the gate**

Run: `pnpm release:check`
Expected: exit 0 — lint clean, all tests pass (including `style-contract.test.ts`), typecheck and build succeed.

- [ ] **Step 4: Commit**

```bash
git status --short
git commit -m "feat(phone-chrome): drawer tab bar in both drawers, with swipe

Reads each drawer's real tabs and drives selectTabIndex — the same entry
point Obsidian's native selector uses.

Obsidian renders only the ACTIVE drawer tab, so there is no neighbouring view
to drag: during a swipe the pill alone tracks the finger and the section
changes on release. Showing live content would mean mounting views Obsidian
never built, which is what broke the hub navbar.

Accepted regression: content that scrolls horizontally inside a drawer
(Bases tables) can no longer be scrolled sideways while this is on." -- src/phone-chrome/drawer-tabs.ts styles.css
```

---

### Task 4: Device verification

**Files:**
- Create: `docs/plans/2026-08-03-003-signoff.md`

**Interfaces:**
- Consumes: the complete feature.
- Produces: a signed-off checklist.

Phone emulation is how this bar was validated in the first place, and it is the only way to see it from a desktop. Do not skip it: three separate positioning defects shipped on this feature before emulation was used.

- [ ] **Step 1: Enter phone emulation**

```bash
obsidian dev:mobile on
```

Wait ~6s, then size the window and reload — `Platform.isPhone` stays false at desktop dimensions, and full-screen must be off for the resize to take:

```bash
obsidian eval code="const w=require('@electron/remote').getCurrentWindow(); w.setFullScreen(false); w.setSize(402,874); 'sized'"
obsidian eval code="location.reload();'r'"
```

Wait ~10s, then confirm:

```bash
obsidian eval code="'isPhone='+require('obsidian').Platform.isPhone+' w='+window.innerWidth"
```

Expected: `isPhone=true w=402`. If it says false, repeat the resize and reload — the first attempt after enabling emulation often lands before the window settles.

- [ ] **Step 2: Turn the feature on and open a drawer**

```bash
obsidian eval code="
document.querySelectorAll('.notice').forEach(n=>n.remove());
const p=app.plugins.plugins.portal;
p.settings.drawerTabs=true;
p.saveSettings().then(()=>p.syncDrawerTabs());
app.workspace.rightSplit.expand();
'ready'"
```

- [ ] **Step 3: Verify the bar mounted in both drawers**

```bash
obsidian eval code="
const r=document.querySelector('.workspace-drawer.mod-right .portal-phone-navbar');
const l=document.querySelector('.workspace-drawer.mod-left .portal-phone-navbar');
JSON.stringify({right: !!r, rightPills: r?r.querySelectorAll('.portal-phone-slot').length:0, left: !!l})"
```

Expected: `right: true` with more than one pill. `left` may be false while the left drawer has never been opened this session — expand it and re-check:

```bash
obsidian eval code="app.workspace.leftSplit.expand(); 'expanded'"
```

- [ ] **Step 4: Verify a tap switches the tab**

```bash
obsidian eval code="
function cur(){
  const ls=[]; app.workspace.iterateAllLeaves(l=>{if(l.getRoot()===app.workspace.rightSplit) ls.push(l);});
  const p=ls[0].parent; return {idx:p.currentTab, type:p.children[p.currentTab].view.getViewType()};
}
const before=cur();
const bar=document.querySelector('.workspace-drawer.mod-right .portal-phone-navbar');
[...bar.querySelectorAll('.portal-phone-slot')][1].click();
JSON.stringify({before, after: cur()})"
```

Expected: `after.idx` is 1 and differs from `before.idx`.

- [ ] **Step 5: Verify a swipe switches the tab**

Dispatch the whole gesture in ONE `eval` — each call is a separate JS context, so variables do not survive between them. Dispatch on the host element, not `document`: the listeners are attached to the host.

```bash
obsidian eval code="
function cur(){
  const ls=[]; app.workspace.iterateAllLeaves(l=>{if(l.getRoot()===app.workspace.rightSplit) ls.push(l);});
  const p=ls[0].parent; return p.currentTab;
}
function mk(x,y,el){ return new Touch({identifier:1,target:el,clientX:x,clientY:y,pageX:x,pageY:y}); }
const host=document.querySelector('.workspace-drawer.mod-right .workspace-drawer-active-tab-container');
const before=cur();
const sx=300, sy=450;
const t0=mk(sx,sy,host);
host.dispatchEvent(new TouchEvent('touchstart',{touches:[t0],targetTouches:[t0],changedTouches:[t0],bubbles:true,cancelable:true}));
let lx=sx;
for(let dx=15;dx<=220;dx+=15){ lx=sx-dx; const t=mk(lx,sy,host);
  host.dispatchEvent(new TouchEvent('touchmove',{touches:[t],targetTouches:[t],changedTouches:[t],bubbles:true,cancelable:true})); }
const te=mk(lx,sy,host);
host.dispatchEvent(new TouchEvent('touchend',{touches:[],targetTouches:[],changedTouches:[te],bubbles:true,cancelable:true}));
JSON.stringify({before, after: cur()})"
```

Expected: `after` is `before + 1`.

- [ ] **Step 6: Screenshot**

```bash
obsidian eval code="document.querySelectorAll('.notice').forEach(n=>n.remove()); 'x'"
obsidian dev:screenshot path=/tmp/drawer-bar-signoff.png
```

Read the image and confirm: the pill bar sits at the top of the drawer, the active pill is expanded with its label, the others are icon-only, and nothing overlaps the drawer header.

- [ ] **Step 7: Restore the environment**

```bash
obsidian eval code="const p=app.plugins.plugins.portal; p.settings.drawerTabs=false; p.saveSettings().then(()=>p.syncDrawerTabs()); 'off'"
obsidian dev:mobile off
```

Wait ~9s, then restore the window (this often needs a second call — the first can land during the reload):

```bash
obsidian eval code="const w=require('@electron/remote').getCurrentWindow(); w.setSize(1512,949); w.setFullScreen(true); 'w='+window.innerWidth"
```

Expected: `w=1512`. Leaving Obsidian in emulation breaks Exo, which needs desktop Node access.

- [ ] **Step 8: Write the sign-off**

Create `docs/plans/2026-08-03-003-signoff.md` recording, for each of steps 3–6, what was actually observed — the real JSON output, not a restatement of what was expected — plus the Obsidian version and the emulated dimensions.

- [ ] **Step 9: Commit**

```bash
git status --short
git commit -m "docs: drawer tab bar emulation sign-off" -- docs/plans/2026-08-03-003-signoff.md
```

---

## Notes for the implementer

**The swipe shows no content, and that is correct.** Obsidian renders only the active drawer tab; there is no neighbouring view to drag. If you find yourself wanting to mount one so the swipe "looks right", stop — that is precisely what produced the three defects this feature replaces.

**Verify in emulation before claiming anything works.** Three positioning defects shipped on the predecessor because it was reasoned about instead of looked at. `obsidian dev:mobile on` plus a screenshot costs under a minute.

**Shared working tree.** Another session commits to this repo concurrently. Every commit in this plan uses explicit pathspecs for that reason. Run `git status --short` first, every time, and stage only your own files.
