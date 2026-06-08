import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { isNewer } from './semver';

const RELEASES_API =
  'https://api.github.com/repos/AndriyFit/claude-command-deck/releases/latest';

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  assets: ReleaseAsset[];
}

/**
 * Checks GitHub releases for a newer version and, with the user's consent,
 * downloads the .vsix and installs it via the built-in install command.
 * Fail-open: any error is swallowed (no update is not an error to surface).
 */
export async function checkForUpdate(
  currentVersion: string,
  opts: { silent?: boolean } = {},
): Promise<void> {
  let release: Release;
  try {
    const res = await fetch(RELEASES_API, {
      headers: { 'User-Agent': 'claude-command-deck', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    release = (await res.json()) as Release;
  } catch {
    if (!opts.silent) {
      vscode.window.showWarningMessage('Command Deck: не вдалося перевірити оновлення.');
    }
    return;
  }

  const latest = (release.tag_name || '').replace(/^v/, '');
  if (!latest || !isNewer(latest, currentVersion)) {
    if (!opts.silent) {
      vscode.window.showInformationMessage(`Command Deck: вже остання версія (${currentVersion}).`);
    }
    return;
  }

  const asset = (release.assets || []).find(a => a.name.endsWith('.vsix'));
  if (!asset) return;

  const choice = await vscode.window.showInformationMessage(
    `Command Deck ${latest} доступний (у вас ${currentVersion}).`,
    'Оновити',
    'Пізніше',
  );
  if (choice !== 'Оновити') return;

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Оновлення Command Deck до ${latest}...` },
    async () => {
      const dl = await fetch(asset.browser_download_url, {
        headers: { 'User-Agent': 'claude-command-deck' },
      });
      if (!dl.ok) throw new Error(`download HTTP ${dl.status}`);
      const buf = Buffer.from(await dl.arrayBuffer());
      const tmp = path.join(os.tmpdir(), asset.name);
      fs.writeFileSync(tmp, buf);
      await vscode.commands.executeCommand(
        'workbench.extensions.installExtension',
        vscode.Uri.file(tmp),
      );
    },
  );

  const reload = await vscode.window.showInformationMessage(
    `Command Deck оновлено до ${latest}. Перезавантажити вікно?`,
    'Перезавантажити',
  );
  if (reload === 'Перезавантажити') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}
