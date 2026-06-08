import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDest, isUserItem, installedHashes, sha256, install, uninstall } from '../src/installer';
import { CommandItem } from '../src/types';
import { CatalogEntry } from '../src/catalogTypes';

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
  it('rejects name "." (would collapse skill root to skills/ dir)', () => {
    expect(() => resolveDest(HOME, 'skill', '.', 'SKILL.md')).toThrow();
  });
  it('rejects name ".." (traversal via name)', () => {
    expect(() => resolveDest(HOME, 'skill', '..', 'SKILL.md')).toThrow();
  });
  it('permits a literal dotted segment inside relPath that stays within root', () => {
    const dest = resolveDest(HOME, 'skill', 'bar', '....//x.md');
    expect(dest.startsWith(path.join(HOME, 'skills', 'bar'))).toBe(true);
  });
  it('rejects a non-text extension (.sh)', () => {
    expect(() => resolveDest(HOME, 'skill', 'bar', 'evil.sh')).toThrow('unsupported file type');
  });
  it('rejects a non-text extension (.js)', () => {
    expect(() => resolveDest(HOME, 'command', 'foo', 'foo.js')).toThrow('unsupported file type');
  });
  it('allows an allowed text extension inside a subdirectory (.txt)', () => {
    expect(() => resolveDest(HOME, 'skill', 'bar', 'references/notes.txt')).not.toThrow();
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
  it('rejects install into a symlinked skill dir', async () => {
    fs.mkdirSync(path.join(HOME, 'skills'), { recursive: true });
    fs.symlinkSync('/tmp', path.join(HOME, 'skills', 'demo'));
    const e = catEntry({ files: [{ path: 'SKILL.md', url: 'mem://s' }] });
    await expect(install(HOME, e, async () => 'MAIN')).rejects.toThrow('symlinked');
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
