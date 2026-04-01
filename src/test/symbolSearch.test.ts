import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (p: string) => ({ fsPath: p }) },
  commands: { executeCommand: vi.fn() },
  SymbolKind: {
    File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4,
    Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9,
    Interface: 10, Function: 11, Variable: 12, Constant: 13,
    String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18,
    Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23,
    Operator: 24, TypeParameter: 25,
  },
}));

import { flattenDocSymbols, KIND_LABELS, SymbolLike } from '../symbolSearch';

const sym = (
  name: string,
  kind: number,
  line: number,
  children?: SymbolLike[],
): SymbolLike => ({
  name,
  kind,
  selectionRange: { start: { line } },
  children,
});

describe('KIND_LABELS', () => {
  it('maps well-known kinds to readable labels', () => {
    expect(KIND_LABELS[4]).toBe('class');
    expect(KIND_LABELS[11]).toBe('function');
    expect(KIND_LABELS[12]).toBe('variable');
    expect(KIND_LABELS[5]).toBe('method');
    expect(KIND_LABELS[10]).toBe('interface');
    expect(KIND_LABELS[13]).toBe('constant');
  });

  it('covers all 26 standard LSP kinds (0–25)', () => {
    for (let i = 0; i <= 25; i++) {
      expect(KIND_LABELS[i], `kind ${i} should have a label`).toBeTruthy();
    }
  });
});

describe('flattenDocSymbols — basic', () => {
  const FILE = '/workspace/src/foo.ts';
  const REL  = 'src/foo.ts';

  it('returns empty array for empty symbol list', () => {
    expect(flattenDocSymbols([], FILE, REL)).toEqual([]);
  });

  it('maps a single top-level symbol', () => {
    const result = flattenDocSymbols([sym('myFn', 11, 4)], FILE, REL);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      name: 'myFn',
      kindLabel: 'function',
      file: FILE,
      relativePath: REL,
      line: 5,          // selectionRange line is 0-based, result is 1-based
      container: undefined,
    });
  });

  it('converts 0-based line to 1-based', () => {
    const result = flattenDocSymbols([sym('foo', 11, 0)], FILE, REL);
    expect(result[0].line).toBe(1);
  });

  it('uses "symbol" as fallback for unknown kind', () => {
    const result = flattenDocSymbols([sym('x', 999, 0)], FILE, REL);
    expect(result[0].kindLabel).toBe('symbol');
  });

  it('handles multiple top-level symbols preserving order', () => {
    const result = flattenDocSymbols([
      sym('Alpha', 4, 0),
      sym('beta', 11, 10),
      sym('GAMMA', 12, 20),
    ], FILE, REL);
    expect(result.map(r => r.name)).toEqual(['Alpha', 'beta', 'GAMMA']);
  });
});

describe('flattenDocSymbols — nested children', () => {
  const FILE = '/proj/a.ts';
  const REL  = 'a.ts';

  it('flattens one level of children', () => {
    const root = sym('MyClass', 4, 0, [
      sym('constructor', 8, 2),
      sym('doThing', 5, 5),
    ]);
    const result = flattenDocSymbols([root], FILE, REL);
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('MyClass');
    expect(result[1].name).toBe('constructor');
    expect(result[2].name).toBe('doThing');
  });

  it('sets container to parent name for direct children', () => {
    const root = sym('MyClass', 4, 0, [sym('method', 5, 3)]);
    const result = flattenDocSymbols([root], FILE, REL);
    expect(result[0].container).toBeUndefined();
    expect(result[1].container).toBe('MyClass');
  });

  it('sets container to immediate parent (not grandparent) for grandchildren', () => {
    const root = sym('Outer', 4, 0, [
      sym('Inner', 4, 2, [
        sym('deepMethod', 5, 4),
      ]),
    ]);
    const result = flattenDocSymbols([root], FILE, REL);
    expect(result[0].name).toBe('Outer');
    expect(result[0].container).toBeUndefined();
    expect(result[1].name).toBe('Inner');
    expect(result[1].container).toBe('Outer');
    expect(result[2].name).toBe('deepMethod');
    expect(result[2].container).toBe('Inner');   // NOT 'Outer'
  });

  it('handles sibling classes with their own children independently', () => {
    const syms = [
      sym('ClassA', 4, 0, [sym('methodA', 5, 1)]),
      sym('ClassB', 4, 10, [sym('methodB', 5, 11)]),
    ];
    const result = flattenDocSymbols(syms, FILE, REL);
    expect(result).toHaveLength(4);
    expect(result[1].container).toBe('ClassA');
    expect(result[3].container).toBe('ClassB');
  });

  it('handles symbols with no children gracefully', () => {
    const result = flattenDocSymbols([sym('lone', 12, 0, undefined)], FILE, REL);
    expect(result).toHaveLength(1);
  });

  it('handles symbols with empty children array', () => {
    const result = flattenDocSymbols([sym('lone', 12, 0, [])], FILE, REL);
    expect(result).toHaveLength(1);
  });
});

describe('flattenDocSymbols — file/path fields', () => {
  it('sets file and relativePath on all results including children', () => {
    const root = sym('A', 4, 0, [sym('b', 5, 1)]);
    const result = flattenDocSymbols([root], '/abs/path.ts', 'rel/path.ts');
    for (const r of result) {
      expect(r.file).toBe('/abs/path.ts');
      expect(r.relativePath).toBe('rel/path.ts');
    }
  });
});
