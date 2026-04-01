import * as vscode from 'vscode';
import { SymbolResult } from './types';

// LSP SymbolKind numeric values (identical to vscode.SymbolKind — stable constants)
export const KIND_LABELS: Record<number, string> = {
  0: 'file', 1: 'module', 2: 'namespace', 3: 'package',
  4: 'class', 5: 'method', 6: 'property', 7: 'field',
  8: 'constructor', 9: 'enum', 10: 'interface', 11: 'function',
  12: 'variable', 13: 'constant', 14: 'string', 15: 'number',
  16: 'boolean', 17: 'array', 18: 'object', 19: 'key',
  20: 'null', 21: 'enum member', 22: 'struct', 23: 'event',
  24: 'operator', 25: 'type param',
};

export interface SymbolLike {
  name: string;
  kind: number;
  selectionRange: { start: { line: number } };
  children?: SymbolLike[];
}

export function flattenDocSymbols(
  symbols: SymbolLike[],
  filePath: string,
  relativePath: string,
): SymbolResult[] {
  const results: SymbolResult[] = [];
  function flatten(syms: SymbolLike[], container?: string): void {
    for (const s of syms) {
      results.push({
        name: s.name,
        kindLabel: KIND_LABELS[s.kind] ?? 'symbol',
        file: filePath,
        relativePath,
        line: s.selectionRange.start.line + 1,
        container,
      });
      if (s.children?.length) { flatten(s.children, s.name); }
    }
  }
  flatten(symbols);
  return results;
}

export async function runDocSymbolSearch(
  filePath: string,
  makeRelative: (filePath: string) => string
): Promise<SymbolResult[]> {
  const uri = vscode.Uri.file(filePath);
  const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider', uri
  );
  if (!symbols?.length) { return []; }
  return flattenDocSymbols(symbols, filePath, makeRelative(filePath)).slice(0, 500);
}

export async function runSymbolSearch(
  query: string,
  makeRelative: (filePath: string) => string
): Promise<SymbolResult[]> {
  const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    'vscode.executeWorkspaceSymbolProvider', query
  );
  return (symbols || []).slice(0, 200).map(s => ({
    name: s.name,
    kindLabel: KIND_LABELS[s.kind] ?? 'symbol',
    file: s.location.uri.fsPath,
    relativePath: makeRelative(s.location.uri.fsPath),
    line: s.location.range.start.line + 1,
    container: s.containerName || undefined,
  }));
}
