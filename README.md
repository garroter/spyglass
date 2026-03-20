<h1 align="center">
  <img src="https://raw.githubusercontent.com/garroter/spyglass/main/images/icon.png" width="64" alt="Spyglass icon" /><br/>
  Spyglass
</h1>

<p align="center">
  <strong>Fast, keyboard-driven search popup for VS Code</strong><br/>
  Inspired by <a href="https://github.com/nvim-telescope/telescope.nvim">Neovim Telescope</a> and JetBrains Search Everywhere<br/>
  <em>Results stream in as you type — no waiting for large projects</em>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=garroter.spyglass">
    <img src="https://img.shields.io/visual-studio-marketplace/v/garroter.spyglass?style=flat-square&label=VS%20Marketplace&color=7c3aed" alt="VS Marketplace"/>
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=garroter.spyglass">
    <img src="https://img.shields.io/visual-studio-marketplace/d/garroter.spyglass?style=flat-square&color=4f86f7" alt="Downloads"/>
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=garroter.spyglass">
    <img src="https://img.shields.io/visual-studio-marketplace/r/garroter.spyglass?style=flat-square&color=f5a623" alt="Rating"/>
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-22c55e?style=flat-square" alt="License: MIT"/>
  </a>
</p>

<p align="center">
  Open with <kbd>Ctrl+Alt+F</kbd> — Type — Navigate — Done.
</p>

---

## Why Spyglass?

VS Code's built-in search (`Ctrl+Shift+F`) is powerful but slow to use — it opens a sidebar panel, requires mouse clicks to navigate, and doesn't show a live preview. Spyglass is designed to keep your hands on the keyboard:

- **One shortcut** to open, type, navigate, open — no mouse needed
- **Live preview** updates as you move through results
- **Unified interface** for text search, file search, and symbols — no switching panels
- **Instant results** streaming from ripgrep, even in large projects

---

## 📸 Demo

**Full-text search with live preview**

![Full-text search with live preview](https://raw.githubusercontent.com/garroter/spyglass/main/images/demo_search.gif)

**File search and recent files**

![File search and recent files](https://raw.githubusercontent.com/garroter/spyglass/main/images/files.gif)

**Split editor**

![Split editor](https://raw.githubusercontent.com/garroter/spyglass/main/images/split.gif)

---

## ✨ Features

### 🔍 Search
- **Full-text search** across the whole project powered by ripgrep (blazing fast)
- **Streaming results** — matches appear instantly as ripgrep finds them, no waiting
- **Results grouped by file** — sticky file header with match count; line numbers in a fixed column for easy scanning
- **Fuzzy file search** — search by filename with character-level match highlighting
- **Symbol search** — workspace symbols via LSP with color-coded kind badges (class, function, method…)
- **Regex mode** toggle for power users
- **Case sensitive** and **whole word** toggles
- **Inline glob filter** — append a glob to any query to narrow results: `myFunc *.ts` or `test !*.test.ts`
- **Multi-root workspace** — searches and file listings span all workspace folders simultaneously

### 🗂️ Navigation
- **7 search scopes** — Project, Open Files, Files, Recent, Dir, Symbols, Git
- **Recent files on open** — opens to recent files immediately, no empty screen
- **Scope memory** — last used scope is restored when you reopen
- **Dir scope** — search only within the directory of the active file
- **Search history** — navigate previous queries with `Ctrl+↑` / `Ctrl+↓`
- **Multi-select** — pick multiple results and open them all at once

### 👁️ Preview
- **Live preview** — file content as you navigate, with syntax highlighting
- **Git change indicators** — modified lines highlighted in the gutter
- **Theme adaptive** — native look in any VS Code theme: dark, light, high contrast

### ⚡ Actions
- **Find & Replace** — replace across all matched files instantly, saved to disk automatically (with undo)
- **Copy path** — copy the absolute path of the selected result
- **Reveal in Explorer** — click the preview header to locate the file
- **Open in split** — open any result beside the current editor
- **Pre-fill from selection** — select text, open Spyglass → query is pre-filled
- **Zero dependencies** — ripgrep is bundled, nothing to install

---

## 🚀 Usage

### Opening Spyglass

| Action | Shortcut |
|--------|----------|
| Open Spyglass | `Ctrl+Alt+F` |

> **VSCode Vim users** — bind `<Space>f` as your leader shortcut. See [Vim setup](#-vim-setup) below.

### ⌨️ Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Navigate results | `↑` / `↓` |
| Open selected file | `Enter` |
| Open in split editor | `Ctrl+Enter` |
| Switch scope | `Tab` |
| Close | `Escape` |
| Toggle regex | `Shift+Alt+R` |
| Toggle case sensitive | `Alt+C` |
| Toggle whole word | `Alt+W` |
| Toggle preview panel | `Shift+Alt+P` |
| Toggle replace mode | `Alt+R` |
| History — previous query | `Ctrl+↑` |
| History — next query | `Ctrl+↓` |
| Copy path | `Alt+Y` |
| Multi-select toggle | `Ctrl+Space` / `Ctrl+Click` |
| Select all results | `Ctrl+A` |
| Open all selected | `Shift+Enter` |
| Reveal in Explorer | click the preview header |

---

## 🗺️ Search Scopes

| Scope | Description |
|-------|-------------|
| **Project** | Full-text search across all files in the workspace |
| **Open Files** | Full-text search only within currently open editor tabs |
| **Files** | Fuzzy search by filename across the whole project |
| **Recent** | Recently opened files, ordered by most recent |
| **Dir** | Full-text search within the directory of the active file |
| **Symbols** | Workspace symbol search via LSP (requires a language extension) |
| **Git** | All files with uncommitted changes — modified, added, untracked, deleted, renamed |

Switch between scopes with `Tab` while Spyglass is open.

---

## 🔄 Find & Replace

1. Open Spyglass and type your search query
2. Press `Alt+R` (or click `⇄`) to enable replace mode
3. Type the replacement text in the second field
4. Optionally tune case-sensitive / whole-word / glob filter
5. Click **Replace all** — all matches replaced instantly via VS Code's edit API (supports undo)

---

## 👁️ Preview Panel

The right-side preview shows the file around the matched line with syntax highlighting.
Lines modified since the last git commit are marked with a **blue indicator** in the gutter.

- Toggle with `Shift+Alt+P` or the `⊡` button
- Click the preview header to **Reveal in Explorer**

---

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `spyglass.defaultScope` | `project` | Scope on open: `project` `openFiles` `files` `recent` `here` `symbols` |
| `spyglass.maxResults` | `200` | Maximum number of results to display |
| `spyglass.exclude` | `[".git","node_modules","out","dist","*.lock"]` | Glob patterns excluded from search and file listing |
| `spyglass.keybindings.navigateDown` | `ArrowDown` | Navigate down in results |
| `spyglass.keybindings.navigateUp` | `ArrowUp` | Navigate up in results |
| `spyglass.keybindings.open` | `Enter` | Open selected result |
| `spyglass.keybindings.close` | `Escape` | Close Spyglass |
| `spyglass.keybindings.toggleRegex` | `shift+alt+r` | Toggle regex mode |
| `spyglass.keybindings.togglePreview` | `shift+alt+p` | Toggle preview panel |

---

## 🎹 Customizing Keybindings

### Change the open shortcut

Open **Keyboard Shortcuts** (`Ctrl+K Ctrl+S`), search for `Spyglass: Open Search` and assign your preferred key.

Or edit `keybindings.json` directly (`Ctrl+Shift+P` → *Open Keyboard Shortcuts (JSON)*):

```json
[
  {
    "key": "ctrl+alt+f",
    "command": "spyglass.open",
    "when": "!inputFocus || editorTextFocus"
  }
]
```

### Change shortcuts inside the panel

Add to your `settings.json`:

```json
{
  "spyglass.keybindings.navigateDown": "j",
  "spyglass.keybindings.navigateUp": "k",
  "spyglass.keybindings.toggleRegex": "ctrl+r",
  "spyglass.keybindings.togglePreview": "ctrl+p"
}
```

---

## 🟢 Vim Setup

### vscodevim (VSCode Vim extension)

VSCode Vim intercepts `Space` before VS Code sees it, so the built-in `Space f` shortcut won't work. Configure it through VSCode Vim instead — add to your `settings.json`:

```json
{
  "vim.normalModeKeyBindingsNonRecursive": [
    {
      "before": ["<Space>", "f"],
      "commands": ["spyglass.open"]
    }
  ]
}
```

### vscode-neovim

The built-in `Space f` binding works out of the box in normal mode — no extra configuration needed.

---

To disable the default `Ctrl+Alt+F` binding for either setup:

```json
[
  {
    "key": "ctrl+alt+f",
    "command": "-spyglass.open"
  }
]
```

---

## 🌐 Multi-root Workspaces

Spyglass works across all workspace folders simultaneously. Results from multiple folders are prefixed with the folder name so you always know where a match comes from:

```
backend/src/server.ts
frontend/src/App.tsx
```

All scopes — text search, file listing, replace, and git status badges — cover every folder in the workspace.

---

## 🔍 Inline Glob Filter

Append a glob pattern to any query to narrow the search without leaving the input field:

| Query | Effect |
|-------|--------|
| `useState *.tsx` | Search for `useState` only in `.tsx` files |
| `TODO !*.test.ts` | Search for `TODO`, excluding test files |
| `error *.ts !*.d.ts` | Multiple globs combined |

Patterns starting with `*` are treated as include globs, patterns starting with `!` as excludes. Everything else is the search query.

---

## 📋 Requirements

- VS Code `^1.85.0`
- No additional dependencies — ripgrep is bundled automatically
- Git *(optional)* — required for change indicators in the preview panel
- A language server extension *(optional)* — required for the **Symbols** scope

---

## Privacy

Spyglass collects **no data**. All processing happens locally on your machine:

- No network requests are made (webview CSP is `default-src 'none'`)
- No telemetry, analytics, or crash reporting
- Search history is stored locally in VS Code's `workspaceState` and never leaves your machine
- Dependencies (`@vscode/ripgrep`, `highlight.js`) are fully local with no network activity

---

## 🛠️ Development

```bash
git clone https://github.com/garroter/spyglass
cd spyglass
npm install

npm run compile   # compile TypeScript
npm run watch     # watch mode
npm test          # run unit tests (vitest)
```

Press `F5` in VS Code to launch an Extension Development Host.

### Project structure

```
src/
  extension.ts       — activation, command registration
  FinderPanel.ts     — webview panel lifecycle, message handler
  ripgrep.ts         — ripgrep search backend
  gitUtils.ts        — git status and diff parsing
  symbolSearch.ts    — LSP workspace symbol search
  workspaceUtils.ts  — path helpers (cwdForFile, makeRelative)
  webviewUtils.ts    — pure functions shared with tests (fuzzyScore, parseQueryInput)
  webview/           — webview UI (TypeScript, bundled with esbuild)
    main.ts          — entry point
    state.ts         — UI state management
    search.ts        — search logic
    render.ts        — results rendering
    preview.ts       — preview panel
    events.ts        — keyboard/mouse event handlers
    contextMenu.ts   — right-click context menu
    highlight.ts     — syntax highlighting helpers
  test/              — unit tests (vitest)
```

---

## 🤝 Contributing

PRs and issues welcome at [github.com/garroter/spyglass](https://github.com/garroter/spyglass).

---

## 📄 License

MIT
