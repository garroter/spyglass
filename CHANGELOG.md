# Changelog

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
