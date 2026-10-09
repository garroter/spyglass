# Commands scope — design

Date: 2026-10-09 · Status: approved in conversation, awaiting review of this document · Target: 0.4.0

## Goal

Let Spyglass run VS Code commands, so that one shortcut (`Shift Shift`, `Ctrl+Alt+F`) reaches files,
text, symbols **and actions**, the way JetBrains *Search Everywhere* does. It should feel like
VS Code's Command Palette for the commands people use every day, and hand over to the real palette
for anything it does not know.

Success means: typing `>format` and `Enter` formats the file Spyglass was opened from; the commands
used most sit at the top; nothing a user expects from `Ctrl+Shift+P` is a dead end.

## User experience

### Getting in and out

- **`>` prefix** at the start of the query in **Files** or **Recent** switches to the Commands
  list, keeping the `>` in the box. Deleting the `>` returns to the list it came from. This mirrors
  the existing `@` → Doc round trip and VS Code's Quick Open (`Ctrl+P`, then `>`).
- **`Spyglass: Find Commands`** (`spyglass.findCommands`) opens Spyglass straight in Commands. No
  default keybinding; users may bind it (e.g. to `Ctrl+Shift+P`). `spyglass.open` also accepts
  `{ "scope": "commands" }`.
- **No permanent tab.** A *Commands* tab appears in the tab bar only while the Commands list is
  shown, and disappears when it is left. `Tab` / `Shift+Tab` cycle the regular scopes and leave
  Commands. The Commands scope is never remembered as the last scope.
- In Commands, the query box placeholder reads e.g. *"Run a command…"*; text-search toolbar
  options are hidden as in the other list scopes.

### The list

- Each row: **Category: Title** (e.g. *Git: Commit*), with the fuzzy-matched characters highlighted
  like file names in Files, and the default keybinding on the right when one is known.
- **Recently run first.** Commands run from Spyglass are remembered across sessions (global state,
  newest first, at most 20 kept). With an empty query the recent ones come first, then all others
  alphabetically. With a query, matching recent commands (up to 10) come first in recency order,
  then the rest by fuzzy score.
- **Last row, always:** *Show all commands for '…'* — opens VS Code's own Command Palette with the
  same text, for anything Spyglass does not list.
- The **preview pane** shows details of the selected command instead of a file: title, category,
  command id, where it comes from (extension name, or "VS Code"), and its default keybinding.
  The id is what a user needs to bind their own key.
- Status bar: *"N commands"*.

### Running

- `Enter` (or a click) runs the selected command.
  - **Popup:** the popup closes first, so focus returns to the editor it was opened from, then the
    command runs — editor commands apply to that editor.
  - **Sidebar:** focus moves to the active editor group, then the command runs. The sidebar stays.
- A command that throws shows an error message (`Spyglass: "<title>" failed: <message>`) rather
  than failing silently.
- The command is added to the top of the recent list.
- `Ctrl+Enter`, multi-select, copy path, pin and the context menu do nothing in Commands.

## Where the commands come from

### Extension commands

From `vscode.extensions.all`, each extension's `packageJSON.contributes.commands`:

- `title` and `category` as given. If a value is still an unresolved `%key%` placeholder, it is
  resolved from the extension's `package.nls.<vscode.env.language>.json`, falling back to
  `package.nls.json`, falling back to the raw value. (Whether VS Code already returns translated
  manifests is to be confirmed in a real VS Code — see *Verification*; the fallback is harmless
  either way.)
- Titles given as `{ value, original }` objects use `value`.
- **Hidden commands are skipped:** those listed in `contributes.menus.commandPalette` with
  `"when": "false"`. Other `when` clauses cannot be evaluated by an extension and are ignored
  (the command is listed).
- **Default keybinding:** the first entry in `contributes.keybindings` for that command, using the
  `mac` / `linux` / `win` field for the current platform, else `key`. Shown in a readable form
  (`ctrl+shift+p` → `Ctrl+Shift+P`, `cmd` → `⌘` on macOS).
- Spyglass's own internal command (`spyglass.keyHandledInWebview`) is skipped like any other
  hidden command.

### VS Code's own commands

The API exposes only ids for built-in commands, so Spyglass carries a **curated list of about 70
common workbench commands** (`src/coreCommands.ts`): id, category, English title, default key and
macOS key. Areas: editors (close, close all, split, reopen closed, navigate), files (new, save,
save all, revert), view and layout (toggle sidebar, panel, terminal, zen mode, full screen, minimap,
breadcrumbs), editing (format document, toggle word wrap, comment line, fold/unfold all), window
(reload, new window, zoom in/out/reset), settings and keyboard shortcuts, git view, problems,
output, extensions.

Each id is checked against `vscode.commands.getCommands()` when the catalog is built; ids missing
from the running VS Code are dropped, so the list never offers a command that does not exist.

Core titles are English only (no translations are available to an extension).

### Building and refreshing

The catalog is built on first use of the Commands scope in a page (not on every Spyglass open) and
cached in the extension host; it is rebuilt on `vscode.extensions.onDidChange`. Building is pure
data assembly plus one `getCommands()` call and reading a few small nls files.

## Architecture

- **`src/coreCommands.ts`** — the curated core list (data only).
- **`src/commandCatalog.ts`** — pure functions, unit-tested without VS Code:
  - `buildCatalog(extensions, existingIds, platform, core, nlsLookup) → CommandEntry[]`
  - `resolveNls(value, strings)`, `defaultKeybinding(bindings, command, platform)`,
    `formatKeybinding(key, platform)`
  - `rankCommands(entries, query, recentIds, limit)` lives in `src/webviewUtils.ts` (shared with the
    webview, like `fuzzyRank`).
  - `CommandEntry = { id, title, category?, source: 'core' | 'extension', extensionName?, keybinding? }`
- **`SpyglassController`** — new messages:
  - page → host `commandList` → host answers `commands { entries, recent }`
  - page → host `runCommand { id }` → close / focus as above, `executeCommand`, record in recent
  - page → host `showAllCommands { query }` → `workbench.action.quickOpen` with `'>' + query`
- **Scope** type gains `'commands'`; `spyglass.findCommands` joins `SCOPE_COMMANDS`; `commands` is
  excluded from the remembered scope and from the `Tab` cycle.
- **Webview** — `state.commandResults`, a `renderCommandResults()` alongside files/symbols, a
  command details panel in place of the file preview, and the `>` round trip generalised from the
  existing `@` one (`atReturnScope` becomes `prefixReturnScope`).

## Error handling

- Catalog build failure (e.g. an unreadable nls file): that extension's commands fall back to raw
  titles; one bad extension never empties the list.
- `executeCommand` rejection: error message as above; the recent list is still updated.
- `getCommands()` failing: core commands are listed unfiltered.

## Testing

- **Unit (`commandCatalog`, `rankCommands`):** nls resolution (present, missing, locale fallback,
  `{value}` titles); hidden commands skipped; missing core ids dropped; keybinding per platform
  and formatting; ranking with recent commands (empty query, matching query, recents capped,
  stable order).
- **Controller:** `commandList` answers with the catalog and recents; `runCommand` closes the popup
  before executing, records the recent, reports errors; `showAllCommands` calls quick open with
  `>`.
- **UI (Playwright):** `>` switches to Commands and keeps the `>`; deleting it returns; filtering;
  `Enter` asks the host to run the selected id; the *Show all commands* row; the details pane;
  the temporary tab appears and disappears; text toolbar hidden; `>` stays text in Project.
- **Verification in a real VS Code (F5):** extension titles appear translated (no `%key%`); focus
  lands in the editor so *Format Document* formats it, in the popup and in the sidebar; *Show all
  commands* opens the palette with the text.

## Out of scope

- User-customised keybindings (not readable by extensions) — defaults only.
- Evaluating `when` clauses / enablement.
- Translated titles for core commands.
- Commands that need arguments.
- A permanent Commands tab or `Alt+digit` scope jumps.
