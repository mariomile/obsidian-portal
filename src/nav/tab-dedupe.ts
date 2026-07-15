/**
 * Focus-existing-tab behaviour, vault-wide.
 *
 * Patches `WorkspaceLeaf.prototype.openFile` so that opening a file that is
 * already visible in a main-area tab focuses that tab instead of creating a
 * duplicate. Every open path in Obsidian (file explorer, quick switcher,
 * internal links, suite plugins) funnels through `openFile`, so one patch
 * covers them all. Sidebar leaves are ignored — a note open in a sidebar
 * pane must not steal focus from the main area.
 *
 * Unload safety: the wrapper is removed only when it is still the installed
 * function; if another plugin patched over it meanwhile, the wrapper stays in
 * place but goes inert (the `active` flag), preserving the outer patch chain.
 */
import { WorkspaceLeaf } from 'obsidian';
import type { App, OpenViewState, TFile } from 'obsidian';
import type PortalPlugin from '../main';

type OpenFile = (this: WorkspaceLeaf, file: TFile, openState?: OpenViewState) => Promise<void>;

/** The main-area (or popout-window) leaf currently showing `path`, if any.
 *  Uses `getViewState()` rather than `view.file` so deferred (not yet loaded)
 *  tabs match too, and covers every file-backed view type (markdown, canvas,
 *  pdf, images), not just markdown. */
function findOpenLeaf(app: App, path: string, self: WorkspaceLeaf): WorkspaceLeaf | null {
  const { workspace } = app;
  let found: WorkspaceLeaf | null = null;
  workspace.iterateAllLeaves((leaf) => {
    if (found || leaf === self) return;
    const root = leaf.getRoot();
    if (root === workspace.leftSplit || root === workspace.rightSplit) return;
    const state = leaf.getViewState().state as { file?: unknown } | undefined;
    if (state?.file === path) found = leaf;
  });
  return found;
}

export function installTabDedupe(plugin: PortalPlugin): void {
  const app = plugin.app;
  const proto = WorkspaceLeaf.prototype as unknown as { openFile: OpenFile };
  const original = proto.openFile;
  let active = true;

  const wrapper: OpenFile = function (this: WorkspaceLeaf, file, openState) {
    if (active && plugin.settings.focusExistingTab) {
      const existing = findOpenLeaf(app, file.path, this);
      if (existing) {
        app.workspace.setActiveLeaf(existing, { focus: true });
        // Carry ephemeral intent (scroll target, search-match highlight) to
        // the tab that will actually show the file.
        if (openState?.eState) existing.setEphemeralState(openState.eState);
        // A leaf freshly created for this open (`getLeaf('tab')` → empty
        // view) is now orphaned — remove it so no blank tab is left behind.
        if (this.view.getViewType() === 'empty') this.detach();
        return Promise.resolve();
      }
    }
    return original.call(this, file, openState);
  };

  proto.openFile = wrapper;
  plugin.register(() => {
    active = false;
    if (proto.openFile === wrapper) proto.openFile = original;
  });
}
