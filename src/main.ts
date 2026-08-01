import { Plugin } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { installMvIcons, refreshRenderedIcons } from './kit/mv-icons';
import { installMobileHeaderBack } from './nav/mobile-header-back';
import { installNoteEnter } from './nav/note-enter';
import { installPhoneChrome } from './phone-chrome/hub-level';
import { installTabDedupe } from './nav/tab-dedupe';
import { PortalView, PORTAL_VIEW_TYPE } from './portal-view';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  PortalSettingTab,
  type PortalSettings,
} from './settings';

/** Class applied to the native file-explorer's `.workspace-leaf` to hide it.
 *  Applied in JS (not via a `[data-type]` CSS selector) because the view type
 *  is not reliably exposed as a DOM attribute across Obsidian versions. */
const HIDDEN_LEAF_CLASS = 'portal-hidden-leaf';
const FILE_EXPLORER_TYPE = 'file-explorer';

/**
 * Portal — Craft-style unified navigator.
 *
 * U2: registers the sidebar rail view, opens it on the left on layout-ready,
 * and CSS-hides the native file explorer (reversible via settings). The rail
 * sections are filled by U3+ (see the plan).
 */
export default class PortalPlugin extends Plugin {
  settings: PortalSettings = DEFAULT_SETTINGS;
  /** Re-syncs the phone hub chrome against current settings/workspace state
   *  — a no-op on desktop. Exposed so the settings tab's `phoneChrome`
   *  toggle can apply live instead of waiting for the next
   *  layout-change/active-leaf-change. Assigned in `onload()`. */
  syncPhoneChrome: () => void = () => {};

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    // Re-skin Obsidian's Lucide icons with the Phosphor `fill` set before any
    // view or chrome renders. This writes into Obsidian's global icon registry,
    // so it also re-skins every other plugin that calls setIcon() — that is how
    // the whole suite changes set without any of them being modified.
    // No runtime undo exists, so disabling it takes effect on the next app
    // restart (surfaced in the setting description).
    if (this.settings.mvIcons) installMvIcons();

    this.registerView(
      PORTAL_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new PortalView(leaf, this),
    );

    this.addRibbonIcon('hi-panel-left', 'Open Portal', () => {
      void this.activateView();
    });
    this.addCommand({
      id: 'open-portal',
      name: 'Open Portal',
      callback: () => {
        void this.activateView();
      },
    });

    this.addSettingTab(new PortalSettingTab(this.app, this));

    // Vault-wide focus-existing-tab behaviour (toggleable in settings).
    installTabDedupe(this);

    // Phone-only Craft-style page transition on file-open (no-op on desktop).
    installNoteEnter(this);

    // Phone-only: header top-left goes Back (falls back to opening the menu).
    installMobileHeaderBack(this);

    // Phone-only: segmented hub navbar with a swipe pager (default off).
    this.syncPhoneChrome = installPhoneChrome(this);

    // Re-apply the hide whenever the layout changes, so a file-explorer leaf
    // the user re-adds (e.g. via the "Files" ribbon) gets hidden again.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.applyExplorerVisibility();
        this.scheduleIconRefresh();
      }),
    );

    // Opening a note builds chrome that `layout-change` doesn't announce — the
    // editor's formatting toolbar most visibly — so those icons need their own
    // trigger or they stay Lucide while everything around them is filled.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.scheduleIconRefresh()),
    );
    this.registerEvent(this.app.workspace.on('file-open', () => this.scheduleIconRefresh()));

    // Open the rail and apply the hide only once the workspace is ready — this
    // also guards later units against the create-event storm on vault load.
    this.app.workspace.onLayoutReady(() => {
      void this.activateView(false);
      this.applyExplorerVisibility();
      // Chrome built before this plugin loaded still holds Lucide glyphs;
      // addIcon() never rewrites the DOM, so they have to be swapped by hand.
      this.scheduleIconRefresh();
    });

    // Some icons are drawn inline while markdown renders — the code-block
    // "copy" button is the one that shows — instead of going through the icon
    // registry, so overriding the registry never reaches them. The post
    // processor runs on each rendered block, which is exactly where they
    // appear, and is a documented API rather than a DOM-watching guess.
    this.registerMarkdownPostProcessor((el) => {
      if (this.settings.mvIcons) refreshRenderedIcons(el);
    });
  }

  onunload(): void {
    for (const id of this.iconRefreshTimers ?? []) window.clearTimeout(id);
    // Always restore the native explorer so disabling Portal never leaves it
    // permanently hidden.
    this.setExplorerHidden(false);
    this.app.workspace.detachLeavesOfType(PORTAL_VIEW_TYPE);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Deliberately initialised lazily rather than with a class-field
   *  initializer: at runtime this property was observed to be `undefined` when
   *  `scheduleIconRefresh` first ran, which made `.length` throw and silently
   *  abort the rest of the `onLayoutReady` callback — the icon sweep never ran
   *  and the cause was invisible. `??=` removes the dependency on when field
   *  initializers are applied by the bundler. */
  private iconRefreshTimers?: number[];

  /** Sweep stale Lucide glyphs out of the DOM, coalesced.
   *
   *  Two passes, not one. Obsidian builds chrome in stages: the workspace
   *  arrives with the event, but pieces like the editor's formatting toolbar
   *  are constructed a beat later. A single immediate sweep consistently misses
   *  those and leaves a visible mix of filled and outlined glyphs.
   *
   *  The selector is narrow enough that a sweep finding nothing costs almost
   *  nothing, which is the steady state: only icons drawn before
   *  `installMvIcons()` — or drawn inline, bypassing the registry — ever match. */
  private scheduleIconRefresh(): void {
    const timers = (this.iconRefreshTimers ??= []);
    if (!this.settings.mvIcons || timers.length) return;
    for (const delay of [50, 600]) {
      const id = window.setTimeout(() => {
        this.iconRefreshTimers = (this.iconRefreshTimers ?? []).filter((t) => t !== id);
        refreshRenderedIcons();
      }, delay);
      timers.push(id);
    }
  }

  /** Rebuild any open Portal rail (used after settings that change rendering). */
  refreshRail(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(PORTAL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof PortalView) view.reload();
    }
  }

  /** Toggle the native-explorer hide to match the current setting. */
  applyExplorerVisibility(): void {
    this.setExplorerHidden(this.settings.hideNativeExplorer);
  }

  /** Mark every file-explorer leaf's `.workspace-leaf` hidden (or restore it). */
  private setExplorerHidden(hidden: boolean): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FILE_EXPLORER_TYPE)) {
      const leafEl =
        (leaf.view.containerEl.closest('.workspace-leaf') as HTMLElement | null) ??
        leaf.view.containerEl;
      leafEl.toggleClass(HIDDEN_LEAF_CLASS, hidden);
    }
  }

  /** Open the Portal rail in the left sidebar, reusing an existing leaf. */
  private async activateView(reveal = true): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(PORTAL_VIEW_TYPE);
    const first = existing[0];
    if (first) {
      if (reveal) workspace.revealLeaf(first);
      return;
    }
    const leaf = workspace.getLeftLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: PORTAL_VIEW_TYPE, active: reveal });
    if (reveal) workspace.revealLeaf(leaf);
  }
}
