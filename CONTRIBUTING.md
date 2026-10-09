# Contributing to Spyglass

Thanks for helping! Bug reports, ideas and pull requests are all welcome at
[github.com/garroter/spyglass](https://github.com/garroter/spyglass).

## Getting started

You need Node.js 20.19+ or 22.12+ (CI uses 22), git and VS Code `^1.85`.

```bash
git clone https://github.com/garroter/spyglass
cd spyglass
npm install
```

`npm install` also builds the popup/sidebar UI bundle (`media/webview.js`, generated and not committed).
Open the folder in VS Code and press **F5** to start an Extension Development Host with Spyglass loaded
(it compiles the extension and bundles the UI first). While you work:

```bash
npm run watch           # recompile the extension (src/*.ts) on save
npm run watch-webview   # rebundle the popup/sidebar UI (src/webview/) on save
```

If you change `src/webview/`, keep `watch-webview` running (or run `npm run bundle-webview`) and reload the
Extension Development Host.

ripgrep comes with `npm install` (`@vscode/ripgrep`); the tests also work with an `rg` on your `PATH`.

## How the code is organised

- `SpyglassController` holds the state, answers the webview's messages and runs the searches.
  `FinderPanel` (the popup) and `SpyglassSidebarProvider` (the sidebar) are thin adapters around it: they
  only decide what "open a file" and "close" mean. Put behaviour in the controller so both get it.
- `src/webview/` is the UI (plain TypeScript, no framework), bundled by esbuild into `media/webview.js`.
  `src/webviewHtml.ts` is its HTML template and `media/webview.css` its styles.
- The webview and the controller talk through messages, listed in `src/types.ts`.
- `src/i18n.ts` holds every user-visible string in English and Chinese.

The [project structure](README.md#project-structure) section of the README lists the files.

## Tests

| Command | What it runs |
|---------|--------------|
| `npm test` | unit tests (vitest, `src/test/`) |
| `npm run test:ui` | UI tests (Playwright, `ui-tests/`); rebuilds the webview bundle first |
| `npm run lint` | ESLint |
| `npm run typecheck` | type-check the extension, the UI tests and the webview (`src/webview/`, which esbuild bundles without checking types) |

The UI tests run the **real** webview bundle in headless Chromium against the **real** `SpyglassController`
and the **real** ripgrep, on a small project in `ui-tests/fixtures/project`. Only the VS Code API is mocked
(`ui-tests/support/vscodeMock.ts`). The first time, install the browser with `npx playwright install chromium`,
or point `SPYGLASS_CHROMIUM` at a Chromium/Chrome binary you already have.

What we expect from a change:

- **A behaviour change comes with tests**, ideally written first: see it fail for the right reason, then
  make it pass. A bug fix starts with a test that reproduces the bug.
- **UI changes get a UI test** (`ui-tests/*.spec.ts`); logic that does not need a browser gets a unit test.
- A test is only worth having if it can fail: break the code on purpose and check that a test notices.

Not covered by tests: `FinderPanel` and `SpyglassSidebarProvider` (opening files, view columns, the popup
staying open). Try those by hand with F5.

## The webview bundle

`media/webview.js` is **generated** from `src/webview/` by esbuild and is not committed (it is in `.gitignore`).
It is rebuilt by `npm install`, by F5, by `npm run test:ui` and when the extension is packaged, so there is
nothing to remember: just never edit it by hand. `media/webview.css` is hand-written and is committed.

## Adding a feature: a checklist

1. A new message between the webview and the controller: add it to `src/types.ts`.
2. Logic that both the popup and the sidebar need: `src/SpyglassController.ts`.
3. UI: `src/webview/` and the template in `src/webviewHtml.ts`.
4. Every new string goes into `src/i18n.ts` for **both** languages (a test checks they have the same keys).
5. A new setting or command goes into `package.json`, and settings into the table in the README. In
   `package.json` write its title or description as a `%key%` (`command.<name>.title`,
   `config.<name>.description`) and add the English text to `package.nls.json` and the Chinese one to
   `package.nls.zh-cn.json` (a test checks that both files are complete). Brand names such as "Spyglass"
   stay as they are.
6. Document it: the README (features, shortcuts table) and, for a shortcut, the overlay text in `src/i18n.ts`.
   Add an entry under `## [Unreleased]` in `CHANGELOG.md`.
7. Tests, as above.

## Pull requests

- Branch from `main` and keep a pull request to one thing.
- Use the prefixes the history already uses in commit messages: `feat:`, `fix:`, `docs:`, `test:`,
  `refactor:`, `chore:`, `style:`.
- CI (lint, type-check, unit and UI tests, packaging) has to pass. Please fill in the pull request template.

## Reporting a bug

Open an issue with the bug report form. What helps most: your Spyglass and VS Code versions, your OS, whether it
happens in the popup or the sidebar, the steps, and what you expected. For a UI problem, the webview's console
is often revealing: run **Developer: Open Webview Developer Tools** from the Command Palette.

## Releasing (maintainers)

1. Bump `version` in `package.json`, and rename `## [Unreleased]` in `CHANGELOG.md` to `## [x.y.z] - YYYY-MM-DD`.
2. Commit, then push a tag `vx.y.z`. The release workflow checks that the tag matches `package.json` and that
   the changelog has notes for it, runs the CI checks and publishes a GitHub Release with the `.vsix` that
   passed them.
3. The same workflow publishes that `.vsix` to the VS Code Marketplace and to Open VSX, using the
   repository secrets `VSCE_PAT` and `OVSX_PAT`. A store whose secret is missing is skipped (the run shows
   a notice), and pre-release tags (`v1.2.3-beta.1`) are not published to the stores.

After an update to a new minor version, users get one notification linking to the changelog, so a good
changelog entry is also the announcement.
