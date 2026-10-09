# Commands Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Commands list in Spyglass (`>` prefix, `Spyglass: Find Commands`) that runs VS Code commands, with recent ones first and a hand-over to the real Command Palette.

**Architecture:** A pure catalog module builds `CommandEntry[]` from extension manifests plus a curated core list; the controller serves it to the page on request and runs commands; the webview gets a `commands` scope with its own list renderer and a details pane, entered through a `>` round trip like the existing `@` → Doc one.

**Tech Stack:** TypeScript, VS Code extension API, webview (esbuild bundle), vitest (unit), Playwright (UI).

**Spec:** `docs/superpowers/specs/2026-10-09-commands-scope-design.md`

## Global Constraints

- Recent commands: global state key `spyglass.recentCommands`, newest first, at most 20 kept; at most 10 shown first for a query.
- The Commands scope is never remembered as `spyglass.lastScope` and is not in the `Tab` / `Shift+Tab` cycle.
- The catalog is built on first use of the Commands scope, cached, rebuilt on `vscode.extensions.onDidChange`.
- Hidden = listed in `contributes.menus.commandPalette` with `"when": "false"`.
- Core titles English only; core ids missing from `vscode.commands.getCommands()` are dropped.
- Last row always: *Show all commands for '…'* → `workbench.action.quickOpen` with `'>' + query`.
- Popup: close, then execute. Sidebar: `workbench.action.focusActiveEditorGroup`, then execute.
- Errors: `Spyglass: "<title>" failed: <message>`.
- Text sizes and styles reuse the existing list classes (`.result`, `.result-file`, `.result-text`).

## Review Focus

- An extension whose `contributes.commands` is not an array, or whose command has no `title` → skipped, the rest still listed (Task 1 test).
- The same command id contributed twice (core list and an extension, or two extensions) → listed once, extension entry wins (Task 1 test).
- A recent id that no longer exists (extension uninstalled) → silently ignored in ranking (Task 2 test).
- Query that matches nothing → only the *Show all commands* row, Enter on it opens the palette (Task 4 test).
- `Enter` while the catalog is still loading → nothing runs, no error (Task 4 test).

---

## File Structure

- Create `src/coreCommands.ts` — curated core command data.
- Create `src/commandCatalog.ts` — pure catalog building, nls resolution, keybinding pick/format.
- Modify `src/webviewUtils.ts` — `rankCommands()` shared with the webview.
- Modify `src/types.ts`, `src/scopeCommands.ts` — `'commands'` scope, `spyglass.findCommands`.
- Modify `src/SpyglassController.ts` — catalog loading, `commandList` / `runCommand` / `showAllCommands`.
- Modify `src/extension.ts`, `package.json`, `package.nls*.json` — command registration and title.
- Modify `src/webview/*` (state, types, search, render, events, preview, main), `src/webviewHtml.ts`, `media/webview.css`, `src/i18n.ts` — the Commands list.
- Tests: `src/test/commandCatalog.test.ts` (new), `src/test/webviewUtils.test.ts`, `src/test/SpyglassController.test.ts`, `src/test/extension.test.ts`, `ui-tests/commands.spec.ts` (new), `ui-tests/support/{harness,vscodeMock}.ts`.

---

### Task 1: Command catalog (pure)

**Files:** Create `src/coreCommands.ts`, `src/commandCatalog.ts`, `src/test/commandCatalog.test.ts`.

**Interfaces — Produces:**
```ts
export type Platform = 'linux' | 'win32' | 'darwin';
export interface CoreCommand { id: string; category?: string; title: string; key?: string; mac?: string }
export interface CommandEntry {
  id: string; title: string; category?: string;
  source: 'core' | 'extension'; extensionName?: string; keybinding?: string;
}
export interface ExtensionInfo { id: string; packageJSON: unknown } // shape of vscode.Extension we read
export type NlsLookup = (extensionId: string) => Record<string, string> | undefined;
export function resolveNls(value: unknown, strings: Record<string, string> | undefined): string | undefined;
export function defaultKeybinding(bindings: unknown, command: string, platform: Platform): string | undefined;
export function formatKeybinding(key: string, platform: Platform): string;
export function buildCatalog(extensions: readonly ExtensionInfo[], existingIds: ReadonlySet<string> | undefined,
  platform: Platform, core: readonly CoreCommand[], nls: NlsLookup): CommandEntry[];
```

- [ ] **Step 1: Write failing tests** in `src/test/commandCatalog.test.ts` covering:
  - `resolveNls('%cmd.title%', { 'cmd.title': 'Commit' })` → `'Commit'`; unknown key → raw `'%x%'`; plain string unchanged; `{ value: 'A', original: 'B' }` → `'A'`; non-string → `undefined`.
  - `defaultKeybinding([{command:'a',key:'ctrl+k ctrl+w',mac:'cmd+k cmd+w'}], 'a', 'darwin')` → `'cmd+k cmd+w'`; linux → `'ctrl+k ctrl+w'`; `linux` field wins over `key` on linux; no match → `undefined`; non-array → `undefined`.
  - `formatKeybinding('ctrl+shift+p','linux')` → `'Ctrl+Shift+P'`; `'ctrl+k ctrl+w'` → `'Ctrl+K Ctrl+W'`; `'cmd+shift+p','darwin'` → `'⇧⌘P'`; `'alt+z','darwin'` → `'⌥Z'`; `'f12'` → `'F12'`; `` 'ctrl+`' `` → `` 'Ctrl+`' ``.
  - `buildCatalog`: extension command with nls title and category; command hidden by `menus.commandPalette` `when: 'false'` skipped; command without title skipped; `contributes.commands` not an array → extension skipped, others kept; core command missing from `existingIds` dropped; `existingIds` undefined → core kept; same id in core and extension → one entry, extension's; result sorted by `category: title` (case-insensitive); keybinding filled for platform and formatted; `extensionName` = manifest `displayName` (nls-resolved) else `name`.
- [ ] **Step 2:** `npx vitest run src/test/commandCatalog.test.ts` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/commandCatalog.ts` and `src/coreCommands.ts` (≈85 entries: View, File, Preferences, Developer, Terminal, Tasks, Debug, Editor, Extensions; ids and default keys as in VS Code; `mac` only where it differs).
- [ ] **Step 4:** Tests PASS; `npm run typecheck`.
- [ ] **Step 5:** Commit `feat: command catalog for the Commands scope`.

### Task 2: Ranking with recent commands

**Files:** Modify `src/webviewUtils.ts`; test `src/test/webviewUtils.test.ts`.

**Interfaces — Consumes:** `CommandEntry` shape (structural: `{ id; title; category? }`). **Produces:**
```ts
export interface RankedCommand<T> { entry: T; positions: number[]; recent: boolean }
export function commandLabel(e: { title: string; category?: string }): string; // 'Category: Title' or 'Title'
export function rankCommands<T extends { id: string; title: string; category?: string }>(
  entries: readonly T[], query: string, recentIds: readonly string[], limit: number): RankedCommand<T>[];
```
Positions index into `commandLabel(entry)`.

- [ ] **Step 1: Failing tests:** empty query → recents (in recency order, all of them up to limit) then the rest in given order; query → matching recents first (max 10, recency order) then others by fuzzy score; a recent id not in `entries` ignored; non-matching entries excluded; `limit` respected; positions highlight the matched characters of `'Git: Commit'` for `gc`.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement with `fuzzyScore`. **Step 4:** PASS. **Step 5:** commit `feat: rank commands with recently run first`.

### Task 3: Extension host — scope, command, controller messages

**Files:** `src/types.ts`, `src/scopeCommands.ts`, `src/SpyglassController.ts`, `src/extension.ts`, `package.json`, `package.nls.json`, `package.nls.zh-cn.json`; tests `src/test/SpyglassController.test.ts`, `src/test/extension.test.ts`, `src/test/scopeCommands.test.ts`.

**Interfaces — Consumes:** `buildCatalog`, `CommandEntry`, `Platform` (Task 1). **Produces (messages):**
- page → host `{ type: 'commandList' }`; host → page `{ type: 'commands', entries: CommandEntry[], recent: string[] }`
- page → host `{ type: 'runCommand', id: string }`
- page → host `{ type: 'showAllCommands', query: string }`

- [ ] **Step 1: Failing tests:**
  - `Scope` includes `'commands'`; `SCOPE_COMMANDS` has `spyglass.findCommands → commands`; `scopeFromCommandArg({scope:'commands'})` → `'commands'`.
  - Controller: `commandList` answers `commands` with catalog entries (mock `vscode.extensions.all`, `commands.getCommands`) and `recent` from global state; `runCommand` in popup mode calls `host.close()` before `executeCommand(id)`; in sidebar mode executes `workbench.action.focusActiveEditorGroup` first; records id at the front of `spyglass.recentCommands` (dedup, max 20); a rejecting command shows `Spyglass: "<title>" failed: <message>`; `showAllCommands` executes `workbench.action.quickOpen` with `'>query'`; `scopeChanged` to `commands` does not update `spyglass.lastScope`.
  - Extension: `spyglass.findCommands` registered (via `SCOPE_COMMANDS`), manifest has its title.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement (catalog cache in controller module scope, invalidated by `vscode.extensions.onDidChange`; nls lookup reads `package.nls.<env.language>.json` then `package.nls.json` from `extension.extensionPath`, errors → undefined). **Step 4:** PASS + typecheck. **Step 5:** commit `feat: serve and run commands from the extension host`.

### Task 4: Webview — the Commands list

**Files:** `src/webview/{types,state,search,render,events,preview,main}.ts`, `src/webviewHtml.ts`, `media/webview.css`, `src/i18n.ts`; tests `ui-tests/commands.spec.ts`, `ui-tests/support/{harness,vscodeMock}.ts`.

**Interfaces — Consumes:** messages from Task 3, `rankCommands`/`commandLabel` from Task 2.

- [ ] **Step 1: Failing UI tests** (`ui-tests/commands.spec.ts`; mock `extensions.all` with a fake Git extension and `getCommands`):
  - `>` in Files switches to Commands (temporary tab visible and active), keeps `>`; deleting it returns to Files and the tab disappears.
  - `>` in Project stays a text search.
  - Opening with `initialScope: 'commands'` lists commands; rows read `Category: Title` with the key on the right.
  - Typing filters; matched letters highlighted.
  - `Enter` posts `runCommand` with the selected id (host records `executeCommand`), popup `close` called before.
  - Recent commands (seeded global state) listed first.
  - Last row *Show all commands for 'xyz'*; with no match it is the only row; `Enter` on it → `workbench.action.quickOpen` `'>xyz'`.
  - Details pane shows id and source for the selected command.
  - `Tab` from Commands goes to the next regular scope and the Commands tab disappears; `Tab` never lands on Commands.
  - `Enter` before the list arrives does nothing.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement. **Step 4:** full `npm test`, `npm run test:ui`, typecheck, lint PASS. **Step 5:** commit `feat: Commands list in Spyglass`.

### Task 5: Docs and verification

- [ ] README: Commands section + commands table row + features bullet; CHANGELOG `[Unreleased]` Added entry.
- [ ] Screenshots (popup, sidebar) reviewed for layout.
- [ ] Commit `docs: Commands scope`.
- [ ] Hand to the user for the F5 check listed in the spec's *Verification*.
