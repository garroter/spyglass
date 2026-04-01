# Changelog

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
