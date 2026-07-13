import { Plugin } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
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

  async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    this.registerView(
      PORTAL_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new PortalView(leaf, this),
    );

    this.addRibbonIcon('panel-left', 'Open Portal', () => {
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
      if (view instanceof PortalView) void view.onOpen();
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
