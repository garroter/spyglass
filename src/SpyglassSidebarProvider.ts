import * as vscode from 'vscode';
import { SpyglassController, SpyglassHost } from './SpyglassController';

/** The Activity Bar view: a persistent webview that hosts a SpyglassController. */
export class SpyglassSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'spyglass.sidebarView';

  private _controller?: SpyglassController;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this._context.extensionUri, 'media')],
    };

    // The sidebar stays open: opening a result never closes it, and Esc does nothing.
    const host: SpyglassHost = {
      webview: webviewView.webview,
      openFile: (filePath, line) => this._show(filePath, line, { viewColumn: vscode.ViewColumn.One, preserveFocus: false }),
      openFileInSplit: (filePath, line) => this._show(filePath, line, { viewColumn: vscode.ViewColumn.Beside }),
      close: () => { /* nothing to close */ },
    };

    this._controller?.dispose();
    const controller = new SpyglassController(this._context, host, { sidebarMode: true });
    this._controller = controller;
    controller.refreshActiveContext();
    controller.mount();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        controller.refreshActiveContext();
      }
    });
    webviewView.onDidDispose(() => controller.dispose());
  }

  private async _show(filePath: string, line: number, options: vscode.TextDocumentShowOptions): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, options);
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showErrorMessage(`Spyglass: Could not open file ${filePath}`);
    }
  }
}
