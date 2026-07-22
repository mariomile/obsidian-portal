import { addIcon, setIcon } from 'obsidian';
import type { App } from 'obsidian';
import { executeCommand, getPlugin } from '../obsidian-internals';
import { createNote } from './context-menu';

// Huge Icons (hugeicons.com, free/MIT, Stroke Rounded, 24x24 grid) for the
// fixed nav-block entries. addIcon() always wraps content in a fixed
// viewBox="0 0 100 100", so a 4.166667x scale (100/24) fills it correctly.
addIcon(
  'hi-note-add',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M15.5 2v3m-9-3v3M11 2v3m8 8v-2.5c0-3.3 0-4.95-1.025-5.975S15.3 3.5 12 3.5h-2c-3.3 0-4.95 0-5.975 1.025S3 7.2 3 10.5V15c0 3.3 0 4.95 1.025 5.975S6.7 22 10 22h3m-6-7h4m-4-4h8m6 8h-3m0 0h-3m3 0v3m0-3v-3"/>' +
    '</g>',
);
addIcon(
  'hi-grid',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M3.889 9.663C4.393 10 5.096 10 6.5 10s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C10 8.607 10 7.904 10 6.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C8.607 3 7.904 3 6.5 3s-2.107 0-2.611.337a2 2 0 0 0-.552.552C3 4.393 3 5.096 3 6.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm11 0C15.393 10 16.096 10 17.5 10s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C21 8.607 21 7.904 21 6.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C19.607 3 18.904 3 17.5 3s-2.107 0-2.611.337a2 2 0 0 0-.552.552C14 4.393 14 5.096 14 6.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm-11 11C4.393 21 5.096 21 6.5 21s2.107 0 2.611-.337a2 2 0 0 0 .552-.552C10 19.607 10 18.904 10 17.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C8.607 14 7.904 14 6.5 14s-2.107 0-2.611.337a2 2 0 0 0-.552.552C3 15.393 3 16.096 3 17.5s0 2.107.337 2.611a2 2 0 0 0 .552.552Zm11 0C15.393 21 16.096 21 17.5 21s2.107 0 2.611-.337c.218-.146.406-.334.552-.552C21 19.607 21 18.904 21 17.5s0-2.107-.337-2.611a2 2 0 0 0-.552-.552C19.607 14 18.904 14 17.5 14s-2.107 0-2.611.337a2 2 0 0 0-.552.552C14 15.393 14 16.096 14 17.5s0 2.107.337 2.611c.146.218.334.406.552.552Z"/>' +
    '</g>',
);
addIcon(
  'hi-task',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M14.496 2h-5a1.5 1.5 0 0 0 0 3h5a1.5 1.5 0 0 0 0-3m-6.5 13h3.429m-3.429-4h8"/>' +
    '<path d="M15.996 3.5c1.554.047 2.48.22 3.121.862c.88.878.88 2.293.88 5.12V16c0 2.828 0 4.242-.88 5.121c-.878.879-2.293.879-5.12.879h-4c-2.83 0-4.244 0-5.122-.879S3.996 18.828 3.996 16V9.483c0-2.828 0-4.243.879-5.121c.641-.642 1.568-.815 3.121-.862"/>' +
    '</g>',
);
addIcon(
  'hi-calendar',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M16 2v4M8 2v4m5-2h-2C7.229 4 5.343 4 4.172 5.172S3 8.229 3 12v2c0 3.771 0 5.657 1.172 6.828S7.229 22 11 22h2c3.771 0 5.657 0 6.828-1.172S21 17.771 21 14v-2c0-3.771 0-5.657-1.172-6.828S16.771 4 13 4M3 10h18"/>' +
    '<path d="M12.126 14H12m.125 4H12m-4.376-4H7.5m.125 4H7.5m9.125-4H16.5m-4.25 0a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m0 4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m-4.5-4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m0 4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0m9-4a.25.25 0 1 1-.5 0a.25.25 0 0 1 .5 0"/>' +
    '</g>',
);

interface NavEntry {
  icon: string;
  label: string;
  enabled: boolean;
  run: () => void;
}

/**
 * Craft-style fixed nav block at the very top of the rail: New document plus
 * app-level destinations that delegate to the suite plugins (only shown when
 * the target plugin is installed).
 */
export function mountNavBlock(app: App, containerEl: HTMLElement): void {
  const entries: NavEntry[] = [
    {
      icon: 'hi-note-add',
      label: 'New document',
      enabled: true,
      run: () => {
        const active = app.workspace.getActiveFile();
        void createNote(app, active?.parent ?? app.vault.getRoot());
      },
    },
    {
      icon: 'hi-grid',
      label: 'All Docs',
      enabled: Boolean(getPlugin(app, 'masonry')),
      run: () => executeCommand(app, 'masonry:open-all-docs'),
    },
    {
      icon: 'hi-task',
      label: 'Tasks',
      enabled: Boolean(getPlugin(app, 'runway')),
      run: () => executeCommand(app, 'runway:open-list'),
    },
    {
      icon: 'hi-calendar',
      label: 'Calendar',
      enabled: Boolean(getPlugin(app, 'horizon')),
      run: () => executeCommand(app, 'horizon:open-calendar'),
    },
  ];

  const nav = containerEl.createDiv({ cls: 'portal-nav' });
  for (const entry of entries) {
    if (!entry.enabled) continue;
    const row = nav.createDiv({ cls: 'portal-nav-row portal-tree-row' });
    const icon = row.createSpan({ cls: 'portal-row-icon' });
    setIcon(icon, entry.icon);
    row.createSpan({ cls: 'portal-label', text: entry.label });
    row.addEventListener('click', entry.run);
  }
}
