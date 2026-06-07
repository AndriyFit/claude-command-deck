import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import { scan } from './scanner';
import { translate, TranslateDeps } from './translator';
import { fetchTranslations, makeKeyGetter } from './openrouter';
import { DeckTreeProvider, ItemNode } from './treeProvider';
import { insertIntoTerminal } from './terminal';

function cfg<T>(key: string, def: T): T {
  return vscode.workspace.getConfiguration('claudeCommandDeck').get<T>(key, def);
}

function resolveHome(): string {
  const h = cfg<string>('claudeHome', '');
  return h && h.trim() ? h : path.join(os.homedir(), '.claude');
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DeckTreeProvider();
  vscode.window.registerTreeDataProvider('claudeCommandDeck.tree', provider);

  async function reload(): Promise<void> {
    const home = resolveHome();
    const items = scan(home, cfg('includePlugins', true));
    const lang = cfg('language', 'uk');
    const deps: TranslateDeps = {
      getKey: makeKeyGetter(cfg('openrouterKeyCommand', 'vault-get shared/openrouter_api_key')),
      fetchTranslations,
      cacheDir: context.globalStorageUri.fsPath,
      model: cfg('translationModel', 'google/gemini-2.5-flash'),
    };
    const translations = await translate(items, lang, deps);
    provider.setData(items, translations);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('claudeCommandDeck.refresh', () => reload()),
    vscode.commands.registerCommand('claudeCommandDeck.insert', (invocation: string) =>
      insertIntoTerminal(invocation),
    ),
    vscode.commands.registerCommand('claudeCommandDeck.copy', (node: ItemNode) =>
      vscode.env.clipboard.writeText(node.invocation),
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
  );

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(resolveHome(), '**/*.md'),
  );
  watcher.onDidChange(() => reload());
  watcher.onDidCreate(() => reload());
  watcher.onDidDelete(() => reload());
  context.subscriptions.push(watcher);

  void reload();
}

export function deactivate(): void {}
