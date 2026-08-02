import { Platform } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type PortalPlugin from '../main';
import { drawerTabParentOf, selectDrawerTab } from '../obsidian-internals';
import type { ResolvedSlot } from './hub-registry';
import { PhoneChromeNavbar } from './navbar';

/**
 * Phone-only: a segmented pill bar at the top of the right drawer, driving
 * Obsidian's own drawer tabs.
 *
 * Why here and not over the root split (which the hub navbar does): inside a
 * drawer, Obsidian already stacks every tab's view absolutely at full size
 * and swaps them itself. Nothing has to be dragged, revealed, or cleaned up,
 * so the whole class of defects that came from borrowing the tab container —
 * a neighbour leaf that stays invisible until it is activated, taps landing
 * on live content underneath a drag — cannot happen. `selectTabIndex` is the
 * same entry point Obsidian's own press-and-slide selector calls.
 *
 * The tabs are read from the drawer, never configured: the bar shows exactly
 * what is in there right now, so it cannot advertise a section that does not
 * exist. That is the opposite of the hub navbar's configured-slots model, and
 * deliberately so — here there is nothing to resolve or lazily create.
 *
 * Obsidian's native selector stays where it is. This bar is additive: it
 * turns "press the selector, wait for the list, slide to a tab" into one tap.
 */

/** Marks the drawer while our bar is mounted (styling hook). */
const DRAWER_CLASS = 'portal-drawer-tabs';

export function installDrawerTabs(plugin: PortalPlugin): () => void {
  if (!Platform.isPhone) return () => {};

  let navbar: PhoneChromeNavbar | null = null;
  let host: HTMLElement | null = null;
  let mountedSignature = '';
  let disposed = false;

  /** Every leaf living in the right drawer, in tab order. */
  const drawerLeaves = (): WorkspaceLeaf[] => {
    const root = plugin.app.workspace.rightSplit;
    const leaves: WorkspaceLeaf[] = [];
    plugin.app.workspace.iterateAllLeaves((leaf) => {
      if (leaf.getRoot() === root) leaves.push(leaf);
    });
    return leaves;
  };

  /** Tabs as the bar renders them. `enabled`/`pageable` are both true: every
   *  drawer tab is real and reachable by definition — the fields exist only
   *  because `PhoneChromeNavbar` is shared with the hub bar, which needs
   *  them. */
  const tabsAsSlots = (leaves: WorkspaceLeaf[]): ResolvedSlot[] =>
    leaves.map((leaf, i) => ({
      slot: {
        id: `drawer-${i}`,
        icon: leaf.view.getIcon(),
        label: leaf.view.getDisplayText(),
        viewType: leaf.view.getViewType(),
      },
      enabled: true,
      pageable: true,
    }));

  /** Changes whenever the drawer's tab set changes, so a remount happens on
   *  a plugin adding/removing a sidebar view but not on every event. */
  const signatureOf = (leaves: WorkspaceLeaf[]): string =>
    leaves.map((l) => l.view.getViewType()).join('|');

  const unmount = (): void => {
    navbar?.destroy();
    navbar = null;
    host?.removeClass(DRAWER_CLASS);
    host = null;
    mountedSignature = '';
  };

  const sync = (): void => {
    if (disposed) return;
    if (!plugin.settings.drawerTabs) {
      if (navbar) unmount();
      return;
    }

    const leaves = drawerLeaves();
    // One tab is not a bar; zero means the drawer has not been built yet.
    if (leaves.length < 2) {
      if (navbar) unmount();
      return;
    }

    const first = leaves[0];
    if (!first) return;
    const parent = drawerTabParentOf(first);
    // Fail-safe: an Obsidian change to the drawer's internals means the bar
    // simply never mounts, and the native selector keeps working untouched.
    if (!parent) {
      if (navbar) unmount();
      return;
    }

    const liveHost = document.querySelector<HTMLElement>(
      '.workspace-drawer.mod-right .workspace-drawer-active-tab-container',
    );
    if (!liveHost) {
      if (navbar) unmount();
      return;
    }

    const signature = signatureOf(leaves);
    if (navbar && (liveHost !== host || signature !== mountedSignature)) {
      // The drawer was rebuilt, or its tab set changed. `PhoneChromeNavbar`
      // fixes its slots at construction, so a fresh mount is the only way
      // either change reaches the bar.
      unmount();
    }

    if (!navbar) {
      host = liveHost;
      host.addClass(DRAWER_CLASS);
      mountedSignature = signature;
      navbar = new PhoneChromeNavbar(host, tabsAsSlots(leaves), host.firstChild);
      navbar.onSelect = (index) => {
        const current = drawerLeaves();
        const target = current[0];
        if (!target) return;
        const live = drawerTabParentOf(target);
        if (!live) return;
        selectDrawerTab(live, index);
        // Render immediately rather than waiting for the event this fires:
        // we already know which tab was chosen.
        navbar?.render(index);
      };
    }

    const activeIndex = Math.max(0, typeof parent.currentTab === 'number' ? parent.currentTab : 0);
    navbar.render(activeIndex);
  };

  plugin.registerEvent(plugin.app.workspace.on('layout-change', sync));
  plugin.registerEvent(plugin.app.workspace.on('active-leaf-change', sync));
  plugin.app.workspace.onLayoutReady(sync);
  // The drawer can be laid out a frame after we attach; render() no-ops at
  // zero width, so without a retry a mount into an unlaid-out host is
  // permanent.
  const bootTimer = window.setTimeout(sync, 0);
  plugin.registerDomEvent(window, 'resize', () => {
    if (navbar) sync();
  });

  plugin.register(() => {
    disposed = true;
    window.clearTimeout(bootTimer);
    unmount();
  });

  return sync;
}
