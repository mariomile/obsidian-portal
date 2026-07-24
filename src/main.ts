import { Plugin, addIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import { installCoreIcons } from './icons/core-icons';
import { installNoteEnter } from './nav/note-enter';
import { installTabDedupe } from './nav/tab-dedupe';
import { PortalView, PORTAL_VIEW_TYPE } from './portal-view';
import {
  DEFAULT_SETTINGS,
  parseSettings,
  PortalSettingTab,
  type PortalSettings,
} from './settings';

// Huge Icons (hugeicons.com, free/MIT, Stroke Rounded, 24x24 grid) — same
// pattern as nav-block.ts's hi-* set. addIcon() always wraps content in a
// fixed viewBox="0 0 100 100", so a 4.166667x scale (100/24) fills it right.
addIcon(
  'hi-panel-left',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M13 3h-2C7.229 3 5.343 3 4.172 4.172S3 7.229 3 11v2c0 3.771 0 5.657 1.172 6.828S7.229 21 11 21h2c3.771 0 5.657 0 6.828-1.172S21 16.771 21 13v-2c0-3.771 0-5.657-1.172-6.828S16.771 3 13 3M9 3v18"/>' +
    '</g>',
);

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

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    // Re-skin Obsidian's core Lucide icons with Huge Icons before any view or
    // chrome renders. Only when the setting is on; there is no runtime undo, so
    // disabling it takes effect on the next app restart (see setting desc).
    if (this.settings.hugeCoreIcons) installCoreIcons();

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

    // Re-apply the hide whenever the layout changes, so a file-explorer leaf
    // the user re-adds (e.g. via the "Files" ribbon) gets hidden again.
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.applyExplorerVisibility();
      }),
    );

    // Open the rail and apply the hide only once the workspace is ready — this
    // also guards later units against the create-event storm on vault load.
    this.app.workspace.onLayoutReady(() => {
      void this.activateView(false);
      this.applyExplorerVisibility();
    });
  }

  onunload(): void {
    // Always restore the native explorer so disabling Portal never leaves it
    // permanently hidden.
    this.setExplorerHidden(false);
    this.app.workspace.detachLeavesOfType(PORTAL_VIEW_TYPE);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
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
