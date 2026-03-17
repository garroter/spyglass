# Changelog

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
