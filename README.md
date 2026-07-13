# Portal

Portal is a Craft-style unified navigator for Obsidian. It replaces the plain file explorer with a single quiet rail that brings **folders, tags, and collections together in one place** — something Obsidian splits across separate panes.

When Portal is enabled it becomes the primary left-sidebar surface and hides the native file explorer (reversible from settings — the core plugin is only CSS-hidden, never detached, so "reveal in file explorer" and other plugins keep working).

## Features

- **One unified rail**: a fixed nav block (New document · All Docs · Tasks · Calendar, each delegating to the relevant suite plugin), then **Pinned · Bookmarks · Recent · Folders · Tags · Collections** — every section collapsible and persisted.
- **Folder tree**: lazy (only expanded folders render), live on create/delete/rename, with folder-first sorting by name / modified / created.
- **File-type icons**: ~50 extensions map to distinct icons; a note's `icon:` / `color:` frontmatter overrides them, and folders read the same keys from a same-named folder note.
- **Tags & Collections inline**: click a tag to list its notes; click a collection (absorbed read-only from [SuperBaseTags](https://github.com/mariomile/obsidian-superbasetags)) to list its members, or open its Base with ⇗. Hex-colour tokens are filtered out of the tag tree.
- **Search that shows where things are**: a jump box ranks results with [Sonar](https://github.com/mariomile/obsidian-sonar) (falls back to a substring filter), shows each hit's folder path, filters the tree live, and reveals the opened file in the tree.
- **Full mutations**: right-click for the complete menu (rename, move, delete, new note/folder, pin) plus every item other plugins contribute; drag-to-move with link updates; inline rename.
- **Toolbar**: reveal active file, new note, sort, collapse-all / expand-all folders.
- **Breadcrumb** of the active file, **keyboard navigation** (arrows / Enter / →←), and **native hover previews**.

## Mobile

**Verified** — `isDesktopOnly: false` in `manifest.json`; `styles.css` ships a `@media (pointer: coarse)` block bringing rows, nav rows, section headers, jump hits, and toolbar buttons to 44pt Apple HIG and forcing hover-revealed controls visible on touch, plus `body.is-phone` parity. Desktop-first; a dedicated phone layout pass is planned.

## Installation

### BRAT

1. Install and enable the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. In **Settings → BRAT**, choose **Add beta plugin**.
3. Enter `mariomile/obsidian-portal` and enable Portal.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the latest GitHub release.
2. Create `<vault>/.obsidian/plugins/portal/`.
3. Copy the three files into that directory.
4. Reload Obsidian and enable **Portal** under **Community plugins**.

## Settings

- **Hide native file explorer** (default on) — CSS-hide the built-in explorer so Portal is the primary surface; turn off to show both.
- **Hide hex-colour tags** (default on) — exclude `#1e1e1e`-style colour tokens that Obsidian counts as tags.

## Companion plugins

Portal reads (never modifies) two suite plugins when present:

- **SuperBaseTags** — its `#type/*` collections power Portal's Collections section (read-only).
- **Sonar** — its BM25 index powers the jump ranking (falls back gracefully when absent).

## Development

```bash
pnpm install
pnpm dev      # watch build (deploys into the vault at .obsidian-plugin-dir)
pnpm build    # typecheck + production build
pnpm test     # node --test
pnpm lint
```

## License

MIT
