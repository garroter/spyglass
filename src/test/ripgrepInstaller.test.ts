import { describe, it, expect } from 'vitest';
import { getTarget, versionFor, testRgPath } from '../ripgrepInstaller';

describe('getTarget — darwin', () => {
  it('maps arm64 to aarch64-apple-darwin', () => {
    expect(getTarget('darwin', 'arm64')).toBe('aarch64-apple-darwin');
  });

  it('maps x64 to x86_64-apple-darwin', () => {
    expect(getTarget('darwin', 'x64')).toBe('x86_64-apple-darwin');
  });

  it('falls back to x86_64-apple-darwin for unknown darwin arch', () => {
    expect(getTarget('darwin', 'ia32')).toBe('x86_64-apple-darwin');
  });
});

describe('getTarget — win32', () => {
  it('maps x64 to x86_64-pc-windows-msvc', () => {
    expect(getTarget('win32', 'x64')).toBe('x86_64-pc-windows-msvc');
  });

  it('maps arm64 to aarch64-pc-windows-msvc', () => {
    expect(getTarget('win32', 'arm64')).toBe('aarch64-pc-windows-msvc');
  });

  it('falls back to i686-pc-windows-msvc for other archs', () => {
    expect(getTarget('win32', 'ia32')).toBe('i686-pc-windows-msvc');
  });
});

describe('getTarget — linux', () => {
  it('maps x64 to x86_64-unknown-linux-musl', () => {
    expect(getTarget('linux', 'x64')).toBe('x86_64-unknown-linux-musl');
  });

  it('maps arm64 to aarch64-unknown-linux-musl', () => {
    expect(getTarget('linux', 'arm64')).toBe('aarch64-unknown-linux-musl');
  });

  it('maps arm to arm-unknown-linux-gnueabihf', () => {
    expect(getTarget('linux', 'arm')).toBe('arm-unknown-linux-gnueabihf');
  });

  it('maps ppc64 to powerpc64le-unknown-linux-gnu', () => {
    expect(getTarget('linux', 'ppc64')).toBe('powerpc64le-unknown-linux-gnu');
  });

  it('maps riscv64 to riscv64gc-unknown-linux-gnu', () => {
    expect(getTarget('linux', 'riscv64')).toBe('riscv64gc-unknown-linux-gnu');
  });

  it('maps s390x to s390x-unknown-linux-gnu', () => {
    expect(getTarget('linux', 's390x')).toBe('s390x-unknown-linux-gnu');
  });

  it('falls back to i686-unknown-linux-musl for unknown arch', () => {
    expect(getTarget('linux', 'mips')).toBe('i686-unknown-linux-musl');
  });
});

describe('getTarget — unsupported platform', () => {
  it('returns undefined for platforms with no prebuilt (e.g. sunos)', () => {
    expect(getTarget('sunos', 'x64')).toBeUndefined();
  });
});

describe('versionFor', () => {
  it('uses the multi-arch linux release for arm-unknown-linux-gnueabihf', () => {
    expect(versionFor('arm-unknown-linux-gnueabihf')).toBe('v13.0.0-4');
  });

  it('uses the multi-arch linux release for powerpc64le-unknown-linux-gnu', () => {
    expect(versionFor('powerpc64le-unknown-linux-gnu')).toBe('v13.0.0-4');
  });

  it('uses the multi-arch linux release for s390x-unknown-linux-gnu', () => {
    expect(versionFor('s390x-unknown-linux-gnu')).toBe('v13.0.0-4');
  });

  it('uses the default version for every other target', () => {
    expect(versionFor('x86_64-unknown-linux-musl')).toBe('v15.0.0');
    expect(versionFor('aarch64-apple-darwin')).toBe('v15.0.0');
    expect(versionFor('x86_64-pc-windows-msvc')).toBe('v15.0.0');
  });
});

describe('testRgPath', () => {
  it('resolves true for a binary that runs and exits 0', async () => {
    // process.execPath (node itself) always exists and `node --version` exits 0 —
    // avoids depending on rg being installed on the machine running the tests.
    await expect(testRgPath(process.execPath)).resolves.toBe(true);
  });

  it('resolves false for a path that does not exist', async () => {
    await expect(testRgPath('/no/such/binary-xyz')).resolves.toBe(false);
  });
});
