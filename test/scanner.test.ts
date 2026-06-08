import { describe, it, expect } from 'vitest';
import {
  parseFrontmatter,
  extractDescriptionField,
  firstParagraph,
  extractDescription,
  hashString,
} from '../src/scanner';

describe('parseFrontmatter', () => {
  it('splits frontmatter and body', () => {
    const { frontmatter, body } = parseFrontmatter('---\nname: a\ndescription: D\n---\n# Title\ntext');
    expect(frontmatter).toContain('description: D');
    expect(body).toContain('# Title');
  });
  it('returns null frontmatter when none', () => {
    const { frontmatter, body } = parseFrontmatter('# Title\ntext');
    expect(frontmatter).toBeNull();
    expect(body).toContain('# Title');
  });
});

describe('extractDescriptionField', () => {
  it('reads description value', () => {
    expect(extractDescriptionField('name: a\ndescription: Does X')).toBe('Does X');
  });
  it('strips quotes', () => {
    expect(extractDescriptionField('description: "Quoted"')).toBe('Quoted');
  });
  it('returns null when absent', () => {
    expect(extractDescriptionField('name: a')).toBeNull();
  });
});

describe('firstParagraph', () => {
  it('skips headings and blockquotes', () => {
    expect(firstParagraph('# Heading\n\n> meta\n\nReal line\nmore')).toBe('Real line');
  });
});

describe('extractDescription', () => {
  it('prefers frontmatter description', () => {
    expect(extractDescription('---\ndescription: FM\n---\n# H\npara')).toBe('FM');
  });
  it('falls back to first paragraph without frontmatter', () => {
    expect(extractDescription('# Code Review\n\nComprehensive review of changes')).toBe('Comprehensive review of changes');
  });
});

describe('hashString', () => {
  it('is stable and 12 chars', () => {
    const h = hashString('abc');
    expect(h).toBe(hashString('abc'));
    expect(h).toHaveLength(12);
  });
});

import * as path from 'path';
import { scan, makeItem } from '../src/scanner';

const FIX = path.join(__dirname, 'fixtures', 'claude');

describe('makeItem', () => {
  it('builds user command invocation', () => {
    const it = makeItem('command', 'user', 'foo', '---\ndescription: D\n---\nbody');
    expect(it.id).toBe('command:user:foo');
    expect(it.invocation).toBe('/foo');
    expect(it.rawDescription).toBe('D');
  });
  it('builds plugin invocation with namespace', () => {
    const it = makeItem('skill', 'myplugin', 'pskill', '---\ndescription: D\n---');
    expect(it.invocation).toBe('/myplugin:pskill');
  });
  it('falls back to name when no description', () => {
    const it = makeItem('command', 'user', 'empty', '');
    expect(it.rawDescription).toBe('empty');
  });
});

describe('scan', () => {
  it('finds user commands and skills', () => {
    const items = scan(FIX, false);
    const ids = items.map(i => i.id).sort();
    expect(ids).toContain('command:user:foo');
    expect(ids).toContain('command:user:bar');
    expect(ids).toContain('skill:user:myskill');
    expect(ids).toContain('skill:user:single');
    expect(ids).not.toContain('command:myplugin:pcmd');
  });
  it('includes plugins when enabled', () => {
    const items = scan(FIX, true);
    const ids = items.map(i => i.id);
    expect(ids).toContain('command:myplugin:pcmd');
    expect(ids).toContain('skill:myplugin:pskill');
    const pcmd = items.find(i => i.id === 'command:myplugin:pcmd')!;
    expect(pcmd.invocation).toBe('/myplugin:pcmd');
  });
  it('uses paragraph fallback for frontmatter-less files', () => {
    const items = scan(FIX, false);
    const bar = items.find(i => i.id === 'command:user:bar')!;
    expect(bar.rawDescription).toBe('Bar does bar things');
  });
  it('returns no duplicate ids', () => {
    const items = scan(FIX, true);
    const ids = items.map(i => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('follows symlinked skill directories', () => {
    const fs = require('fs') as typeof import('fs');
    const os = require('os') as typeof import('os');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-'));
    const home = path.join(tmp, '.claude');
    const target = path.join(tmp, 'external', 'linked-skill');
    fs.mkdirSync(path.join(home, 'skills'), { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, 'SKILL.md'), '---\ndescription: Linked\n---');
    fs.symlinkSync(target, path.join(home, 'skills', 'linked-skill'));

    const items = scan(home, false);
    expect(items.map(i => i.id)).toContain('skill:user:linked-skill');
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
