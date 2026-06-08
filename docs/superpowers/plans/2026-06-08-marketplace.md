# Claude Command Deck — Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second "Marketplace" panel that lists an aggregated catalog of commands/skills with Install/Update buttons (file-drop into `~/.claude`), and an Uninstall action on the existing Deck — so the user can add, update, and remove items from the UI.

**Architecture:** Pure logic (`catalog`, `installer` path/hash helpers) has no `vscode`/network dependency and is unit-tested with Vitest. Network (`catalogFetch`) and `vscode` (`marketplaceProvider`, `extension` wiring) layers stay thin. A static `catalog/index.json` is consumed by the extension; a dev script (`scripts/build-catalog.mjs`) + GitHub Action regenerate it from source repos.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild, Vitest, Node 20+ `fetch`, GitHub Actions.

Spec: [docs/superpowers/specs/2026-06-08-marketplace-design.md](../specs/2026-06-08-marketplace-design.md)

---

## File Structure

```
src/
├── catalogTypes.ts      # CatalogEntry, CatalogRow, InstallState (no vscode)        [new]
├── catalog.ts           # parseIndex, computeStatus (pure)                          [new]
├── catalogFetch.ts      # fetchIndex (http/file + disk cache), fetchFile            [new]
├── installer.ts         # resolveDest, isUserItem, installedHashes, install, uninstall [new]
├── marketplaceProvider.ts # vscode TreeDataProvider for the catalog                 [new]
├── treeProvider.ts      # add 'deckItemUser' contextValue for Uninstall            [modify]
├── extension.ts         # register marketplace view + commands                      [modify]
└── ... (scanner, categorize, groups, translator, terminal, updater — reused)
catalog/
├── index.json           # generated catalog consumed by the extension              [new]
├── samples/             # local fixtures for offline manual test                   [new]
└── sources.json         # curated source list for build-catalog                    [new]
scripts/build-catalog.mjs                                                            [new]
.github/workflows/build-catalog.yml                                                  [new]
test/
├── catalog.test.ts                                                                  [new]
├── installer.test.ts                                                                [new]
└── catalogFetch.test.ts                                                             [new]
```

**Hashing convention (used by BOTH build-catalog and installer):** an entry's `hash` is the
SHA-256 (hex) of the **primary file** content only — for a command the `.md`, for a skill the
`SKILL.md`. Update detection compares this against the installed primary file's hash. Supporting
skill files are still installed but do not participate in hash comparison (v1 simplification).

**Matching convention:** installed-vs-catalog match is by key `` `${type}:${name}` `` (filesystem
guarantees name uniqueness), NOT by full `id` (a file-dropped item is scanned as `source:user`).

---

## Task 1: Catalog types + index parsing

**Files:**
- Create: `src/catalogTypes.ts`
- Create: `src/catalog.ts`
- Test: `test/catalog.test.ts`

- [ ] **Step 1: Create `src/catalogTypes.ts`**

```ts
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
```

- [ ] **Step 2: Write the failing test for `parseIndex`**

Create `test/catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseIndex, computeStatus } from '../src/catalog';
import { CatalogEntry } from '../src/catalogTypes';

function entry(over: Partial<CatalogEntry>): CatalogEntry {
  return {
    id: 'command:yours:foo', type: 'command', name: 'foo', category: 'other',
    origin: 'custom', source: 'yours', title: 'Foo', description: 'd',
    version: '1', hash: 'h1', files: [{ path: 'foo.md', url: 'http://x/foo.md' }],
    ...over,
  };
}

describe('parseIndex', () => {
  it('returns entries from a valid index', () => {
    const json = { version: 1, generatedAt: 't', entries: [entry({})] };
    expect(parseIndex(json).map(e => e.id)).toEqual(['command:yours:foo']);
  });
  it('skips malformed entries (missing required fields)', () => {
    const json = { version: 1, generatedAt: 't', entries: [entry({}), { id: 'bad' }] };
    expect(parseIndex(json)).toHaveLength(1);
  });
  it('returns [] for non-object or missing entries', () => {
    expect(parseIndex(null)).toEqual([]);
    expect(parseIndex({ version: 1 })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/catalog.test.ts`
Expected: FAIL — `../src/catalog` does not exist.

- [ ] **Step 4: Implement `parseIndex` in `src/catalog.ts`**

Create `src/catalog.ts`:
```ts
import { CatalogEntry, CatalogRow, InstallState } from './catalogTypes';

function isEntry(x: unknown): x is CatalogEntry {
  if (!x || typeof x !== 'object') return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    (e.type === 'command' || e.type === 'skill' || e.type === 'plugin') &&
    typeof e.name === 'string' &&
    typeof e.category === 'string' &&
    (e.origin === 'official' || e.origin === 'custom') &&
    typeof e.title === 'string' &&
    typeof e.hash === 'string' &&
    Array.isArray(e.files)
  );
}

export function parseIndex(json: unknown): CatalogEntry[] {
  if (!json || typeof json !== 'object') return [];
  const entries = (json as Record<string, unknown>).entries;
  if (!Array.isArray(entries)) return [];
  return entries.filter(isEntry);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/catalog.test.ts`
Expected: PASS (parseIndex block green; computeStatus block still failing — implemented in Task 2).

- [ ] **Step 6: Commit**

```bash
git add src/catalogTypes.ts src/catalog.ts test/catalog.test.ts
git commit -m "feat: catalog types and index parsing"
```

---

## Task 2: computeStatus (catalog ↔ installed)

**Files:**
- Modify: `src/catalog.ts` (append `computeStatus`)
- Test: `test/catalog.test.ts` (append)

- [ ] **Step 1: Append failing tests**

Append to `test/catalog.test.ts`:
```ts
describe('computeStatus', () => {
  const installed = new Map<string, string>([
    ['command:foo', 'h1'],   // same hash → installed
    ['skill:bar', 'OLD'],    // different hash → update
  ]);

  it('marks not_installed when key absent', () => {
    const rows = computeStatus([entry({ id: 'command:yours:baz', name: 'baz', hash: 'h9' })], installed);
    expect(rows[0].state).toBe('not_installed');
  });
  it('marks installed when hash matches', () => {
    const rows = computeStatus([entry({ name: 'foo', hash: 'h1' })], installed);
    expect(rows[0].state).toBe('installed');
  });
  it('marks update_available when hash differs', () => {
    const rows = computeStatus([entry({ type: 'skill', name: 'bar', hash: 'NEW' })], installed);
    expect(rows[0].state).toBe('update_available');
  });
  it('plugin entries are always not_installed (no file-drop detection)', () => {
    const rows = computeStatus([entry({ type: 'plugin', name: 'p', files: [] })], installed);
    expect(rows[0].state).toBe('not_installed');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/catalog.test.ts`
Expected: FAIL — `computeStatus` is not exported.

- [ ] **Step 3: Implement `computeStatus`**

Append to `src/catalog.ts`:
```ts
export function installedKey(type: string, name: string): string {
  return `${type}:${name}`;
}

export function computeStatus(
  entries: CatalogEntry[],
  installed: Map<string, string>,
): CatalogRow[] {
  return entries.map(entry => {
    let state: InstallState = 'not_installed';
    if (entry.type !== 'plugin') {
      const have = installed.get(installedKey(entry.type, entry.name));
      if (have !== undefined) state = have === entry.hash ? 'installed' : 'update_available';
    }
    return { entry, state };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/catalog.test.ts`
Expected: PASS (all blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/catalog.ts test/catalog.test.ts
git commit -m "feat: computeStatus joins catalog with installed by type:name"
```

---

## Task 3: Installer — path safety, isUserItem, installedHashes

**Files:**
- Create: `src/installer.ts`
- Test: `test/installer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/installer.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDest, isUserItem, installedHashes, sha256 } from '../src/installer';
import { CommandItem } from '../src/types';

const HOME = path.join(__dirname, '.tmp-home');

function userItem(type: 'command' | 'skill', name: string): CommandItem {
  return { id: `${type}:user:${name}`, type, name, source: 'user',
    invocation: '/' + name, rawDescription: '', contentHash: '' };
}

beforeEach(() => { fs.rmSync(HOME, { recursive: true, force: true }); });
afterEach(() => { fs.rmSync(HOME, { recursive: true, force: true }); });

describe('resolveDest', () => {
  it('places a command at commands/<name>.md', () => {
    expect(resolveDest(HOME, 'command', 'foo', 'foo.md'))
      .toBe(path.join(HOME, 'commands', 'foo.md'));
  });
  it('places a skill file under skills/<name>/', () => {
    expect(resolveDest(HOME, 'skill', 'bar', 'SKILL.md'))
      .toBe(path.join(HOME, 'skills', 'bar', 'SKILL.md'));
  });
  it('rejects traversal in relPath', () => {
    expect(() => resolveDest(HOME, 'skill', 'bar', '../../etc/passwd')).toThrow();
  });
  it('rejects traversal/separators in name', () => {
    expect(() => resolveDest(HOME, 'command', '../evil', 'x.md')).toThrow();
    expect(() => resolveDest(HOME, 'skill', 'a/b', 'SKILL.md')).toThrow();
  });
  it('rejects absolute relPath', () => {
    expect(() => resolveDest(HOME, 'skill', 'bar', '/etc/passwd')).toThrow();
  });
});

describe('isUserItem', () => {
  it('true for source user, false otherwise', () => {
    expect(isUserItem(userItem('command', 'a'))).toBe(true);
    expect(isUserItem({ ...userItem('skill', 'b'), source: 'superpowers' })).toBe(false);
  });
});

describe('installedHashes', () => {
  it('hashes user commands and skill SKILL.md by type:name', () => {
    fs.mkdirSync(path.join(HOME, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(HOME, 'commands', 'foo.md'), 'CMD');
    fs.mkdirSync(path.join(HOME, 'skills', 'bar'), { recursive: true });
    fs.writeFileSync(path.join(HOME, 'skills', 'bar', 'SKILL.md'), 'SK');
    const map = installedHashes(HOME);
    expect(map.get('command:foo')).toBe(sha256('CMD'));
    expect(map.get('skill:bar')).toBe(sha256('SK'));
  });
  it('returns empty map when dirs absent', () => {
    expect(installedHashes(HOME).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/installer.test.ts`
Expected: FAIL — `../src/installer` does not exist.

- [ ] **Step 3: Implement the helpers in `src/installer.ts`**

Create `src/installer.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommandItem } from './types';

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function userRoots(home: string): { command: string; skill: string } {
  return { command: path.join(home, 'commands'), skill: path.join(home, 'skills') };
}

function safeName(name: string): string {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error(`unsafe name: ${name}`);
  }
  return name;
}

/** Resolves a destination path and guarantees it stays within the allowed user root. */
export function resolveDest(
  home: string,
  type: 'command' | 'skill',
  name: string,
  relPath: string,
): string {
  safeName(name);
  if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) {
    throw new Error(`unsafe relPath: ${relPath}`);
  }
  const roots = userRoots(home);
  const root = type === 'command' ? roots.command : path.join(roots.skill, name);
  const dest = path.resolve(root, relPath);
  const guard = path.resolve(root) + path.sep;
  if (dest !== path.resolve(root) && !dest.startsWith(guard)) {
    throw new Error(`path escapes root: ${dest}`);
  }
  return dest;
}

export function isUserItem(item: CommandItem): boolean {
  return item.source === 'user';
}

function listFiles(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

/** Map `${type}:${name}` → sha256 of the primary file, for user commands and skills only. */
export function installedHashes(home: string): Map<string, string> {
  const map = new Map<string, string>();
  const roots = userRoots(home);
  for (const f of listFiles(roots.command)) {
    if (!f.endsWith('.md')) continue;
    const name = f.slice(0, -3);
    try { map.set(`command:${name}`, sha256(fs.readFileSync(path.join(roots.command, f), 'utf8'))); } catch { /* skip */ }
  }
  for (const d of listFiles(roots.skill)) {
    const skillMd = path.join(roots.skill, d, 'SKILL.md');
    try {
      if (fs.existsSync(skillMd)) {
        map.set(`skill:${d}`, sha256(fs.readFileSync(skillMd, 'utf8')));
      }
    } catch { /* skip */ }
  }
  return map;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/installer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/installer.ts test/installer.test.ts
git commit -m "feat: installer path-safety, isUserItem, installedHashes"
```

---

## Task 4: Installer — install and uninstall

**Files:**
- Modify: `src/installer.ts` (append `install`, `uninstall`)
- Test: `test/installer.test.ts` (append)

- [ ] **Step 1: Append failing tests**

Append to `test/installer.test.ts`:
```ts
import { install, uninstall } from '../src/installer';
import { CatalogEntry } from '../src/catalogTypes';

function catEntry(over: Partial<CatalogEntry>): CatalogEntry {
  return { id: 'x', type: 'skill', name: 'demo', category: 'other', origin: 'custom',
    source: 'yours', title: 'Demo', description: 'd', version: '1', hash: 'h',
    files: [{ path: 'SKILL.md', url: 'mem://skill' }], ...over };
}

describe('install', () => {
  it('writes command file via injected fetchFile', async () => {
    const e = catEntry({ type: 'command', name: 'foo', files: [{ path: 'foo.md', url: 'mem://foo' }] });
    await install(HOME, e, async () => 'CMD-BODY');
    expect(fs.readFileSync(path.join(HOME, 'commands', 'foo.md'), 'utf8')).toBe('CMD-BODY');
  });
  it('writes a multi-file skill', async () => {
    const e = catEntry({ files: [
      { path: 'SKILL.md', url: 'mem://s' },
      { path: 'references/a.md', url: 'mem://a' },
    ] });
    await install(HOME, e, async (url) => (url === 'mem://s' ? 'MAIN' : 'REF'));
    expect(fs.readFileSync(path.join(HOME, 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe('MAIN');
    expect(fs.readFileSync(path.join(HOME, 'skills', 'demo', 'references', 'a.md'), 'utf8')).toBe('REF');
  });
  it('rejects plugin entries', async () => {
    await expect(install(HOME, catEntry({ type: 'plugin', files: [] }), async () => '')).rejects.toThrow();
  });
});

describe('uninstall', () => {
  it('deletes a user command file', async () => {
    fs.mkdirSync(path.join(HOME, 'commands'), { recursive: true });
    fs.writeFileSync(path.join(HOME, 'commands', 'foo.md'), 'X');
    await uninstall(HOME, userItem('command', 'foo'));
    expect(fs.existsSync(path.join(HOME, 'commands', 'foo.md'))).toBe(false);
  });
  it('deletes a user skill directory', async () => {
    fs.mkdirSync(path.join(HOME, 'skills', 'bar'), { recursive: true });
    fs.writeFileSync(path.join(HOME, 'skills', 'bar', 'SKILL.md'), 'X');
    await uninstall(HOME, userItem('skill', 'bar'));
    expect(fs.existsSync(path.join(HOME, 'skills', 'bar'))).toBe(false);
  });
  it('refuses non-user items', async () => {
    await expect(uninstall(HOME, { ...userItem('skill', 'bar'), source: 'superpowers' })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/installer.test.ts`
Expected: FAIL — `install`/`uninstall` are not exported.

- [ ] **Step 3: Implement `install` and `uninstall`**

First add the import to the **top** of `src/installer.ts` (next to the existing imports):
```ts
import { CatalogEntry } from './catalogTypes';
```
Then append to the end of `src/installer.ts`:
```ts
type FetchFile = (url: string) => Promise<string>;

/** Downloads each file and writes it atomically under the user root. Plugins are rejected. */
export async function install(home: string, entry: CatalogEntry, fetchFile: FetchFile): Promise<void> {
  if (entry.type === 'plugin') throw new Error('plugins are not file-installed');
  const type = entry.type;
  for (const file of entry.files) {
    const dest = resolveDest(home, type, entry.name, file.path);
    const content = await fetchFile(file.url);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    const tmp = `${dest}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, dest);
  }
}

/** Hard-deletes a user-owned command file or skill directory. Refuses non-user items. */
export async function uninstall(home: string, item: CommandItem): Promise<void> {
  if (!isUserItem(item)) throw new Error('refusing to delete non-user item');
  const roots = userRoots(home);
  if (item.type === 'command') {
    const dest = resolveDest(home, 'command', item.name, `${item.name}.md`);
    fs.rmSync(dest, { force: true });
  } else {
    safeName(item.name);
    const dir = path.join(roots.skill, item.name);
    const guard = path.resolve(roots.skill) + path.sep;
    if (!path.resolve(dir).startsWith(guard)) throw new Error('path escapes skills root');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/installer.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/installer.ts test/installer.test.ts
git commit -m "feat: install (atomic file-drop) and uninstall (hard delete, user-only)"
```

---

## Task 5: catalogFetch — http/file fetch + disk cache

**Files:**
- Create: `src/catalogFetch.ts`
- Test: `test/catalogFetch.test.ts`

This module's network path is verified by running the extension; the pure cache read/write and
the local-file branch are unit-tested.

- [ ] **Step 1: Write failing tests**

Create `test/catalogFetch.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fetchFile, loadIndexCache, saveIndexCache } from '../src/catalogFetch';
import { CatalogEntry } from '../src/catalogTypes';

const TMP = path.join(__dirname, '.tmp-cf');

function entry(): CatalogEntry {
  return { id: 'command:yours:foo', type: 'command', name: 'foo', category: 'other',
    origin: 'custom', source: 'yours', title: 'Foo', description: 'd', version: '1',
    hash: 'h', files: [{ path: 'foo.md', url: 'x' }] };
}

beforeEach(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
afterEach(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

describe('index cache', () => {
  it('round-trips entries through the cache file', () => {
    saveIndexCache(TMP, [entry()]);
    expect(loadIndexCache(TMP).map(e => e.id)).toEqual(['command:yours:foo']);
  });
  it('returns [] when no cache present', () => {
    expect(loadIndexCache(TMP)).toEqual([]);
  });
});

describe('fetchFile (local file branch)', () => {
  it('reads a local file path', async () => {
    fs.mkdirSync(TMP, { recursive: true });
    const p = path.join(TMP, 'a.md');
    fs.writeFileSync(p, 'HELLO');
    expect(await fetchFile(p)).toBe('HELLO');
    expect(await fetchFile('file://' + p)).toBe('HELLO');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/catalogFetch.test.ts`
Expected: FAIL — `../src/catalogFetch` does not exist.

- [ ] **Step 3: Implement `src/catalogFetch.ts`**

Create `src/catalogFetch.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import { CatalogEntry } from './catalogTypes';
import { parseIndex } from './catalog';

const CACHE_NAME = 'catalog-index.json';

function isHttp(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

function localPath(url: string): string {
  return url.startsWith('file://') ? url.slice('file://'.length) : url;
}

/** Reads a file by http(s) URL or local path (file:// or plain path). */
export async function fetchFile(url: string): Promise<string> {
  if (isHttp(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url} → HTTP ${res.status}`);
    return res.text();
  }
  return fs.readFileSync(localPath(url), 'utf8');
}

export function loadIndexCache(cacheDir: string): CatalogEntry[] {
  try {
    return parseIndex(JSON.parse(fs.readFileSync(path.join(cacheDir, CACHE_NAME), 'utf8')));
  } catch {
    return [];
  }
}

export function saveIndexCache(cacheDir: string, entries: CatalogEntry[]): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(
    path.join(cacheDir, CACHE_NAME),
    JSON.stringify({ version: 1, generatedAt: '', entries }, null, 2),
  );
}

/** Fetches and parses the catalog index; on failure falls back to the on-disk cache. */
export async function fetchIndex(url: string, cacheDir: string): Promise<CatalogEntry[]> {
  try {
    const raw = await fetchFile(url);
    const entries = parseIndex(JSON.parse(raw));
    if (entries.length > 0) saveIndexCache(cacheDir, entries);
    return entries;
  } catch {
    return loadIndexCache(cacheDir);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/catalogFetch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/catalogFetch.ts test/catalogFetch.test.ts
git commit -m "feat: catalogFetch with http/file support and disk cache fallback"
```

---

## Task 6: Manifest — views, commands, menus, config + seed catalog

**Files:**
- Modify: `package.json` (contributes + config)
- Create: `catalog/index.json`, `catalog/samples/demo-skill/SKILL.md`, `catalog/samples/demo-command.md`

- [ ] **Step 1: Add the second view to `package.json`**

In `contributes.views.claudeCommandDeck`, add the marketplace view after the existing tree view so the array reads:
```json
"claudeCommandDeck": [
  { "id": "claudeCommandDeck.tree", "name": "Commands & Skills" },
  { "id": "claudeCommandDeck.marketplace", "name": "Marketplace" }
]
```

- [ ] **Step 2: Add commands to `contributes.commands`**

Append these objects to the `contributes.commands` array:
```json
{ "command": "claudeCommandDeck.install", "title": "Install" },
{ "command": "claudeCommandDeck.updateItem", "title": "Update" },
{ "command": "claudeCommandDeck.uninstall", "title": "Uninstall (delete file)" },
{ "command": "claudeCommandDeck.copyPluginInstall", "title": "Copy plugin install command" },
{ "command": "claudeCommandDeck.refreshMarketplace", "title": "Command Deck: Refresh Marketplace", "icon": "$(refresh)" },
{ "command": "claudeCommandDeck.toggleOriginFilter", "title": "Command Deck: Filter Official/Custom", "icon": "$(filter)" }
```

- [ ] **Step 3: Add menus to `contributes.menus`**

Add a `view/title` group for the marketplace and `view/item/context` entries. Merge into the existing `menus` object:
```json
"view/title": [
  { "command": "claudeCommandDeck.refresh", "when": "view == claudeCommandDeck.tree", "group": "navigation" },
  { "command": "claudeCommandDeck.setLanguage", "when": "view == claudeCommandDeck.tree", "group": "navigation" },
  { "command": "claudeCommandDeck.refreshMarketplace", "when": "view == claudeCommandDeck.marketplace", "group": "navigation" },
  { "command": "claudeCommandDeck.toggleOriginFilter", "when": "view == claudeCommandDeck.marketplace", "group": "navigation" }
],
"view/item/context": [
  { "command": "claudeCommandDeck.copy", "when": "view == claudeCommandDeck.tree && viewItem == deckItem", "group": "inline" },
  { "command": "claudeCommandDeck.copy", "when": "view == claudeCommandDeck.tree && viewItem == deckItemUser", "group": "inline" },
  { "command": "claudeCommandDeck.uninstall", "when": "view == claudeCommandDeck.tree && viewItem == deckItemUser" },
  { "command": "claudeCommandDeck.install", "when": "view == claudeCommandDeck.marketplace && viewItem == marketInstall", "group": "inline" },
  { "command": "claudeCommandDeck.updateItem", "when": "view == claudeCommandDeck.marketplace && viewItem == marketUpdate", "group": "inline" },
  { "command": "claudeCommandDeck.copyPluginInstall", "when": "view == claudeCommandDeck.marketplace && viewItem == marketPlugin", "group": "inline" }
]
```

- [ ] **Step 4: Add config keys to `contributes.configuration.properties`**

Append:
```json
"claudeCommandDeck.catalogUrl": { "type": "string", "default": "https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/index.json", "description": "URL or local path to the marketplace catalog index.json." },
"claudeCommandDeck.catalogRefreshHours": { "type": "number", "default": 24, "description": "How often to re-fetch the catalog (hours)." },
"claudeCommandDeck.marketplaceOriginFilter": { "type": "string", "enum": ["all", "official", "custom"], "default": "all", "description": "Show all items, or only official / custom." }
```

- [ ] **Step 5: Create sample fixtures and a seed `catalog/index.json`**

Create `catalog/samples/demo-command.md`:
```md
---
description: Demo command installed from the marketplace
---
# Demo Command
This is a demo.
```

Create `catalog/samples/demo-skill/SKILL.md`:
```md
---
name: demo-skill
description: Demo skill installed from the marketplace
---
Demo skill body.
```

Create `catalog/index.json` (hashes are placeholders here; Task 9's build script regenerates them — for now any non-empty string is fine because install does not verify the hash, only computeStatus compares it):
```json
{
  "version": 1,
  "generatedAt": "2026-06-08T00:00:00Z",
  "entries": [
    {
      "id": "command:yours:demo-command",
      "type": "command",
      "name": "demo-command",
      "category": "other",
      "origin": "custom",
      "source": "yours",
      "title": "Demo Command",
      "description": "Demo command installed from the marketplace",
      "version": "1",
      "hash": "seed-demo-command",
      "files": [
        { "path": "demo-command.md", "url": "https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/samples/demo-command.md" }
      ]
    },
    {
      "id": "skill:yours:demo-skill",
      "type": "skill",
      "name": "demo-skill",
      "category": "other",
      "origin": "custom",
      "source": "yours",
      "title": "Demo Skill",
      "description": "Demo skill installed from the marketplace",
      "version": "1",
      "hash": "seed-demo-skill",
      "files": [
        { "path": "SKILL.md", "url": "https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/samples/demo-skill/SKILL.md" }
      ]
    }
  ]
}
```

- [ ] **Step 6: Verify the manifest is valid JSON and build still works**

Run: `node -e "require('./package.json')" && npm run build`
Expected: no JSON error; prints `esbuild: built dist/extension.js`.

- [ ] **Step 7: Commit**

```bash
git add package.json catalog/
git commit -m "feat: marketplace manifest (views, commands, menus, config) + seed catalog"
```

---

## Task 7: MarketplaceTreeProvider (vscode)

**Files:**
- Create: `src/marketplaceProvider.ts`

Verified by running the extension (Task 8), not unit tests.

- [ ] **Step 1: Implement `src/marketplaceProvider.ts`**

Create `src/marketplaceProvider.ts`:
```ts
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/marketplaceProvider.ts
git commit -m "feat: marketplace TreeDataProvider grouped by category with origin badges"
```

---

## Task 8: Wire extension + Deck Uninstall + manual run

**Files:**
- Modify: `src/treeProvider.ts` (user contextValue)
- Modify: `src/extension.ts` (register view + commands)

- [ ] **Step 1: Mark user items in `treeProvider.ts`**

In `src/treeProvider.ts`, inside the `ItemNode` constructor, replace the line
`this.contextValue = 'deckItem';` with:
```ts
    this.contextValue = item.source === 'user' ? 'deckItemUser' : 'deckItem';
```

- [ ] **Step 2: Verify type-check**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Wire the marketplace into `src/extension.ts`**

Add these imports near the existing imports in `src/extension.ts`:
```ts
import { fetchIndex, fetchFile } from './catalogFetch';
import { computeStatus } from './catalog';
import { install, uninstall, installedHashes } from './installer';
import { MarketplaceTreeProvider, MarketRowNode, OriginFilter } from './marketplaceProvider';
```

Inside `activate`, after the existing `provider`/`registerTreeDataProvider` lines, add:
```ts
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
```

Register the new commands by adding these entries to the existing
`context.subscriptions.push( ... )` call:
```ts
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
```

At the end of `activate`, after the existing `void reload();`, add:
```ts
  void reloadMarketplace();
```

> Note: `ItemNode` already exposes `item` (public field) and is imported. `MarketRowNode` exposes `entry`.

- [ ] **Step 4: Build and type-check**

Run: `npm run typecheck && npm run build`
Expected: no type errors; prints `esbuild: built dist/extension.js`.

- [ ] **Step 5: Manual verification (run the extension)**

For an offline-deterministic test, temporarily point the catalog at the local seed:
set `claudeCommandDeck.catalogUrl` to
`/root/projects/claude-command-deck/catalog/index.json` and each entry `files[].url`
in that file to a local path (e.g. `/root/projects/claude-command-deck/catalog/samples/demo-command.md`).
Press `F5` to launch the Extension Development Host. Verify, in order:
1. The **Marketplace** panel appears under the Command Deck container with a category group containing `Demo Command` and `Demo Skill`, each showing a `● custom · not installed` badge.
2. Click `Demo Command` → toast "Installed Demo Command"; the **Deck** panel now lists `/demo-command` (watcher refresh); the marketplace row flips to `✓ check · installed`.
3. Edit `~/.claude/commands/demo-command.md`, click the marketplace **Refresh** → row shows `sync · update available`; click it → re-installs, back to `installed`.
4. The filter button in the marketplace title cycles all → official → custom and the list narrows.
5. In the **Deck** panel, right-click `/demo-command` → **Uninstall (delete file)** → confirm modal → file removed, row disappears from Deck and returns to `not installed` in Marketplace.
6. Right-click a `source != user` item in the Deck → no **Uninstall** entry (only `deckItemUser` shows it).

- [ ] **Step 6: Commit**

```bash
git add src/extension.ts src/treeProvider.ts
git commit -m "feat: wire marketplace view, install/update/uninstall/copy commands"
```

---

## Task 9: build-catalog script + GitHub Action

**Files:**
- Create: `catalog/sources.json`
- Create: `scripts/build-catalog.mjs`
- Create: `.github/workflows/build-catalog.yml`
- Modify: `catalog/index.json` (regenerated)

- [ ] **Step 1: Create `catalog/sources.json`**

A curated list of sources. Each item points at a raw file in a public repo. `category`/`origin`
are assigned by the curator. Start with the two self-hosted samples so the build is reproducible
offline, then add real entries over time.
```json
{
  "sources": [
    {
      "type": "command", "name": "demo-command", "category": "other",
      "origin": "custom", "source": "yours",
      "title": "Demo Command", "version": "1",
      "files": [{ "path": "demo-command.md",
        "url": "https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/samples/demo-command.md" }]
    },
    {
      "type": "skill", "name": "demo-skill", "category": "other",
      "origin": "custom", "source": "yours",
      "title": "Demo Skill", "version": "1",
      "files": [{ "path": "SKILL.md",
        "url": "https://raw.githubusercontent.com/AndriyFit/claude-command-deck/main/catalog/samples/demo-skill/SKILL.md" }]
    }
  ]
}
```

- [ ] **Step 2: Create `scripts/build-catalog.mjs`**

Self-contained Node script (no TS import). Fetches each source's PRIMARY file, computes the
SHA-256 used for update detection, extracts a description, and writes `catalog/index.json`.
```js
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function sha256(s) { return createHash('sha256').update(s).digest('hex'); }

function extractDescription(content, fallback) {
  if (content.startsWith('---')) {
    const end = content.indexOf('\n---', 3);
    if (end !== -1) {
      for (const line of content.slice(3, end).split('\n')) {
        const m = line.match(/^description:\s*(.*)$/);
        if (m) return m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  for (const raw of content.split('\n')) {
    const l = raw.trim();
    if (l && !l.startsWith('#') && !l.startsWith('>') && !l.startsWith('---')) return l;
  }
  return fallback;
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

const { sources } = JSON.parse(readFileSync(join(ROOT, 'catalog', 'sources.json'), 'utf8'));
const entries = [];
for (const s of sources) {
  const primary = s.files[0];
  let content = '';
  try { content = await fetchText(primary.url); }
  catch (e) { console.error(`SKIP ${s.type}:${s.name}: ${e.message}`); continue; }
  entries.push({
    id: `${s.type}:${s.source}:${s.name}`,
    type: s.type, name: s.name, category: s.category,
    origin: s.origin, source: s.source,
    title: s.title || s.name,
    description: extractDescription(content, s.name),
    version: s.version || '1',
    hash: sha256(content),
    files: s.files,
    ...(s.pluginInstall ? { pluginInstall: s.pluginInstall } : {}),
  });
}
const index = { version: 1, generatedAt: new Date().toISOString(), entries };
writeFileSync(join(ROOT, 'catalog', 'index.json'), JSON.stringify(index, null, 2) + '\n');
console.log(`build-catalog: wrote ${entries.length} entries`);
```

- [ ] **Step 3: Run the build script and verify output**

Run: `node scripts/build-catalog.mjs`
Expected: prints `build-catalog: wrote 2 entries`; `catalog/index.json` now has real
SHA-256 `hash` values and a current `generatedAt`.

Sanity-check it parses:
```bash
node -e "const e=require('./catalog/index.json').entries; if(e.length!==2) throw new Error('expected 2'); if(!/^[0-9a-f]{64}$/.test(e[0].hash)) throw new Error('bad hash'); console.log('ok')"
```
Expected: `ok`.

- [ ] **Step 4: Create `.github/workflows/build-catalog.yml`**

```yaml
name: build-catalog
on:
  schedule:
    - cron: '0 6 * * 1'   # Mondays 06:00 UTC
  workflow_dispatch: {}
permissions:
  contents: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node scripts/build-catalog.mjs
      - name: Commit refreshed catalog
        run: |
          if ! git diff --quiet catalog/index.json; then
            git config user.name  'github-actions[bot]'
            git config user.email 'github-actions[bot]@users.noreply.github.com'
            git add catalog/index.json
            git commit -m 'chore: refresh catalog/index.json'
            git push
          else
            echo 'no catalog changes'
          fi
```

- [ ] **Step 5: Commit**

```bash
git add catalog/sources.json catalog/index.json scripts/build-catalog.mjs .github/workflows/build-catalog.yml
git commit -m "feat: build-catalog script + weekly GitHub Action"
```

---

## Task 10: Package, README, final verification

**Files:**
- Modify: `README.md` (Marketplace section)
- Modify: `.vscodeignore` (exclude catalog samples/sources from the vsix; keep index.json out too — the extension fetches it from the configured URL)

- [ ] **Step 1: Exclude catalog dev files from the vsix**

Append to `.vscodeignore`:
```
catalog/**
scripts/**
.github/**
```

- [ ] **Step 2: Add a Marketplace section to `README.md`**

Append:
```md
## Marketplace

The **Marketplace** panel lists an aggregated catalog of commands and skills (official + custom),
grouped by category with an origin badge. Click **Install** to drop the files into `~/.claude`
(the Deck refreshes automatically), **Update** when a newer version is available, or — on the
Deck panel — right-click a custom item → **Uninstall** to delete it (hard delete, with confirmation).
Plugin entries offer **Copy plugin install command** to paste into the Claude terminal.

Catalog source: `claudeCommandDeck.catalogUrl` (default: this repo's `catalog/index.json`),
regenerated weekly by a GitHub Action.
```

- [ ] **Step 3: Full verification**

Run:
```bash
npm test && npm run typecheck && npm run build && npm run package
```
Expected: all tests pass; no type errors; `esbuild: built dist/extension.js`;
`Packaged: …/claude-command-deck-<version>.vsix`.

- [ ] **Step 4: Commit**

```bash
git add README.md .vscodeignore
git commit -m "docs: document marketplace; exclude catalog dev files from vsix"
```

---

## Self-Review Notes (filled by plan author)

- **Spec coverage:** catalog source/aggregator (§3)→T9 (build-catalog + Action) + T6 (seed); install/update file-drop (§3,§7)→T4,T8; plugin "copy command" (§3)→T7,T8; Marketplace TreeView grouped by category + origin badge + filter, variant 5a (§3,§5)→T7,T8; Uninstall hard delete user-only (§3,§7)→T4,T8; data model (§6)→T1; computeStatus join by type:name + hash (§6,§7)→T2; path-traversal/atomic/text-only guards (§8)→T3,T4; config keys (§9)→T6; tests (§10)→T1–T5; criteria (§12)→all.
- **Type consistency:** `CatalogEntry`/`CatalogRow`/`InstallState`/`Origin`/`EntryType` (T1) used unchanged in `computeStatus` (T2), `installer` (T3,T4), `catalogFetch` (T5), `marketplaceProvider` (T7), `extension` (T8). `resolveDest`/`installedHashes`/`install`/`uninstall`/`isUserItem`/`sha256` signatures defined in T3–T4 match their calls in T8. `MarketRowNode.entry` and `ItemNode.item` are the exact properties referenced by the commands in T8. Hashing convention (primary-file sha256) is identical in `installer.installedHashes` (T3) and `build-catalog.mjs` (T9).
- **Known limitation (in-scope):** update detection keys on the primary file only (skill `SKILL.md` / command `.md`); edits to supporting skill files do not flip the status to `update_available`. Acceptable for v1.
- **Manual-test note:** Task 8 step 5 uses local file paths for determinism; production uses the https catalog URL produced by Task 9.
