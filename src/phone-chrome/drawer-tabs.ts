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

/**
 * Obsidian's own opt-out from its global mobile swipe, set on the host for as
 * long as our bar owns it.
 *
 * `touch-action: pan-y` only tells the *browser* to stay out of a horizontal
 * drag. Obsidian's swipe is not the browser: it listens on `window`, and the
 * mobile drawer subscribes to the resulting `swipe` event to slide itself
 * open/closed under the finger. Both gestures would fire on the same drag —
 * the drawer visibly wins, so the tab never appears to change.
 *
 * Its producer walks up from the touch target and abandons the gesture at the
 * first ancestor carrying this attribute; Obsidian sets it on its own tab
 * selector for the same reason. On the host it covers every descendant, which
 * is the whole drawer body.
 *
 * The cost is the swipe-to-close over the drawer *body*. The drawer header is
 * a sibling of the host and keeps it, as does a tap on the backdrop, so the
 * drawer is never trapped open. Two gestures cannot share one surface, and
 * the tab swipe is the one this feature exists for.
 */
const IGNORE_SWIPE_ATTR = 'data-ignore-swipe';

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
  /** Torn down with the bar; see `observeWidth`. */
  detachResize: () => void;
  /** True while this drawer's gesture is mid-drag. Per-entry, not a module
   *  flag, so the two drawers stay independent: `syncSide` reads its own
   *  side's value and never blocks on the other drawer's drag. */
  isDragging: () => boolean;
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

  /** The authoritative tab count for a drawer: `parent.children.length`, the
   *  same value `selectDrawerTab` bounds an index against — not re-derived by
   *  counting leaves. The two agree today only because a phone drawer is a
   *  single tab group; this keeps that agreement from being incidental. */
  const tabCountOf = (leaves: readonly WorkspaceLeaf[]): number => {
    const first = leaves[0];
    const parent = first ? drawerTabParentOf(first) : null;
    return Array.isArray(parent?.children) ? parent.children.length : 0;
  };

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
    entry.detachResize();
    entry.detachGesture();
    entry.navbar.destroy();
    entry.host.removeClass(DRAWER_CLASS);
    entry.host.removeAttribute(IGNORE_SWIPE_ATTR);
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
  const attachGesture = (
    side: Side,
    host: HTMLElement,
    count: number,
  ): { detach: () => void; isDragging: () => boolean } => {
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
      // Stop this touch from ever reaching Obsidian's own swipe-to-close: its
      // listener sits on `workspace.containerEl`, an ancestor of every drawer,
      // and fires on bubble. `data-ignore-swipe` asks it to bail once it runs
      // — this makes sure it never runs at all for a touch that started here,
      // which holds regardless of what its own bail-out checks do. Safe on a
      // passive listener: `stopPropagation` is not restricted the way
      // `preventDefault` is.
      evt.stopPropagation();

      // A second finger mid-drag, or a touchstart while the previous touch's
      // cycle has not reached 'idle' yet, is not a fresh gesture: release
      // rather than re-seed on the newcomer, which would freeze the pill and
      // then jump it on re-claim. If it interrupted an actual drag, the pill
      // is left mid-morph and no `layout-change`/`active-leaf-change` fires
      // for an aborted gesture — unwind it back to rest ourselves.
      if (evt.touches.length > 1 || state !== 'idle') {
        if (state === 'dragging') mounted.get(side)?.navbar.setProgress(from, 0);
        state = 'released';
        return;
      }
      const touch = evt.touches[0];
      if (!touch) return;
      // A touch starting ON the bar is a tap on a pill, not a page drag —
      // release immediately so a wobbly thumb doesn't swallow the tap.
      // (Without this, >8px of horizontal jitter makes `onMove` call
      // `preventDefault()`, which per the Touch Events spec suppresses the
      // compatibility `click`, so `PhoneChromeNavbar.onSelect` never fires.)
      const target = evt.target;
      if (target instanceof Element && target.closest('.portal-phone-navbar')) {
        state = 'released';
        return;
      }
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
      evt.stopPropagation();

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

    return {
      detach: () => {
        host.removeEventListener('touchstart', onStart);
        host.removeEventListener('touchmove', onMove);
        host.removeEventListener('touchend', onEnd);
        host.removeEventListener('touchcancel', onEnd);
      },
      isDragging: () => state === 'dragging',
    };
  };

  /**
   * Re-render the bar when its drawer actually has a width.
   *
   * A collapsed drawer is `hide()`n, so at boot — the only moment both sides
   * are synced — every host measures zero and `PhoneChromeNavbar.render`
   * leaves the pills unpainted. Obsidian's `expand()` fires no workspace
   * event: its only `requestResize` lives in `selectTabIndex`. So the bar
   * used to stay invisible until the first tab change through the native
   * selector, which is why a drawer the user merely opened looked empty.
   *
   * A `ResizeObserver` is the exact question being asked — "has my host got a
   * box yet" — and it covers rotation and drawer-width changes for free.
   * Width-only, so the bar's own height never feeds back into it.
   */
  const observeWidth = (side: Side, host: HTMLElement): (() => void) => {
    let lastWidth = -1;
    const observer = new ResizeObserver(() => {
      const width = host.clientWidth;
      if (width === lastWidth) return;
      lastWidth = width;
      if (width === 0) return;
      const entry = mounted.get(side);
      if (!entry || entry.isDragging()) return;
      const count = tabCountOf(drawerLeaves(side));
      if (count < 2) return;
      entry.navbar.render(activeIndexOf(side, count));
    });
    observer.observe(host);
    return () => observer.disconnect();
  };

  const syncSide = (side: Side): void => {
    // Nothing in the drag path calls back into Obsidian, so only an external
    // layout-change/resize could land here mid-gesture. Guarding is cheap and
    // makes it airtight: a re-render would set `is-animating` and re-read
    // layout out from under the touch handler's cached numbers.
    if (mounted.get(side)?.isDragging()) return;

    const leaves = drawerLeaves(side);
    const tabs = tabsOf(leaves);
    const count = tabCountOf(leaves);

    // One tab is not a bar; zero means the drawer is not built yet.
    if (count < 2) {
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
      host.setAttribute(IGNORE_SWIPE_ATTR, 'true');
      const navbar = new PhoneChromeNavbar(host, tabsToSlots(tabs), host.firstChild);
      navbar.onSelect = (index) => {
        navbar.render(clampTabIndex(index, count));
        goToTab(side, index);
      };
      const gesture = attachGesture(side, host, count);
      mounted.set(side, {
        navbar,
        host,
        signature,
        detachGesture: gesture.detach,
        detachResize: () => {},
        isDragging: gesture.isDragging,
      });
      // After the entry exists: the observer's first callback reads it.
      const entry = mounted.get(side);
      if (entry) entry.detachResize = observeWidth(side, host);
    }

    mounted.get(side)?.navbar.render(activeIndexOf(side, count));
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
