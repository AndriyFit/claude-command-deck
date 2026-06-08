import { describe, it, expect } from 'vitest';
import { parseIndex } from '../src/catalog';
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
