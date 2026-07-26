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
  'hi-file-01',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M8 7L16 7"/>' +
    '<path d="M8 11L12 11"/>' +
    '<path d="M13 21.5V21C13 18.1716 13 16.7574 13.8787 15.8787C14.7574 15 16.1716 15 19 15H19.5M20 13.3431V10C20 6.22876 20 4.34315 18.8284 3.17157C17.6569 2 15.7712 2 12 2C8.22877 2 6.34315 2 5.17157 3.17157C4 4.34314 4 6.22876 4 10L4 14.5442C4 17.7892 4 19.4117 4.88607 20.5107C5.06508 20.7327 5.26731 20.9349 5.48933 21.1139C6.58831 22 8.21082 22 11.4558 22C12.1614 22 12.5141 22 12.8372 21.886C12.9044 21.8623 12.9702 21.835 13.0345 21.8043C13.3436 21.6564 13.593 21.407 14.0919 20.9081L18.8284 16.1716C19.4065 15.5935 19.6955 15.3045 19.8478 14.9369C20 14.5694 20 14.1606 20 13.3431Z"/>' +
    '</g>',
);
addIcon(
  'hi-task',
  '<g transform="scale(4.166667)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">' +
    '<path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z"/>' +
    '<path d="M8 12.75C8 12.75 9.6 13.6625 10.4 15C10.4 15 12.8 9.75 16 8"/>' +
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
      icon: 'hi-file-01',
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
