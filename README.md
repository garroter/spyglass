# Finder

**Fast, keyboard-driven search popup for VS Code** — inspired by [Neovim Telescope](https://github.com/nvim-telescope/telescope.nvim) and JetBrains Search Everywhere.

![Finder Icon](images/icon.svg)

---

## Features

- **Double Shift** to open the search popup instantly
- Search **text in files** across the whole project
- Scope tabs: **Project** · **Open Tabs**
- **Regex mode** toggle for power users
- **Neovim keybindings** support inside the popup (`j/k` navigation, `Esc` to close)
- Close with **Q** or `Escape`

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Shift Shift` | Open Finder |
| `↑` / `↓` or `k` / `j` | Navigate results |
| `Enter` | Open selected file |
| `Tab` | Switch scope (Project / Open Tabs) |
| `Ctrl+R` | Toggle Regex mode |
| `Q` / `Escape` | Close Finder |

---

## Scopes

| Scope | Description |
|---|---|
| **Project** | Search across all files in the workspace |
| **Open Tabs** | Search only within currently open editor tabs |

---

## Requirements

- VS Code `^1.85.0`
- [ripgrep](https://github.com/BurntSushi/ripgrep) (bundled or system-installed) for fast full-text search

---

## Extension Settings

| Setting | Default | Description |
|---|---|---|
| `finder.maxResults` | `200` | Max number of results shown |
| `finder.defaultScope` | `project` | Default scope on open (`project` or `openFiles`) |
| `finder.ripgrepPath` | `""` | Custom path to `rg` binary |

---

## Roadmap

- [x] Project scaffold & icon
- [ ] Search popup UI (WebviewPanel)
- [ ] Full-text search with ripgrep
- [ ] Open tabs scope
- [ ] Regex toggle
- [ ] Neovim keybinding support
- [ ] File search mode (filenames)
- [ ] Recent files scope

---

## Contributing

PRs and issues welcome at [github.com/piotrmacai/finder](https://github.com/piotrmacai/finder).

---

## License

MIT
