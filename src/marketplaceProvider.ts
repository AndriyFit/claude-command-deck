import * as vscode from 'vscode';
import { CatalogRow } from './catalogTypes';
import { categoryLabel, categoryIcon } from './categorize';

export type OriginFilter = 'all' | 'official' | 'custom';

interface CatGroup { id: string; rows: CatalogRow[]; }

class MarketGroupNode extends vscode.TreeItem {
  constructor(public group: CatGroup, lang: string) {
    super(`${categoryLabel(group.id, lang)} (${group.rows.length})`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'marketGroup';
    this.iconPath = new vscode.ThemeIcon(categoryIcon(group.id));
  }
}

const STATE_ICON: Record<string, string> = {
  not_installed: 'cloud-download',
  installed: 'check',
  update_available: 'sync',
};

class MarketRowNode extends vscode.TreeItem {
  constructor(public row: CatalogRow) {
    super(row.entry.title || row.entry.name, vscode.TreeItemCollapsibleState.None);
    const e = row.entry;
    const badge = e.origin === 'official' ? '✓ official' : '● custom';
    this.description = `${badge} · ${row.state.replace('_', ' ')}`;
    this.tooltip = new vscode.MarkdownString(
      `**${e.title}**\n\n${e.description}\n\nsource: \`${e.source}\` · type: \`${e.type}\``,
    );
    this.iconPath = new vscode.ThemeIcon(STATE_ICON[row.state] ?? 'circle-outline');
    this.contextValue =
      e.type === 'plugin' ? 'marketPlugin' :
      row.state === 'update_available' ? 'marketUpdate' :
      row.state === 'installed' ? 'marketInstalled' : 'marketInstall';
    if (this.contextValue === 'marketInstall') {
      this.command = { command: 'claudeCommandDeck.install', title: 'Install', arguments: [this] };
    } else if (this.contextValue === 'marketUpdate') {
      this.command = { command: 'claudeCommandDeck.updateItem', title: 'Update', arguments: [this] };
    } else if (this.contextValue === 'marketPlugin') {
      this.command = { command: 'claudeCommandDeck.copyPluginInstall', title: 'Copy', arguments: [this] };
    }
  }
  get entry() { return this.row.entry; }
}

export class MarketplaceTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private groups: CatGroup[] = [];
  private lang = 'uk';

  setData(rows: CatalogRow[], lang: string, filter: OriginFilter): void {
    this.lang = lang;
    const shown = filter === 'all' ? rows : rows.filter(r => r.entry.origin === filter);
    const byCat = new Map<string, CatalogRow[]>();
    for (const r of shown) {
      const list = byCat.get(r.entry.category) ?? [];
      list.push(r);
      byCat.set(r.entry.category, list);
    }
    this.groups = [...byCat.entries()]
      .map(([id, rs]) => ({ id, rows: rs.sort((a, b) => a.entry.name.localeCompare(b.entry.name)) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    this._onDidChange.fire();
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(el?: vscode.TreeItem): vscode.TreeItem[] {
    if (!el) return this.groups.map(g => new MarketGroupNode(g, this.lang));
    if (el instanceof MarketGroupNode) return el.group.rows.map(r => new MarketRowNode(r));
    return [];
  }
}

export { MarketRowNode };
