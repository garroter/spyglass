import * as vscode from 'vscode';
import { FinderPanel } from './FinderPanel';
import { SpyglassSidebarProvider } from './SpyglassSidebarProvider';
import { ensureRipgrepPath } from './ripgrep';
import { SCOPE_COMMANDS, scopeFromCommandArg, directoryFromCommandArg } from './scopeCommands';
import { announceIfUpdated, showWhatsNew } from './whatsNew';
import { recordRecentFile } from './recentFiles';

function pushRecent(context: vscode.ExtensionContext, fsPath: string): void {
  void recordRecentFile(context.workspaceState, fsPath);
}

export function activate(context: vscode.ExtensionContext): void {
  // Kick off in the background so it's usually already resolved by the time the user
  // opens Spyglass, instead of waiting until then to discover rg needs to be downloaded.
  void ensureRipgrepPath(context);

  // Seed with the currently active file
  const active = vscode.window.activeTextEditor;
  if (active?.document.uri.scheme === 'file') {
    pushRecent(context, active.document.uri.fsPath);
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor?.document.uri.scheme === 'file') {
        pushRecent(context, editor.document.uri.fsPath);
      }
    })
  );

  // In a keybinding, `"args": { "scope": "files" }` opens Spyglass in that scope.
  const cmd = vscode.commands.registerCommand('spyglass.open', (arg?: unknown) => {
    FinderPanel.createOrShow(context, scopeFromCommandArg(arg));
  });
  context.subscriptions.push(cmd);

  for (const { command, scope } of SCOPE_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => FinderPanel.createOrShow(context, scope))
    );
  }

  // From the Explorer's folder menu: the "Dir" scope, on that folder.
  context.subscriptions.push(
    vscode.commands.registerCommand('spyglass.findInFolder', (folder?: unknown) => {
      const directory = directoryFromCommandArg(folder);
      return FinderPanel.createOrShow(context, 'here', directory ? { directory } : undefined);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('spyglass.showWhatsNew', () => showWhatsNew(context))
  );

  // Reopens the popup on the last query, scope and selected result, like :Telescope resume.
  context.subscriptions.push(
    vscode.commands.registerCommand('spyglass.resume', () => FinderPanel.createOrShow(context, undefined, { resume: true }))
  );
  // Bound (in package.json) to keys the Spyglass page handles itself, such as Ctrl+P / Ctrl+J: a
  // webview also hands every key press on to VS Code, which would otherwise open Quick Open etc.
  context.subscriptions.push(
    vscode.commands.registerCommand('spyglass.keyHandledInWebview', () => undefined)
  );
  // Once after an update to a new minor/major version, not on a fresh install.
  void announceIfUpdated(context);

  const sidebarCmd = vscode.commands.registerCommand('spyglass.focusSidebar', () => {
    vscode.commands.executeCommand('workbench.view.extension.spyglass-sidebar');
  });
  context.subscriptions.push(sidebarCmd);

  const sidebarProvider = new SpyglassSidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SpyglassSidebarProvider.viewType,
      sidebarProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

export function deactivate(): void {}
