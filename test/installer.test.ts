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
