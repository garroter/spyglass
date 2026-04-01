import * as vscode from 'vscode';
import { FinderPanel } from './FinderPanel';
import { SpyglassSidebarProvider } from './SpyglassSidebarProvider';

const MAX_RECENT = 100;
const RECENT_KEY = 'spyglass.recentFiles';

function pushRecent(context: vscode.ExtensionContext, fsPath: string): void {
  const list = context.workspaceState.get<string[]>(RECENT_KEY, []);
  const updated = [fsPath, ...list.filter(p => p !== fsPath)].slice(0, MAX_RECENT);
  context.workspaceState.update(RECENT_KEY, updated);
}

export function activate(context: vscode.ExtensionContext): void {
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

  const cmd = vscode.commands.registerCommand('spyglass.open', () => {
    FinderPanel.createOrShow(context);
  });
  context.subscriptions.push(cmd);

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
