# Changelog

## [Unreleased]

### Changed
- Search cancellation: previous ripgrep process is now killed when a new search starts, reducing CPU usage on large projects

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
