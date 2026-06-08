import { describe, it, expect } from 'vitest';
import { buildGroups } from '../src/groups';
import { CommandItem } from '../src/types';

function it_(id: string, type: 'command' | 'skill', name: string): CommandItem {
  return { id, type, name, source: 'user', invocation: '/' + name, rawDescription: '', contentHash: '' };
}

describe('buildGroups', () => {
  it('separates commands and skills with counts', () => {
    const groups = buildGroups([
      it_('1', 'command', 'b'),
      it_('2', 'skill', 'z'),
      it_('3', 'command', 'a'),
    ]);
    expect(groups[0].id).toBe('commands');
    expect(groups[0].label).toBe('Commands (2)');
    expect(groups[0].items.map(i => i.name)).toEqual(['a', 'b']);
    expect(groups[1].id).toBe('skill:user');
    expect(groups[1].label).toBe('User Skills (1)');
  });
});
