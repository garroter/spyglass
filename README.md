# Spyglass

**Fast, keyboard-driven search popup for VS Code** — inspired by [Neovim Telescope](https://github.com/nvim-telescope/telescope.nvim) and JetBrains Search Everywhere.

[![VS Marketplace](https://img.shields.io/visual-studio-marketplace/v/piotrmacai.spyglass?style=flat-square&label=VS%20Marketplace&color=7c3aed)](https://marketplace.visualstudio.com/items?itemName=piotrmacai.spyglass)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/piotrmacai.spyglass?style=flat-square&color=blue)](https://marketplace.visualstudio.com/items?itemName=piotrmacai.spyglass)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/piotrmacai.spyglass?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=piotrmacai.spyglass)
[![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

Open with `Ctrl+Alt+F`. Type. Navigate. Done.

---

## Screenshots

![Full-text search with live preview](images/demo-search.gif)

![File search and recent files](images/demo-files.gif)

---

## Features

### Search
- **Full-text search** across the whole project with ripgrep (blazing fast)
- **Fuzzy file search** — search by filename with character-level match highlighting
- **Symbol search** — search workspace symbols via LSP (classes, functions, variables…)
- **Regex mode** toggle for power users
- **Case sensitive** and **whole word** toggles
- **Glob filter** — limit search to specific file patterns (`*.ts`, `!*.test.ts`)

### Navigation
- **Search scopes** — Project, Open Files, Files, Recent, Dir, Symbols
- **Recent files** — instantly access your most recently opened files
- **Dir scope** — search only within the directory of the active file
- **Search history** — navigate previous queries with `Ctrl+↑` / `Ctrl+↓`
- **Multi-select** — select multiple results and open them all at once

### Preview
- **Live preview** — see file content as you navigate results, with syntax highlighting
- **Git change indicators** — modified lines highlighted in the preview panel
- **Theme adaptive** — works with any VS Code theme (dark, light, high contrast)

### Actions
- **Find & Replace** — replace across all matched files instantly
- **Copy path** — copy the absolute path of the selected result
- **Reveal in Explorer** — click the preview header to reveal the file in the sidebar
- **Open in split** — open any result beside the current editor
- **Pre-fill from selection** — select text in editor, open Spyglass → query is pre-filled
- **Zero dependencies** — ripgrep is bundled, no installation required

---

## Usage

### Opening Spyglass

| Action | Shortcut |
|--------|----------|
| Open Spyglass | `Ctrl+Alt+F` |

> **VSCode Vim users** — bind `<Space>f` as your leader shortcut (see [Vim setup](#vim-setup) below).

### Inside the panel

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
| Copy path of selected result | `Alt+Y` |
| Multi-select toggle (current) | `Ctrl+Space` |
| Multi-select toggle (on click) | `Ctrl+Click` |
| Select all results | `Ctrl+A` |
| Open all selected | `Shift+Enter` |
| Reveal in Explorer | click the preview header |

---

## Search Scopes

| Scope | Description |
|-------|-------------|
| **Project** | Full-text search across all files in the workspace |
| **Open Files** | Full-text search only within currently open editor tabs |
| **Files** | Fuzzy search by filename across the whole project |
| **Recent** | Recently opened files, ordered by most recent |
| **Dir** | Full-text search within the directory of the active file |
| **Symbols** | Workspace symbol search via LSP (requires a language extension) |

Switch between scopes with `Tab` while Spyglass is open.

---

## Find & Replace

1. Open Spyglass and type your search query
2. Click the `⇄` button (or press `Alt+R`) to enable replace mode
3. Type the replacement text in the second field
4. Optionally set case-sensitive / whole-word / glob filter
5. Click **Replace all** — all matches are replaced instantly via VS Code's edit API (supports undo)

---

## Preview Panel

The right-side preview panel shows the file around the matched line with syntax highlighting.

Lines modified since the last git commit are marked with a blue indicator in the gutter.

- Toggle with `Shift+Alt+P` or the `⊡` button
- Click the preview header to **Reveal in Explorer**

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `spyglass.defaultScope` | `project` | Scope on open: `project`, `openFiles`, `files`, `recent`, `here`, `symbols` |
| `spyglass.maxResults` | `200` | Maximum number of results to display |
| `spyglass.keybindings.navigateDown` | `ArrowDown` | Navigate down in results |
| `spyglass.keybindings.navigateUp` | `ArrowUp` | Navigate up in results |
| `spyglass.keybindings.open` | `Enter` | Open selected result |
| `spyglass.keybindings.close` | `Escape` | Close Spyglass |
| `spyglass.keybindings.toggleRegex` | `shift+alt+r` | Toggle regex mode |
| `spyglass.keybindings.togglePreview` | `shift+alt+p` | Toggle preview panel |

---

## Customizing Keybindings

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

## Vim Setup

If you use the [VSCode Vim extension](https://marketplace.visualstudio.com/items?itemName=vscodevim.vim), you can bind `<Space>f` as your Spyglass shortcut — just like Telescope in Neovim.

Add to your `settings.json`:

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

Then disable the default `Ctrl+Alt+F` binding if you prefer to use only the Vim shortcut:

```json
[
  {
    "key": "ctrl+alt+f",
    "command": "-spyglass.open"
  }
]
```

---

## Requirements

- VS Code `^1.85.0`
- No additional dependencies — ripgrep is bundled automatically
- Git (optional) — required for change indicators in the preview panel
- A language server extension (optional) — required for the **Symbols** scope

---

## Contributing

PRs and issues welcome at [github.com/garroter/spyglass](https://github.com/garroter/spyglass).

---

## License

MIT
