# Follow Active File — Folders tree design

**Date:** 2026-07-17
**Status:** Approved by Mario (brainstorm session)

## Problem

Portal auto-reveals the active file on every `file-open` (`portal-view.ts` → `revealInTree` → `folders.reveal(file)`). `reveal()` is additive and persistent: it pushes every ancestor folder into `settings.expandedFolders` and saves. Nothing ever collapses automatically, so after a normal day of navigation the tree ends up fully expanded and the overview is lost. The only remedy today is the manual collapse-all toolbar button.

## Behavior

**Follow mode** (new, default on): the Folders tree follows the active file.

- On `file-open`, `reveal()` **replaces** `expandedFolders` with exactly the ancestor chain of the active file. Every branch outside that path collapses.
- Manual chevron toggles keep working as today and are persisted. They survive until the next `file-open`, at which point the tree re-aligns to the active file's path. Browsing the tree without opening files never moves anything on its own.
- If the revealed file is already the active revealed file (e.g. re-focusing the same tab), `reveal()` is a no-op — no state change, no re-render.
- The collapse-all toolbar button stays: it is still the way to also close the active path.

**Follow mode off**: current additive behavior, unchanged.

## Scope

- **Folders tree only.** Tag tree, Collections, Pins/Recent and section collapse state are untouched.
- `expandTo` (jump-to-folder) stays additive in both modes — jumping to a folder to explore it must not collapse the rest of the tree.

## Implementation

- New setting `followActiveFile: boolean`, default `true`, parsed in `parseSettings` and added to `DEFAULT_SETTINGS` (`settings.ts`).
- Settings tab toggle: "Follow active file" — "Collapse the tree to the active file's path when a file is opened."
- `folders.ts reveal(file)`:
  - follow on → `expandedFolders = ancestors(file.path)` (replace), skip save/render if the resulting set equals the current one (covers the same-file no-op);
  - follow off → current push-missing-ancestors behavior.
- Persistence model unchanged: in follow mode the saved state is simply "the path of the last active file", so a restart reopens a clean tree.

## Error handling

No new failure surfaces: `reveal()` already guards on the file existing in the vault, and `parseSettings` already coerces malformed data via `asStringArray`/boolean defaults.

## Testing

- Unit tests on the ancestors-replacement logic (pure function extracted or tested through the settings mutation): replace vs additive, root-level file (empty ancestor chain), same-file no-op.
- Manual check in the dev vault: open files across `Active/`, `Atlas/`, `Journal/` and confirm the tree follows; toggle setting off and confirm the old behavior returns.

## Size / risk

~20 lines across `settings.ts` and `sections/folders.ts` + settings-tab toggle + 1–2 unit tests. Low risk; no schema/state migration (existing `expandedFolders` array is reused as-is).
