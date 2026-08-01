import { Platform } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type PortalPlugin from '../main';
import { executeCommand, isCommandRegistered, isViewTypeRegistered } from '../obsidian-internals';
import {
  firstEnabledIndex,
  nextPageableIndex,
  resolveSlots,
  type ResolvedSlot,
} from './hub-registry';
import { PhoneChromeNavbar } from './navbar';
import { PhoneChromePager } from './pager';

/** The mobile root container Obsidian keeps every root leaf inside. Verified
 *  on device; also the anchor Cosmos Phone Edition relies on. */
const TAB_CONTAINER =
  '.workspace-tabs.mod-visible > .workspace-tab-container';
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
  /** Per-gesture cache, filled at claim and reused by every frame. Gesture
   *  frames must never query the workspace or force layout — that is the
   *  fluidity contract, and this object is how the hub honours it. */
  let gesture: {
    targetIndex: number;
    currentEl: HTMLElement;
    neighbourEl: HTMLElement;
    width: number;
  } | null = null;

  const slotLeaves = (): (WorkspaceLeaf | null)[] =>
    resolved.map(({ slot, enabled }) => {
      if (!enabled || !slot.viewType) return null;
      return plugin.app.workspace.getLeavesOfType(slot.viewType)[0] ?? null;
    });

  const leafEl = (leaf: WorkspaceLeaf | null | undefined): HTMLElement | null =>
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
      el.classList.remove(PEEK_CLASS, 'portal-phone-dragging', 'portal-phone-settling');
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
    // Backstop 2: the container may gain its width a frame after we attach.
    // render() is idempotent and no-ops at zero width, so an extra call is
    // free; without it a mount into an unlaid-out host is permanent.
    window.setTimeout(() => navbar?.render(activeIndex), 0);
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

    // Question B PASS → `document`: the pager runs before Obsidian's drawer
    // handler and swallows the touch itself, so the swipe works edge to edge.
    // Question B FAIL → swap this for `container` and keep the carve-out
    // listener at the bottom of this file.
    pager = new PhoneChromePager(container, document, {
      slotCount: () => resolved.length,
      activeIndex: () => activeIndex,
      onClaim: (direction) => {
        // Spec: disabled and tap-only slots are SKIPPED by the pager, so the
        // destination is the nearest pageable slot, not blindly ±1.
        const targetIndex = nextPageableIndex(resolved, activeIndex, direction);
        if (targetIndex === -1 || !container) return null;
        const target = slotLeaves()[targetIndex];
        const currentEl = leafEl(slotLeaves()[activeIndex]);
        const neighbourEl = leafEl(target);
        if (!target || !currentEl || !neighbourEl) return null;
        // Neighbour views are deferred at rest (Obsidian 1.7+): mounting one
        // here, at first contact, is what lets the swipe show real content
        // without keeping every hub view alive all the time. Fire and forget —
        // the drag has ~120ms of travel before the neighbour is on screen, and
        // an unresolved leaf simply renders empty for a frame.
        void target.loadIfDeferred();
        // Question A from the spike: force the sibling visible for the drag.
        neighbourEl.addClass(PEEK_CLASS);
        // Promote both leaves to their own compositor layers for THIS drag
        // only — permanent will-change on two viewport-sized elements would
        // hold their textures in GPU memory for the whole session.
        currentEl.addClass('portal-phone-dragging');
        neighbourEl.addClass('portal-phone-dragging');
        gesture = {
          targetIndex,
          currentEl,
          neighbourEl,
          // The claim's one layout read; every frame below reuses it.
          width: container.clientWidth || 1,
        };
        return neighbourEl;
      },
      onProgress: (progress) => {
        // Cached elements and width only — no queries, no layout, per frame.
        if (!gesture) return;
        const { currentEl, neighbourEl, width, targetIndex } = gesture;
        currentEl.style.transform = `translateX(${-progress * width}px)`;
        const offset = progress > 0 ? width : -width;
        neighbourEl.style.transform = `translateX(${offset - progress * width}px)`;
        navbar?.setProgress(activeIndex, progress, targetIndex);
      },
      onSettle: (decision) => {
        const settled = gesture;
        gesture = null;
        if (!settled) {
          // Rubber-band release with no neighbour: nothing moved but the bar.
          navbar?.render(activeIndex);
          return;
        }
        const { currentEl, neighbourEl, width, targetIndex } = settled;
        const goes = decision === 'next' || decision === 'prev';
        const landing = goes ? targetIndex : activeIndex;
        const dir = targetIndex > activeIndex ? 1 : -1;

        // Finish the slide with a transition instead of jump-cutting: set the
        // final transforms, let the panel easing play, then hand the leaf
        // over and clean up. `transitionend` can be swallowed if the element
        // is hidden mid-flight, so a timeout backstop always runs the
        // epilogue exactly once.
        currentEl.addClass('portal-phone-settling');
        neighbourEl.addClass('portal-phone-settling');
        currentEl.style.transform = goes
          ? `translateX(${-dir * width}px)`
          : 'translateX(0)';
        neighbourEl.style.transform = goes
          ? 'translateX(0)'
          : `translateX(${dir * width}px)`;

        let done = false;
        const epilogue = (): void => {
          if (done) return;
          done = true;
          clearTransforms();
          activeIndex = landing;
          const leaf = slotLeaves()[landing];
          if (leaf) plugin.app.workspace.setActiveLeaf(leaf, { focus: true });
          navbar?.render(activeIndex);
        };
        currentEl.addEventListener('transitionend', epilogue, { once: true });
        window.setTimeout(epilogue, 350);
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

  // NOTE — only needed if the spike recorded Question B as FAIL. With the
  // unified wiring above, the pager already swallows every hub touch at
  // document capture and this listener must NOT exist: two listeners racing
  // for the same touch is the bug that would ship the feature dead.
  //
  // Fallback shape, for reference. `stopImmediatePropagation` at document
  // capture halts propagation toward the target, so it may only ever fire
  // for touches the pager is not going to want — hence the bezel-only test.
  // Consequence: a swipe started in the outer 24px does not page.
  //
  //   const DRAWER_EDGE_PX = 24;
  //   plugin.registerDomEvent(document, 'touchstart', (evt: TouchEvent) => {
  //     if (!plugin.settings.phoneChrome || !container) return;
  //     const touch = evt.touches[0];
  //     const target = evt.target as HTMLElement | null;
  //     if (!touch || !target?.closest(`.${HUB_CLASS}`)) return;
  //     const nearEdge =
  //       touch.clientX <= DRAWER_EDGE_PX ||
  //       touch.clientX >= window.innerWidth - DRAWER_EDGE_PX;
  //     if (!nearEdge) return;
  //     evt.stopImmediatePropagation();
  //   }, { capture: true });

  plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', sync));
  plugin.app.workspace.onLayoutReady(sync);

  // The navbar measures itself in render() and gives up when the host has no
  // width yet — a deferred or hidden leaf mounts at 0px, every slot stacks at
  // x=0, and nothing in the navbar schedules a retry. Two backstops, because
  // the failure is silent and permanent otherwise:
  //   1. re-render on viewport resize (rotation, keyboard, split changes)
  //   2. one deferred re-render after mount, for the case where the container
  //      is laid out a frame after we attach
  // Obsidian's rAF and ResizeObserver both starve on an idle pane, so this
  // leans on window resize plus an explicit timeout rather than an observer.
  plugin.registerDomEvent(window, 'resize', () => {
    if (!plugin.settings.phoneChrome) return;
    navbar?.render(activeIndex);
  });
}
