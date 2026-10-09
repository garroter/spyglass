# Changelog

## [Unreleased]

### Added
- **Go to line & symbol, like Quick Open** — in the Files and Recent lists `util.ts:42` (or `util.ts:42:7`) previews and opens the file at that line (and column), `:42` goes to a line in the file you are editing, and a leading `@` switches to the symbols of that file (Doc), going back when you delete the `@`. `file:line` works in the Git list too. Text searches are unchanged

### Changed
- **A cleaner, less crowded popup and sidebar**
  - The `⋯` button opens a **menu** that lists each option by name with its shortcut and a check mark when it is on (group by file, sort, multiline, include ignored files, include filter, saved searches, keyboard shortcuts), instead of a row of symbols (`▤ ⇅ ⊂ ◌ ↵ ★ ?`) whose meaning only a tooltip told. The menu stays open while you switch options and closes on `Escape` or a click outside
  - **Options that do nothing in a scope are hidden** instead of greyed out: the Files, Recent, Git, Doc, Symbols and Refs lists show just the search box, like Quick Open
  - **A narrow sidebar gives the search box the room** — below 420 px the regex, case, whole word and replace toggles move into the `⋯` menu (a dot on `⋯` shows when one is on); at 300 px the box went from about 65 px to most of the width
  - **Tabs that do not fit are shown as such** — they no longer wrap onto two lines (`Open Files`), a `›` / `‹` at the edge says there are more, the tab you switch to is scrolled into view, and the mouse wheel scrolls them
  - Result rows show the code without its indentation, so they line up
  - Doc rows show just the line (`:12`) instead of repeating the current file on every row
  - Toolbar tooltips open towards the inside, so the ones at the right edge are no longer cut off
  - The status bar says "Recent files" instead of "recent"

### Fixed
- When opened straight into the Doc scope (a `Find Symbols in Document` command), the search box said "Search files by name"
- **Doc / Symbols: Enter opened the wrong symbol after filtering** — with a query (Doc) or a kind chip active, `Enter`, `Ctrl+Enter`, the preview, copying the path and multi-select used the position in the unfiltered list, so they could act on a different symbol than the one highlighted

## [0.3.1] - 2026-10-09

### Changed
- **The popup opens about 2–4× faster** — every time it opened, the popup loaded and parsed the syntax-highlighting grammars of all 28 supported languages (2.7 MB of script) before showing anything. Grammars are now loaded on demand, only for the languages you actually preview, so the startup script is 0.4 MB. Measured in Chromium: first results after 300 ms instead of 726 ms, and after 558 ms instead of 2.2 s on a CPU slowed down 4×. All languages are still highlighted; the first preview in a new language waits a moment for its grammar

### Fixed
- **"What's new" could not open the changelog on Linux** — clicking *Show changes* in the update notification (or running `Spyglass: What's New`) said `CHANGELOG.md cannot be found`, because the packaged extension names the file `changelog.md` and Linux file names are case-sensitive. Both names are now looked up
- A preview whose grammar is still loading can no longer replace the preview of a file you moved to in the meantime

## [0.3.0] - 2026-10-09

### Added
- **Multiline search** — a `↵` toggle (secondary toolbar, or `Alt+M`) that lets a regular expression match across lines (`rg --multiline`): `import .*;\nimport`, `(?s)<div>.*?</div>`. The query is always a regex in this mode. A multi-line result is shown as its first line with a `+N` badge and opens at that line. Replace all is disabled while it is on (per-line replacing cannot do multiline safely), and turning it on switches replace mode off. Puts a dot on the collapsed `⋯` button while on; remembered with the other toggles
- **Recent ranked by frecency** — the Recent scope now orders files by how often *and* how recently you open them (a score that halves every 7 days; quick flips between two files count once) instead of pure recency, so the files you keep coming back to rise to the top. Pinned files stay first, and a workspace with no history yet keeps the old order
- **Localized commands and settings** — command titles in the Command Palette and setting descriptions in the Settings UI now follow VS Code's display language (English, and Simplified Chinese with a Chinese language pack), through `package.nls.json` / `package.nls.zh-cn.json`
- **Context menus** — right-click a folder in the Explorer → *Spyglass: Find in Folder* (the Dir scope on that folder), and right-click selected text in an editor → *Spyglass: Find in Project* (the selection becomes the query)
- **"What's new" notification** — after an update to a new minor or major version Spyglass shows one notification linking to the changelog (not on a fresh install, and not for patch releases). Turn it off with `spyglass.showWhatsNew`; the new `Spyglass: What's New` command opens the changelog any time
- **A "Find …" command for every scope** — `Find in Project`, `Find Files`, `Find in Open Files`, `Find Recent Files`, `Find in Current Directory`, `Find Symbols in Workspace`, `Find Git Changes`, `Find Symbols in Document` and `Find References` (ids `spyglass.findInProject`, `spyglass.findFiles`, …). Each opens Spyglass straight in that scope, or switches an already open popup to it, so it can have its own shortcut (e.g. `Ctrl+P` → `spyglass.findFiles`). None has a default keybinding
- **Include ignored and hidden files** — a `◌` toggle (secondary toolbar, or `Alt+H`) that also searches files hidden by `.gitignore`/`.ignore`, hidden files such as `.env` and the folders in `spyglass.exclude` (`node_modules`, `dist`, …). The `.git` folder is always skipped. It covers Project, Open Files, Dir, Files and Replace (the replace preview matches what the search shows), is remembered with the other toolbar toggles, and puts a dot on the collapsed `⋯` button while it is on
- `spyglass.open` accepts a scope in a keybinding: `{ "key": "ctrl+p", "command": "spyglass.open", "args": { "scope": "files" } }`
- **`spyglass.maxMatchesPerFile`** — how many matches are shown per file in text search (default `10`, unchanged). Previously hard-coded, so files with many occurrences were silently cut off
- **`spyglass.maxFileSize`** — files larger than this are skipped by text search (default `"1M"`, unchanged), e.g. `"500K"`, `"10M"`. Previously hard-coded, so matches in big files never showed up with no way to opt in

### Fixed
- **`spyglass.maxResults` above 200 had no effect** — results were cut to 200 inside the ripgrep backend regardless of the setting, and the "Showing first N results" hint never appeared because the list never reached the configured limit. The setting now works from 1 to 5000 (out-of-range values are clamped)
- The Files / Recent / Git file lists ignored `spyglass.maxResults` and always stopped at 200 entries; they now honor it
- Opening Spyglass with a selection that contains `</script>` no longer breaks the page — the initial query is now escaped when it is embedded in the page
- The popup now checks that ripgrep is available before every text search, like the sidebar already did, instead of only when it opens
- **Wrong highlight in lines with non-ASCII text** — ripgrep reports match positions in UTF-8 bytes, but they were used as character positions, so a match after `ż`, `ó`, `ł`, CJK text or an emoji was highlighted shifted (searching `gęślą` in `zażółć gęślą jaźń` highlighted `ą jaźń`). Positions are now converted to characters
- **Recent in the sidebar was frozen** — the list was read once when the view was built, so files opened later did not appear until VS Code was reloaded; it is now refreshed every time you enter the Recent scope
- Two setting descriptions (`spyglass.defaultScope`, `spyglass.keybindings.close`) still said "Finder", the old name of the extension
- **Search history direction** — `Ctrl+↑` now recalls the previous (older) query and `Ctrl+↓` moves back towards the newest, as documented; before, the two were swapped. Starting with `Ctrl+↓` no longer replaces what you had typed with a stale earlier draft
- **Search history in the same session** — queries you type are now available to `Ctrl+↑` right away. Before, the page only saw the history from when it was opened, so in the sidebar (which stays open) recent queries could not be recalled until VS Code was reloaded
- **Recalling a query from the history now runs it** — `Ctrl+↑` / `Ctrl+↓` used to change the text in the box but leave the results as they were until you edited it. A recalled query is not recorded again, so your place in the history stays put while you browse, and the first `Ctrl+↑` skips the entry that is already what you see in the box
- **`Ctrl+Space` multi-select while typing** — the shortcut now works with the cursor in the query box, where it had no effect (it only worked when focus was elsewhere)

### Changed
- **Faster file filtering in big projects** — typing in the Files, Recent and Git lists re-scored every path on every keystroke, which made typing lag in projects with 100,000+ files (about 100 ms a key at 127,000 files and 250–370 ms at 383,000). Filtering no longer allocates per path, picks the top results instead of sorting every match, and reuses the previous keystroke's matches (typing or deleting a letter rescans only the files that can still match). On the same machine that is 24–55 ms a key at 127,000 files and 35–150 ms at 383,000; the first letter, especially a very common one, is still the slowest. Results and their order are identical to before (checked against the old algorithm on random data)
- Internal: the popup/sidebar UI (`src/webview/`) is now type-checked — esbuild bundles it without checking types, so nothing did, and it had 34 type errors (30 of them shiki imports TypeScript could not resolve, 4 a missing `line` on the recent-files list). All fixed (the latter with a small `textResultTarget` helper that replaces four copies of the same code), and `npm run typecheck` covers the extension, the UI tests and the webview, in CI too
- Internal: the generated UI bundle `media/webview.js` is no longer committed (it is in `.gitignore`); `npm install`, F5, `npm run test:ui` and packaging build it, so changes to `src/webview/` no longer produce thousand-line diffs or merge conflicts in it
- Internal: the popup and the sidebar were near-identical copies (~1600 lines); they now share one `SpyglassController` and one HTML template, so every future feature is written once. No change to the UI or to keyboard shortcuts
- Internal: added Playwright UI tests (`npm run test:ui`) that drive the real webview against the real search backend — keyboard navigation, scopes, toggles, sidebar layout breakpoints, replace preview/apply

## [0.2.10] - 2026-09-08

### Fixed
- Marketplace/package description referenced "JetBrains Finder" (not a real product) — corrected to "JetBrains Search Everywhere", matching the README

### Docs
- Refreshed the popup demo screenshots in README (old GIF predated syntax highlighting and adaptive layout)

## [0.2.9] - 2026-09-08

### Fixed
- Preview syntax highlighting no longer falls back to dark-theme colors on a light background — `resolveThemeId()` now honors `window.autoDetectColorScheme` / `autoDetectHighContrast`, picking up `workbench.preferredLightColorTheme` / `preferredDarkColorTheme` (and high-contrast variants) based on the active theme kind instead of always reading `workbench.colorTheme`
- Shiki's fallback base tokens now match the active appearance (`github-light` vs `github-dark`) instead of always using `github-dark`

## [0.2.8] - 2026-08-25

### Added
- **`spyglass.closeOnSelect`** — when disabled, the popup stays open after opening a result so you can open multiple files from one search
- **`spyglass.openExternalWindow`** — opens the popup detached in a side editor group and keeps it open after selection; drag the panel's tab to a second monitor for a standalone window

### Fixed
- In persistent mode (`closeOnSelect` disabled or `openExternalWindow` enabled) opening a result no longer closes the popup — the file now opens in a separate editor group instead of replacing the webview

## [0.2.7] - 2026-07-23

### Added
- **Localized UI** — interface strings switch to Chinese when VS Code's display language is Chinese, English otherwise
- **Persisted toolbar preferences** — regex / case-sensitive / whole-word / replace mode / preview / sort / include-filter toggles are now remembered across sessions
- Documented the `shift shift` keybinding in the README

### Changed
- Popup and sidebar layout now fill the available window/panel space instead of a fixed-size centered card; scope tabs use a solid accent background for better contrast

### Fixed
- Keyboard shortcuts overlay no longer loses its sidebar-anchored positioning when opened from the help button

## [0.2.6] - 2026-07-16

### Fixed
- Extension now also looks for ripgrep under `@vscode/ripgrep-universal`'s per-platform-arch layout (`bin/{platform}-{arch}/rg`), which newer VS Code builds ship instead of the old single-binary `@vscode/ripgrep` package — closes the root cause behind the "ripgrep not found" reports that the v0.2.5 auto-download fallback was working around

## [0.2.5] - 2026-07-14

### Fixed
- ripgrep bundled in the VSIX only runs on the platform/arch it was built on — extension now auto-downloads a matching `rg` binary from GitHub Releases into extension storage as a last resort when no working binary is found (VS Code's own bundled copy, our own bundled copy, or a previously downloaded one), so most users never see the "ripgrep not found" error at all

## [0.2.4] - 2026-07-10

### Added
- **shift shift keybinding** — double-tap Shift now opens Spyglass, JetBrains "Search Everywhere"-style, alongside the existing ctrl+alt+f / cmd+alt+f shortcut

## [0.2.3] - 2026-07-08

### Added
- **Syntax highlighting in preview** — preview panel now uses [Shiki](https://shiki.style) for accurate syntax highlighting across 28 languages (TypeScript, Python, Rust, Go, Java, C/C++, CSS, HTML, JSON, YAML, Markdown, Bash, SQL, PHP, Ruby, Swift, Kotlin, Lua, Vue, Svelte, Dockerfile and more)
- **VSCode theme integration** — highlighting uses your active VS Code theme colors loaded directly from disk; falls back to GitHub Dark/Light when no theme is found

### Fixed
- Syntax highlighting in sidebar panel was blocked by CSP — added `unsafe-inline` to `style-src` to allow Shiki's inline color styles
- Preview highlighting now correctly falls back to github-dark/light when the active VSCode theme has sparse TextMate token rules (common in themes that rely on semantic tokens)

## [0.2.2] - 2026-06-11

### Fixed
- ripgrep not starting on VS Code 1.124.0+ — extension now also checks `node_modules.asar.unpacked` path used in newer VS Code builds
- `spyglass.ripgrepPath` setting was defined but never read — it now takes priority over auto-detection, allowing users to point to a system `rg` binary
- Error message when ripgrep is unavailable now shows an actionable notification with an "Open Settings" button instead of "Try reinstalling"
- Sidebar "Search failed" message when ripgrep is not found replaced with the same actionable error shown in the popup

## [0.2.1] - 2026-04-01

### Added
- **Activity Bar sidebar panel** — Spyglass now lives as a persistent panel in the Activity Bar (alongside Files, Extensions, etc.), in addition to the existing floating popup
- **`Ctrl+Alt+E` shortcut** — focuses / toggles the sidebar panel; `Ctrl+Alt+F` continues to open the popup
- **`spyglass.focusSidebar` command** — available in Command Palette as "Spyglass: Focus Sidebar Panel"
- **Responsive sidebar layout** — the sidebar automatically adapts to its width:
  - `< 420 px` — results only, preview hidden
  - `420–599 px` — preview panel stacked **below** results
  - `≥ 600 px` — preview panel **beside** results (classic split)
- **Pill-style scope tabs in sidebar** — active tab highlighted with accent color background, much more readable than the underline style used in the popup
- **Compact secondary toolbar** — less-used options (group, sort, include, bookmarks, help) are collapsed behind a `⋯` button; clicking reveals them inline to the left of the button, keeping the topbar clean on narrow screens

### Fixed
- Crash on panel open: `Cannot read properties of null (reading 'classList')` — sidebar HTML was missing `more-btn` / `secondary-toolbar` elements that the shared webview bundle expected
- Activity Bar icon displayed as a white square — the SVG had a background `<rect>` that VS Code's mask rendering filled solid; removed the background so only the spyglass shape is used
- Search icon in topbar changed from `⌕` (dentistry symbol) to an inline SVG magnifying glass that matches the UI style

## [0.2.0] - 2026-03-31

### Added
- **Find References scope** — new "Refs" tab shows all references to the symbol under the cursor at panel open; results rendered as text search results with file/line/context; shows "X refs to: symbolName" in status bar
- **Document Symbols scope** — new "Doc" tab lists all symbols in the active file (functions, classes, variables…) using the LSP; filter by typing (local, instant); symbol kind filter chips (fn / cls / var / enum…)
- **Replace preview** — clicking "Replace all" now shows a diff overlay with before/after lines for every affected file before applying; "Apply" and "Cancel" buttons
- **Saved searches (bookmarks)** — `Alt+B` saves the current query + scope; `★` button (or `Alt+B` with empty query) opens bookmarks inline in the results panel; arrow keys + Enter to apply; `✕` to remove
- **Sort results** — `Alt+S` or `⇅` button cycles sort order: default → by filename → by match count
- **Include filter** — `Alt+I` or `⊂` button reveals an include-patterns row (`*.ts, src/**`); merged with glob filter when searching
- **Symbol kind filter** — chips row in Symbols/Doc scope to filter results by kind (fn, cls, var, enum…)
- **`spyglass.openOnSide`** — new setting to open the panel in a side column instead of the active editor column
- **Toast notifications** now centered at the top instead of top-right

### Fixed
- Esc now exits replace/include mode first before closing the panel
- ripgrep process error now surfaces a proper error message instead of silently returning empty results
- Results capped at limit now show an explanatory message ("Narrow your query to see more")
- Doc scope symbols fetched once per scope entry and filtered locally on subsequent keystrokes — no LSP round-trip per keystroke
- Tabs row scrollable horizontally when too many tabs to fit (9 scopes)

## [0.1.9] - 2026-03-20

### Added
- **Pinned files** — pin any file with `Alt+P` (or right-click → Pin file); pinned files appear at the top of the Recent tab marked with `★` and persist across sessions; `Alt+P` again unpins
- **Group by file toggle** — press `Alt+L` or click `▤` to switch between flat list (default) and results grouped by file with sticky headers; button disabled in Files/Recent/Git/Symbols scopes
- **Git scope refresh** — press `F5` in the Git tab to reload the list of changed files without reopening the panel
- **Copy paths from multi-select** — `Alt+Y` with multiple files selected copies all their paths joined by newlines, instead of only the current file
- Text search results are now grouped by file — a sticky header shows the filename, directory, and match count badge for each group; line numbers are displayed in a fixed column beside each match
- **Git scope** — new tab showing all files with uncommitted changes (modified, added, untracked, deleted, renamed); filter by typing, open and preview like any other scope; status shown as a colored pill badge beside each filename

- Unit tests for git scope: `relToAbsolute` path reconstruction (single-root and multi-root), additional `parseGitStatus` edge cases (clean tree, staged+worktree, nested paths, multi-folder workspaces)

### Fixed
- Replace all now saves files to disk immediately — previously files were left with unsaved changes after replacing

## [0.1.8] - 2026-03-17

### Changed
- Context menu on right-click — Open, Open in split, Copy absolute/relative path, Reveal in Explorer
- Breadcrumbs in preview header (dir / dir / file) instead of plain path
- Webview JavaScript refactored into TypeScript modules (`src/webview/`) bundled with esbuild

## [0.1.7] - 2026-03-17

### Changed
- Webview CSS and JavaScript extracted to separate `media/` files — faster panel load and cleaner codebase
- Internal code split into focused modules (`gitUtils`, `symbolSearch`, `workspaceUtils`) — no behavior changes
- Unit test suite added (38 tests covering search logic, git parsing, path utilities)
- README updated: multi-root workspace section, inline glob filter examples, development guide

## [0.1.6] - 2026-03-17

### Added
- Multi-root workspace support — search, file listing, replace, and git badges now work across all workspace folders simultaneously. Results from multiple folders are prefixed with the folder name (e.g. `backend/src/main.ts`).

### Fixed
- Arrow key navigation now works on the default recent files list (no query typed yet)
- `Ctrl+A` now selects all results in Files and Symbols scopes, not only in text search
- `Ctrl+↑` history navigation now resets correctly when switching scope

## [0.1.5] - 2026-03-17

### Added
- `spyglass.exclude` setting — configure which glob patterns are excluded from search and file listing (default: `.git`, `node_modules`, `out`, `dist`, `*.lock`). Add `vendor`, `build`, `*.min.js`, etc. to suit your project.

## [0.1.4] - 2026-03-17

### Added
- Git status badges in results (`M` modified, `A` added, `U` untracked, `D` deleted) — colors match the file explorer
- Recent files shown by default when opening with no query — no more empty screen on open
- Search time displayed in statusbar after each search (e.g. `234ms`)
- Last used scope is now remembered between sessions — reopening Spyglass restores the scope you were using

## [0.1.3] - 2026-03-17

### Changed
- Search cancellation: previous ripgrep process is now killed when a new search starts, reducing CPU usage on large projects
- Streaming results: first matches appear immediately as ripgrep finds them, instead of waiting for the full search to complete
- Git diff results are now cached per panel session — navigating through results no longer spawns a git process for every file
- Proper light theme and high-contrast theme support — syntax highlight fallback colors are now correct for all theme types, not just dark themes
- Panel opening animation (fade + slide) for a smoother first impression
- Symbol kinds are now color-coded (function/method in blue, class/interface in accent, variable/field in orange, enum in green, etc.)
- Buttons (regex, case, word, replace, preview) now show fast custom tooltips with keyboard shortcut hints on hover
- Result counter now updates live during streaming (e.g. `12… results`), shows `200+ results` when the cap is reached, and shows a spinner inline while searching

### Fixed
- Search history: original query is now restored when navigating back out of history (Ctrl+Down to index -1)
- Search history: typing in the input now resets history navigation index, so next Ctrl+Up always starts from the most recent entry

## [0.1.2] - 2026-03-17

### Added
- Privacy disclosure in README

## [0.1.1] - 2026-02-27

### Fixed
- ripgrep path resolution on Windows

### Added
- Case-sensitive toggle (Alt+C), whole-word toggle (Alt+W)
- Glob filter row (`*.ts`, `!*.test.ts`)
- Replace mode (Alt+R) with Replace All via WorkspaceEdit
- Search history (Ctrl+↑/↓, persisted, max 50 entries)
- Copy path (Alt+Y), Reveal in Explorer (click preview header)
- Multi-select (Ctrl+Click, Ctrl+Space, Shift+Enter, Ctrl+A)
- Symbol search via LSP (executeWorkspaceSymbolProvider)
- Dir scope — search in active file's directory
- Git diff highlights in preview

## [0.1.0] - 2026-02-25

### Added
- Full-text search across project and open files using bundled ripgrep
- Fuzzy file search by filename (Files scope) with character-level match highlighting
- Live file preview panel with syntax highlighting (JS/TS, Python, Rust, Go and more)
- Four search scopes: Project, Open Files, Files, Recent — cycle with Tab
- Recent files scope — instantly jump to recently opened files
- Pre-fill query from editor selection — select text, open Spyglass, search starts immediately
- Regex mode toggle
- Fully configurable keybindings via VS Code settings
- Theme-adaptive UI — works with dark, light, and high-contrast themes
- Bundled ripgrep — no system dependency required
- Prefetch file list in background for instant Files tab response
