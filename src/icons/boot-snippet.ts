import { BOOT_ICON_CSS, BOOT_ICON_CSS_VERSION } from '../kit/mv-icons-boot';
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
 * is kept current, but whether it applies stays their decision. The version
 * marker in the CSS header is what makes "outdated" cheap to detect without
 * comparing 43 KB of text.
 */
export async function installBootSnippet(app: App): Promise<'written' | 'current' | 'failed'> {
  try {
    const adapter = app.vault.adapter;
    const exists = await adapter.exists(SNIPPET_PATH);
    const current = exists ? await adapter.read(SNIPPET_PATH) : '';

    if (!current.includes(BOOT_ICON_CSS_VERSION)) {
      if (!(await adapter.exists('.obsidian/snippets'))) {
        await adapter.mkdir('.obsidian/snippets');
      }
      await adapter.write(SNIPPET_PATH, BOOT_ICON_CSS);

      const css = (app as App & { customCss?: CustomCss }).customCss;
      css?.readSnippets?.();
      // Enable only on first install. If the file existed and the user had
      // disabled it, updating the contents must not switch it back on.
      if (!exists) css?.setCssEnabledStatus?.(SNIPPET_NAME, true);
      return 'written';
    }
    return 'current';
  } catch {
    // Never let a cosmetic snippet break plugin startup. Without it the icons
    // still work — they just arrive a beat late, which is where we started.
    return 'failed';
  }
}
