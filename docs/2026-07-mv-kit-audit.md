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

---

## §6 — wave 2026-07 dinamica

Audit of `styles.css` (505 lines pre-fix) + `src/nav/dnd.ts`,
`src/nav/context-menu.ts`, `src/nav/note-enter.ts` against
`obsidian-cosmos-theme/docs/mv-kit.md` §6 "Elevation & motion depth"
(commit `10f5ddc`, cantiere 2 — `docs/2026-07-25-dynamics-depth-design.md`).
`src/nav/nav-block.ts` excluded per hard constraint (Mario's uncommitted
in-flight diff); untouched, byte-identical before/after this wave. Scope:
motion/elevation coherence only — no layout redesign, no new components, per
brief non-goals. Portal is the first plugin through cantiere 2 (rollout order
Sonar → **Portal** → Masonry → TabX); no prior §6 wave exists anywhere in the
suite to defer to, so every verdict below is argued from mv-kit.md's text and
from cross-plugin precedent that predates §6 (Masonry's `.masonry-card`
lift-on-hover vs Sonar's `.sonar-result` colour-only row-hover, and Cosmos's
own `cosmos-islands.css` sidebar elevation).

Per-rule verdict: **pass** (already compliant, nothing to do) / **fixed**
(this wave) / **waived** (kit rule doesn't literally apply to this surface,
with reason) / **deferred** (real violation, lives in the untouchable
`nav-block.ts` — none found this wave).

### Elevation hierarchy

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.portal-rail` (the persistent sidebar/rail — Island tier candidate) | No Portal-owned `box-shadow` anywhere in `styles.css` | same | **pass, waived** — Cosmos's own `cosmos-islands.css` already applies `--cosmos-island-shadow` to `.mod-left-split .workspace-tab-container` (the sidedock chrome Portal's rail renders inside), gated to the flavours that use the island treatment. Portal correctly does **not** redeclare an Island shadow itself — doing so would create the exact stacked-tier violation §6's MUST NOT forbids (two shadow declarations on the same visual surface). Verified by reading `cosmos-islands.css` directly, not assumed. |
| Context menus / modals (Pop tier candidate) | Portal owns no popover/menu chrome of its own | same | **pass, not applicable** — confirmed by reading `src/nav/context-menu.ts` in full: `showFileMenu`/`showBulkMenu` use Obsidian's native `Menu`, `MoveModal`/`BulkMoveModal` use native `FuzzySuggestModal`. Nothing plugin-authored to consume `--cosmos-pop-shadow` for; this matches wave 2's §1 verdict on the same surfaces. |
| Stacked tiers | 0 `box-shadow` declarations in `styles.css` except `.portal-tree-row.is-kb`'s `inset 0 0 0 1px` keyboard-cursor ring | same | **pass** — an inset 1px ring is a focus indicator, not an elevation shadow (no blur/offset reading as depth); nothing to stack against. |

### Hover richness

| Rule | Desktop | Phone | Verdict |
|---|---|---|---|
| Colour **and** lift, never colour alone | All 12 `:hover` rules in `styles.css` are colour/opacity washes only (`background-color`, `color`, `opacity`) on dense list-row surfaces (`.portal-tree-row`, `.portal-jump-hit`, `.portal-section-header`, `.portal-pin-remove`, `.portal-collection-open`) — no `transform` lift on any of them | same | **pass, waived** — mv-kit's own code example under this rule shows `.row:hover` as colour-only and `.card:hover` as lift-only, as two *distinct* patterns, not one rule both must satisfy. Cross-plugin precedent confirms the row/card split is real and already lived: `obsidian-masonry`'s `.masonry-card:hover` (a grid card) gets `box-shadow` + colour; `obsidian-sonar`'s `.sonar-result:hover` (a dense list row, same shape as every Portal row) is colour-only, no lift. Portal's rows are card-shaped nowhere — adding a `translateY` lift to every tree row would read as jitter in a dense list, not the "hint" the kit describes for card surfaces. No lift-transform hover exists in Portal to check against the ≤2px cap, so that MUST is vacuously satisfied. |
| `--mv-wash` for colour transitions, `--mv-lift` for transform transitions (not interchangeable) | **was a violation**: the single `--portal-motion` alias (`--cosmos-t-fast` + `--mv-lift`) was reused for every transition in the file, including 10 `background-color`/`color`/`opacity` wash transitions that should ease with `--mv-wash` | same fix applies (`--portal-motion` is device-agnostic) | **fixed** — added a second alias `--portal-wash-motion: var(--cosmos-t-fast, 120ms) var(--mv-wash, cubic-bezier(0.25, 1, 0.5, 1))` next to `--portal-motion` in `.portal-rail`'s local-alias block, and repointed all 10 colour/opacity `transition` declarations (`.portal-section-header`, `.portal-section-title`, `.portal-section-action`, `.portal-tree-row`, `.portal-row-icon`, `.portal-twisty`, `.portal-pin-remove`, `.portal-collection-open`, `.portal-jump-hit`) to it. `--portal-motion` itself (`--mv-lift`) is now used for exactly one thing: `.portal-section-twisty`'s `transform: rotate()` on collapse/expand — the file's only genuine physical-transform transition. Guarded by a new style-contract test. |
| `transform` lift never exceeds 2px | n/a — no lift-transform hover exists (see row above) | same | **pass, not applicable** |
| Hover gated to `@media (hover: hover)` on phone-reachable elements | **was a violation**: 0 of the file's 12 `:hover` rules were wrapped in `@media (hover: hover)` — Portal's rail is explicitly phone-reachable (renders as a full-screen drawer on phone, per the file's own existing `@media (pointer: coarse)` / `body.is-phone` blocks) | same rule, now fixed | **fixed** — wrapped all 12 `:hover` rules in `@media (hover: hover)`. `:focus-visible` rules were left untouched and ungated (keyboard-only, must never be hover-gated — verified by re-reading each grouped selector before editing so no `:focus-visible` selector was accidentally pulled inside a hover-only block). One second-order fix required: `.portal-collection-open`'s only reveal mechanism was `.portal-collection:hover`, and it had no existing phone-fallback (unlike `.portal-section-action`/`.portal-pin-remove`, which already had one in the `@media (pointer: coarse)` block) — gating its hover without a fallback would have made the "open base" ⇗ control permanently unreachable on touch, a real functional regression and a violation of the program's mobile-parity principle ("azioni restano sempre raggiungibili"). Added `.portal-collection-open { opacity: 1 }` to the existing phone always-visible block, mirroring the established `.portal-pin-remove` pattern exactly — same shape of fix already in the file, not a new pattern. Guarded by a new style-contract test. |

### Drag polish

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| Drag positioning via `transform`, never `left`/`top`/`margin` | Portal uses native HTML5 drag-and-drop exclusively (`draggable="true"` + `dragstart`/`dragover`/`drop` listeners in `src/nav/dnd.ts`) — confirmed by reading the full file: no `setDragImage`, no `.is-dragging`/`.is-dropped` classes, no synthetic drag-ghost element anywhere in `src/` | same, native DnD has no phone equivalent gesture in Portal (no long-press-to-drag implemented) | **pass, not applicable** — the browser's native drag-ghost paints itself; Portal has no transform-driven dragged element for this rule to govern. The two `left`/`top` declarations that do exist in `styles.css` (`.portal-drop-before::before` / `.portal-drop-after::after`, the Finder-style insertion line) are a **static** indicator toggled on/off via class add/remove in `dnd.ts` on `dragover`/`dragleave` — not repositioned per pointer-move frame, no `transition` even declared on them. This is not the per-frame-reflow anti-pattern the rule targets (a `left`/`top`-animated *dragged* element); it's a one-shot positioned overlay, the standard CSS idiom for a static line indicator. |
| Drop settle via `--cosmos-native` | n/a — no drop-settle animation exists (native browser drag-end has no Portal-owned settle transition) | same | **pass, not applicable** |

### Panel & tab transitions

| Surface | Desktop | Phone | Verdict |
|---|---|---|---|
| `.portal-section.is-collapsed .portal-section-body { display: none }` (section expand/collapse) | Instant `display:none` toggle, no transition | same | **pass, waived** — matches native Obsidian folder-tree collapse behaviour exactly (also an instant `display:none`, unanimated). Verified Cosmos does not animate `.nav-folder-children` collapse anywhere in the theme's source (`grep -rl "nav-folder-children" *.css` → no hits) — the theme deliberately leaves this native interaction alone. §6's panel-motion example is workspace-level structural chrome (sidebar open-close, ribbon peek); a tree-item disclosure toggle inside an already-open panel is a different, smaller-scoped interaction the kit's panel rule doesn't reach, and changing it would be new-animation scope creep beyond a coherence fix. |
| `.portal-jump.is-open { display: block }` (search/jump box reveal) | Instant `display:none`↔`block`, no transition | same | **pass, waived** — a keyboard-hotkey-triggered search input expects instant focus/typing readiness (the same UX contract as Obsidian's native quick-switcher and Sonar's own search field); it is an additive transient overlay above the tree, not a persistent panel being opened/closed nor a tab-content swap replacing existing content, so neither of §6's two panel-transition sub-rules (`--cosmos-t-panel` for structural open/close, crossfade for tab-content-swap) literally targets it. Adding entrance motion here would be a speculative enhancement outside this wave's "fix concrete violations only" mandate. |
| `.portal-note-enter` (file-open content transition) | `var(--cosmos-t-panel, 260ms) var(--cosmos-native, …)`, `transform: translateY(8px)→none` + `opacity`, explicit `prefers-reduced-motion` guard | same, device-agnostic selector (JS gate decides when it fires) | **pass** — already compliant, verified pre-existing (wave 2 §3); correctly uses the *panel* duration token (not the faster hover token) for what is a genuinely structural full-content transition, exactly per §6's panel-motion rule. No changes this wave. |

### Not touched (explicit non-goals, confirmed out of scope)

- No layout/DOM changes anywhere — every fix in this wave is a CSS-only
  token-repoint (`--portal-motion` → `--portal-wash-motion` on 10
  declarations) or a `@media` wrapper addition (12 `:hover` rules + 1 phone
  always-visible fallback for `.portal-collection-open`).
- `src/nav/nav-block.ts` — untouched, byte-identical to its pre-wave state
  (verified via diff + checksum before and after this wave); not audited
  against §6 per hard constraint.
- Section-collapse and jump-box reveal animation (see Panel & tab
  transitions above) — waived, not fixed; adding entrance motion to either
  would be new animation scope, not a fix to an identified violation.
- Card-style lift-on-hover for tree rows — waived; Portal's rows are list
  rows, not cards, per the kit's own row/card example and cross-plugin
  precedent (Masonry vs Sonar).

### Verification

- `pnpm typecheck` — 0 errors (before and after fixes)
- `pnpm lint` — 0 issues (before and after fixes; 1 `prefer-const` issue was
  caught and fixed in the new style-contract test code during this wave,
  before the final green run)
- `pnpm test` — 37 tests passing, 0 failing (35 pre-existing + 2 new
  style-contract assertions added this wave: "every `:hover` selector is
  gated behind `@media (hover: hover)`" and "colour/opacity transitions
  never pair with the `--mv-lift` motion alias"). Both new assertions were
  sanity-checked against a deliberately reintroduced violation (temporarily
  reverting one fix) to confirm they actually fail before being confirmed
  green against the real file — not just written and trusted.
- `src/nav/nav-block.ts`: MD5 checksum and `git diff` identical before and
  after this wave's edits.
- Desktop/phone screenshot verification: **pending**, same constraint as
  wave 2 — `EmulateMobile` never enabled (kills Node-based plugins); phone
  behaviour (hover-gate correctness, the `.portal-collection-open` touch
  fallback) verified by reading the resulting CSS against the kit's phone
  column and against Portal's own existing `@media (pointer: coarse)` /
  `body.is-phone` precedent in the same file. Phone sign-off remains
  Mario's, on-device.
