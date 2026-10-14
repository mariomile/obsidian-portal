import { setIcon } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { PortalContext } from '../types';

/**
 * Open section: the tabs of the main area as rows (icon + title), in tab
 * order, the active one highlighted. Click activates, middle-click or the
 * hover × closes. Re-rendered by the view on layout / active-leaf changes.
 */
export class OpenSection {
  private readonly ctx: PortalContext;
  private readonly containerEl: HTMLElement;

  constructor(ctx: PortalContext, containerEl: HTMLElement) {
    this.ctx = ctx;
    this.containerEl = containerEl;
  }

  render(): void {
    const { workspace } = this.ctx.app;
    const leaves: WorkspaceLeaf[] = [];
    workspace.iterateAllLeaves((leaf) => {
      if (leaf.getRoot() === workspace.rootSplit) leaves.push(leaf);
    });
    const active = workspace.getMostRecentLeaf(workspace.rootSplit);

    this.containerEl.empty();
    if (leaves.length === 0) {
      this.containerEl.createDiv({ cls: 'portal-empty', text: 'No open tabs' });
      return;
    }
    for (const leaf of leaves) {
      const row = this.containerEl.createDiv({ cls: 'portal-tree-row portal-open-tab' });
      if (leaf === active) row.addClass('is-active');
      row.createSpan({ cls: 'portal-twisty portal-twisty-empty' });
      const icon = row.createSpan({ cls: 'portal-row-icon' });
      setIcon(icon, leaf.view.getIcon());
      row.createSpan({ cls: 'portal-label', text: leaf.getDisplayText() });
      const close = row.createSpan({
        cls: 'portal-pin-remove portal-open-close',
        attr: { 'aria-label': 'Close tab' },
      });
      close.setText('×');
      close.addEventListener('click', (event) => {
        event.stopPropagation();
        leaf.detach();
      });
      row.addEventListener('click', () => workspace.setActiveLeaf(leaf, { focus: true }));
      row.addEventListener('auxclick', (event) => {
        if (event.button !== 1) return;
        event.preventDefault();
        leaf.detach();
      });
    }
  }
}
