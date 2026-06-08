import { describe, it, expect } from 'vitest';
import { parseIndex, computeStatus, entryFilesAreRemote } from '../src/catalog';
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
  it('returns [] when top-level json is an array (not an object)', () => {
    expect(parseIndex([])).toEqual([]);
  });
  it('skips an entry with an invalid type', () => {
    const bad = { ...entry({}), type: 'bogus' } as unknown;
    expect(parseIndex({ version: 1, generatedAt: 't', entries: [bad] })).toHaveLength(0);
  });
  it('skips an entry with an invalid origin', () => {
    const bad = { ...entry({}), origin: 'weird' } as unknown;
    expect(parseIndex({ version: 1, generatedAt: 't', entries: [bad] })).toHaveLength(0);
  });
  it('skips an entry missing source', () => {
    const bad: Record<string, unknown> = { ...entry({}) };
    delete bad.source;
    expect(parseIndex({ version: 1, generatedAt: 't', entries: [bad] })).toHaveLength(0);
  });
  it('skips an entry missing description', () => {
    const bad: Record<string, unknown> = { ...entry({}) };
    delete bad.description;
    expect(parseIndex({ version: 1, generatedAt: 't', entries: [bad] })).toHaveLength(0);
  });
  it('skips an entry missing version', () => {
    const bad: Record<string, unknown> = { ...entry({}) };
    delete bad.version;
    expect(parseIndex({ version: 1, generatedAt: 't', entries: [bad] })).toHaveLength(0);
  });
});

describe('entryFilesAreRemote', () => {
  it('returns true when all file URLs are https', () => {
    const e = entry({ files: [{ path: 'foo.md', url: 'https://example.com/foo.md' }, { path: 'bar.md', url: 'https://example.com/bar.md' }] });
    expect(entryFilesAreRemote(e)).toBe(true);
  });
  it('returns true when all file URLs are http', () => {
    const e = entry({ files: [{ path: 'foo.md', url: 'http://example.com/foo.md' }] });
    expect(entryFilesAreRemote(e)).toBe(true);
  });
  it('returns false when a file URL uses file://', () => {
    const e = entry({ files: [{ path: 'foo.md', url: 'https://example.com/foo.md' }, { path: 'bar.md', url: 'file:///local/bar.md' }] });
    expect(entryFilesAreRemote(e)).toBe(false);
  });
  it('returns false when a file URL is a plain local path', () => {
    const e = entry({ files: [{ path: 'foo.md', url: '/local/path/foo.md' }] });
    expect(entryFilesAreRemote(e)).toBe(false);
  });
});

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
