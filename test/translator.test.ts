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
