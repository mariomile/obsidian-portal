# Follow Active File Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a file opens, Portal's Folders tree collapses to exactly the active file's ancestor path (default-on "follow mode"), instead of accumulating expanded folders forever.

**Architecture:** A pure helper `followExpandedFolders(current, filePath)` in `folder-tree.ts` computes the replacement `expandedFolders` array (or `null` for a no-op). `FoldersSection.reveal()` branches on a new persisted setting `followActiveFile`: follow → replace state via the helper; off → today's additive behavior. One toggle in the settings tab.

**Tech Stack:** Obsidian plugin, TypeScript, esbuild, `node --test` with `--experimental-strip-types` (pure-logic tests only, no `obsidian` imports in tested files).

**Spec:** `docs/superpowers/specs/2026-07-17-follow-active-file-design.md`

## Global Constraints

- Repo: `~/Dev Projects/obsidian-portal`. Run all commands from the repo root.
- `folder-tree.ts` must stay free of `obsidian` imports (it is loaded by `node --test`).
- Only the Folders tree changes. `expandTo()`, tag tree, collections, sections: untouched.
- Setting default is `true` (follow mode on).
- Test: `pnpm test` · Typecheck: `pnpm typecheck` · Build (also deploys `main.js` into the vault via `.obsidian-plugin-dir`): `pnpm build`.

---

### Task 1: Pure helper `followExpandedFolders`

**Files:**
- Modify: `src/sections/folder-tree.ts` (append after `ancestorFolderPaths`, line ~36)
- Test: `src/sections/folder-tree.test.ts`

**Interfaces:**
- Consumes: `ancestorFolderPaths(path: string): string[]` (same file).
- Produces: `followExpandedFolders(current: string[], filePath: string): string[] | null` — the new `expandedFolders` value, or `null` when `current` already equals the ancestor chain as a set (caller skips save/render). Task 2 imports it.

- [ ] **Step 1: Write the failing tests**

Append to `src/sections/folder-tree.test.ts`:

```ts
import { followExpandedFolders } from './folder-tree.ts';

test('followExpandedFolders replaces state with the active file ancestor chain', () => {
  assert.deepEqual(
    followExpandedFolders(['Atlas', 'Atlas/People', 'Journal'], 'Active/Projects/Captoo.io/note.md'),
    ['Active', 'Active/Projects', 'Active/Projects/Captoo.io'],
  );
});

test('followExpandedFolders collapses everything for a root-level file', () => {
  assert.deepEqual(followExpandedFolders(['Atlas', 'Journal'], 'note.md'), []);
});

test('followExpandedFolders returns null when state already matches (any order)', () => {
  assert.equal(followExpandedFolders(['a/b', 'a'], 'a/b/c.md'), null);
  assert.equal(followExpandedFolders([], 'note.md'), null);
});

test('followExpandedFolders is not fooled by same-length different sets', () => {
  assert.deepEqual(followExpandedFolders(['a', 'x'], 'a/b/c.md'), ['a', 'a/b']);
});
```

Note: `assert` and `test` are already imported at the top of this file; the new `import { followExpandedFolders }` line can be merged into the existing `./folder-tree.ts` import instead — either form is fine.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: FAIL — `followExpandedFolders` is not exported / undefined.

- [ ] **Step 3: Implement the helper**

Append to `src/sections/folder-tree.ts`:

```ts
/**
 * Follow-mode expansion state: exactly the ancestor chain of `filePath`.
 * Returns null when `current` already equals that chain as a set, so the
 * caller can skip the save + re-render (same-file re-focus no-op).
 */
export function followExpandedFolders(current: string[], filePath: string): string[] | null {
  const next = ancestorFolderPaths(filePath);
  const same = next.length === current.length && next.every((p) => current.includes(p));
  return same ? null : next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS (all existing + 4 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/sections/folder-tree.ts src/sections/folder-tree.test.ts
git commit -m "feat(folders): add followExpandedFolders pure helper"
```

---

### Task 2: Setting + reveal() branch + settings toggle

**Files:**
- Modify: `src/settings.ts` (interface line ~14, `DEFAULT_SETTINGS` line ~43, `parseSettings` line ~61, settings tab `display()` after the "Focus existing tab" block line ~127)
- Modify: `src/sections/folders.ts` (import line 4, `reveal()` line ~398)

**Interfaces:**
- Consumes: `followExpandedFolders(current: string[], filePath: string): string[] | null` from Task 1.
- Produces: `PortalSettings.followActiveFile: boolean` (persisted, default `true`). No later task depends on more.

- [ ] **Step 1: Add the setting field, default, and parse**

In `src/settings.ts`, add to the `PortalSettings` interface (after `focusExistingTab`):

```ts
  /** Follow mode: on file-open the Folders tree collapses to exactly the
   *  active file's ancestor path. Off → reveals are additive (legacy). */
  followActiveFile: boolean;
```

Add to `DEFAULT_SETTINGS` (after `focusExistingTab: true,`):

```ts
  followActiveFile: true,
```

Add to the object returned by `parseSettings` (after the `focusExistingTab` entry):

```ts
    followActiveFile:
      typeof data.followActiveFile === 'boolean'
        ? data.followActiveFile
        : DEFAULT_SETTINGS.followActiveFile,
```

- [ ] **Step 2: Add the settings-tab toggle**

In `src/settings.ts` `display()`, insert after the "Focus existing tab" `Setting` block (after line ~127) and before "Hide hex-colour tags":

```ts
    new Setting(containerEl)
      .setName('Follow active file')
      .setDesc(
        'Collapse the folder tree to the active file’s path when a file is opened. Turn off to keep folders open as you navigate.',
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.followActiveFile)
          .onChange(async (value) => {
            this.plugin.settings.followActiveFile = value;
            await this.plugin.saveSettings();
          }),
      );
```

- [ ] **Step 3: Branch reveal() on the setting**

In `src/sections/folders.ts`, extend the import on line 4:

```ts
import { ancestorFolderPaths, followExpandedFolders } from './folder-tree.ts';
```

Replace the expansion block at the top of `reveal()` (the `const expanded = ...` through the `if (changed) {...}` close, lines ~401–412) with:

```ts
    if (this.ctx.settings.followActiveFile) {
      const next = followExpandedFolders(this.ctx.settings.expandedFolders, file.path);
      if (next) {
        this.ctx.settings.expandedFolders = next;
        void this.ctx.saveSettings();
        this.render();
      }
    } else {
      const expanded = this.ctx.settings.expandedFolders;
      let changed = false;
      for (const ancestor of ancestorFolderPaths(file.path)) {
        if (!expanded.includes(ancestor)) {
          expanded.push(ancestor);
          changed = true;
        }
      }
      if (changed) {
        void this.ctx.saveSettings();
        this.render();
      }
    }
```

The highlight/scroll code below (`.portal-file.is-active` loop onward) stays exactly as is.

- [ ] **Step 4: Typecheck and run the full test suite**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck clean, all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/settings.ts src/sections/folders.ts
git commit -m "feat(folders): follow active file — collapse tree to active path on open"
```

---

### Task 3: Build, deploy, manual verification

**Files:**
- No source changes. `pnpm build` writes fresh `main.js` into the vault plugin dir (`.obsidian-plugin-dir` → `~/Vaults/marioverse.ai/.obsidian/plugins/portal`). Never copy the repo's stale `main.js` by hand.

**Interfaces:**
- Consumes: Tasks 1–2 merged on the branch.
- Produces: deployed build; manual test evidence.

- [ ] **Step 1: Build + deploy**

Run: `pnpm build`
Expected: exit 0 (typecheck + esbuild production; `main.js` lands in the vault plugin dir).

- [ ] **Step 2: Manual verification in the live vault**

Reload Portal (e.g. via `obsidian-cli` plugin reload or toggling the plugin), then:

1. Open a file under `Active/Projects/...` → tree shows only that path; `Atlas/`, `Journal/`, `Resources/` closed.
2. Open a file under `Atlas/...` → `Active/` branch collapses, `Atlas/` path opens.
3. Manually expand a second branch with the chevron, don't open any file → nothing auto-collapses.
4. Then open another file → tree re-aligns to that file's path only.
5. Re-focus the same file's tab → no visible re-render/flicker (no-op path).
6. Settings → Portal → turn "Follow active file" off → navigation is additive again (old behavior).

Expected: all six hold.

- [ ] **Step 3: Commit any generated artifacts if the repo tracks them, else nothing to commit**

Run: `git status --short`
Expected: clean (build artifacts are gitignored in this repo). If dirty with intentional changes only, commit them; otherwise stop.
