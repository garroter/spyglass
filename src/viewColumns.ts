export const ACTIVE_COLUMN = -1; // vscode.ViewColumn.Active

export interface FileOpenPlan {
  movePanelBeside: boolean;
  fileTargetColumn: number;
}

// When the popup should stay open, the opened document must never land in the
// webview's own editor group — a group holds one thing, so opening a file there
// would dispose the webview. The panel therefore moves beside whenever it shares
// the origin column (or its column is unknown). The file always goes to the column
// the user's editor was in before Spyglass took focus.
export function planFileOpen(panelColumn: number | undefined, originColumn: number): FileOpenPlan {
  const movePanelBeside =
    panelColumn === undefined || panelColumn === ACTIVE_COLUMN || panelColumn === originColumn;
  return { movePanelBeside, fileTargetColumn: originColumn };
}