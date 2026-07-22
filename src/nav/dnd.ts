import { Notice, TFolder } from 'obsidian';
import type { App } from 'obsidian';

const DRAG_MIME = 'text/plain';
const EDGE_ZONE_RATIO = 0.3;

function clearDropTargets(): void {
  for (const element of Array.from(
    document.querySelectorAll('.portal-drop-target, .portal-drop-before, .portal-drop-after'),
  )) {
    element.removeClass('portal-drop-target');
    element.removeClass('portal-drop-before');
    element.removeClass('portal-drop-after');
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
    if (srcPath) void moveInto(app, srcPath, destFolderPath, onMoved);
  });
}

export type DropZone = 'before' | 'after' | 'into';

/**
 * Root-level folder rows (task: manual reordering): the same row accepts
 * both "drop into" (middle band) and "drop before/after" (top/bottom edges,
 * Craft/Finder-style insertion line) — the caller decides what each zone
 * means via `onDrop`. Kept separate from `makeDropTarget` so every other
 * row (nested folders, the root container) is unaffected.
 */
export function makeReorderableDropTarget(
  rowEl: HTMLElement,
  onDrop: (srcPath: string, zone: DropZone) => void,
): void {
  const zoneOf = (event: DragEvent): DropZone => {
    const rect = rowEl.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    if (ratio < EDGE_ZONE_RATIO) return 'before';
    if (ratio > 1 - EDGE_ZONE_RATIO) return 'after';
    return 'into';
  };
  const paintZone = (zone: DropZone): void => {
    rowEl.removeClass('portal-drop-target');
    rowEl.removeClass('portal-drop-before');
    rowEl.removeClass('portal-drop-after');
    if (zone === 'before') rowEl.addClass('portal-drop-before');
    else if (zone === 'after') rowEl.addClass('portal-drop-after');
    else rowEl.addClass('portal-drop-target');
  };

  rowEl.addEventListener('dragover', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    paintZone(zoneOf(event));
  });
  rowEl.addEventListener('dragleave', (event) => {
    event.stopPropagation();
    const next = event.relatedTarget;
    if (next instanceof Node && rowEl.contains(next)) return;
    rowEl.removeClass('portal-drop-target');
    rowEl.removeClass('portal-drop-before');
    rowEl.removeClass('portal-drop-after');
  });
  rowEl.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const zone = zoneOf(event);
    clearDropTargets();
    const srcPath = event.dataTransfer?.getData(DRAG_MIME);
    if (srcPath) onDrop(srcPath, zone);
  });
}

export async function moveInto(
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
