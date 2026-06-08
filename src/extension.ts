import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { scan } from './scanner';
import { translate, TranslateDeps } from './translator';
import { fetchTranslations, makeKeyGetter } from './openrouter';
import { DeckTreeProvider, ItemNode } from './treeProvider';
import { insertIntoTerminal } from './terminal';
import { checkForUpdate } from './updater';
import { fetchIndex, fetchFile } from './catalogFetch';
import { computeStatus } from './catalog';
import { install, uninstall, installedHashes } from './installer';
import { MarketplaceTreeProvider, MarketRowNode, OriginFilter } from './marketplaceProvider';

function cfg<T>(key: string, def: T): T {
  return vscode.workspace.getConfiguration('claudeCommandDeck').get<T>(key, def);
}

/**
 * Resolves the OpenRouter key: direct setting first, then a shell command,
 * otherwise throws (translation is skipped and original descriptions are shown).
 */
function buildKeyGetter(): () => Promise<string> {
  const direct = cfg('openrouterApiKey', '').trim();
  if (direct) return async () => direct;
  const command = cfg('openrouterKeyCommand', '').trim();
  if (command) return makeKeyGetter(command);
  return async () => {
    throw new Error('No OpenRouter API key configured');
  };
}

function resolveHome(): string {
  const h = cfg<string>('claudeHome', '');
  return h && h.trim() ? h : path.join(os.homedir(), '.claude');
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DeckTreeProvider();
  vscode.window.registerTreeDataProvider('claudeCommandDeck.tree', provider);

  const market = new MarketplaceTreeProvider();
  vscode.window.registerTreeDataProvider('claudeCommandDeck.marketplace', market);

  async function reloadMarketplace(): Promise<void> {
    const home = resolveHome();
    const url = cfg('catalogUrl', '');
    if (!url) return;
    const entries = await fetchIndex(url, context.globalStorageUri.fsPath);
    const rows = computeStatus(entries, installedHashes(home));
    const filter = cfg<OriginFilter>('marketplaceOriginFilter', 'all');
    market.setData(rows, cfg('language', 'uk'), filter);
  }

  async function reload(): Promise<void> {
    const home = resolveHome();
    const items = scan(home, cfg('includePlugins', true));
    const lang = cfg('language', 'uk');

    // Show items immediately with raw descriptions (no translation delay)
    provider.setData(items, new Map(), lang);

    if (items.length === 0) {
      vscode.window.showWarningMessage(`Claude Command Deck: no items found in ${home}`);
      return;
    }

    // Translate in background, update when done
    try {
      const deps: TranslateDeps = {
        getKey: buildKeyGetter(),
        fetchTranslations,
        cacheDir: context.globalStorageUri.fsPath,
        model: cfg('translationModel', 'google/gemini-2.5-flash'),
      };
      const translations = await translate(items, lang, deps);
      provider.setData(items, translations, lang);
    } catch {
      // Translation failed — items already visible with raw descriptions
    }
  }

  const version: string = context.extension.packageJSON.version;

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCommandDeck.refresh', () => reload()),
    vscode.commands.registerCommand('claudeCommandDeck.insert', (invocation: string) =>
      insertIntoTerminal(invocation),
    ),
    vscode.commands.registerCommand('claudeCommandDeck.copy', (node: ItemNode) =>
      vscode.env.clipboard.writeText(node.invocation),
    ),
    vscode.commands.registerCommand('claudeCommandDeck.checkUpdate', () =>
      checkForUpdate(version, { silent: false }),
    ),
    vscode.commands.registerCommand('claudeCommandDeck.setLanguage', async () => {
      const lang = await vscode.window.showInputBox({
        prompt: 'Language code (e.g. uk, en, pl)',
        value: cfg('language', 'uk'),
      });
      if (lang) {
        await vscode.workspace
          .getConfiguration('claudeCommandDeck')
          .update('language', lang, vscode.ConfigurationTarget.Global);
        await reload();
      }
    }),
    vscode.commands.registerCommand('claudeCommandDeck.refreshMarketplace', () => reloadMarketplace()),
    vscode.commands.registerCommand('claudeCommandDeck.install', async (node: MarketRowNode) => {
      try {
        await install(resolveHome(), node.entry, fetchFile);
        vscode.window.showInformationMessage(`Installed ${node.entry.title}`);
        await reload();
        await reloadMarketplace();
      } catch (e) {
        vscode.window.showErrorMessage(`Install failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand('claudeCommandDeck.updateItem', async (node: MarketRowNode) => {
      try {
        await install(resolveHome(), node.entry, fetchFile);
        vscode.window.showInformationMessage(`Updated ${node.entry.title}`);
        await reload();
        await reloadMarketplace();
      } catch (e) {
        vscode.window.showErrorMessage(`Update failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
    vscode.commands.registerCommand('claudeCommandDeck.copyPluginInstall', (node: MarketRowNode) => {
      const cmd = node.entry.pluginInstall ?? '';
      void vscode.env.clipboard.writeText(cmd);
      vscode.window.showInformationMessage('Plugin install command copied — paste it into the Claude terminal.');
    }),
    vscode.commands.registerCommand('claudeCommandDeck.toggleOriginFilter', async () => {
      const order: OriginFilter[] = ['all', 'official', 'custom'];
      const cur = cfg<OriginFilter>('marketplaceOriginFilter', 'all');
      const next = order[(order.indexOf(cur) + 1) % order.length];
      await vscode.workspace.getConfiguration('claudeCommandDeck')
        .update('marketplaceOriginFilter', next, vscode.ConfigurationTarget.Global);
      await reloadMarketplace();
    }),
    vscode.commands.registerCommand('claudeCommandDeck.uninstall', async (node: ItemNode) => {
      const item = node.item;
      const ok = await vscode.window.showWarningMessage(
        `Delete ${item.type} "${item.name}" from ~/.claude? This cannot be undone.`,
        { modal: true },
        'Delete',
      );
      if (ok !== 'Delete') return;
      try {
        await uninstall(resolveHome(), item);
        vscode.window.showInformationMessage(`Deleted ${item.name}`);
        await reload();
        await reloadMarketplace();
      } catch (e) {
        vscode.window.showErrorMessage(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(resolveHome(), '**/*.md'),
  );
  watcher.onDidChange(() => void reload());
  watcher.onDidCreate(() => void reload());
  watcher.onDidDelete(() => void reload());
  context.subscriptions.push(watcher);

  void reload();
  void reloadMarketplace();

  // Background update check on startup (does nothing if disabled or up to date)
  if (cfg('autoUpdate', true)) {
    setTimeout(() => void checkForUpdate(version, { silent: true }), 4000);
  }
}

export function deactivate(): void {}
