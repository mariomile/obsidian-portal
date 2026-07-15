import { Notice, TFolder } from 'obsidian';
import type { App } from 'obsidian';

const DRAG_MIME = 'text/plain';

function clearDropTargets(): void {
  for (const element of Array.from(document.querySelectorAll('.portal-drop-target'))) {
    element.removeClass('portal-drop-target');
  }
}

/** Make a tree row draggable, carrying its vault path. */
export function makeDraggable(rowEl: HTMLElement, path: string): void {
  rowEl.setAttribute('draggable', 'true');
  rowEl.addEventListener('dragstart', (event) => {
    clearDropTargets();
    event.dataTransfer?.setData(DRAG_MIME, path);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });
  // A drag can end outside Portal, where no target receives dragleave/drop.
  rowEl.addEventListener('dragend', clearDropTargets);
}

/** Make a folder row (or the root container) accept dropped files/folders. */
export function makeDropTarget(
  targetEl: HTMLElement,
  destFolderPath: string,
  app: App,
  onMoved: () => void,
): void {
  targetEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    // Nested folder targets own their hover state; do not also highlight the
    // root Folders body through bubbling.
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    targetEl.addClass('portal-drop-target');
  });
  targetEl.addEventListener('dragleave', (event) => {
    event.stopPropagation();
    const next = event.relatedTarget;
    if (next instanceof Node && targetEl.contains(next)) return;
    targetEl.removeClass('portal-drop-target');
  });
  targetEl.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearDropTargets();
    const srcPath = event.dataTransfer?.getData(DRAG_MIME);
    if (srcPath) void move(app, srcPath, destFolderPath, onMoved);
  });
}

async function move(
  app: App,
  srcPath: string,
  destFolder: string,
  onMoved: () => void,
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(srcPath);
  if (!file) return;

  // No-op: already in the destination folder.
  const currentParent = file.parent?.path ?? '';
  if (currentParent === destFolder) return;

  // Guard: never move a folder into itself or a descendant.
  if (file instanceof TFolder && (destFolder === file.path || destFolder.startsWith(`${file.path}/`))) {
    return;
  }

  const target = destFolder ? `${destFolder}/${file.name}` : file.name;
  if (app.vault.getAbstractFileByPath(target)) {
    new Notice(`"${file.name}" already exists in that folder.`);
    return;
  }
  await app.fileManager.renameFile(file, target);
  onMoved();
}
