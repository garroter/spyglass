import * as vscode from 'vscode';
import { FinderPanel } from './FinderPanel';

export function activate(context: vscode.ExtensionContext): void {
  const cmd = vscode.commands.registerCommand('finder.open', () => {
    FinderPanel.createOrShow(context);
  });

  context.subscriptions.push(cmd);
}

export function deactivate(): void {}
