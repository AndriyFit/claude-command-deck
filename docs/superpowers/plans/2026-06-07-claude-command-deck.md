# Claude Command Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VS Code extension that lists all Claude Code commands and skills in a sidebar TreeView with translated descriptions; clicking an item inserts its invocation into the active terminal without running it.

**Architecture:** Five focused modules. Pure logic (`scanner`, `translator`, `groups`) has no `vscode` dependency and is unit-tested with Vitest. The `vscode`-bound layer (`treeProvider`, `terminal`, `extension`) is thin and verified by running the extension. OpenRouter network/key access is isolated in `openrouter.ts` and injected into the pure `translator` so the cache logic stays testable.

**Tech Stack:** TypeScript, VS Code Extension API, esbuild (bundle), Vitest (unit tests), Node 20+ built-in `fetch`, OpenRouter (translation), `vault-get` (key retrieval).

---

## File Structure

```
/root/projects/claude-command-deck/
├── package.json            # extension manifest + scripts + deps
├── tsconfig.json           # type-checking config
├── esbuild.js              # bundles src/extension.ts → dist/extension.js
├── vitest.config.ts        # unit test config
├── media/icon.svg          # activity-bar icon
├── src/
│   ├── types.ts            # CommandItem, ItemType (no vscode)
│   ├── scanner.ts          # scan ~/.claude → CommandItem[] (no vscode)
│   ├── translator.ts       # translate + cache (no vscode, deps injected)
│   ├── openrouter.ts       # OpenRouter fetch + key getter (no vscode)
│   ├── groups.ts           # buildGroups (no vscode)
│   ├── treeProvider.ts     # vscode TreeDataProvider (thin)
│   ├── terminal.ts         # insert into terminal (thin)
│   └── extension.ts        # activate(): wire everything
└── test/
    ├── fixtures/claude/    # mock ~/.claude tree
    ├── scanner.test.ts
    ├── translator.test.ts
    └── groups.test.ts
```

**Responsibility per file:** `scanner` finds & normalizes items; `translator` caches/produces translated text; `openrouter` is the only place that touches the network/secret; `groups` decides grouping/order; `treeProvider` maps data → VS Code tree nodes; `terminal` sends text; `extension` wires config + commands + watcher.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.js`, `vitest.config.ts`, `media/icon.svg`, `src/types.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "claude-command-deck",
  "displayName": "Claude Command Deck",
  "description": "Sidebar of all Claude Code commands and skills with translated descriptions; click to insert into the terminal.",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        { "id": "claudeCommandDeck", "title": "Command Deck", "icon": "media/icon.svg" }
      ]
    },
    "views": {
      "claudeCommandDeck": [
        { "id": "claudeCommandDeck.tree", "name": "Commands & Skills" }
      ]
    },
    "commands": [
      { "command": "claudeCommandDeck.refresh", "title": "Command Deck: Refresh", "icon": "$(refresh)" },
      { "command": "claudeCommandDeck.insert", "title": "Insert into Terminal" },
      { "command": "claudeCommandDeck.setLanguage", "title": "Command Deck: Set Language", "icon": "$(globe)" },
      { "command": "claudeCommandDeck.copy", "title": "Copy Invocation" }
    ],
    "menus": {
      "view/title": [
        { "command": "claudeCommandDeck.refresh", "when": "view == claudeCommandDeck.tree", "group": "navigation" },
        { "command": "claudeCommandDeck.setLanguage", "when": "view == claudeCommandDeck.tree", "group": "navigation" }
      ],
      "view/item/context": [
        { "command": "claudeCommandDeck.copy", "when": "view == claudeCommandDeck.tree && viewItem == deckItem" }
      ]
    },
    "configuration": {
      "title": "Claude Command Deck",
      "properties": {
        "claudeCommandDeck.language": { "type": "string", "default": "uk", "description": "Language code for descriptions (e.g. uk, en, pl)." },
        "claudeCommandDeck.claudeHome": { "type": "string", "default": "", "description": "Path to Claude config root. Empty = ~/.claude." },
        "claudeCommandDeck.includePlugins": { "type": "boolean", "default": true, "description": "Include commands/skills from installed plugins." },
        "claudeCommandDeck.openrouterKeyCommand": { "type": "string", "default": "vault-get shared/openrouter_api_key", "description": "Shell command that prints the OpenRouter API key." },
        "claudeCommandDeck.translationModel": { "type": "string", "default": "google/gemini-2.5-flash", "description": "OpenRouter model used for translation." },
        "claudeCommandDeck.clickAction": { "type": "string", "enum": ["insert", "run"], "default": "insert", "description": "Reserved for future: insert vs insert+run." }
      }
    }
  },
  "scripts": {
    "build": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "package": "vsce package"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.85.0",
    "esbuild": "^0.21.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "@vscode/vsce": "^2.26.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "out",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "moduleResolution": "node",
    "types": ["node"]
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 3: Create `esbuild.js`**

```js
const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
};

(async () => {
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log('esbuild: watching');
  } else {
    await esbuild.build(options);
    console.log('esbuild: built dist/extension.js');
  }
})();
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create `media/icon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="4" width="18" height="16" rx="2"/>
  <path d="M7 9l3 3-3 3"/>
  <path d="M13 15h4"/>
</svg>
```

- [ ] **Step 6: Create `src/types.ts`**

```ts
export type ItemType = 'command' | 'skill';

export interface CommandItem {
  /** Stable id: `${type}:${source}:${name}` */
  id: string;
  type: ItemType;
  /** Bare name, e.g. "code-review" */
  name: string;
  /** Text inserted into the terminal, e.g. "/code-review" or "/superpowers:brainstorming" */
  invocation: string;
  /** "user" or the plugin name */
  source: string;
  /** Description extracted from the file (original language) */
  rawDescription: string;
  /** Hash of rawDescription, used to invalidate the translation cache */
  contentHash: string;
}
```

- [ ] **Step 7: Install deps and verify build**

Run:
```bash
cd /root/projects/claude-command-deck
npm install
npm run build
```
Expected: `npm install` completes; build prints `esbuild: built dist/extension.js` (a near-empty bundle is fine — `src/extension.ts` does not exist yet, so this step will FAIL on missing entry point). To make build pass now, create a temporary stub:

```bash
echo "export function activate(){} export function deactivate(){}" > src/extension.ts
npm run build
```
Expected: prints `esbuild: built dist/extension.js`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold VS Code extension project"
```

---

## Task 2: Scanner — description extraction helpers

**Files:**
- Create: `src/scanner.ts`
- Test: `test/scanner.test.ts`

- [ ] **Step 1: Write failing tests for parsing helpers**

Create `test/scanner.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractDescriptionField,
  firstParagraph,
  extractDescription,
  hashString,
} from '../src/scanner';

describe('parseFrontmatter', () => {
  it('splits frontmatter and body', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: a\ndescription: D\n---\n# Title\ntext');
    expect(frontmatter).toContain('description: D');
    expect(body).toContain('# Title');
  });
  it('returns null frontmatter when none', () => {
    const { frontmatter, body } = parseFrontmatter('# Title\ntext');
    expect(frontmatter).toBeNull();
    expect(body).toContain('# Title');
  });
});

describe('extractDescriptionField', () => {
  it('reads description value', () => {
    expect(extractDescriptionField('name: a\ndescription: Does X')).toBe('Does X');
  });
  it('strips quotes', () => {
    expect(extractDescriptionField('description: "Quoted"')).toBe('Quoted');
  });
  it('returns null when absent', () => {
    expect(extractDescriptionField('name: a')).toBeNull();
  });
});

describe('firstParagraph', () => {
  it('skips headings and blockquotes', () => {
    expect(firstParagraph('# Heading\n\n> meta\n\nReal line\nmore')).toBe('Real line');
  });
});

describe('extractDescription', () => {
  it('prefers frontmatter description', () => {
    expect(extractDescription('---\ndescription: FM\n---\n# H\npara')).toBe('FM');
  });
  it('falls back to first paragraph without frontmatter', () => {
    expect(extractDescription('# Code Review\n\nComprehensive review of changes')).toBe('Comprehensive review of changes');
  });
});

describe('hashString', () => {
  it('is stable and 12 chars', () => {
    const h = hashString('abc');
    expect(h).toBe(hashString('abc'));
    expect(h).toHaveLength(12);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find exports in `../src/scanner` (module/exports do not exist).

- [ ] **Step 3: Implement the helpers**

Create `src/scanner.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommandItem, ItemType } from './types';

export function parseFrontmatter(content: string): { frontmatter: string | null; body: string } {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) {
    return { frontmatter: null, body: content };
  }
  const frontmatter = content.slice(3, end).trim();
  const body = content.slice(end + 4).trim();
  return { frontmatter, body };
}

export function extractDescriptionField(frontmatter: string): string | null {
  for (const line of frontmatter.split('\n')) {
    const m = line.match(/^description:\s*(.*)$/);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

export function firstParagraph(body: string): string {
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;
    if (line.startsWith('#')) continue;
    if (line.startsWith('>')) continue;
    return line;
  }
  return '';
}

export function extractDescription(content: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  if (frontmatter) {
    const d = extractDescriptionField(frontmatter);
    if (d) return d;
  }
  return firstParagraph(body);
}

export function hashString(s: string): string {
  return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/scanner.ts test/scanner.test.ts
git commit -m "feat: scanner description extraction helpers"
```

---

## Task 3: Scanner — item creation and full scan

**Files:**
- Modify: `src/scanner.ts` (append functions)
- Create: `test/fixtures/claude/...` (mock tree)
- Modify: `test/scanner.test.ts` (append tests)

- [ ] **Step 1: Create the fixture tree**

Run:
```bash
cd /root/projects/claude-command-deck
mkdir -p test/fixtures/claude/commands
mkdir -p test/fixtures/claude/skills/myskill
mkdir -p test/fixtures/claude/plugins/cache/mp/myplugin/1.0.0/commands
mkdir -p test/fixtures/claude/plugins/cache/mp/myplugin/1.0.0/skills/pskill
```

Create `test/fixtures/claude/commands/foo.md`:
```md
---
description: Foo does foo
---
# Foo
body
```

Create `test/fixtures/claude/commands/bar.md`:
```md
# Bar Command

Bar does bar things
```

Create `test/fixtures/claude/skills/myskill/SKILL.md`:
```md
---
name: myskill
description: My skill description
---
content
```

Create `test/fixtures/claude/skills/single.md`:
```md
---
name: single
description: Single file skill
---
content
```

Create `test/fixtures/claude/plugins/cache/mp/myplugin/1.0.0/commands/pcmd.md`:
```md
---
description: Plugin command desc
---
body
```

Create `test/fixtures/claude/plugins/cache/mp/myplugin/1.0.0/skills/pskill/SKILL.md`:
```md
---
name: pskill
description: Plugin skill desc
---
content
```

- [ ] **Step 2: Write failing tests for `scan`**

Append to `test/scanner.test.ts`:
```ts
import * as path from 'path';
import { scan, makeItem } from '../src/scanner';

const FIX = path.join(__dirname, 'fixtures', 'claude');

describe('makeItem', () => {
  it('builds user command invocation', () => {
    const it = makeItem('command', 'user', 'foo', '---\ndescription: D\n---\nbody');
    expect(it.id).toBe('command:user:foo');
    expect(it.invocation).toBe('/foo');
    expect(it.rawDescription).toBe('D');
  });
  it('builds plugin invocation with namespace', () => {
    const it = makeItem('skill', 'myplugin', 'pskill', '---\ndescription: D\n---');
    expect(it.invocation).toBe('/myplugin:pskill');
  });
  it('falls back to name when no description', () => {
    const it = makeItem('command', 'user', 'empty', '');
    expect(it.rawDescription).toBe('empty');
  });
});

describe('scan', () => {
  it('finds user commands and skills', () => {
    const items = scan(FIX, false);
    const ids = items.map(i => i.id).sort();
    expect(ids).toContain('command:user:foo');
    expect(ids).toContain('command:user:bar');
    expect(ids).toContain('skill:user:myskill');
    expect(ids).toContain('skill:user:single');
    expect(ids).not.toContain('command:myplugin:pcmd');
  });
  it('includes plugins when enabled', () => {
    const items = scan(FIX, true);
    const ids = items.map(i => i.id);
    expect(ids).toContain('command:myplugin:pcmd');
    expect(ids).toContain('skill:myplugin:pskill');
    const pcmd = items.find(i => i.id === 'command:myplugin:pcmd')!;
    expect(pcmd.invocation).toBe('/myplugin:pcmd');
  });
  it('uses paragraph fallback for frontmatter-less files', () => {
    const items = scan(FIX, false);
    const bar = items.find(i => i.id === 'command:user:bar')!;
    expect(bar.rawDescription).toBe('Bar does bar things');
  });
  it('returns no duplicate ids', () => {
    const items = scan(FIX, true);
    const ids = items.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `scan` and `makeItem` are not exported.

- [ ] **Step 4: Implement `makeItem` and `scan`**

Append to `src/scanner.ts`:
```ts
export function makeItem(type: ItemType, source: string, name: string, content: string): CommandItem {
  const desc = extractDescription(content) || name;
  const invocation = source === 'user' ? `/${name}` : `/${source}:${name}`;
  return {
    id: `${type}:${source}:${name}`,
    type,
    name,
    source,
    invocation,
    rawDescription: desc,
    contentHash: hashString(desc),
  };
}

function safeRead(file: string): string {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function listFiles(dir: string, ext: string): string[] {
  try {
    return fs.readdirSync(dir).filter(f => f.endsWith(ext)).map(f => path.join(dir, f));
  } catch { return []; }
}

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(dir, d.name));
  } catch { return []; }
}

function scanSkillsDir(dir: string, source: string): CommandItem[] {
  const items: CommandItem[] = [];
  for (const sub of listDirs(dir)) {
    const skillMd = path.join(sub, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      items.push(makeItem('skill', source, path.basename(sub), safeRead(skillMd)));
    }
  }
  for (const file of listFiles(dir, '.md')) {
    items.push(makeItem('skill', source, path.basename(file, '.md'), safeRead(file)));
  }
  return items;
}

function scanCommandsDir(dir: string, source: string): CommandItem[] {
  return listFiles(dir, '.md').map(file =>
    makeItem('command', source, path.basename(file, '.md'), safeRead(file)),
  );
}

function scanPlugins(claudeHome: string): CommandItem[] {
  const cache = path.join(claudeHome, 'plugins', 'cache');
  const items: CommandItem[] = [];
  for (const marketplace of listDirs(cache)) {
    for (const plugin of listDirs(marketplace)) {
      const pluginName = path.basename(plugin);
      for (const version of listDirs(plugin)) {
        items.push(...scanCommandsDir(path.join(version, 'commands'), pluginName));
        items.push(...scanSkillsDir(path.join(version, 'skills'), pluginName));
      }
    }
  }
  return items;
}

export function scan(claudeHome: string, includePlugins: boolean): CommandItem[] {
  const all: CommandItem[] = [
    ...scanCommandsDir(path.join(claudeHome, 'commands'), 'user'),
    ...scanSkillsDir(path.join(claudeHome, 'skills'), 'user'),
  ];
  if (includePlugins) {
    all.push(...scanPlugins(claudeHome));
  }
  const seen = new Set<string>();
  const result: CommandItem[] = [];
  for (const it of all) {
    if (seen.has(it.id)) continue;
    seen.add(it.id);
    result.push(it);
  }
  return result;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/scanner.ts test/scanner.test.ts test/fixtures
git commit -m "feat: full scan of commands, skills and plugins"
```

---

## Task 4: Translator — cache logic

**Files:**
- Create: `src/translator.ts`
- Test: `test/translator.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/translator.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { translate, TranslateDeps } from '../src/translator';
import { CommandItem } from '../src/types';

const TMP = path.join(__dirname, '.tmp-cache');

function item(id: string, hash: string, raw: string): CommandItem {
  return { id, type: 'command', name: id, source: 'user', invocation: '/' + id, rawDescription: raw, contentHash: hash };
}

function makeDeps(overrides: Partial<TranslateDeps> & { calls: any[] }): TranslateDeps {
  return {
    cacheDir: TMP,
    model: 'test-model',
    getKey: async () => 'KEY',
    fetchTranslations: async (_key, _model, _lang, items) => {
      overrides.calls.push(items);
      return Object.fromEntries(items.map(i => [i.id, 'T:' + i.text]));
    },
    ...overrides,
  };
}

beforeEach(() => { fs.rmSync(TMP, { recursive: true, force: true }); });
afterEach(() => { fs.rmSync(TMP, { recursive: true, force: true }); });

describe('translate', () => {
  it('translates all items on empty cache and writes the cache file', async () => {
    const calls: any[] = [];
    const deps = makeDeps({ calls });
    const items = [item('a', 'h1', 'Alpha'), item('b', 'h2', 'Beta')];
    const result = await translate(items, 'uk', deps);
    expect(result.get('a')).toBe('T:Alpha');
    expect(result.get('b')).toBe('T:Beta');
    expect(calls.length).toBe(1);
    expect(calls[0].length).toBe(2);
    expect(fs.existsSync(path.join(TMP, 'translations.uk.json'))).toBe(true);
  });

  it('does not re-translate unchanged items', async () => {
    const calls: any[] = [];
    const items = [item('a', 'h1', 'Alpha')];
    await translate(items, 'uk', makeDeps({ calls }));
    const calls2: any[] = [];
    const result = await translate(items, 'uk', makeDeps({ calls: calls2 }));
    expect(calls2.length).toBe(0);
    expect(result.get('a')).toBe('T:Alpha');
  });

  it('only re-translates items whose hash changed', async () => {
    const calls: any[] = [];
    await translate([item('a', 'h1', 'Alpha'), item('b', 'h2', 'Beta')], 'uk', makeDeps({ calls }));
    const calls2: any[] = [];
    const result = await translate([item('a', 'h1', 'Alpha'), item('b', 'h2x', 'Beta v2')], 'uk', makeDeps({ calls: calls2 }));
    expect(calls2.length).toBe(1);
    expect(calls2[0].map((i: any) => i.id)).toEqual(['b']);
    expect(result.get('b')).toBe('T:Beta v2');
    expect(result.get('a')).toBe('T:Alpha');
  });

  it('falls back to raw description when fetch throws', async () => {
    const calls: any[] = [];
    const deps = makeDeps({ calls, fetchTranslations: async () => { throw new Error('network'); } });
    const result = await translate([item('a', 'h1', 'Alpha')], 'uk', deps);
    expect(result.get('a')).toBe('Alpha');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `../src/translator` does not exist.

- [ ] **Step 3: Implement `translator.ts`**

Create `src/translator.ts`:
```ts
import * as fs from 'fs';
import * as path from 'path';
import { CommandItem } from './types';

type CacheEntry = { hash: string; text: string };
type Cache = Record<string, CacheEntry>;

export interface TranslateDeps {
  getKey: () => Promise<string>;
  fetchTranslations: (
    key: string,
    model: string,
    lang: string,
    items: { id: string; text: string }[],
  ) => Promise<Record<string, string>>;
  cacheDir: string;
  model: string;
}

export function cacheFile(cacheDir: string, lang: string): string {
  return path.join(cacheDir, `translations.${lang}.json`);
}

export function loadCache(cacheDir: string, lang: string): Cache {
  try {
    return JSON.parse(fs.readFileSync(cacheFile(cacheDir, lang), 'utf8')) as Cache;
  } catch {
    return {};
  }
}

export function saveCache(cacheDir: string, lang: string, cache: Cache): void {
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(cacheFile(cacheDir, lang), JSON.stringify(cache, null, 2));
}

export async function translate(
  items: CommandItem[],
  lang: string,
  deps: TranslateDeps,
): Promise<Map<string, string>> {
  const cache = loadCache(deps.cacheDir, lang);
  const missing = items.filter(it => cache[it.id]?.hash !== it.contentHash);

  if (missing.length > 0) {
    try {
      const key = await deps.getKey();
      const translated = await deps.fetchTranslations(
        key,
        deps.model,
        lang,
        missing.map(it => ({ id: it.id, text: it.rawDescription })),
      );
      for (const it of missing) {
        const t = translated[it.id];
        if (t) cache[it.id] = { hash: it.contentHash, text: t };
      }
      saveCache(deps.cacheDir, lang, cache);
    } catch {
      // network/key failure → silently fall back to raw descriptions below
    }
  }

  const result = new Map<string, string>();
  for (const it of items) {
    result.set(it.id, cache[it.id]?.text ?? it.rawDescription);
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/translator.ts test/translator.test.ts
git commit -m "feat: translator cache logic with hash invalidation"
```

---

## Task 5: OpenRouter integration (network + key)

**Files:**
- Create: `src/openrouter.ts`
- Test: `test/openrouter.test.ts` (pure `chunk` helper only)

- [ ] **Step 1: Write a failing test for the `chunk` helper**

Create `test/openrouter.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { chunk } from '../src/openrouter';

describe('chunk', () => {
  it('splits into fixed-size groups', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it('returns empty for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/openrouter` does not exist.

- [ ] **Step 3: Implement `openrouter.ts`**

Create `src/openrouter.ts`:
```ts
import { execFile } from 'child_process';

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

/** Returns a function that prints the OpenRouter key by running a shell command. */
export function makeKeyGetter(command: string): () => Promise<string> {
  return () =>
    new Promise((resolve, reject) => {
      execFile('bash', ['-lc', command], (err, stdout) => {
        if (err) return reject(err);
        const key = stdout.trim();
        if (!key) return reject(new Error('empty OpenRouter key'));
        resolve(key);
      });
    });
}

async function translateChunk(
  key: string,
  model: string,
  lang: string,
  items: { id: string; text: string }[],
): Promise<Record<string, string>> {
  const system =
    `You are a translator. Translate each short technical description into the language with code "${lang}". ` +
    `Keep slash-commands, code identifiers, command names and product names untranslated. ` +
    `Return ONLY a JSON object mapping each id to its translated text.`;
  const user = JSON.stringify(items);

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter HTTP ${res.status}`);
  }
  const data: any = await res.json();
  const content: string = data.choices?.[0]?.message?.content ?? '{}';
  return JSON.parse(content) as Record<string, string>;
}

/** Translates all items in chunks of 40 and merges the results. */
export async function fetchTranslations(
  key: string,
  model: string,
  lang: string,
  items: { id: string; text: string }[],
): Promise<Record<string, string>> {
  const merged: Record<string, string> = {};
  for (const group of chunk(items, 40)) {
    const part = await translateChunk(key, model, lang, group);
    Object.assign(merged, part);
  }
  return merged;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (chunk tests green).

- [ ] **Step 5: Commit**

```bash
git add src/openrouter.ts test/openrouter.test.ts
git commit -m "feat: OpenRouter translation client and key getter"
```

---

## Task 6: Groups — pure grouping/order

**Files:**
- Create: `src/groups.ts`
- Test: `test/groups.test.ts`

- [ ] **Step 1: Write failing tests**

Create `test/groups.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildGroups } from '../src/groups';
import { CommandItem } from '../src/types';

function it_(id: string, type: 'command' | 'skill', name: string): CommandItem {
  return { id, type, name, source: 'user', invocation: '/' + name, rawDescription: '', contentHash: '' };
}

describe('buildGroups', () => {
  it('separates commands and skills with counts', () => {
    const groups = buildGroups([
      it_('1', 'command', 'b'),
      it_('2', 'skill', 'z'),
      it_('3', 'command', 'a'),
    ]);
    expect(groups[0].id).toBe('command');
    expect(groups[0].label).toBe('Commands (2)');
    expect(groups[0].items.map(i => i.name)).toEqual(['a', 'b']);
    expect(groups[1].id).toBe('skill');
    expect(groups[1].label).toBe('Skills (1)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `../src/groups` does not exist.

- [ ] **Step 3: Implement `groups.ts`**

Create `src/groups.ts`:
```ts
import { CommandItem, ItemType } from './types';

export interface TreeGroup {
  id: ItemType;
  label: string;
  items: CommandItem[];
}

export function buildGroups(items: CommandItem[]): TreeGroup[] {
  const byName = (a: CommandItem, b: CommandItem) => a.name.localeCompare(b.name);
  const commands = items.filter(i => i.type === 'command').sort(byName);
  const skills = items.filter(i => i.type === 'skill').sort(byName);
  return [
    { id: 'command', label: `Commands (${commands.length})`, items: commands },
    { id: 'skill', label: `Skills (${skills.length})`, items: skills },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/groups.ts test/groups.test.ts
git commit -m "feat: pure grouping of items into Commands/Skills"
```

---

## Task 7: TreeProvider (vscode)

**Files:**
- Create: `src/treeProvider.ts`

This module imports `vscode` and is verified by running the extension (Task 9), not by unit tests.

- [ ] **Step 1: Implement `treeProvider.ts`**

Create `src/treeProvider.ts`:
```ts
import * as vscode from 'vscode';
import { CommandItem } from './types';
import { buildGroups, TreeGroup } from './groups';

class GroupNode extends vscode.TreeItem {
  constructor(public group: TreeGroup) {
    super(group.label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'deckGroup';
    this.iconPath = new vscode.ThemeIcon(group.id === 'command' ? 'terminal' : 'sparkle');
  }
}

class ItemNode extends vscode.TreeItem {
  constructor(public item: CommandItem, description: string) {
    super(item.invocation, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.tooltip = new vscode.MarkdownString(
      `**${item.invocation}**\n\n${description}\n\n_${item.rawDescription}_\n\nsource: \`${item.source}\``,
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/treeProvider.ts
git commit -m "feat: VS Code TreeDataProvider for the deck"
```

---

## Task 8: Terminal bridge (vscode)

**Files:**
- Create: `src/terminal.ts`

- [ ] **Step 1: Implement `terminal.ts`**

Create `src/terminal.ts`:
```ts
import * as vscode from 'vscode';

export function insertIntoTerminal(invocation: string): void {
  const terminal = vscode.window.activeTerminal ?? vscode.window.createTerminal('Claude');
  terminal.show();
  // second arg `false` = do NOT append a newline → command is typed but not run
  terminal.sendText(invocation, false);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/terminal.ts
git commit -m "feat: insert invocation into active terminal without running"
```

---

## Task 9: Extension wiring + manual run

**Files:**
- Modify: `src/extension.ts` (replace the stub from Task 1)
- Create: `.vscode/launch.json` (for F5 debugging)

- [ ] **Step 1: Implement `extension.ts`**

Replace `src/extension.ts` with:
```ts
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
  const h = cfg('claudeHome', '');
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
```

- [ ] **Step 2: Create `.vscode/launch.json`**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "npm: build"
    }
  ]
}
```

- [ ] **Step 3: Build and type-check**

Run:
```bash
npm run typecheck && npm run build
```
Expected: no type errors; prints `esbuild: built dist/extension.js`.

- [ ] **Step 4: Manual verification (run the extension)**

Open the project in VS Code (connected to the VPS via Remote-SSH so `~/.claude` and `vault-get` are reachable). Press `F5` to launch the Extension Development Host.

Verify, in order:
1. A new icon appears in the Activity Bar; clicking it opens the **Commands & Skills** panel.
2. Two groups appear: `Commands (N)` and `Skills (M)` with non-zero counts.
3. Descriptions render in Ukrainian (first load may take a few seconds while translating; watch the cache file appear at the path printed by `echo "$(code --version)"`-independent globalStorage — or just confirm text turns Ukrainian).
4. Type in the tree filter (start typing) → list narrows.
5. Open a terminal in the dev host, run `claude`, then click `/code-review` in the panel → the text `/code-review` appears in the terminal **without** being submitted; cursor is at the end.
6. Right-click an item → **Copy Invocation** → paste elsewhere → matches.
7. Click the globe icon → enter `en` → descriptions switch to English (re-translates, then cached).

If translation does not appear: open the dev host Output/Debug Console and confirm no exception; verify `vault-get shared/openrouter_api_key` prints a key in the VPS terminal.

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts .vscode/launch.json
git commit -m "feat: wire extension activation, commands, and file watcher"
```

---

## Task 10: Package and install

**Files:** none (build artifact)

- [ ] **Step 1: Package the extension**

Run:
```bash
cd /root/projects/claude-command-deck
npm run package
```
Expected: produces `claude-command-deck-0.1.0.vsix`.

- [ ] **Step 2: Install into VS Code (remote host)**

Run (in the VPS where the Remote-SSH server runs):
```bash
code --install-extension claude-command-deck-0.1.0.vsix
```
Expected: `Extension 'claude-command-deck-0.1.0.vsix' was successfully installed.`
(If `code` CLI is unavailable on the remote, install via VS Code UI: Extensions panel → `…` → Install from VSIX.)

- [ ] **Step 3: Final end-to-end check**

Reload the VS Code window. Confirm the Command Deck icon appears in the (non-dev) Activity Bar and the click-to-insert flow works as in Task 9 Step 4.

- [ ] **Step 4: Write README and commit**

Create `README.md`:
```md
# Claude Command Deck

VS Code sidebar listing all Claude Code commands and skills (yours + plugins) with
descriptions in your language. Click an item to insert its invocation into the active
terminal (without running it).

## Settings
- `claudeCommandDeck.language` — description language (default `uk`)
- `claudeCommandDeck.claudeHome` — Claude config root (default `~/.claude`)
- `claudeCommandDeck.includePlugins` — include plugin commands/skills (default `true`)
- `claudeCommandDeck.openrouterKeyCommand` — command that prints the OpenRouter key
- `claudeCommandDeck.translationModel` — OpenRouter model (default `google/gemini-2.5-flash`)

## Notes
Must run on the host where `~/.claude` and `vault-get` live (e.g. VPS via Remote-SSH).
Translations are fetched once via OpenRouter and cached; subsequent loads are offline.
```

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Self-Review Notes (filled by plan author)

- **Spec coverage:** Scanner (§4.1)→T2,T3; Translator+cache (§4.2)→T4; OpenRouter/Vault key (§4.2)→T5; TreeProvider (§4.3)→T6,T7; Terminal (§4.4)→T8; extension wiring/config/watcher (§4.5)→T1,T9; settings (§5)→T1; error handling (§6: fallback to raw, no active terminal, missing dir, malformed md)→ covered by translator catch (T4), `createTerminal` fallback (T8), `safeRead`/`list*` swallowing errors (T3); testing (§7)→T2–T6; packaging (§8, §9)→T10.
- **Type consistency:** `CommandItem`, `TranslateDeps`, `TreeGroup`, `buildGroups`, `scan`, `makeItem`, `translate`, `fetchTranslations`, `makeKeyGetter`, `insertIntoTerminal`, `DeckTreeProvider.setData`, `ItemNode.invocation` are defined once and used with matching signatures across tasks.
- **Known limitation (in-scope):** Empty-directory state (§6 "no ~/.claude") surfaces as empty groups `Commands (0) / Skills (0)` rather than a dedicated message — acceptable for v1; a placeholder TreeItem can be added later if desired.
