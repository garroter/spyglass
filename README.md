# Spyglass

**Fast, keyboard-driven search popup for VS Code** — inspired by [Neovim Telescope](https://github.com/nvim-telescope/telescope.nvim) and JetBrains Search Everywhere.

Open with `Shift+Alt+F`. Type. Navigate. Done.

---

## Screenshots

![Full-text search with live preview](images/demo-search.gif)

![File search and recent files](images/demo-files.gif)

---

## Features

- **Full-text search** across the whole project with ripgrep (blazing fast)
- **Fuzzy file search** — search by filename with character-level match highlighting
- **Recent files** — instantly access your most recently opened files, no typing required
- **Open Files scope** — search only within currently open editor tabs
- **Live preview** — see file content as you navigate results, with syntax highlighting
- **Git change indicators** — modified lines highlighted in the preview panel (requires git)
- **Open in split** — open any result beside the current editor with `Ctrl+Enter`
- **Pre-fill from selection** — select text in editor, open Spyglass → query is pre-filled instantly
- **Regex mode** toggle for power users
- **Fully configurable keybindings** — change any shortcut via VS Code settings
- **Theme adaptive** — works with any VS Code theme (dark, light, high contrast)
- **Zero dependencies** — ripgrep is bundled, no installation required

---

## Usage

| Action | Default Shortcut |
|--------|-----------------|
| Open Spyglass | `Shift+Alt+F` |
| Navigate results | `↑` / `↓` |
| Open selected file | `Enter` |
| Open in split editor | `Ctrl+Enter` |
| Switch scope | `Tab` |
| Toggle regex mode | `Shift+Alt+R` |
| Toggle preview panel | `Shift+Alt+P` |
| Close | `Escape` |

**Tips:**
- Select text in the editor before opening Spyglass — the query is pre-filled and search starts instantly
- Switch to **Recent** scope with `Tab` to jump to recently opened files without typing anything
- Use `Ctrl+Enter` to open a result in a split view without closing Spyglass's context

---

## Search Scopes

| Scope | Description |
|-------|-------------|
| **Project** | Full-text search across all files in the workspace |
| **Open Files** | Full-text search only within currently open editor tabs |
| **Files** | Fuzzy search by filename across the whole project |
| **Recent** | Recently opened files, ordered by most recent. Filter by typing. |

Switch between scopes with `Tab` while Spyglass is open.

---

## Preview Panel

The right-side preview panel shows the file around the matched line with syntax highlighting for the most common languages (JavaScript, TypeScript, Python, Rust, Go, and more).

Lines modified since the last git commit are marked with a blue indicator in the gutter — the same color used by VS Code's built-in git decorations.

Toggle the preview panel with `Shift+Alt+P` or the `⊡` button in the top bar.

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `spyglass.defaultScope` | `project` | Scope on open: `project`, `openFiles`, `files`, or `recent` |
| `spyglass.maxResults` | `200` | Maximum number of results to display |
| `spyglass.keybindings.navigateDown` | `ArrowDown` | Navigate down in results |
| `spyglass.keybindings.navigateUp` | `ArrowUp` | Navigate up in results |
| `spyglass.keybindings.open` | `Enter` | Open selected result |
| `spyglass.keybindings.close` | `Escape` | Close Spyglass |
| `spyglass.keybindings.toggleRegex` | `shift+alt+r` | Toggle regex mode |
| `spyglass.keybindings.togglePreview` | `shift+alt+p` | Toggle preview panel |

---

## Customizing Keybindings

### Change shortcuts inside the panel

You can remap any key used within the Spyglass panel (navigate, open, close, regex toggle) via **VS Code Settings** (`Ctrl+,`). Search for `spyglass.keybindings` or add to your `settings.json`:

```json
{
  "spyglass.keybindings.navigateDown": "j",
  "spyglass.keybindings.navigateUp": "k",
  "spyglass.keybindings.toggleRegex": "ctrl+r",
  "spyglass.keybindings.togglePreview": "ctrl+p"
}
```

### Change the Open shortcut (`Shift+Alt+F`)

To rebind how you open Spyglass, open the **Keyboard Shortcuts** editor (`Ctrl+K Ctrl+S`), search for `Spyglass: Open Search`, and assign your preferred key.

Or add it directly to your `keybindings.json` (`Ctrl+Shift+P` → *Open Keyboard Shortcuts (JSON)*):

```json
[
  {
    "key": "ctrl+shift+f",
    "command": "spyglass.open",
    "when": "editorTextFocus || !inputFocus"
  }
]
```

---

## Requirements

- VS Code `^1.85.0`
- No additional dependencies — ripgrep is bundled automatically
- Git (optional) — required for change indicators in the preview panel

---

## Contributing

PRs and issues welcome at [github.com/piotrmacai/spyglass](https://github.com/piotrmacai/spyglass).

---

## License

MIT
