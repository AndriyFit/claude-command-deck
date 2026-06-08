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
