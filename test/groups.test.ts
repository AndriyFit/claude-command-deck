import { describe, it, expect } from 'vitest';
import { buildGroups } from '../src/groups';
import { CommandItem } from '../src/types';

function it_(id: string, type: 'command' | 'skill', name: string): CommandItem {
  return { id, type, name, source: 'user', invocation: '/' + name, rawDescription: '', contentHash: '' };
}

describe('buildGroups', () => {
  it('groups items into thematic categories with counts', () => {
    const groups = buildGroups([
      it_('1', 'skill', 'ads-meta'),
      it_('2', 'skill', 'ads-tiktok'),
      it_('3', 'command', 'code-review'),
    ]);
    const ads = groups.find(g => g.id === 'ads');
    const review = groups.find(g => g.id === 'review');
    expect(ads?.label).toBe('Реклама та маркетинг (2)');
    expect(review?.label).toBe('Перевірка коду (1)');
  });

  it('omits empty categories', () => {
    const groups = buildGroups([it_('1', 'skill', 'ads-meta')]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('ads');
  });

  it('orders commands before skills within a category', () => {
    const groups = buildGroups([
      it_('1', 'skill', 'cpp-review'),
      it_('2', 'command', 'rust-review'),
    ]);
    const review = groups.find(g => g.id === 'review')!;
    expect(review.items.map(i => i.type)).toEqual(['command', 'skill']);
  });

  it('uses English labels when lang is en', () => {
    const groups = buildGroups([it_('1', 'skill', 'ads-meta')], 'en');
    expect(groups[0].label).toBe('Ads & Marketing (1)');
  });

  it('respects category display order (ads before review)', () => {
    const groups = buildGroups([
      it_('1', 'command', 'code-review'),
      it_('2', 'skill', 'ads-meta'),
    ]);
    expect(groups.map(g => g.id)).toEqual(['ads', 'review']);
  });
});
