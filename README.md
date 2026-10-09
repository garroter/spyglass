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
  Popup: <kbd>Ctrl+Alt+F</kbd> &nbsp;·&nbsp; Sidebar: <kbd>Ctrl+Alt+E</kbd> — Type — Navigate — Done.
</p>

---

## ✨ What's new

- **A command for every scope** — `Find Files`, `Find in Project`, `Find Symbols in Document` … each opens Spyglass straight in that scope, so you can bind them to `Ctrl+P`, `Ctrl+T`, `Ctrl+Shift+O` → [Commands](#-commands)
- **Right-click to search** — *Find in Folder* on any folder in the Explorer, *Find in Project* on selected text in an editor
- **Search ignored & hidden files** — the `◌` toggle (`Alt+H`) also searches files hidden by `.gitignore`, dotfiles such as `.env`, and folders like `node_modules` / `dist` → [Ignored & hidden files](#-ignored--hidden-files)
- **Search limits you can change** — `spyglass.maxResults` now really goes up to 5000, plus new `spyglass.maxMatchesPerFile` and `spyglass.maxFileSize` → [Search limits](#-search-limits)
- **Smarter Recent** — ranked by how often and how recently you open files, and kept up to date in the sidebar
- **Multiline search** — `↵` / `Alt+M`: a regex can match across lines
- **Search history that works** — `Ctrl+↑` / `Ctrl+↓` go the right way, include the queries you typed this session, and run the query you recall
- **`Ctrl+Space` multi-select** now works while you are typing in the search box

Everything else is in the [changelog](https://github.com/garroter/spyglass/blob/main/CHANGELOG.md). After an update to a new minor version Spyglass shows one notification linking to it; turn that off with `spyglass.showWhatsNew`, or open it any time with **`Spyglass: What's New`** from the Command Palette.

---

## Why Spyglass?

VS Code's built-in search (`Ctrl+Shift+F`) is powerful but slow to use — it requires mouse clicks to navigate and doesn't show a live preview. Spyglass is designed to keep your hands on the keyboard:

- **One shortcut** to open, type, navigate, open — no mouse needed
- **Two modes** — floating popup (`Ctrl+Alt+F`) or persistent Activity Bar sidebar (`Ctrl+Alt+E`)
- **Live preview** updates as you move through results
- **Unified interface** for text search, file search, and symbols — no switching panels
- **Instant results** streaming from ripgrep, even in large projects

---

## 📸 Demo

**Popup — browsing results with live, syntax-highlighted preview** (`Ctrl+Alt+F` / `shift shift`)

![Popup with live preview](https://raw.githubusercontent.com/garroter/spyglass/main/images/screenshot-popup-preview.png)

**Popup — live full-text search with match highlighting**

![Popup live search results](https://raw.githubusercontent.com/garroter/spyglass/main/images/screenshot-popup-search.png)

**Sidebar panel — persistent search in the Activity Bar** (`Ctrl+Alt+E`)

![Sidebar panel](https://raw.githubusercontent.com/garroter/spyglass/main/images/demo-panel.gif)

---

## ✨ Features

### 🔍 Search
- **Full-text search** across the whole project powered by ripgrep (blazing fast)
- **Streaming results** — matches appear instantly as ripgrep finds them, no waiting
- **Results grouped by file** — sticky file header with match count; line numbers in a fixed column for easy scanning
- **Fuzzy file search** — search by filename with character-level match highlighting
- **Symbol search** — workspace symbols via LSP with color-coded kind badges (class, function, method…)
- **Symbol kind filter** — chips above symbol results to filter by kind (fn, cls, var, enum, …); click to filter, click again to reset
- **Find References scope** — all references to the symbol under the cursor via LSP (`Refs` tab)
- **Regex mode** toggle for power users
- **Case sensitive** and **whole word** toggles
- **Inline glob filter** — append a glob to any query to narrow results: `myFunc *.ts` or `test !*.test.ts`
- **Ignored & hidden files toggle** — `◌` / `Alt+H` also searches files hidden by `.gitignore`, dotfiles and the folders in `spyglass.exclude` (never `.git`); see [Ignored & hidden files](#-ignored--hidden-files)
- **Multiline search** — `↵` / `Alt+M` lets a regular expression match across lines (`foo\nbar`, `(?s)start.*?end`); a result shows its first line with a `+N` badge → [Multiline search](#-multiline-search)
- **Multi-root workspace** — searches and file listings span all workspace folders simultaneously
- **Tunable search limits** — raise `spyglass.maxResults`, `spyglass.maxMatchesPerFile` or `spyglass.maxFileSize` when the defaults hide matches you need (see [Search limits](#-search-limits))

### 🗂️ Navigation
- **9 search scopes** — Project, Open Files, Files, Recent, Dir, Symbols, Git, Doc, Refs
- **Pinned files** — pin any file with `Alt+P`; pinned files stay at the top of the Recent tab marked with `★` and persist across sessions
- **Recent files on open** — opens to recent files immediately, no empty screen; ranked by *frecency* (how often **and** how recently you open a file), so the files you keep coming back to rise above one you opened once a minute ago
- **Scope memory** — last used scope is restored when you reopen
- **Dir scope** — search only within the directory of the active file
- **One command per scope** — "Find Files", "Find in Project", "Find Symbols in Document" … open Spyglass straight in that scope, so each can have its own shortcut (see [Commands](#-commands))
- **Go to line & symbol** — `util.ts:42` opens a file at a line, `:42` jumps to a line in the current file, `@name` lists its symbols, just like Quick Open → [Go to line & symbol](#-go-to-line--symbol)
- **Search history** — navigate previous queries with `Ctrl+↑` / `Ctrl+↓`
- **Saved searches (bookmarks)** — `Alt+B` bookmarks the current query+scope; `★` button opens the bookmarks overlay; persisted across sessions
- **Multi-select** — pick multiple results and open them all at once

### 👁️ Preview
- **Live preview** — file content as you navigate, with syntax highlighting powered by [Shiki](https://shiki.style) (same engine as VS Code)
- **Theme-matched highlighting** — uses your active VS Code theme colors; falls back to GitHub Dark/Light
- **Git change indicators** — modified lines highlighted in the gutter
- **Theme adaptive** — native look in any VS Code theme: dark, light, high contrast

### 🖥️ Two ways to use Spyglass

| Mode | Shortcut | Description |
|------|----------|-------------|
| **Popup** | `Ctrl+Alt+F` / `Shift Shift` | Floating modal — opens over the editor, closes with `Esc` (keeps open after selection when `spyglass.closeOnSelect` is `false`) |
| **Sidebar** | `Ctrl+Alt+E` | Persistent panel in the Activity Bar — stays open as you work |

**Keep Spyglass always visible** — set `spyglass.openExternalWindow: true` so the popup opens detached in a side editor group and stays open after selecting a result, then drag the panel's tab out of the VS Code window onto a second monitor to get a standalone window.

The sidebar adapts to its width automatically:
- **Narrow** (< 420 px) — results only, no preview
- **Medium** (420–599 px) — preview panel stacked **below** results
- **Wide** (≥ 600 px) — preview panel **beside** results (classic split)

Both modes share the same features, keyboard shortcuts, and state.

### ⚡ Actions
- **Find & Replace with preview** — `Alt+R` to enable replace mode; "Replace all" shows a diff overlay (before/after per line per file) before applying; Apply or Cancel; uses VS Code WorkspaceEdit (supports undo)
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
| Open popup (floating modal) | `Ctrl+Alt+F` |
| Open popup (double-tap Shift, JetBrains-style) | `Shift Shift` |
| Focus sidebar panel | `Ctrl+Alt+E` |

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
| Group results by file | `Alt+L` |
| Sort results (cycle) | `Alt+S` |
| Include filter row | `Alt+I` |
| Include ignored & hidden files | `Alt+H` |
| Multiline search (regex) | `Alt+M` |
| Toggle preview panel | `Shift+Alt+P` |
| Toggle replace mode | `Alt+R` |
| Focus replace input (in replace mode) | `Tab` |
| History — previous query | `Ctrl+↑` |
| History — next query | `Ctrl+↓` |
| Save search (bookmark) | `Alt+B` |
| Copy path | `Alt+Y` |
| Pin / Unpin file | `Alt+P` |
| Multi-select toggle | `Ctrl+Space` / `Ctrl+Click` |
| Select all results | `Ctrl+A` |
| Open all selected | `Shift+Enter` |
| Reveal in Explorer | click the preview header |
| Refresh git changed files | `F5` (in Git scope) |

---

## 🗺️ Search Scopes

| Scope | Description |
|-------|-------------|
| **Project** | Full-text search across all files in the workspace |
| **Open Files** | Full-text search only within currently open editor tabs |
| **Files** | Fuzzy search by filename across the whole project |
| **Recent** | Recently opened files, ranked by frecency (frequency + recency); pinned files first |
| **Dir** | Full-text search within the directory of the active file |
| **Symbols** | Workspace symbol search via LSP (requires a language extension) |
| **Git** | All files with uncommitted changes — modified, added, untracked, deleted, renamed |
| **Doc** | Document symbols for the currently active file via LSP |
| **Refs** | All references to the symbol under the cursor at the time Spyglass was opened |

Switch between scopes with `Tab` while Spyglass is open.

---

## 🧭 Commands

Besides the general `Spyglass: Open Search Popup`, every scope has its own command in the Command Palette. Each one opens Spyglass **straight in that scope** (or switches an already open popup to it) and loads its list right away where that makes sense (Recent, Git, Doc, Refs):

| Command | Scope |
|---------|-------|
| `Spyglass: Find in Project` | Project — full-text search |
| `Spyglass: Find Files` | Files — fuzzy search by file name |
| `Spyglass: Find in Open Files` | Open Files — full-text search in open tabs |
| `Spyglass: Find Recent Files` | Recent |
| `Spyglass: Find in Current Directory` | Dir |
| `Spyglass: Find Symbols in Workspace` | Symbols |
| `Spyglass: Find Git Changes` | Git |
| `Spyglass: Find Symbols in Document` | Doc |
| `Spyglass: Find References` | Refs |
| `Spyglass: Find in Folder` | Dir, on a folder chosen in the Explorer (right-click a folder → *Spyglass: Find in Folder*) |

Two of them are also in context menus: right-click a **folder** in the Explorer for *Find in Folder*, and right-click **selected text** in an editor for *Find in Project* (the selection becomes the query). `Spyglass: What's New` opens the changelog. None of them has a default shortcut, so nothing you already use is taken over. Bind the ones you want in `keybindings.json` (`Ctrl+Shift+P` → *Open Keyboard Shortcuts (JSON)*), for example to get Quick Open-, Go to Symbol- and Find in Files-style keys:

```json
[
  { "key": "ctrl+p",       "command": "spyglass.findFiles" },
  { "key": "ctrl+t",       "command": "spyglass.findSymbols" },
  { "key": "ctrl+shift+o", "command": "spyglass.findDocumentSymbols" },
  { "key": "ctrl+shift+f", "command": "spyglass.findInProject" }
]
```

The general command takes the scope as an argument too, which is handy if you prefer one command id everywhere:

```json
{ "key": "ctrl+p", "command": "spyglass.open", "args": { "scope": "files" } }
```

Valid scopes are `project`, `openFiles`, `files`, `recent`, `here`, `symbols`, `git`, `doc` and `refs`; an unknown value is ignored and Spyglass opens as usual.

A scope chosen by a command is **not** remembered: the plain `Ctrl+Alt+F` / `Shift Shift` shortcut still reopens in the scope you last picked yourself with the tabs.

---

## 🎯 Go to line & symbol

In the **Files** and **Recent** lists the query understands the same shortcuts as VS Code's Quick Open (`Ctrl+P`):

| Type | What happens |
|------|--------------|
| `util.ts:42` | Filters the files by `util.ts`; the preview shows line 42 and `Enter` opens the file there (also in the **Git** list) |
| `util.ts:42:7` | The same, with the cursor at column 7 |
| `:42` | Line 42 in the file you are editing: one result, previewed at that line |
| `@` | Switches to the **Doc** scope — the symbols of the current file — and keeps the `@` in the box; `@init` filters them |

Delete the `@` and you are back in the list you came from. A line past the end of the file goes to its last line. In the text search scopes (Project, Open Files, Dir) nothing changes: `std::vector` or `@Override` are searched as text.

---

## 🔄 Find & Replace

1. Open Spyglass and type your search query
2. Press `Alt+R` (or click `⇄`) to enable replace mode
3. Type the replacement text in the second field (`Tab` moves focus from query to replace input)
4. Optionally tune case-sensitive / whole-word / glob filter
5. Click **Replace all** — a diff preview overlay appears showing every changed line (before in red, after in green) grouped by file
6. Click **Apply** to apply all changes, or **Cancel** to abort

Changes are applied via VS Code's `WorkspaceEdit` API and are fully undoable (`Ctrl+Z`).

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
| `spyglass.defaultScope` | `project` | Scope on open: `project` `openFiles` `files` `recent` `here` `symbols` `git` `doc` `refs` |
| `spyglass.maxResults` | `200` | Maximum number of results to display (`1`–`5000`) |
| `spyglass.maxMatchesPerFile` | `10` | Maximum number of matches shown per file in text search |
| `spyglass.maxFileSize` | `"1M"` | Files larger than this are skipped by text search (`500K`, `1M`, `10M`, `1G`) |
| `spyglass.exclude` | `[".git","node_modules","out","dist","*.lock"]` | Glob patterns excluded from search and file listing (lifted while [Include ignored & hidden files](#-ignored--hidden-files) is on, except `.git`) |
| `spyglass.ripgrepPath` | `""` | Path to your own `rg` binary. Leave empty to use the ripgrep that ships with VS Code |
| `spyglass.showWhatsNew` | `true` | Show a notification linking to the changelog after an update to a new minor or major version |
| `spyglass.openOnSide` | `false` | Open the popup in a side column instead of the active editor column |
| `spyglass.closeOnSelect` | `true` | Close the popup after opening a result. Disable to keep it open and open multiple results from one search |
| `spyglass.openExternalWindow` | `false` | Like "openOnSide", but also keeps the popup open after selecting a result — ideal for keeping Spyglass on a second monitor (drag the panel's tab out of the window to make it a standalone window) |
| `spyglass.keybindings.navigateDown` | `ArrowDown` | Navigate down in results |
| `spyglass.keybindings.navigateUp` | `ArrowUp` | Navigate up in results |
| `spyglass.keybindings.open` | `Enter` | Open selected result |
| `spyglass.keybindings.close` | `Escape` | Close Spyglass |
| `spyglass.keybindings.toggleRegex` | `shift+alt+r` | Toggle regex mode |
| `spyglass.keybindings.togglePreview` | `shift+alt+p` | Toggle preview panel |

---

## 🎹 Customizing Keybindings

### Change the open shortcut

Open **Keyboard Shortcuts** (`Ctrl+K Ctrl+S`), search for `Spyglass: Open Search Popup`, `Spyglass: Focus Sidebar Panel` or one of the per-scope [commands](#-commands) and assign your preferred keys.

Or edit `keybindings.json` directly (`Ctrl+Shift+P` → *Open Keyboard Shortcuts (JSON)*):

```json
[
  {
    "key": "ctrl+alt+f",
    "command": "spyglass.open",
    "when": "!inputFocus || editorTextFocus"
  },
  {
    "key": "ctrl+alt+e",
    "command": "spyglass.focusSidebar"
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

## 🙈 Ignored & hidden files

By default Spyglass searches what ripgrep would: it skips files listed in `.gitignore` / `.ignore`, hidden files (dotfiles such as `.env`, folders such as `.github`) and anything matching `spyglass.exclude` (`node_modules`, `dist`, `out`, `*.lock` …). Turn on **Include ignored and hidden files** — the `◌` button in the secondary toolbar (behind `⋯`) or `Alt+H` — to search those too. When it is on, the `⋯` button shows a dot so you do not forget.

- It applies to **Project**, **Open Files**, **Dir** and **Files**, and to **Replace all**, so the preview always covers exactly the files the search shows.
- It lifts `spyglass.exclude` as well, because otherwise `dist/` and `node_modules/` would stay hidden. The **`.git`** folder is always skipped.
- The choice is remembered with the other toolbar toggles. It can make searches slower and noisier in big repositories (`node_modules`, build output), so turn it off when you are done.

---

## ↵ Multiline search

Turn on **Multiline search** — the `↵` button in the secondary toolbar (behind `⋯`) or `Alt+M` — to let a pattern match across line breaks. It is always a **regular expression** (you cannot type a line break into a plain string), whatever the regex toggle says. When it is on, the `⋯` button shows a dot.

| Query | Finds |
|-------|-------|
| `import .*;\nimport` | two import lines in a row |
| `\{\n\s*return` | a block that opens and returns on the next line |
| `(?s)<div>.*?</div>` | anything between the tags, across any number of lines |

- `.` does not match a line break unless you start the pattern with `(?s)`; `\n`, `\s` and `[\s\S]` always do.
- A result that spans several lines is shown as its **first line** with a `+N` badge (N more lines); `Enter` opens the file at that first line.
- **Replace all is not available** in multiline mode, because replacing works line by line and a wrong multi-line replacement is easy to miss. Turning multiline on switches replace mode off.
- It applies to Project, Open Files and Dir. Searching is slower on big files, since ripgrep reads each file whole.

---

## 📏 Search limits

To stay fast on large projects, text search caps how much it returns. All three caps are settings, so you can raise them when something you expect is missing:

| Symptom | Setting | Default |
|---------|---------|---------|
| The header shows `200+ results` and asks you to narrow the query | `spyglass.maxResults` (1–5000) | `200` |
| A file clearly contains more occurrences than Spyglass lists | `spyglass.maxMatchesPerFile` | `10` |
| A match in a very large file (generated code, bundles, dumps) never shows up | `spyglass.maxFileSize` | `"1M"` |

```json
{
  "spyglass.maxResults": 1000,
  "spyglass.maxMatchesPerFile": 50,
  "spyglass.maxFileSize": "5M"
}
```

Higher values mean more work for ripgrep and a longer list to render, so raise them only as far as you need. Invalid values fall back to the defaults, and `spyglass.maxResults` above 5000 is capped at 5000.

---

## 📋 Requirements

- VS Code `^1.85.0`
- No additional dependencies — ripgrep is bundled automatically
- Git *(optional)* — required for change indicators in the preview panel
- A language server extension *(optional)* — required for the **Symbols** scope

---

## Privacy

Spyglass collects **no data**. All processing happens locally on your machine:

- No network requests are made while searching (webview CSP is `default-src 'none'`). The one exception: if no ripgrep binary can be found (neither the one that ships with VS Code nor the bundled `@vscode/ripgrep`), Spyglass downloads the official ripgrep release from GitHub once, into its extension storage. Set `spyglass.ripgrepPath` to point at your own `rg` to avoid that
- No telemetry, analytics, or crash reporting
- Search history is stored locally in VS Code's `workspaceState` and never leaves your machine
- Dependencies (`@vscode/ripgrep`, `shiki`) run fully locally

---

## 🛠️ Development

```bash
git clone https://github.com/garroter/spyglass
cd spyglass
npm install

npm run compile   # compile TypeScript
npm run watch     # watch mode
npm test          # run unit tests (vitest)
npm run test:ui   # run UI tests (Playwright + headless Chromium)
```

`npm run test:ui` rebuilds the webview bundle and drives the real UI against the real search backend,
with only the VS Code API mocked. The first time, install the browser with `npx playwright install chromium`
(or set `SPYGLASS_CHROMIUM` to an existing Chromium/Chrome binary).

Press `F5` in VS Code to launch an Extension Development Host.

### Continuous integration and releases

GitHub Actions runs lint, type-checks, the unit tests and the UI tests on every push to `main` and on every pull request (`.github/workflows/ci.yml`), and builds the `.vsix`. To release, bump `version` in `package.json`, give `CHANGELOG.md` a `## [x.y.z]` section, and push the tag `vx.y.z`: the release workflow checks the tag and the changelog, runs the same checks and publishes a GitHub Release with the `.vsix` that passed them. Publishing to the Marketplace is still a manual `vsce publish`.

### Project structure

```
src/
  extension.ts             — activation, command registration
  FinderPanel.ts           — popup: webview panel lifecycle, opening files
  SpyglassSidebarProvider.ts — sidebar view provider
  SpyglassController.ts    — state, message handling and searches shared by the popup and the sidebar
  scopeCommands.ts         — the per-scope "Find …" commands and scope-argument parsing
  webviewHtml.ts           — HTML template for the webview (pure function)
  ripgrep.ts               — ripgrep search backend
  gitUtils.ts              — git status and diff parsing
  symbolSearch.ts          — LSP workspace symbol search
  themeLoader.ts           — loads the active VS Code theme for Shiki
  workspaceUtils.ts        — path helpers (cwdForFile, makeRelative)
  webviewUtils.ts          — pure functions shared with tests (fuzzyScore, parseQueryInput)
  webview/                 — webview UI (TypeScript, bundled with esbuild)
    main.ts                — entry point
    state.ts               — UI state management
    search.ts              — search logic
    render.ts              — results rendering
    preview.ts             — preview panel
    events.ts              — keyboard/mouse event handlers
    contextMenu.ts         — right-click context menu
    highlight.ts           — HTML escaping and query match highlighting
    shiki.ts               — Shiki syntax highlighter integration
  test/                    — unit tests (vitest)
scripts/                   — release helpers (changelog section extraction)
.github/workflows/         — CI and release workflows
ui-tests/                  — UI tests (Playwright): webview + real controller + real ripgrep, VS Code API mocked
```

---

## 🤝 Contributing

PRs and issues welcome at [github.com/garroter/spyglass](https://github.com/garroter/spyglass). See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up, test and submit a change.

---

## 📄 License

MIT
