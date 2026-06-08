import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommandItem } from './types';
import { CatalogEntry } from './catalogTypes';

export function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex');
}

export function userRoots(home: string): { command: string; skill: string } {
  return { command: path.join(home, 'commands'), skill: path.join(home, 'skills') };
}

function safeName(name: string): string {
  if (!name || name === '.' || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error(`unsafe name: ${name}`);
  }
  return name;
}

const TEXT_EXTS = new Set(['.md', '.txt', '.json', '.yaml', '.yml', '.toml']);

/**
 * Resolves a destination path and guarantees it stays within the allowed user root.
 * Lexical guard only (assumes POSIX, does not resolve symlinks) — writers must not
 * follow symlinks out of the root.
 */
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
  const ext = path.extname(relPath).toLowerCase();
  if (!TEXT_EXTS.has(ext)) {
    throw new Error(`unsupported file type: ${relPath}`);
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

type FetchFile = (url: string) => Promise<string>;

/**
 * Downloads each file and writes it atomically (tmp + rename) under the user root.
 * Plugins are rejected — they have no files list and are installed via other means.
 *
 * Security: reuses resolveDest's lexical guard so catalog-supplied paths cannot
 * escape the item root. For skill entries we additionally refuse to write into a
 * symlinked skill directory, which would redirect writes outside the root even
 * though the lexical path still looks safe.
 */
export async function install(home: string, entry: CatalogEntry, fetchFile: FetchFile): Promise<void> {
  if (entry.type === 'plugin') throw new Error('plugins are not file-installed');
  const type = entry.type;

  // Symlink guard for skill dirs: a pre-existing symlink at skills/<name> would
  // let an attacker (or a compromised catalog) redirect all writes to an arbitrary
  // directory. Check once before touching any files.
  if (type === 'skill') {
    const skillDir = path.join(userRoots(home).skill, entry.name);
    try {
      const stat = fs.lstatSync(skillDir);
      if (stat.isSymbolicLink()) {
        throw new Error(`refusing to install into symlinked skill dir: ${skillDir}`);
      }
    } catch (err) {
      // lstatSync throws ENOENT when the dir doesn't exist yet — that's fine.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  for (const file of entry.files) {
    const dest = resolveDest(home, type, entry.name, file.path);
    const content = await fetchFile(file.url);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // Atomic write: write to a temp file in the same directory, then rename.
    // rename() is atomic on POSIX; the tmp suffix includes the PID to avoid
    // collisions between concurrent install calls.
    const tmp = `${dest}.tmp-${process.pid}`;
    try {
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, dest);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
}

/**
 * Hard-deletes a user-owned command file or skill directory.
 * Refuses to touch items that are not source === 'user' to prevent
 * accidental deletion of bundled/plugin-managed items.
 */
export async function uninstall(home: string, item: CommandItem): Promise<void> {
  if (!isUserItem(item)) throw new Error('refusing to delete non-user item');
  const roots = userRoots(home);
  if (item.type === 'command') {
    // For commands, resolveDest provides the lexical guard.
    const dest = resolveDest(home, 'command', item.name, `${item.name}.md`);
    fs.rmSync(dest, { force: true });
  } else {
    // For skills, validate the name and verify the resolved dir stays inside
    // the skills root before recursively removing it.
    safeName(item.name);
    const dir = path.join(roots.skill, item.name);
    const guard = path.resolve(roots.skill) + path.sep;
    if (!path.resolve(dir).startsWith(guard)) throw new Error('path escapes skills root');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
