import { setIcon } from 'obsidian';

/** Actions the rail toolbar drives (wired by the view). */
export interface ToolbarActions {
  revealActive(): void;
  newNote(): void;
  collapseAll(): void;
  expandAll(): void;
}

/** Compact icon toolbar under the jump box (reveal / new / collapse / expand). */
export function mountToolbar(containerEl: HTMLElement, actions: ToolbarActions): void {
  const bar = containerEl.createDiv({ cls: 'portal-toolbar' });

  const button = (icon: string, label: string, onClick: () => void): void => {
    const el = bar.createEl('button', {
      cls: 'clickable-icon portal-tool',
      attr: { type: 'button', 'aria-label': label, title: label },
    });
    setIcon(el, icon);
    el.addEventListener('click', onClick);
  };

  button('locate', 'Reveal active file', actions.revealActive);
  button('file-plus', 'New note', actions.newNote);
  button('chevrons-down-up', 'Collapse all folders', actions.collapseAll);
  button('chevrons-up-down', 'Expand all folders', actions.expandAll);
}
