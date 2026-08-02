import { Notice, Platform } from 'obsidian';
import type { App } from 'obsidian';

/**
 * Icon diagnostics — dumps what is actually on screen to a note.
 *
 * Why this exists: the phone navbar cannot be inspected from the desktop.
 * Mobile emulation reports `isPhone: false` and never builds that bar, so a
 * glyph that renders wrong on iPhone is invisible to every check available
 * here. Guessing which icon name a broken button uses has already cost several
 * rounds.
 *
 * This runs on the device, writes the answer into the vault, and Sync carries
 * it back. It is a debugging aid, not a feature: it reads the DOM and writes
 * one file, nothing else.
 */

interface IconRow {
  name: string;
  converted: boolean;
  visible: boolean;
  visibility: string;
  size: string;
  where: string;
  label: string;
}

/** The icon name Obsidian encodes in an SVG's class list. */
function iconName(svg: Element): string {
  for (const cls of Array.from(svg.classList)) {
    if (cls === 'svg-icon') continue;
    return cls.startsWith('lucide-') ? cls.slice('lucide-'.length) : cls;
  }
  return '(nessun nome)';
}

/** A short, readable trail of ancestor classes — enough to tell a navbar
 *  button from an editor toolbar one without dumping the whole tree. */
function ancestry(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el.parentElement;
  for (let i = 0; i < 4 && node; i += 1) {
    const cls = node.getAttribute('class');
    if (cls) parts.push('.' + cls.split(/\s+/)[0]);
    node = node.parentElement;
  }
  return parts.join(' < ') || '(radice)';
}

function collect(): IconRow[] {
  const rows: IconRow[] = [];
  for (const svg of Array.from(document.querySelectorAll('svg.svg-icon'))) {
    const rect = svg.getBoundingClientRect();
    const holder = svg.closest('[aria-label]');
    rows.push({
      name: iconName(svg),
      converted: !!svg.querySelector('g[data-mv-icon]'),
      visible: rect.width > 0 && rect.height > 0,
      visibility: getComputedStyle(svg).visibility,
      size: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      where: ancestry(svg),
      label: holder?.getAttribute('aria-label') ?? '',
    });
  }
  return rows;
}

/** Buttons that carry no icon at all — the likeliest explanation for a button
 *  that renders as a bare blur with nothing inside it. */
function emptyButtons(): string[] {
  const out: string[] = [];
  for (const el of Array.from(document.querySelectorAll('.clickable-icon, .mobile-navbar-action'))) {
    if (el.querySelector('svg')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) continue;
    const label = el.getAttribute('aria-label') ?? '(senza label)';
    out.push(`${label} — ${(el.getAttribute('class') ?? '').split(/\s+/)[0]}, ${Math.round(rect.width)}x${Math.round(rect.height)}`);
  }
  return out;
}

function table(rows: IconRow[]): string {
  const head = '| icona | set | visibile | dimensione | pulsante | posizione |\n|---|---|---|---|---|---|';
  const body = rows
    .map(
      (r) =>
        `| \`${r.name}\` | ${r.converted ? 'nuovo' : 'ORIGINALE'} | ${
          r.visible ? 'sì' : `no (${r.visibility})`
        } | ${r.size} | ${r.label || '—'} | \`${r.where}\` |`,
    )
    .join('\n');
  return `${head}\n${body}`;
}

/** Writes the report and opens it. Returns the path written. */
export async function writeIconDiagnostics(
  app: App,
  context: { version: string; mvIcons: boolean; settling: boolean },
): Promise<string> {
  const rows = collect();
  const visible = rows.filter((r) => r.visible);
  const stale = visible.filter((r) => !r.converted);
  const empties = emptyButtons();

  const report = [
    '---',
    'tags: [type/log]',
    '---',
    '',
    '# Portal — diagnostica icone',
    '',
    `- Portal **${context.version}**`,
    `- set unificato: **${context.mvIcons ? 'attivo' : 'spento'}**`,
    `- classe di avvio ancora applicata: **${context.settling ? 'SÌ (anomalo)' : 'no'}**`,
    `- piattaforma: ${Platform.isPhone ? 'telefono' : Platform.isMobile ? 'tablet' : 'desktop'}`,
    `- finestra: ${window.innerWidth}x${window.innerHeight}`,
    '',
    `Icone totali: **${rows.length}** · visibili: **${visible.length}** · ` +
      `visibili non convertite: **${stale.length}**`,
    '',
    '## Pulsanti senza alcuna icona dentro',
    '',
    empties.length
      ? empties.map((e) => `- ${e}`).join('\n')
      : '_nessuno — ogni pulsante contiene un SVG._',
    '',
    '## Icone visibili non convertite',
    '',
    stale.length ? table(stale) : '_nessuna._',
    '',
    '## Inventario completo',
    '',
    table(rows),
    '',
  ].join('\n');

  const path = '_system/portal-icon-diagnostics.md';
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing) await app.vault.adapter.write(path, report);
  else await app.vault.create(path, report);

  new Notice(`Diagnostica icone scritta in ${path}`, 5000);
  return path;
}
