---
date: 2026-07-13
topic: portal-craft-navigator
---

# Portal — Craft-style unified navigator

## Summary

Portal is a new marioverse-suite plugin that becomes Obsidian's **primary sidebar** — hiding the native file explorer — and presents a single Craft-quiet rail unifying **Folders + Tags + Collections + Pinned + Recent**. Folders and tags live in one surface for the first time; drag-move, inline rename, and context menus all ship in v1, proxied to native APIs. superbasetags is reduced to an engine.

---

## Problem Frame

Obsidian keeps folders and tags in two separate panes — the file explorer and the tag pane — so you can never see both at once, and neither is the refined, quiet navigation surface Craft makes its home screen. Mario has already paid to work around this: he built the **Cosmos** theme to re-skin the native sidebar and **superbasetags** to surface `#type/*` collections in their own hub. Even so, day-to-day navigation is still split across panes, the native explorer stays visually plain under the theme, and semantic collections sit apart from the folder tree. The cost is a fragmented navigation experience across a large single-user vault, and a sidebar that never reaches the calm, single-surface feel that made Craft the reference.

---

## Actors

- A1. **Mario** (single user): navigates the vault, moves/renames/creates notes, jumps to files, opens tags and collections.
- A2. **Obsidian file APIs** (native): own the source-of-truth mutations (move, rename, create) and the file context-menu contribution point that third-party plugins hook.
- A3. **superbasetags** (companion plugin): engine for `#type/*` collection definitions and for typing a note (apply tag + scaffold fields).
- A4. **sonar** (companion plugin): existing search ranking reused for Portal's jump.
- A5. **Cosmos** (theme): supplies the visual tokens Portal tunes to.

---

## Key Flows

- F1. **Unified navigation**
  - **Trigger:** Portal is the sidebar; Mario scans the rail.
  - **Actors:** A1
  - **Steps:** Sees Pinned / Recent / Folders / Tags / Collections in one rail → clicks a folder to expand, a file to open, a tag/collection to open its results.
  - **Outcome:** Reaches any file, folder, tag, or collection from one surface without switching panes.
  - **Covered by:** R2, R3, R4, R5, R7, R9

- F2. **Move / rename / create (native proxy)**
  - **Trigger:** Mario drags a file onto a folder, renames inline, or creates a new note.
  - **Actors:** A1, A2
  - **Steps:** Action performed in Portal → Portal delegates to the native file API → links update, file lands in target → rail reflects new location.
  - **Outcome:** Same result and link-integrity as a native move/rename/create.
  - **Covered by:** R11, R12, R13

- F3. **Context menu with plugin parity**
  - **Trigger:** Mario right-clicks an item in Portal.
  - **Actors:** A1, A2
  - **Steps:** Portal builds a menu through Obsidian's file-menu contribution point → native actions plus every installed plugin's items appear → Mario picks one.
  - **Outcome:** No loss of context-menu function vs the native explorer.
  - **Covered by:** R10

- F4. **Jump**
  - **Trigger:** Mario invokes the jump/filter field.
  - **Actors:** A1, A4
  - **Steps:** Types a partial name → rail filters/ranks via the existing search ranking → Enter opens the top match.
  - **Outcome:** Fast keyboard navigation to any file/folder/tag.
  - **Covered by:** R8

---

## Requirements

**Sidebar shell & sections**
- R1. Portal registers a sidebar view that serves as the primary file-navigation surface; when Portal is enabled the native file explorer is hidden by default.
- R2. A single scrollable rail presents, top to bottom: Pinned, Recent, Folders, Tags, Collections.
- R3. Folders renders the full vault folder hierarchy as a collapsible tree; collapse state persists across reloads.
- R4. Tags renders the vault's tags as a collapsible hierarchical tree (nested `#a/b/c`), each node with a live note count.
- R5. Collections renders the `#type/*` → Bases collections (icon · name · live member count), sourced from superbasetags.
- R6. Pinned holds a user-curated set of files/folders; Recent auto-lists recently opened files.

**Navigation & jump**
- R7. Clicking an item navigates it: file → open in the active pane; folder → expand/collapse; tag or collection → open its results/view.
- R8. A jump/filter affordance lets the user reach any file/folder/tag by fuzzy query, reusing the vault's existing search ranking rather than a new engine.
- R9. The rail reveals and scrolls to the active file's location as the user navigates.

**Mutations via native proxy**
- R10. Right-clicking an item opens a context menu that includes the native explorer's actions **and** items contributed by other installed plugins.
- R11. Dragging a file/folder onto a folder moves it via the native file-manager, with the same result and link-updates as a native drag-move.
- R12. Inline rename is available on files/folders and commits through the native rename API so links update.
- R13. Creating a new note or folder is available from the rail header and from folder context menus.

**superbasetags absorption (READ-ONLY — superbasetags is NEVER modified)**
- R14. Portal surfaces superbasetags' `#type/*` collections inside its Collections section by **reading** superbasetags' in-memory registry at runtime. superbasetags is never edited, gated, or suppressed — it stays fully functional and autonomous (its own sidebar view, commands, and typing all keep working unchanged). Portal is simply an additional read-only surface. *(Hard constraint, Mario 2026-07-13.)*
- R15. superbasetags stays installed as the engine for typing a note (apply `#type/X` + scaffold fields); Portal invokes it via its command rather than reimplementing it.
- R16. Typing/apply-supertag is reachable from Portal (note or collection action) and delegates to superbasetags.

**Look & platform**
- R17. Portal ships theme-agnostic but is visually tuned to Cosmos (quiet, typographic, generous), reusing Cosmos tokens where present and degrading gracefully on other themes.
- R18. Portal targets desktop first; phone parity ships as a dedicated later slice, not in this scope.

---

## Acceptance Examples

- AE1. **Covers R1.** Given Portal enabled, when Obsidian starts, the native file explorer is not shown and Portal occupies the file-navigation sidebar.
- AE2. **Covers R10.** Given another installed plugin that adds a file context-menu item, when the user right-clicks a file in Portal, that plugin's item appears alongside the native actions.
- AE3. **Covers R11, R12.** Given a file in folder A, when the user drags it onto folder B, the file moves to B and its inbound links update — identical to a native move.
- AE4. **Covers R5, R14.** Given superbasetags installed, when the user opens Portal, `#type/*` collections appear in Portal's Collections section and superbasetags shows no separate sidebar view.
- AE5. **Covers R8.** Given the jump field, when the user types a partial note name, the rail ranks matches with the existing search ranking and Enter opens the top match.

---

## Success Criteria

- Mario switches to Portal as his daily sidebar and stops opening the native file explorer.
- Zero loss of function vs native: every action he did in the native explorer — move, rename, new, reveal, and third-party menu items — is doable in Portal.
- Folders, tags, and collections are usable from one rail without switching panes.
- ce-plan can proceed without inventing sections, actions, or the superbasetags split.

---

## Scope Boundaries

- Not a full-custom reimplementation of drag/rename/context — these proxy to native APIs.
- Does not replace sonar's search modal, tabx, or horizon.
- No saved-search / smart-query beyond tags and collections in v1.
- No graph or canvas navigation.
- No phone touch parity in v1 (dedicated later slice).
- superbasetags is **never modified** — Portal only reads it at runtime (see R14); it stays fully functional and autonomous.

---

## Key Decisions

- **Visual replace over complement:** Portal becomes the primary sidebar and hides the native explorer for full Craft fidelity, accepting the cost of proxying drag and context to native APIs.
- **Context-menu parity via the native file-menu contribution point** so third-party plugin items still appear from a custom view — the single highest-risk parity point (risk #1).
- **Absorb superbasetags' hub into Portal** (one rail) rather than two communicating plugins; superbasetags becomes engine-only.
- **Reuse rather than rebuild:** sonar for jump ranking, Cosmos tokens for look — no new search engine, no bespoke theme.
- **Everything in v1:** no read-only-first phasing — drag, rename, context, and the merge all land in the first release (explicit user decision).

---

## Dependencies / Assumptions

- Depends on superbasetags installed alongside (collection/Bases definitions + typing engine).
- Assumes Obsidian's file-menu contribution point reproduces native + third-party context items from a custom view — to be verified in planning.
- Assumes the native file explorer can be hidden without breaking plugins that call reveal-in-explorer or rely on its file-menu source — to be verified.
- Assumes Cosmos exposes tokens Portal can consume; Portal must degrade gracefully on other themes.

---

## Outstanding Questions

### Resolve Before Planning

- None — all product decisions are locked (scope, superbasetags absorption, v1-everything).

### Deferred to Planning

- [Affects R1][Technical] How to cleanly hide/replace the native file explorer without breaking plugins that depend on reveal-in-explorer or its file-menu source.
- [Affects R10][Technical][Needs research] Confirm the native file-menu contribution point reproduces the full native + third-party context menu from a custom view.
- [Affects R11][Technical] Drag-and-drop DOM mechanics for move, and whether to reuse native drag data.
- [Affects R8][Technical] Integration surface with sonar's ranking (in-process API vs shared index).
- [Affects R5, R15][Technical] How Portal reads superbasetags' collection definitions and invokes its typing engine (shared API vs config/command).
- [Affects R2] Naming: keep "Portal" / `obsidian-portal` or pick a more suite-consistent name.
