import type { App, TAbstractFile } from 'obsidian';

/** Parent-relative new path for `file` given a new full name (incl. extension). */
function newPathFor(file: TAbstractFile, name: string): string {
  const parentPath = file.parent && file.parent.path ? `${file.parent.path}/` : '';
  return `${parentPath}${name}`;
}

/**
 * Inline rename (U8/U9): swap a row's label for an input, commit through the
 * link-updating `fileManager.renameFile`. Shared by the context menu and F2.
 * Refuses a collision rather than clobbering; `onDone` re-renders the tree.
 */
export function startInlineRename(
  app: App,
  rowEl: HTMLElement,
  file: TAbstractFile,
  onDone: () => void,
): void {
  const label = rowEl.querySelector('.portal-label');
  if (!(label instanceof HTMLElement)) return;

  const original = file.name;
  const input = document.createElement('input');
  input.className = 'portal-rename-input';
  input.value = original;
  label.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = async (): Promise<void> => {
    if (committed) return;
    committed = true;
    const name = input.value.trim();
    if (name && name !== original) {
      const target = newPathFor(file, name);
      if (!app.vault.getAbstractFileByPath(target)) {
        await app.fileManager.renameFile(file, target);
      }
    }
    onDone();
  };

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      committed = true;
      onDone();
    }
  });
  input.addEventListener('blur', () => void commit());
}
