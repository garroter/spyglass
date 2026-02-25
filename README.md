# Finder

**Fast, keyboard-driven search popup for VS Code** — inspired by [Neovim Telescope](https://github.com/nvim-telescope/telescope.nvim) and JetBrains Search Everywhere.

Open with `Shift+Alt+F`. Type. Navigate. Done.

---

## Features

- **Full-text search** across the whole project with ripgrep (blazing fast)
- **File search** — fuzzy search by filename with match highlighting
- **Open Files scope** — search only within currently open editor tabs
- **Live preview** — see file content as you navigate results, with syntax highlighting
- **Pre-fill from selection** — select text in editor, open Finder → query is pre-filled
- **Regex mode** toggle for power users
- **Fully configurable keybindings** — change any shortcut via VS Code settings
- **Theme adaptive** — works with any VS Code theme (dark, light, high contrast)
- **Zero dependencies** — ripgrep is bundled, no installation required

---

## Usage

| Action | Default shortcut |
|--------|-----------------|
| Open Finder | `Shift+Alt+F` |
| Navigate results | `↑` / `↓` |
| Open selected file | `Enter` |
| Switch scope (Project → Open Files → Files) | `Tab` |
| Toggle regex mode | `Shift+Alt+R` |
| Toggle preview panel | `Shift+Alt+P` |
| Close | `Escape` |

**Tip:** Select any text in the editor before opening Finder — the query is automatically pre-filled and search starts instantly.

---

## Search Scopes

| Scope | Description |
|-------|-------------|
| **Project** | Full-text search across all files in the workspace |
| **Open Files** | Full-text search only within currently open editor tabs |
| **Files** | Fuzzy search by filename across the whole project |

Switch between scopes with `Tab` while Finder is open.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `finder.defaultScope` | `project` | Scope on open: `project`, `openFiles`, or `files` |
| `finder.maxResults` | `200` | Maximum number of results to display |
| `finder.keybindings.navigateDown` | `ArrowDown` | Navigate down in results |
| `finder.keybindings.navigateUp` | `ArrowUp` | Navigate up in results |
| `finder.keybindings.open` | `Enter` | Open selected result |
| `finder.keybindings.close` | `Escape` | Close Finder |
| `finder.keybindings.toggleRegex` | `shift+alt+r` | Toggle regex mode |
| `finder.keybindings.togglePreview` | `shift+alt+p` | Toggle preview panel |

---

## Requirements

- VS Code `^1.85.0`
- No additional dependencies — ripgrep is bundled automatically

---

## Contributing

PRs and issues welcome at [github.com/piotrmacai/finder](https://github.com/piotrmacai/finder).

---

## License

MIT
