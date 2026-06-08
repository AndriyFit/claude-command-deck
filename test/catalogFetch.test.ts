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
