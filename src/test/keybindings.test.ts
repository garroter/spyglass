import { describe, it, expect } from 'vitest';
import pkg from '../../package.json';

type Keybinding = {
  command: string;
  key: string;
  mac?: string;
  when?: string;
};

const keybindings = pkg.contributes.keybindings as Keybinding[];

describe('spyglass.open keybindings', () => {
  it('binds ctrl+alt+f / cmd+alt+f', () => {
    const binding = keybindings.find(
      (kb) => kb.command === 'spyglass.open' && kb.key === 'ctrl+alt+f'
    );
    expect(binding).toBeDefined();
    expect(binding?.mac).toBe('cmd+alt+f');
  });

  it('binds the JetBrains-style double-tap shift shift', () => {
    const binding = keybindings.find(
      (kb) => kb.command === 'spyglass.open' && kb.key === 'shift shift'
    );
    expect(binding).toBeDefined();
    expect(binding?.when).toBe('!inputFocus || editorTextFocus');
  });

  it('has no two bindings sharing the same key for the same command', () => {
    const seen = new Set<string>();
    for (const kb of keybindings) {
      const id = `${kb.command}::${kb.key}`;
      expect(seen.has(id), `duplicate keybinding: ${id}`).toBe(false);
      seen.add(id);
    }
  });
});
