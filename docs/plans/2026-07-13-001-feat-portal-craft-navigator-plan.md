---
title: "feat: Portal — Craft-style unified navigator (v1)"
type: feat
status: active
date: 2026-07-13
origin: docs/brainstorms/portal-requirements.md
---

# feat: Portal — Craft-style unified navigator (v1)

**Target repo:** `obsidian-portal` (greenfield; only `docs/` exists today). All paths below are repo-relative to `obsidian-portal/`.

## Summary

Build Portal as a new marioverse-suite plugin: a left-sidebar `ItemView` that becomes the primary file-navigation surface (CSS-hiding the native explorer), rendering one Craft-quiet rail of Pinned · Recent · Folders · Tags · Collections. Mutations (rename/move/delete/create) are rebuilt on `FileManager`, the context menu triggers `file-menu` for third-party pass-through, drag reuses `app.dragManager`, jump reuses sonar's `service.query`, and Collections read superbasetags' registry — which retires its own sidebar view.

---

## Problem Frame

Obsidian keeps folders and tags in two separate panes and leaves the native explorer visually plain under any theme. Mario already built Cosmos (re-skin) and superbasetags (tag collections) to work around this, yet daily navigation stays fragmented across panes. See origin for the full frame: `docs/brainstorms/portal-requirements.md`.

---

## Requirements

- R1. Portal registers a sidebar view as the primary file-navigation surface; the native file explorer is hidden by default when Portal is enabled.
- R2. One scrollable rail: Pinned, Recent, Folders, Tags, Collections (top→bottom).
- R3. Folders = collapsible tree of the full vault hierarchy; collapse state persists.
- R4. Tags = collapsible hierarchical tree (nested `#a/b/c`) with live counts.
- R5. Collections = `#type/*` → Bases collections (icon · name · live count), sourced from superbasetags.
- R6. Pinned = user-curated; Recent = recently opened files (auto).
- R7. Click navigates: file → open; folder → expand; tag/collection → open results.
- R8. Jump/filter reaches any file/folder/tag by fuzzy query, reusing existing search ranking.
- R9. Rail reveals + scrolls to the active file's location.
- R10. Right-click menu includes native explorer actions **and** third-party plugin items.
- R11. Drag file/folder onto a folder moves it (native `fileManager`), links update.
- R12. Inline rename commits through the link-updating rename API.
- R13. Create new note/folder from the rail and folder context menus.
- R14. superbasetags no longer renders its own sidebar view; its hub lives inside Portal's Collections.
- R15. superbasetags stays installed as the typing engine (apply `#type/X` + scaffold fields); Portal invokes it.
- R16. Typing/apply-supertag reachable from Portal, delegated to superbasetags.
- R17. Theme-agnostic but tuned to Cosmos; degrades on other themes.
- R18. Desktop-first; phone parity is a later slice, out of this scope.

**Origin actors:** A1 Mario · A2 Obsidian file APIs · A3 superbasetags (engine) · A4 sonar (jump ranking) · A5 Cosmos (tokens)
**Origin flows:** F1 Unified navigation · F2 Move/rename/create · F3 Context menu with plugin parity · F4 Jump
**Origin acceptance examples:** AE1 (R1) · AE2 (R10) · AE3 (R11,R12) · AE4 (R5,R14) · AE5 (R8)

---

## Scope Boundaries

- Not a full-custom reimplementation of everything: drag reuses `app.dragManager`, mutations reuse `FileManager` — no bespoke move engine.
- Does not replace sonar's search modal, tabx, or horizon.
- No saved-search / smart-query beyond tags and collections in v1.
- No graph or canvas navigation.
- No phone touch parity in v1 (dedicated later slice — do not add `@media`/`is-phone` work here).
- superbasetags is not deleted or deprecated — reduced to engine; only its sidebar view is retired.

### Deferred to Follow-Up Work

- Phone/mobile slice (touch targets, drawer layout): separate slice after v1, per suite convention.
- superbasetags cleanup PR: removing its now-dead view code once Portal's Collections is proven (its repo, separate commit).

---

## Context & Research

### Relevant Code and Patterns

- **Template (copy structurally):** `obsidian-horizon` is the closest sidebar analogue — `src/main.ts` registers `HorizonSidebarView` and opens it via `app.workspace.ensureSideLeaf` inside `onLayoutReady`; `src/ui/sidebar-view.ts` is the `ItemView` subclass pattern (`getViewType`/`getDisplayText`/`getIcon`/`onOpen`/`onClose`, child components via `addChild`). `obsidian-masonry` supplies `esbuild.config.mjs`, `manifest.json`+`versions.json`+`src/release-contract.test.ts`, `tsconfig.json`, and the settings split (`settings-data.ts` interface/defaults/`parseSettings` re-exported through `settings.ts` with the `PluginSettingTab`).
- **Build/deploy:** `esbuild.config.mjs` resolves deploy target via `OBSIDIAN_PLUGIN_DIR` env → gitignored `.obsidian-plugin-dir` file → project root, copying `manifest.json`+`styles.css` beside the built `main.js`. `styles.css` is auto-loaded by Obsidian from the plugin folder (no code load). Toolchain: pnpm, `node --test --experimental-strip-types` (not vitest), obsidian `1.13.1` pinned, `minAppVersion` `1.12.7`.
- **superbasetags integration (`app.plugins.plugins['superbasetags']`):** public `registry: SupertagRegistry` (`.supertags`, `.find(tag)`, `.membersOf(tag,limit)`, `.recount()`), plus `applyToFile`, `openBase(st)`, `openBasePath(path)`. Collection source = `src/base-scanner.ts` (`scanBases` → `parseYaml` of `.base` files → `extractTag` on `hasTag("type/…")`) combined in `registry.rebuild()` with `metadataCache.getTags()` counts. Typing command: `superbasetags:apply-to-current`.
- **sonar integration (`app.plugins.plugins['sonar']`):** public `service: SearchService` — `query(raw, opts): Promise<KeywordHit[]>` (BM25 + frecency), `recent(limit)`, `allTags()`, `previewMarkdown(path)`. Command `sonar:open-search`. No sidebar view (modal-only) — Portal builds its own jump UI over `service.query`.

### Institutional Learnings (from vault memory)

- Cross-plugin invocation via `app.commands.executeCommandById('<id>')` / reading `app.plugins.plugins['<id>']` is the suite's established convention (Exo `askExo`, AIditor↔Composer). Untyped — cast `as any`, null-guard, resolve after `onLayoutReady`.
- Never `processFrontMatter` on notes with unquoted wikilink frontmatter — irrelevant to Portal's own writes but relevant if delegating to superbasetags typing (it owns that).
- Build deploys fresh `main.js` into the vault via `.obsidian-plugin-dir`; never copy a stale repo `main.js` over it.
- Desktop-first; never toggle EmulateMobile during any dev/test.

### External References (Obsidian API — verified against obsidian.d.ts v1.12.x)

- **Q1 hide explorer:** CSS-hide `[data-type="file-explorer"]` (obsidian-hider pattern) keeps the core plugin alive → `revealInFolder` unbroken; `detachLeavesOfType('file-explorer')` is cleaner UX but kills reveal-style calls. **Decision: CSS-hide.** Place Portal via `getLeftLeaf(false)` + `setViewState`, register via `registerView`.
- **Q2 context menu (RISK #1):** `workspace.on('file-menu', (menu,file,source,leaf))` is a broadcast — native items are added by the file-explorer core plugin's own listener, NOT by `trigger`. With CSS-hide the core listener stays alive so items *may* pass through, but this is **UNVERIFIED** → build the full menu manually (`fileManager.renameFile`, `fileManager.trashFile`/`promptForDeletion`, `vault.copy`, `workspace.getLeaf('tab').openFile`, custom "Move to" folder picker), and treat any native pass-through as a bonus.
- **Q3 drag/move:** `fileManager.renameFile(file, newPath)` moves + updates links (`vault.rename` does not). `app.dragManager.dragFile(evt,file)`+`onDragStart(evt,data)` gives native-fidelity drag from a custom view (UNVERIFIED-but-proven in `recent-files-obsidian`; guard with `?.`). Pre-check collisions via `vault.getAbstractFileByPath(newPath)`.
- **Q4 create/rename/delete:** `vault.create(path,"")`, `vault.createFolder(path)`, `fileManager.getNewFileParent(activePath)`, `fileManager.trashFile`/`promptForDeletion`. No `createNewMarkdownFile` exists.
- **Q5 cross-plugin:** `app.plugins.plugins[id]` + `executeCommandById` — untyped, cast `as any`, guard after `onLayoutReady`.
- **Q6 tree/tags/live:** `vault.getRoot()` + `TFolder.children`; `metadataCache.getTags()` → `{tag: count}` (untyped, proven); live via `vault.on('create'|'delete'|'rename')` and `metadataCache.on('changed'|'resolved')` — **register inside `onLayoutReady`** to avoid a create-event storm on load.

---

## Key Technical Decisions

- **CSS-hide the native explorer, not detach** (R1): keeps the core file-explorer plugin alive so `revealInFolder` and any third-party dependence on it survive, and preserves a chance of free context-menu pass-through. A settings toggle governs the hide so disabling Portal restores the native explorer instantly. (see origin: Key Decisions — visual replace)
- **Rebuild the context menu manually; treat native pass-through as bonus** (R10, RISK #1): do not architect on the assumption that `trigger('file-menu')` yields native items. Portal owns Rename/Delete/Move/Open-in-new-tab/New via `FileManager`, then also fires `file-menu` so other plugins' registered items appear.
- **Consume superbasetags via its plugin instance's `registry` + delegate typing via command** (R5, R15, R16): read collections from the same source superbasetags computes (`registry.supertags`), invoke typing via `executeCommandById('superbasetags:apply-to-current')` — the suite's cross-plugin convention. superbasetags is changed to not auto-open its view when Portal is present.
- **Jump reuses sonar `service.query` in-process** (R8): no new index, no HTTP; Portal builds only the jump UI. Fallback to a plain substring filter when sonar is absent.
- **Native `dragManager` for drag fidelity** (R11): reuse Obsidian's drag payload so drops behave like the native explorer, with `fileManager.renameFile` on folder-drop.
- **Suite template = masonry/horizon** (all): pnpm + `node --test`, esbuild `.obsidian-plugin-dir` deploy, `release-contract.test.ts`, settings split. Add a `versions.json` + release-contract test from day one (masonry has it; horizon's absence is an inconsistency, not a model to copy).

---

## Open Questions

### Resolved During Planning

- Hide strategy (detach vs CSS): **CSS-hide**, reversible via settings toggle.
- Context-menu native parity: **do not rely on it** — rebuild manually; bonus pass-through if it works under CSS-hide.
- superbasetags read surface: its live `registry` (not re-parsing `.base` independently) so counts/membership stay consistent.
- Jump engine: sonar `service.query`, in-process.
- Naming: keep **Portal** / id `portal` provisionally — renaming pre-release is cheap; revisit before any public listing.

### Deferred to Implementation

- Exact "Move to" picker UX (FuzzySuggest over folders vs drag-only) — settle when building U8.
- Whether native items pass through under CSS-hide in practice — verify empirically in U8; the manual menu makes the answer non-blocking.
- How superbasetags signals "Portal present, suppress my view" — shared setting vs presence check `app.plugins.plugins['portal']`; settle when landing U5's superbasetags-side change.
- Collapse/pin persistence shape in plugin data — settle in U3/U6.

---

## Output Structure

    obsidian-portal/
    ├── manifest.json
    ├── versions.json
    ├── package.json
    ├── tsconfig.json
    ├── eslint.config.mjs
    ├── esbuild.config.mjs
    ├── .obsidian-plugin-dir            (gitignored; → vault/.obsidian/plugins/portal)
    ├── styles.css
    └── src/
        ├── main.ts                     (plugin: registerView, onLayoutReady, hide toggle)
        ├── portal-view.ts              (ItemView: the rail shell + section mount)
        ├── sections/
        │   ├── folders.ts              (folder tree)
        │   ├── tags.ts                 (tag tree)
        │   ├── collections.ts          (superbasetags bridge)
        │   └── pins-recent.ts          (Pinned + Recent)
        ├── nav/
        │   ├── jump.ts                 (sonar-backed jump UI)
        │   ├── context-menu.ts         (manual menu + file-menu trigger)
        │   ├── dnd.ts                  (dragManager move + collision precheck)
        │   └── rename.ts               (inline rename via fileManager)
        ├── integrations/
        │   ├── superbasetags.ts        (registry read + typing delegation)
        │   └── sonar.ts                (service.query wrapper + fallback)
        ├── settings.ts                 (interface, DEFAULT_SETTINGS, parseSettings, SettingTab)
        └── *.test.ts                   (release-contract + per-unit unit tests)

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                 ┌──────────────── PortalView (ItemView, left sidebar) ────────────────┐
  onLayoutReady  │  rail = [ Pinned · Recent · Folders · Tags · Collections ]          │
  ──────────────▶│    each section = a renderer subscribed to live events              │
                 └───┬─────────────┬──────────────┬───────────────┬────────────────────┘
                     │             │              │               │
        vault.getRoot│  metadataCache│   integrations/           │ workspace lastOpen
        + TFolder    │  .getTags()   │   superbasetags.registry  │ + settings.pinned
        + vault.on(  │  + on(changed)│   sonar.service.query     │
          create/…)  │               │                           │
                     ▼             ▼              ▼               ▼
  interactions:  context-menu.ts (manual items + trigger 'file-menu')   ← RISK #1
                 dnd.ts (dragManager.dragFile → drop → fileManager.renameFile)
                 rename.ts (inline → fileManager.renameFile)
                 jump.ts (sonar service.query → open top hit)

  native explorer: CSS-hidden ([data-type=file-explorer]); core plugin stays ALIVE
                   (revealInFolder preserved; toggle in settings restores it)
```

---

## Implementation Units

### U1. Scaffold the plugin repo

**Goal:** A buildable, deployable, empty Portal plugin matching the suite template.

**Requirements:** (structural, advances all)

**Dependencies:** None

**Files:**
- Create: `package.json`, `tsconfig.json`, `eslint.config.mjs`, `esbuild.config.mjs`, `manifest.json`, `versions.json`, `.gitignore`, `styles.css`, `src/main.ts`
- Test: `src/release-contract.test.ts`

**Approach:**
- Copy `obsidian-masonry` toolchain verbatim: pnpm, `node --test --experimental-strip-types`, esbuild with the `.obsidian-plugin-dir` deploy resolver, obsidian `1.13.1` pinned, `minAppVersion` `1.12.7`, `isDesktopOnly: false`.
- `manifest.json` id `portal`; `versions.json` = `{ "<version>": "1.12.7" }`.
- `.obsidian-plugin-dir` (gitignored) → the vault's `.obsidian/plugins/portal`.
- `src/main.ts` minimal: `registerView` stub + `onload` logging; real view lands in U2.

**Patterns to follow:** `obsidian-masonry/esbuild.config.mjs`, `obsidian-masonry/manifest.json`, `obsidian-masonry/src/release-contract.test.ts`.

**Test scenarios:**
- Happy path: release-contract test asserts `manifest.id === 'portal'`, `manifest.version === packageJson.version`, `versions.json` deep-equals `{ [version]: minAppVersion }`.
- Test expectation: build (`pnpm build`) produces `main.js` and deploys it plus `manifest.json`/`styles.css` into the vault plugin dir.

**Verification:** `pnpm build` + `pnpm test` green; plugin appears and enables in Obsidian with no errors.

---

### U2. Sidebar shell + native-explorer hide

**Goal:** Portal opens as the primary left-sidebar view; native explorer is hidden with a reversible toggle.

**Requirements:** R1, R2, R17

**Dependencies:** U1

**Files:**
- Create: `src/portal-view.ts`, `src/settings.ts`
- Modify: `src/main.ts`, `styles.css`

**Approach:**
- `registerView('portal', leaf => new PortalView(leaf, ctx))`; open via `getLeftLeaf(false)` + `setViewState` inside `onLayoutReady` (horizon pattern), non-focus-stealing.
- Native hide: add body class toggling a CSS rule on `.workspace-leaf-content[data-type="file-explorer"]` (obsidian-hider pattern), governed by a `hideNativeExplorer` setting (default on). On `onunload` remove the class so the explorer returns.
- `PortalView` renders empty labelled section containers (Pinned/Recent/Folders/Tags/Collections) that later units fill.
- Rail base styling: Cosmos-quiet (consume Cosmos CSS vars with fallbacks).

**Patterns to follow:** `obsidian-horizon/src/main.ts` (`ensureSideLeaf`, `onLayoutReady`), `obsidian-horizon/src/ui/sidebar-view.ts`; `obsidian-hider/styles.css` selector.

**Test scenarios:**
- Covers AE1. Happy path: with Portal enabled, native explorer leaf content is visually hidden and Portal occupies the left sidebar.
- Edge case: toggling `hideNativeExplorer` off restores the native explorer without reload.
- Edge case: disabling the plugin removes the hide class (no permanently-hidden explorer).
- Unit: section containers render in the fixed top→bottom order.

**Verification:** Portal auto-opens on layout ready; native explorer hidden by default; toggle + unload both reversible.

---

### U3. Folders section (tree + live)

**Goal:** Collapsible folder tree of the whole vault, persisted collapse state, live updates, click-to-navigate, active-file reveal.

**Requirements:** R3, R7, R9

**Dependencies:** U2

**Files:**
- Create: `src/sections/folders.ts`
- Modify: `src/portal-view.ts`, `src/settings.ts` (persist collapse + reveal state)
- Test: `src/sections/folders.test.ts`

**Approach:**
- Build from `vault.getRoot()` + recursive `TFolder.children` (`instanceof TFile/TFolder`).
- Live: subscribe `vault.on('create'|'delete'|'rename')` registered inside `onLayoutReady`; incremental re-render (avoid full rebuild storms).
- Click: file → `workspace.getLeaf().openFile`; folder → toggle collapse (persist).
- Active reveal: on `workspace.on('file-open')`, expand ancestors + scroll into view.

**Patterns to follow:** horizon's incremental renderer discipline; memory `obsidian-raf-starves-when-pane-idle` (don't gate relayout solely on render-loop events).

**Test scenarios:**
- Happy path: a fixture vault tree renders folders/files in sorted order.
- Edge case: empty folder, deeply nested path, file with no extension.
- Integration: `vault.rename` of a file moves its node under the new parent without a full rebuild.
- Edge case: collapse state survives a view reopen.

**Verification:** Tree matches the vault, stays live on create/delete/rename, reveals the active file.

---

### U4. Tags section (hierarchical tree + counts + live)

**Goal:** Nested tag tree with live counts; click opens the tag's results.

**Requirements:** R4, R7

**Dependencies:** U2

**Files:**
- Create: `src/sections/tags.ts`
- Test: `src/sections/tags.test.ts`

**Approach:**
- Source `(metadataCache as any).getTags()` → `{tag: count}`; parse `#a/b/c` into a nested tree, summing counts up the hierarchy.
- Live: `metadataCache.on('changed'|'resolved')`; first read gated on `'resolved'`.
- Click a tag → open its results (delegate to sonar tag-filter query, else native tag search).

**Patterns to follow:** `tag-wrangler` `Object.keys(getTags())` usage (from research); integrations/sonar for the results open.

**Test scenarios:**
- Happy path: flat + nested tags build the correct tree with summed counts.
- Edge case: tag appearing only as a leaf vs also as a parent prefix; zero-count after removal.
- Integration: editing a note's tags updates counts via `metadataCache.on('changed')`.

**Verification:** Tag tree matches vault tags with correct nested counts, live on edits.

---

### U5. Collections section (superbasetags absorption)

**Goal:** Render `#type/*` collections inside Portal; retire superbasetags' own sidebar view; delegate typing.

**Requirements:** R5, R14, R15, R16

**Dependencies:** U2; cross-repo change in `obsidian-superbasetags`

**Files:**
- Create: `src/sections/collections.ts`, `src/integrations/superbasetags.ts`
- Modify (other repo): `obsidian-superbasetags/src/main.ts` (suppress auto-open of its view when Portal is present)
- Test: `src/integrations/superbasetags.test.ts`

**Approach:**
- Read collections from `app.plugins.plugins['superbasetags'].registry.supertags` (icon · name · `membersOf(tag).length`), resolved after `onLayoutReady`, null-guarded when absent.
- Click a collection → `registry`-instance `openBase(st)`; "type this note" → `executeCommandById('superbasetags:apply-to-current')`.
- superbasetags side: gate its `activateView`/auto-open on absence of Portal (presence check or shared setting) so only Portal surfaces collections. Its view code stays (dead) until the follow-up cleanup PR.

**Patterns to follow:** memory `exo-askexo-cross-plugin-api`, `aiditor-annotation-engine` (command-execution cross-plugin convention).

**Test scenarios:**
- Covers AE4. Integration: with superbasetags installed, Collections lists each `#type/*` with a live member count and superbasetags shows no separate sidebar view.
- Edge case: superbasetags absent → Collections section renders an empty/disabled state, no crash.
- Happy path: clicking a collection opens its Base; "type note" fires the superbasetags command.

**Verification:** Collections mirror superbasetags; its view no longer opens; typing delegates correctly.

---

### U6. Pinned + Recent sections

**Goal:** User-curated Pinned and auto Recent.

**Requirements:** R6, R7

**Dependencies:** U2

**Files:**
- Create: `src/sections/pins-recent.ts`
- Modify: `src/settings.ts` (persist pinned list)
- Test: `src/sections/pins-recent.test.ts`

**Approach:**
- Pinned: persisted array of paths; add/remove via context menu (U8) and drag; render with live existence checks.
- Recent: `workspace.getLastOpenFiles()` (or track `workspace.on('file-open')`), capped list.

**Test scenarios:**
- Happy path: pin/unpin persists across reload; recent updates on file open, capped at N.
- Edge case: pinned path whose file was deleted → shown as stale/removed gracefully.

**Verification:** Pinned persists and is editable; Recent reflects recent opens.

---

### U7. Jump (sonar-backed)

**Goal:** Fuzzy jump/filter over files/folders/tags reusing sonar ranking.

**Requirements:** R8

**Dependencies:** U2; U3/U4 for in-rail filtering

**Files:**
- Create: `src/nav/jump.ts`, `src/integrations/sonar.ts`
- Test: `src/integrations/sonar.test.ts`

**Approach:**
- Jump input at the rail top; on query call `app.plugins.plugins['sonar'].service.query(raw, opts)`, rank results, Enter opens top hit.
- Fallback when sonar absent: plain substring filter over the folder/tag trees.

**Patterns to follow:** integrations null-guard convention; sonar `SearchService.query` signature from research.

**Test scenarios:**
- Covers AE5. Happy path: typing a partial name ranks via sonar and Enter opens the top match.
- Edge case: sonar absent → substring fallback still filters the rail; no crash.
- Edge case: empty query restores the full rail.

**Verification:** Jump returns ranked matches with sonar, degrades to filter without it.

---

### U8. Context menu (RISK #1) + create actions

**Goal:** Right-click menu with native + third-party parity, plus new note/folder.

**Requirements:** R10, R13

**Dependencies:** U3, U6

**Files:**
- Create: `src/nav/context-menu.ts`
- Test: `src/nav/context-menu.test.ts`

**Approach:**
- On right-click build a `Menu`; manually add Rename (→ U9), Delete (`fileManager.promptForDeletion`/`trashFile`), Move to… (folder picker → `fileManager.renameFile`), Open in new tab (`workspace.getLeaf('tab').openFile`), New note (`vault.create` under `getNewFileParent`), New folder (`vault.createFolder`), Pin/Unpin (U6).
- Then `app.workspace.trigger('file-menu', menu, file, 'portal', leaf)` so other plugins' registered items append. Any native items that appear under CSS-hide are a bonus.

**Execution note:** Verify empirically whether native items pass through under CSS-hide; the manual set makes the outcome non-blocking either way.

**Patterns to follow:** research Q2/Q4 API set; `FileManager` methods.

**Test scenarios:**
- Covers AE2. Integration: with a plugin that registers a `file-menu` item, right-clicking a Portal file shows that item alongside Portal's own actions.
- Happy path: New note creates a `.md` in the target folder via `vault.create`; New folder via `vault.createFolder`.
- Error path: delete routes through `promptForDeletion` (respects trash preference); move onto a colliding name is pre-checked and refused gracefully.

**Verification:** Menu offers full mutation set; third-party items appear; create/delete/move behave like native.

---

### U9. Drag-to-move + inline rename

**Goal:** Native-fidelity drag move and inline rename with link updates.

**Requirements:** R11, R12

**Dependencies:** U3

**Files:**
- Create: `src/nav/dnd.ts`, `src/nav/rename.ts`
- Test: `src/nav/dnd.test.ts`

**Approach:**
- Drag: make rows draggable via `app.dragManager.dragFile(evt, file)` + `onDragStart` (guarded `?.`); drop onto a folder → precheck `vault.getAbstractFileByPath(newPath)` then `fileManager.renameFile(file, newPath)`.
- Inline rename: editable label commits through `fileManager.renameFile` (link-safe); Esc cancels.

**Patterns to follow:** research Q3 (`recent-files-obsidian` dragManager usage); collision precheck.

**Test scenarios:**
- Covers AE3. Integration: dragging a file from folder A onto folder B moves it and updates inbound links (identical to native).
- Edge case: drop onto a folder already containing a same-named file → refused with a notice, no data loss.
- Edge case: moving a folder (not just a file) relocates its subtree.
- Happy path: inline rename updates links; Esc reverts.

**Verification:** Drag-move and rename match native behavior including link integrity and collision safety.

---

### U10. Look, settings & polish

**Goal:** Cosmos-tuned styling, settings tab, graceful non-Cosmos degrade.

**Requirements:** R17

**Dependencies:** U2–U9

**Files:**
- Modify: `styles.css`, `src/settings.ts`
- Test: `src/settings.test.ts`

**Approach:**
- Quiet typographic styling consuming Cosmos CSS vars with fallbacks; section headers, hover/active, focus-visible.
- Settings tab: `hideNativeExplorer` toggle, pinned management, jump source, section visibility.

**Test scenarios:**
- Happy path: settings persist via `saveData`/`parseSettings`; toggles reflect in the view.
- Test expectation: styling — none (visual); verified by eyeball in-vault.

**Verification:** Rail reads Craft-quiet on Cosmos and remains usable on the default theme; settings persist.

---

## System-Wide Impact

- **Interaction graph:** hooks `vault.on(create/delete/rename)`, `metadataCache.on(changed/resolved)`, `workspace.on(file-open)`, and fires `workspace.trigger('file-menu')`. Reads `app.plugins.plugins['superbasetags'|'sonar']`.
- **Error propagation:** every cross-plugin read is null-guarded; missing superbasetags/sonar degrade to empty/fallback, never throw.
- **State lifecycle risks:** register vault/metadata listeners only inside `onLayoutReady` (avoid create-event storm); remove the explorer-hide class on `onunload`; pinned/collapse persistence must survive reload.
- **API surface parity:** superbasetags' view retirement is a coordinated two-repo change; its typing engine + registry stay public.
- **Unchanged invariants:** native file-explorer core plugin stays loaded (CSS-hidden only) so `revealInFolder` and other plugins depending on it keep working; sonar/superbasetags public APIs unchanged (only superbasetags view auto-open is gated).

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **Context-menu native items don't pass through (RISK #1)** | Rebuild the full menu manually on `FileManager`; pass-through is a bonus, not a dependency. |
| `app.dragManager` is untyped and could change across Obsidian versions | Guard with `?.`; it's proven in `recent-files-obsidian`; drag-move degrades to context-menu "Move to…". |
| `app.plugins`/`executeCommandById`/`getTags` untyped | Cast `as any`, null-guard, resolve after `onLayoutReady`; already the suite convention. |
| superbasetags view retirement regresses its users | Gate only auto-open behind Portal presence; keep view code until a follow-up cleanup PR proves Collections. |
| CSS-hide leaves a reachable "Files" ribbon that re-shows the explorer | Acceptable (reversible by design); optionally also hide the ribbon entry via CSS. |
| Create-event storm on load | Register vault listeners inside `onLayoutReady` per the documented caveat. |

---

## Sources & References

- **Origin document:** `docs/brainstorms/portal-requirements.md`
- Template repos: `obsidian-masonry`, `obsidian-horizon` (toolchain, esbuild deploy, ItemView, release-contract)
- Integration surfaces: `obsidian-superbasetags/src/{main,registry,base-scanner}.ts`, `obsidian-sonar/src/service/search-service.ts`
- Obsidian API: `obsidian.d.ts` v1.12.x (`fileManager.renameFile`/`trashFile`/`promptForDeletion`/`getNewFileParent`, `vault.create`/`createFolder`/`getRoot`/`on`, `workspace.on('file-menu')`/`getLeftLeaf`/`onLayoutReady`, `metadataCache.getTags`/`on`); community-proven untyped: `app.dragManager`, `app.plugins.plugins`, `executeCommandById`, `internalPlugins`
- Reference implementations: `recent-files-obsidian` (dragManager), `obsidian-hider` (CSS hide), Notebook Navigator (manual menu precedent)
