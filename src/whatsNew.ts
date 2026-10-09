import * as vscode from 'vscode';
import { getUiStrings } from './i18n';

const LAST_SEEN_KEY = 'spyglass.lastSeenVersion';

export function parseVersion(version: string): [number, number, number] | undefined {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/**
 * True when the extension was updated to a newer minor or major version. Not for a fresh install
 * (nothing to compare with), a patch release, a restart on the same version or a downgrade.
 */
export function shouldAnnounce(previous: string | undefined, current: string): boolean {
  if (previous === undefined) { return false; }
  const before = parseVersion(previous);
  const now = parseVersion(current);
  if (!before || !now) { return false; }
  return now[0] > before[0] || (now[0] === before[0] && now[1] > before[1]);
}

// vsce packages CHANGELOG.md as lower-case changelog.md; the repository (F5) has CHANGELOG.md.
// Names are case-sensitive on Linux, so look for both.
const CHANGELOG_NAMES = ['changelog.md', 'CHANGELOG.md'];

/** Opens the CHANGELOG that ships with the extension. */
export async function showWhatsNew(context: vscode.ExtensionContext): Promise<void> {
  let changelog = vscode.Uri.joinPath(context.extensionUri, CHANGELOG_NAMES[0]);
  for (const name of CHANGELOG_NAMES) {
    const uri = vscode.Uri.joinPath(context.extensionUri, name);
    try {
      await vscode.workspace.fs.stat(uri);
      changelog = uri;
      break;
    } catch { /* try the next name */ }
  }
  await vscode.commands.executeCommand('markdown.showPreview', changelog);
}

/**
 * After an update to a new minor/major version, shows one notification linking to the changelog.
 * The version is remembered first, so a dismissed message is not shown again.
 */
export async function announceIfUpdated(context: vscode.ExtensionContext): Promise<void> {
  const current = context.extension.packageJSON.version as string;
  const previous = context.globalState.get<string>(LAST_SEEN_KEY);
  await context.globalState.update(LAST_SEEN_KEY, current);

  if (!shouldAnnounce(previous, current)) { return; }
  const config = vscode.workspace.getConfiguration('spyglass');
  if (!config.get<boolean>('showWhatsNew', true)) { return; }

  const s = getUiStrings();
  const choice = await vscode.window.showInformationMessage(
    s.whatsNewMessage.replace('{version}', current), s.whatsNewAction, s.dontShowAgain,
  );
  if (choice === s.whatsNewAction) {
    await showWhatsNew(context);
  } else if (choice === s.dontShowAgain) {
    await config.update('showWhatsNew', false, vscode.ConfigurationTarget.Global);
  }
}
