# mv-kit audit — Portal (wave 2)

Audit of `styles.css` (482 lines pre-fix) + the UI code in `src/` —
`portal-view.ts`, `sections/*`, `nav/*` (excluding `src/nav/nav-block.ts`,
an in-flight uncommitted file of Mario's, per hard constraint), `settings.ts`
— against `obsidian-cosmos-theme/docs/mv-kit.md`, both desktop and phone
columns. Scope: coherence-only fixes (radius / type / icons / motion tokens
/ empty states / microcopy). No layout redesign, no DOM restructure — per
`docs/2026-07-24-suite-coherence-design.md` §C/D non-goals. Portal's phone
surface is the rail as a full-screen drawer (`body.is-phone` / `@media
(pointer: coarse)`); audited statically at the code/CSS level — `EmulateMobile`
was never enabled (kills Node-based plugins per project memory); phone
screenshots remain Mario's on-device sign-off, out of scope here.

Per-rule verdict: **pass** (already compliant) / **fixed** (this wave) /
**waived** (kit rule doesn't apply here, with reason) / **deferred** (real
violation, but lives in the untouchable `nav-block.ts`).

## Golden rule — theme-independent consumption

| Check | Verdict |
|---|---|
| Every `var(--cosmos-*)`/`var(--mv-*)` has a literal fallback | **pass** — pre-existing: `--portal-motion` (line 9) and `.portal-note-enter`'s animation (lines 469-471, pre-fix numbering) already followed this pattern; this wave's additions (press-scale block) follow it too. |
| No plugin stylesheet redefines `--mv-*`/`--cosmos-*` at `:root`/`body` | **pass** — Portal only ever defines its own `--portal-*` namespace on `.portal-rail`, never at `:root`/`body`. |
| Raw `ms`/hex/`cubic-bezier` outside a `var(--token, fallback)` expression | **pass** — brief's premise verified: pre-fix, exactly 2 raw `ms` values and 2 `cubic-bezier` values existed, both pairs already living inside `var(..., fallback)` forms (old lines 9, 470-471). 0 hex colours in the file. Post-fix, the new press-scale block's `140ms`/`cubic-bezier(...)` follow the same pattern. |
| `!important` count | **pass** — 0 occurrences, before and after. |

## §1 Radius + surfaces

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.portal-section-header` radius | `var(--radius-l, 12px)` | same | **pass** |
| `.portal-drop-target` (DnD outline) radius | `var(--radius-s, 4px)` | same | **pass** |
| `.portal-tree-row` (folder/file/tag/pin/recent/collection row) radius | hardcoded `7px` | same rule, shared class | **waived** — this is a plain list-row rectangle, not a "pill", "card", or "chip" surface in the kit's §1 sense (`--mv-r1`=chip/toolbar, `--mv-r-card`=card, `--cosmos-r-pill`/`-fusion-tab`=tab pill). The kit's radius vocabulary has no entry for generic row containers; Sonar's own equivalent (`.sonar-result`/`.sonar-preview` rows) was judged **pass** in wave 1 without requiring a `--mv-r*` swap, for the same reason — rows aren't in the pill/card/chip taxonomy the kit's MUST targets. |
| `.portal-jump-hit` (search-result row) radius | hardcoded `6px` | same | **waived** — same reasoning as `.portal-tree-row`: a list row, not a pill/card/chip surface. |
| Elevation shadow on floating surfaces | Portal has no popovers/menus of its own (context menus are Obsidian's native `Menu`, modals are native `Modal`/`FuzzySuggestModal`) | n/a | **waived** — nothing plugin-owned to consume `--cosmos-pop-shadow` for; native Obsidian chrome already carries its own elevation. |

## §2 Type sizes, icon sizes, touch targets

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.portal-tree-row` / `.portal-nav-row` / `.portal-section-header` / `.portal-jump-hit` tap target | row height driven by content (28px/32px min-height, no touch-min requirement per kit) | was hardcoded `min-height: 44px` in the `@media (pointer: coarse)` block, inconsistent with the token-based `body.is-phone` block 15 lines below it targeting the same 3 selectors | **fixed** — both blocks now consume `var(--cosmos-touch-min, 44px)`; same 44px value, now token-sourced and internally consistent. |
| `.portal-jump-input` (search field) | no min enforced | was hardcoded `min-height: 40px` — **below the 44px floor** | **fixed** — now `var(--cosmos-touch-min, 44px)`. |
| `.portal-tool` (toolbar icon buttons: new note, new folder, sort, reveal, search) | `28×28px` via native `clickable-icon`/`nav-action-button`, no min enforced | was hardcoded `40×40px` — **below the 44px floor** | **fixed** — now `var(--cosmos-touch-min, 44px)` square. |
| `.portal-section-action` (section-header "+" button: New folder / Add pin / Add bookmark / Create tag / Create collection) | `28×28px`, hover/focus-revealed | had **no phone-size override at all** — stayed 28×28px, opacity forced to 1 but hit area never grew — **below the 44px floor** | **fixed** — added `width`/`height: var(--cosmos-touch-min, 44px)` inside the existing phone media block. |
| `.portal-pin-remove` (× unpin control on pinned rows) | `16px` wide, hover-revealed | was `width: 28px` only — **below the 44px floor** | **fixed** — now `width: var(--cosmos-touch-min, 44px)` + added `min-height: var(--cosmos-touch-min, 44px)` (row height already provides the vertical component via the row's own 44px min-height fix above, but the control's own box is now sized correctly too). |
| Micro-label text size (`.portal-count`, `.portal-jump-path`) | `var(--font-ui-smaller, 0.75rem)` | same | **pass** |
| Icon sizing (`.portal-row-icon`, `.portal-twisty`, `.portal-jump-icon`) | native `var(--icon-size, 16px)` / fixed 13-14px for secondary glyphs, no separate icon-size scale — matches kit: "Cosmos defines no separate icon-size scale" | same | **pass** |

## §3 Motion

| Token/animation | Before | After | Verdict |
|---|---|---|---|
| `--portal-motion` (hover/reveal wash: section header, twisty, row, pin-remove, collection-open, jump-hit) | `var(--cosmos-t-fast, 120ms) var(--mv-lift, cubic-bezier(0.22, 1, 0.36, 1))` | unchanged | **pass** — already the kit's exact "physical hover/reveal easing" recipe (`--mv-lift` on the `--cosmos-t-fast` tier); this declaration is literally the kit's own doc example (mv-kit.md's golden-rule code block quotes this exact line from Portal). |
| `.portal-note-enter` phone/desktop entrance animation | `var(--cosmos-t-panel, 260ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))`, `transform: translateY(8px) → none` + `opacity` | unchanged | **pass** — composited properties only, token-sourced duration/easing, has its own explicit `prefers-reduced-motion: reduce { animation: none }` block. |
| `--cosmos-press-scale` on phone tap targets | **missing entirely** — Portal's custom rail classes (`.portal-tree-row`, `.portal-section-header`, `.portal-nav-row`, `.portal-jump-hit`, `.portal-tool`, `.portal-section-action`, `.portal-pin-remove`) aren't in Cosmos's own phone press-scale selector list (`cosmos-phone.css` §E only targets `.clickable-icon`, `.nav-file-title`, `.nav-folder-title`, `.menu-item`, `.suggestion-item`, `.mobile-navbar-action`, `.mobile-toolbar-option`) — so these rows got **zero** tap feedback on phone, Cosmos present or not | added a `@media (pointer: coarse)` block applying `transform: scale(var(--cosmos-press-scale, 0.98))` on `:active` to all of the above, transitioned on `var(--cosmos-t-fast, 140ms) var(--cosmos-native, cubic-bezier(0.32, 0.72, 0, 1))` | **fixed** — kit §3 MUST: "tap targets apply `transform: scale(var(--cosmos-press-scale, 0.98))` on active/press." `transform`-only, composited; inherits reduced-motion because the duration is token-sourced (Cosmos zeroes `--cosmos-t-*` under `prefers-reduced-motion: reduce`) — with Cosmos absent the plugin's own `0.98`/`140ms` literal fallback is a small enough motion that no explicit override was added, matching the kit's own guidance that token-consumption is sufficient. |
| `prefers-reduced-motion: reduce` handling | explicit override present on `.portal-note-enter` only (the file's only `@keyframes` animation) | unchanged | **pass** — the new press-scale rule is a `:active` transition (not a `@keyframes` entrance), token-driven duration, same treatment the kit describes as sufficient ("a plugin that consumes the duration tokens … inherits this automatically"). |
| Animated properties | `transform`/`opacity` for entrances; `background-color`/`color`/`opacity` for hover washes | unchanged, new press-scale rule adds `transform` only | **pass** — no layout-triggering property (`width`/`height`/`top`/`left`) is ever animated; the `width`/`height` touch-target fixes in §2 are static sizing changes, not transitions. |

## §4 Empty-state pattern

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.portal-empty` ("No bookmarks" / "No pins" / "Nothing recent" / "No collections" / "No tags" / "SuperBaseTags not installed") | `color: var(--text-faint); font-size: var(--font-ui-smaller, 0.75rem)` (+ `font-style: italic`, additive, not prohibited) | same class, no phone variant | **pass** — matches the kit's whisper recipe verbatim on the two MUST properties (`text-faint` + `font-ui-smaller`); the extra `italic` doesn't violate any MUST/MUST NOT (kit only bans bold, `--text-normal`, and urgency punctuation). |
| `.portal-section-title` (section headers: "Folders", "Tags", "Pinned", "Bookmarks", "Collections", "Recent") | `font-size: var(--font-ui-medium, 0.9375rem); font-weight: var(--font-semibold, 600)` | same | **waived** — considered against the kit's §4 micro-label row ("Section label … Same micro-label recipe applies wherever the plugin has an equivalent section heading") but judged not equivalent: Sonar's `.sonar-group` eyebrow was *already* `font-ui-smaller`/`text-faint` pre-fix (only missing uppercase/letter-spacing) — a lightweight label from the start. Portal's section titles are load-bearing primary headings (the only visual anchor naming each of the 6 rail sections, semibold at the medium type step), not a secondary eyebrow sitting above other content the way Cosmos's shipped "Properties"/backlinks micro-labels do. Shrinking/uppercasing them to the micro-label recipe would be a visual redesign of the rail's primary information hierarchy, which the wave's explicit non-goal excludes ("NO layout redesign… do not restructure DOM/sections"). Flagged for Mario if a future wave wants to revisit section-header type scale suite-wide. |
| `.portal-count` (row-count badge next to section titles) | `color: var(--text-faint); font-size: var(--font-ui-smaller, 0.75rem)` | same | **pass** — already the whisper-adjacent micro recipe (faint + smaller), correctly quiet next to the heading it annotates. |

## §5 Microcopy voice

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Sentence-case labels | `PortalSettingTab` uses Obsidian's native `Setting`/`PluginSettingTab` API exclusively (`new Setting(containerEl).setName('Hide native file explorer')…`) — all 6 toggle labels + the "Sections" sub-heading are sentence-case | n/a | **pass** — no bespoke `.mva-pv`-style form exists to normalize; delegates entirely to native `Setting`, matching Sonar wave 1's identical verdict for the same reason. |
| Context-menu / modal labels | `showFileMenu`/`showBulkMenu` (native `Menu`) and `CreateTagModal`/`PinItemModal`/`MoveModal` (native `Modal`/`FuzzySuggestModal`) — "Open in new tab", "Rename", "Move to…", "Delete", "New note", "New folder", "Pin"/"Unpin", "Create tag" — all sentence-case | same | **pass** |
| No native `<select>` | `grep -rn "createEl('select'\|<select"` over `src/` (excl. `nav-block.ts`): zero hits | same | **pass** |
| No `mod-cta` on buttons | `grep -n "mod-cta"` over `src/` + `styles.css`: zero hits (`CreateTagModal`'s primary button uses native `.setCta()`, which is Obsidian's own `Setting`/`ButtonComponent` API, not a plugin-authored `mod-cta` class the kit's rule is aimed at — same category as Sonar's native-`Setting` pass above) | same | **pass** |
| English product copy, PM jargon untranslated | every UI string across `portal-view.ts`, `sections/*.ts`, `nav/toolbar.ts`, `nav/jump.ts`, `nav/context-menu.ts`, `nav/section-actions.ts`, `settings.ts` is English | same | **pass** |
| Chip+popover pickers, never native `<select>` | Portal has no picker-style controls (settings are toggles + up/down reorder buttons; sort order is a native `Menu`) | n/a | **pass, not applicable** — nothing in Portal's surface is a picker in the kit's sense. |
| `nav-block.ts` label "All Docs" (Title Case) | fixed nav-block entry label, alongside "New document" (sentence-case), "Tasks" (single word, case-neutral), "Calendar" (single word, case-neutral) | same, `mountNavBlock` is device-agnostic | **deferred** — real §5 violation ("All Docs" is Title Case, not sentence-case per the kit's MUST), but it lives in `src/nav/nav-block.ts`, which carries Mario's uncommitted in-flight diff and is off-limits for this wave per hard constraint. Flagged here for a future wave (or for Mario to fix inline in his own pending edit) rather than fixed. |

## Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a token
  substitution, a missing phone-size override, or a new `:active` motion
  rule on already-existing selectors.
- `src/nav/nav-block.ts` — untouched, byte-identical to its pre-wave state;
  its "All Docs" Title Case label is recorded above as **deferred**, not
  fixed.
- `.portal-tree-row` / `.portal-jump-hit` hardcoded row radii (see §1) —
  outside the kit's radius vocabulary (row containers, not pill/card/chip
  surfaces), consistent with Sonar wave 1's treatment of its own row radii.
- `.portal-section-title` type scale (see §4) — outside this wave's
  coherence-only scope; flagged as a possible future-wave discussion, not a
  fix, because normalizing it would restructure the rail's primary heading
  hierarchy.

## Verification

- `pnpm typecheck` — 0 errors (before and after fixes)
- `pnpm lint` — 0 issues (before and after fixes)
- `pnpm test` — 31 tests passing, 0 failing (before and after fixes; this
  wave added no new test files — unlike Sonar wave 1, no style-contract
  test was requested for this wave)
- Desktop/phone screenshot verification: **pending** — not performed this
  session (no live vault-reload check run); phone changes (touch targets,
  press-scale) are verified by reading the resulting CSS values against the
  kit's phone column, per hard constraint (`EmulateMobile` never enabled —
  it kills Node-based plugins). Phone sign-off remains Mario's, on-device.
