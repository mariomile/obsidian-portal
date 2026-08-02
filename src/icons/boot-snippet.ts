import { buildBootCss, MV_ICON_SET } from '../kit/mv-icons';
import type { App } from 'obsidian';

/**
 * Installs the boot-icon CSS snippet.
 *
 * Why a snippet and not this plugin's own `styles.css`
 * ----------------------------------------------------
 * A plugin's stylesheet is injected when the plugin loads — measured here,
 * ~4.4s after launch, which is exactly when the JS runs too. It would gain
 * nothing. Snippets are applied with the theme, before any plugin, and that
 * head start is the whole point: the ~25 icons Obsidian draws early are
 * already correct in the first frame the user sees, instead of changing under
 * their eyes seconds later.
 *
 * Why not the theme
 * -----------------
 * The theme is distributed to other people, and the icon set is a personal
 * choice with a different release cadence — it changed three times in two
 * days. It also carries a CC BY obligation that has no business travelling
 * inside an MIT theme.
 *
 * The snippet is written from the plugin so users get it without manual setup,
 * while the file still sits where the timing works.
 */

const SNIPPET_NAME = 'mv-icons-boot';
const SNIPPET_PATH = `.obsidian/snippets/${SNIPPET_NAME}.css`;

/** Obsidian's snippet manager. Not in the public API, so every call is
 *  optional: a version that renames these leaves the snippet un-enabled rather
 *  than throwing during startup. */
interface CustomCss {
  enabledSnippets?: Set<string>;
  setCssEnabledStatus?(name: string, enabled: boolean): void;
  readSnippets?(): void;
}

/**
 * Writes the snippet if missing or outdated, and enables it once.
 *
 * Deliberately does NOT re-enable a snippet the user has turned off: the file
 * is kept current, but whether it applies stays their decision. The set+variant
 * marker in the CSS header is what makes "outdated" cheap to detect without
 * comparing 40 KB of text — and it is why switching weight rewrites the file.
 */
export async function installBootSnippet(
  app: App,
  variant?: string,
): Promise<'written' | 'current' | 'failed'> {
  try {
    const adapter = app.vault.adapter;
    const exists = await adapter.exists(SNIPPET_PATH);
    const current = exists ? await adapter.read(SNIPPET_PATH) : '';
    // The marker the freshly built CSS carries. Comparing against it — rather
    // than against a stamp assembled here — means the file is rewritten
    // whenever anything about its contents changes, including the list of
    // icons covered. Assembling it separately once let a new icon slip in
    // without the file on disk ever being updated.
    const css = buildBootCss(variant);
    const marker = /\[([^\]]+)\]/.exec(css)?.[1] ?? MV_ICON_SET;
    const stamp = `${marker}${variant ? `-${variant}` : ''}`;

    if (!current.includes(`[${stamp}]`)) {
      const stamped = css.replace(`[${marker}]`, `[${stamp}]`);
      if (!(await adapter.exists('.obsidian/snippets'))) {
        await adapter.mkdir('.obsidian/snippets');
      }
      await adapter.write(SNIPPET_PATH, stamped);

      const manager = (app as App & { customCss?: CustomCss }).customCss;
      manager?.readSnippets?.();
      // Enable only on first install. If the file existed and the user had
      // disabled it, updating the contents must not switch it back on.
      if (!exists) manager?.setCssEnabledStatus?.(SNIPPET_NAME, true);
      return 'written';
    }
    return 'current';
  } catch {
    // Never let a cosmetic snippet break plugin startup. Without it the icons
    // still work — they just arrive a beat late, which is where we started.
    return 'failed';
  }
}
