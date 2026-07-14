import * as https from 'https';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';

// Mirrors the target-triple/version mapping @vscode/ripgrep's own postinstall script uses.
// Needed here because the rg binary bundled in our VSIX was downloaded on the publisher's
// machine (one platform/arch only) and won't run on every user's platform/arch — this lets
// us self-heal by fetching the right binary for whoever is actually running the extension.
const RIPGREP_VERSION = 'v15.0.0';
const MULTI_ARCH_LINUX_VERSION = 'v13.0.0-4';
const REPO = 'microsoft/ripgrep-prebuilt';

export function getTarget(platform: NodeJS.Platform = os.platform(), arch: string = os.arch()): string | undefined {
  switch (platform) {
    case 'darwin':
      return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
    case 'win32':
      return arch === 'x64' ? 'x86_64-pc-windows-msvc'
        : arch === 'arm64' ? 'aarch64-pc-windows-msvc'
        : 'i686-pc-windows-msvc';
    case 'linux':
      return arch === 'x64' ? 'x86_64-unknown-linux-musl'
        : arch === 'arm' ? 'arm-unknown-linux-gnueabihf'
        : arch === 'arm64' ? 'aarch64-unknown-linux-musl'
        : arch === 'ppc64' ? 'powerpc64le-unknown-linux-gnu'
        : arch === 'riscv64' ? 'riscv64gc-unknown-linux-gnu'
        : arch === 's390x' ? 's390x-unknown-linux-gnu'
        : 'i686-unknown-linux-musl';
    default:
      return undefined;
  }
}

export function versionFor(target: string): string {
  return target === 'arm-unknown-linux-gnueabihf'
    || target === 'powerpc64le-unknown-linux-gnu'
    || target === 's390x-unknown-linux-gnu'
    ? MULTI_ARCH_LINUX_VERSION
    : RIPGREP_VERSION;
}

function get(url: string, redirectsLeft = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'spyglass-vscode-extension' } }, res => {
      if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirectsLeft <= 0) { reject(new Error('Too many redirects')); return; }
        get(res.headers.location, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed with status ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function extract(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Unix assets are .tar.gz (system tar handles them); Windows assets are .zip
    // (Expand-Archive avoids pulling in a zip-extraction dependency just for this).
    const proc = process.platform === 'win32'
      ? spawn('powershell.exe', [
          '-NoProfile', '-NonInteractive', '-Command',
          `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${destDir}' -Force`,
        ])
      : spawn('tar', ['xzf', archivePath, '-C', destDir]);
    proc.on('error', reject);
    proc.on('close', code => (code === 0 ? resolve() : reject(new Error(`extract exited with ${code}`))));
  });
}

export function testRgPath(rgPath: string): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const proc = spawn(rgPath, ['--version']);
      proc.on('error', () => resolve(false));
      proc.on('close', code => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}

export async function downloadRipgrep(destDir: string): Promise<string | undefined> {
  const target = getTarget();
  if (!target) { return undefined; }

  const ext = process.platform === 'win32' ? '.exe' : '';
  const binPath = path.join(destDir, `rg${ext}`);
  if (fs.existsSync(binPath) && (await testRgPath(binPath))) { return binPath; }

  const version = versionFor(target);
  const assetExt = process.platform === 'win32' ? 'zip' : 'tar.gz';
  const assetName = `ripgrep-${version}-${target}.${assetExt}`;
  const url = `https://github.com/${REPO}/releases/download/${version}/${assetName}`;
  const archivePath = path.join(os.tmpdir(), assetName);

  try {
    await fs.promises.mkdir(destDir, { recursive: true });
    const data = await get(url);
    await fs.promises.writeFile(archivePath, data);
    await extract(archivePath, destDir);
    if (process.platform !== 'win32') { await fs.promises.chmod(binPath, 0o755); }
    return (await testRgPath(binPath)) ? binPath : undefined;
  } catch (err) {
    console.error('Spyglass: failed to auto-download ripgrep', err);
    return undefined;
  } finally {
    fs.promises.unlink(archivePath).catch(() => {});
  }
}
