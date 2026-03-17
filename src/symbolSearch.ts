import * as vscode from 'vscode';
import { SymbolResult } from './types';

const KIND_LABELS: Record<number, string> = {
  [vscode.SymbolKind.File]: 'file',
  [vscode.SymbolKind.Module]: 'module',
  [vscode.SymbolKind.Namespace]: 'namespace',
  [vscode.SymbolKind.Package]: 'package',
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Property]: 'property',
  [vscode.SymbolKind.Field]: 'field',
  [vscode.SymbolKind.Constructor]: 'constructor',
  [vscode.SymbolKind.Enum]: 'enum',
  [vscode.SymbolKind.Interface]: 'interface',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Variable]: 'variable',
  [vscode.SymbolKind.Constant]: 'constant',
  [vscode.SymbolKind.String]: 'string',
  [vscode.SymbolKind.Number]: 'number',
  [vscode.SymbolKind.Boolean]: 'boolean',
  [vscode.SymbolKind.Array]: 'array',
  [vscode.SymbolKind.Object]: 'object',
  [vscode.SymbolKind.Key]: 'key',
  [vscode.SymbolKind.Null]: 'null',
  [vscode.SymbolKind.EnumMember]: 'enum member',
  [vscode.SymbolKind.Struct]: 'struct',
  [vscode.SymbolKind.Event]: 'event',
  [vscode.SymbolKind.Operator]: 'operator',
  [vscode.SymbolKind.TypeParameter]: 'type param',
};

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
