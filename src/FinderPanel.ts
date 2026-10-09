import * as vscode from 'vscode';
import * as path from 'path';
import { isRipgrepAvailable } from './ripgrep';
import { getUiStrings } from './i18n';
import { planFileOpen } from './viewColumns';
import { ActiveContext, SpyglassController, SpyglassHost } from './SpyglassController';
import { Scope } from './types';

interface PanelInit {
  initialQuery: string;
  /** Open in this scope instead of the remembered one (a "Find …" command). */
  initialScope?: Scope;
  active: ActiveContext;
  /** Keep the popup open after a result is opened (closeOnSelect off, or openExternalWindow). */
  persistent: boolean;
  /** Editor column that had focus before Spyglass opened. */
  originColumn: vscode.ViewColumn;
}

function activeContextOf(editor: vscode.TextEditor | undefined): ActiveContext {
  const file = editor?.document.uri.fsPath ?? '';
  return {
    dir: file ? path.dirname(file) : '',
    file,
    line: editor?.selection.active.line ?? 0,
    character: editor?.selection.active.character ?? 0,
  };
}

/** The popup: a webview editor tab that hosts a SpyglassController. */
export class FinderPanel implements SpyglassHost {
  public static currentPanel: FinderPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _controller: SpyglassController;
  private readonly _disposables: vscode.Disposable[] = [];
  private readonly _persistent: boolean;
  private readonly _originColumn: vscode.ViewColumn;

  /** Opens the popup, or brings the open one forward. `scope` starts it in that scope (or switches to it). */
  public static async createOrShow(context: vscode.ExtensionContext, scope?: Scope, options?: { directory?: string }): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const selectedText = editor && !editor.selection.isEmpty
      ? editor.document.getText(editor.selection).trim().split('\n')[0].trim()
      : '';

    if (FinderPanel.currentPanel) {
      const open = FinderPanel.currentPanel;
      open._panel.reveal();
      if (scope) {
        // "Dir", "Doc" and "Refs" work from the editor the command was run in, which may have changed
        if (editor) { open._controller.setActiveContext(activeContextOf(editor)); }
        if (options?.directory) { open._controller.setActiveDirectory(options.directory); }
        open._controller.showScope(scope);
      }
      if (selectedText) {
        open._controller.post({ type: 'setQuery', query: selectedText });
      } else {
        open._controller.post({ type: 'focus' });
      }
      return;
    }

    const rgOk = await isRipgrepAvailable(context);
    if (!rgOk) {
      const s = getUiStrings();
      vscode.window.showErrorMessage(s.ripgrepNotFound, s.openSettings).then(sel => {
        if (sel === s.openSettings) { vscode.commands.executeCommand('workbench.action.openSettings', 'spyglass.ripgrepPath'); }
      });
      return;
    }

    const config = vscode.workspace.getConfiguration('spyglass');
    const openOnSide = config.get<boolean>('openOnSide', false);
    const openExternal = config.get<boolean>('openExternalWindow', false);
    const closeOnSelect = config.get<boolean>('closeOnSelect', true);
    const originColumn = editor?.viewColumn ?? vscode.ViewColumn.One;
    const panel = vscode.window.createWebviewPanel(
      'spyglass',
      'Spyglass',
      { viewColumn: openOnSide || openExternal ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );

    FinderPanel.currentPanel = new FinderPanel(panel, context, {
      initialQuery: selectedText,
      initialScope: scope,
      active: options?.directory ? { ...activeContextOf(editor), dir: options.directory } : activeContextOf(editor),
      persistent: openExternal || !closeOnSelect,
      originColumn,
    });
  }

  private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, init: PanelInit) {
    this._panel = panel;
    this._persistent = init.persistent;
    this._originColumn = init.originColumn;

    this._controller = new SpyglassController(context, this, { sidebarMode: false, initialQuery: init.initialQuery, initialScope: init.initialScope });
    this._controller.setActiveContext(init.active);
    this._controller.mount();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public get webview(): vscode.Webview {
    return this._panel.webview;
  }

  public close(): void {
    this.dispose();
  }

  public async openFile(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = this._persistent
        ? await this._showDocumentAwayFromPanel(doc)
        : await vscode.window.showTextDocument(doc);
      if (!this._persistent) { this.dispose(); }
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch {
      vscode.window.showErrorMessage(`Finder: Could not open file ${filePath}`);
    }
  }

  public async openFileInSplit(filePath: string, line: number): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      const pos = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      if (!this._persistent) { this.dispose(); }
    } catch {
      vscode.window.showErrorMessage(`Finder: Could not open file ${filePath}`);
    }
  }

  // Opening a text document in the webview's own editor group disposes the
  // webview, so in persistent mode the panel is moved to a Beside group and the
  // file opens in the column the editor was in before Spyglass took focus.
  private async _showDocumentAwayFromPanel(doc: vscode.TextDocument): Promise<vscode.TextEditor> {
    const plan = planFileOpen(this._panel.viewColumn, this._originColumn);
    if (plan.movePanelBeside) {
      this._panel.reveal(vscode.ViewColumn.Beside, true);
    }
    return vscode.window.showTextDocument(doc, { viewColumn: plan.fileTargetColumn as vscode.ViewColumn });
  }

  public dispose(): void {
    FinderPanel.currentPanel = undefined;
    this._controller.dispose();
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
    this._disposables.length = 0;
  }
}
