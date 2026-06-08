import * as vscode from 'vscode';
import { CommandItem } from './types';
import { buildGroups, TreeGroup } from './groups';

class GroupNode extends vscode.TreeItem {
  constructor(public group: TreeGroup) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'deckGroup';
    this.iconPath = new vscode.ThemeIcon(group.id === 'commands' ? 'terminal' : 'sparkle');
  }
}

class ItemNode extends vscode.TreeItem {
  constructor(public item: CommandItem, description: string) {
    super(item.invocation, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = new vscode.MarkdownString(
      `**${item.invocation}**\n\n${description}\n\nsource: \`${item.source}\``,
    );
    this.contextValue = 'deckItem';
    this.iconPath = new vscode.ThemeIcon(item.type === 'command' ? 'terminal' : 'sparkle');
    this.command = {
      command: 'claudeCommandDeck.insert',
      title: 'Insert',
      arguments: [item.invocation],
    };
  }
  get invocation(): string {
    return this.item.invocation;
  }
}

export class DeckTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChange.event;

  private groups: TreeGroup[] = [];
  private translations = new Map<string, string>();

  setData(items: CommandItem[], translations: Map<string, string>): void {
    this.groups = buildGroups(items);
    this.translations = translations;
    this._onDidChange.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
    if (!element) {
      return this.groups.map(g => new GroupNode(g));
    }
    if (element instanceof GroupNode) {
      return element.group.items.map(
        it => new ItemNode(it, this.translations.get(it.id) ?? it.rawDescription),
      );
    }
    return [];
  }
}

export { ItemNode };
