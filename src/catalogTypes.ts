export type Origin = 'official' | 'custom';
export type EntryType = 'command' | 'skill' | 'plugin';

export interface CatalogFile {
  /** Destination path relative to the item root: '<name>.md' for commands, 'SKILL.md'/'references/x.md' for skills. */
  path: string;
  /** http(s) URL or a local file path (for offline testing). */
  url: string;
}

export interface CatalogEntry {
  id: string;            // "skill:superpowers:brainstorming" — stable catalog key
  type: EntryType;
  name: string;          // bare name (== install identity on disk)
  category: string;      // category id from categorize.ts
  origin: Origin;
  source: string;        // human label: "superpowers" | "ECC" | "yours"
  title: string;
  description: string;
  version: string;       // display-only ("1.2.0" or short hash)
  hash: string;          // sha256 of the primary file (update detection)
  files: CatalogFile[];  // empty for plugin
  pluginInstall?: string; // for plugin: command string to copy
}

export type InstallState = 'not_installed' | 'installed' | 'update_available';
export interface CatalogRow { entry: CatalogEntry; state: InstallState; }

export interface CatalogIndex {
  version: number;
  generatedAt: string;
  entries: CatalogEntry[];
}
