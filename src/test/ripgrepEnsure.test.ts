import { describe, it, expect, vi, beforeEach } from 'vitest';

const withProgress = vi.fn((_opts: unknown, task: () => Promise<unknown>) => task());
const getConfig = vi.fn();

vi.mock('vscode', () => ({
  env: { appRoot: '/mock/vscode' },
  workspace: {
    getConfiguration: () => ({ get: getConfig }),
  },
  window: { withProgress },
  ProgressLocation: { Notification: 1 },
}));

const existsSync = vi.fn();
vi.mock('fs', () => ({
  existsSync,
  promises: { mkdir: vi.fn(), writeFile: vi.fn(), chmod: vi.fn(), unlink: vi.fn() },
}));

const testRgPath = vi.fn();
const downloadRipgrep = vi.fn();
vi.mock('../ripgrepInstaller', () => ({ testRgPath, downloadRipgrep }));

const fakeContext = {
  globalStorageUri: { fsPath: '/mock/storage' },
} as unknown as import('vscode').ExtensionContext;

// Module-level cache (resolvedRgPath / downloadAttempted) lives inside ripgrep.ts, so each
// test needs a fresh module instance — otherwise state from one test leaks into the next.
async function loadEnsureRipgrepPath() {
  vi.resetModules();
  const mod = await import('../ripgrep');
  return mod.ensureRipgrepPath;
}

beforeEach(() => {
  withProgress.mockClear();
  getConfig.mockReset();
  existsSync.mockReset();
  testRgPath.mockReset();
  downloadRipgrep.mockReset();
});

describe('ensureRipgrepPath — configured override', () => {
  it('trusts spyglass.ripgrepPath and reports its own test result without probing candidates', async () => {
    getConfig.mockReturnValue('/custom/rg');
    testRgPath.mockResolvedValue(true);
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    const ok = await ensureRipgrepPath(fakeContext);

    expect(ok).toBe(true);
    expect(testRgPath).toHaveBeenCalledWith('/custom/rg');
    expect(existsSync).not.toHaveBeenCalled();
    expect(downloadRipgrep).not.toHaveBeenCalled();
  });

  it('surfaces failure when the configured path does not work', async () => {
    getConfig.mockReturnValue('/custom/broken-rg');
    testRgPath.mockResolvedValue(false);
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    await expect(ensureRipgrepPath(fakeContext)).resolves.toBe(false);
    expect(downloadRipgrep).not.toHaveBeenCalled();
  });
});

describe('ensureRipgrepPath — candidate discovery', () => {
  it('uses the first existing candidate that passes testRgPath, without downloading', async () => {
    getConfig.mockReturnValue(undefined);
    existsSync.mockReturnValue(true);
    testRgPath.mockResolvedValue(true);
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    const ok = await ensureRipgrepPath(fakeContext);

    expect(ok).toBe(true);
    expect(downloadRipgrep).not.toHaveBeenCalled();
  });

  it('skips candidates that exist but fail the version check', async () => {
    getConfig.mockReturnValue(undefined);
    existsSync.mockReturnValue(true);
    testRgPath
      .mockResolvedValueOnce(false) // vscode/node_modules candidate
      .mockResolvedValueOnce(false) // asar.unpacked candidate
      .mockResolvedValueOnce(true); // downloaded-cache candidate
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    const ok = await ensureRipgrepPath(fakeContext);

    expect(ok).toBe(true);
    expect(downloadRipgrep).not.toHaveBeenCalled();
  });
});

describe('ensureRipgrepPath — auto-download fallback', () => {
  it('downloads rg only after every candidate fails, showing a progress notification', async () => {
    getConfig.mockReturnValue(undefined);
    existsSync.mockReturnValue(false);
    testRgPath.mockResolvedValue(false);
    downloadRipgrep.mockResolvedValue('/mock/storage/ripgrep-bin/rg');
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    const ok = await ensureRipgrepPath(fakeContext);

    expect(ok).toBe(true);
    expect(downloadRipgrep).toHaveBeenCalledTimes(1);
    expect(downloadRipgrep).toHaveBeenCalledWith('/mock/storage/ripgrep-bin');
    expect(withProgress).toHaveBeenCalledTimes(1);
  });

  it('returns false when download fails, and does not retry within the same session', async () => {
    getConfig.mockReturnValue(undefined);
    existsSync.mockReturnValue(false);
    testRgPath.mockResolvedValue(false);
    downloadRipgrep.mockResolvedValue(undefined);
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    await expect(ensureRipgrepPath(fakeContext)).resolves.toBe(false);
    await expect(ensureRipgrepPath(fakeContext)).resolves.toBe(false);

    expect(downloadRipgrep).toHaveBeenCalledTimes(1);
  });
});

describe('ensureRipgrepPath — caching', () => {
  it('does not re-probe candidates once a working path has been resolved', async () => {
    getConfig.mockReturnValue(undefined);
    existsSync.mockReturnValue(true);
    testRgPath.mockResolvedValue(true);
    const ensureRipgrepPath = await loadEnsureRipgrepPath();

    await ensureRipgrepPath(fakeContext);
    testRgPath.mockClear();
    existsSync.mockClear();

    const ok = await ensureRipgrepPath(fakeContext);

    expect(ok).toBe(true);
    expect(testRgPath).not.toHaveBeenCalled();
    expect(existsSync).not.toHaveBeenCalled();
  });
});
