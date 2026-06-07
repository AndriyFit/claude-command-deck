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
